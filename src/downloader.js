// A small download engine used when a download speed limit is set.
// Chromium's own downloader can't be throttled, so the file is re-requested
// through the same browsing session (same cookies, same VPN) and streamed to
// disk at the chosen rate. Supports pause, resume (HTTP Range) and cancel.
const { net } = require('electron');
const fs = require('fs');
const { EventEmitter } = require('events');

class ThrottledDownload extends EventEmitter {
  constructor({ url, session, savePath, limitBytesPerSec, referrer, total = 0 }) {
    super();
    this.url = url; this.session = session; this.savePath = savePath; this.limit = limitBytesPerSec;
    this.referrer = referrer; this.total = total; this.received = 0;
    this.state = 'progressing'; this.paused = false; this.req = null; this.res = null; this.out = null;
    this.windowStart = Date.now(); this.windowBytes = 0; this.retries = 0;
  }

  start() { this.request(); return this; }

  request() {
    const headers = {};
    if (this.received > 0) headers.Range = `bytes=${this.received}-`;
    // (Chromium doesn't allow setting Referer on net.request — it fails with ERR_BLOCKED_BY_CLIENT.)
    const req = net.request({ url: this.url, session: this.session, useSessionCookies: true, redirect: 'follow', headers });
    this.req = req;
    req.on('response', (res) => {
      this.res = res;
      if (res.statusCode >= 400) {
        if (!this.accepted) { this.state = 'rejected'; try { req.abort(); } catch {} this.emit('rejected', res.statusCode); return; }
        return this.fail(`Server answered ${res.statusCode}`);
      }
      if (!this.accepted) { this.accepted = true; this.windowStart = Date.now(); this.windowBytes = 0; this.emit('accepted'); }
      const resumed = this.received > 0 && res.statusCode === 206;
      if (this.received > 0 && !resumed) { this.received = 0; } // server ignored Range: start over
      const len = +([].concat(res.headers['content-length'] || [])[0] || 0);
      if (len && !resumed) this.total = len; else if (len && resumed) this.total = this.received + len;
      if (!(resumed && this.out && !this.out.destroyed && !this.out.writableEnded)) {
        if (this.out) try { this.out.end(); } catch {}
        this.out = fs.createWriteStream(this.savePath + '.noamdownload', { flags: resumed ? 'a' : 'w' });
      }
      res.on('data', (chunk) => this.onData(chunk));
      res.on('end', () => this.finish());
      res.on('error', (e) => this.retry(e));
      this.emit('updated');
    });
    req.on('error', (e) => { if (!this.accepted) { this.state = 'rejected'; this.emit('rejected', (e && e.message) || 0); return; } this.retry(e); });
    req.end();
  }

  onData(chunk) {
    if (this.state !== 'progressing') return;
    this.out.write(chunk);
    this.received += chunk.length;
    this.windowBytes += chunk.length;
    if (this.limit > 0) {
      // token bucket over the whole transfer: if we're ahead of schedule, hold the stream until we're back on it
      const due = this.windowStart + (this.windowBytes / this.limit) * 1000;
      const wait = due - Date.now();
      if (wait > 30 && !this.holding) {
        this.holding = true; try { this.res.pause(); } catch {}
        setTimeout(() => { this.holding = false; if (!this.paused && this.state === 'progressing' && this.res) try { this.res.resume(); } catch {} }, Math.min(wait, 5000));
      }
    }
    this.tick();
  }

  setLimit(bytesPerSec) { this.limit = Math.max(0, bytesPerSec || 0); this.windowStart = Date.now(); this.windowBytes = 0; if (!this.limit && this.holding && this.res && !this.paused) { this.holding = false; try { this.res.resume(); } catch {} } }

  tick() { const t = Date.now(); if (!this.lastEmit || t - this.lastEmit > 250) { this.lastEmit = t; this.emit('updated'); } }

  pause() { if (this.state !== 'progressing' || this.paused) return; this.paused = true; try { this.res && this.res.pause(); } catch {} this.emit('updated'); }

  resume() {
    if (this.state !== 'progressing' || !this.paused) return;
    this.paused = false; this.windowStart = Date.now(); this.windowBytes = 0;
    if (this.res && !this.res.destroyed) { try { this.res.resume(); } catch {} } else this.request();
    this.emit('updated');
  }

  cancel() {
    if (this.state !== 'progressing') return;
    this.state = 'cancelled';
    try { this.req && this.req.abort(); } catch {}
    const done = () => { try { fs.unlinkSync(this.savePath + '.noamdownload'); } catch {} };
    if (this.out) this.out.end(done); else done();
    this.emit('done', 'cancelled');
  }

  retry(e) {
    if (this.state !== 'progressing') return;
    if (this.paused) { this.res = null; return; } // resume() will reconnect
    if (this.retries++ < 4) { setTimeout(() => { if (this.state === 'progressing' && !this.paused) this.request(); }, 1500 * this.retries); return; }
    this.fail(e && e.message);
  }

  fail(msg) {
    if (this.state !== 'progressing') return;
    this.state = 'interrupted'; this.error = msg || 'failed';
    try { this.out && this.out.end(); } catch {}
    this.emit('done', 'interrupted');
  }

  finish() {
    if (this.state !== 'progressing') return;
    this.out.end(() => {
      try { fs.renameSync(this.savePath + '.noamdownload', this.savePath); } catch (e) { return this.fail(e.message); }
      this.state = 'completed'; if (!this.total) this.total = this.received;
      this.emit('done', 'completed');
    });
  }
}

const TYPE_FOLDERS = {
  Images: /\.(png|jpe?g|gif|webp|svg|bmp|heic|avif|ico|tiff?)$/i,
  Videos: /\.(mp4|mkv|mov|avi|webm|wmv|m4v|flv)$/i,
  Music: /\.(mp3|wav|flac|aac|ogg|m4a|opus|wma)$/i,
  Documents: /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|txt|rtf|csv|md|epub)$/i,
  Archives: /\.(zip|rar|7z|tar|gz|bz2|xz|tgz)$/i,
  Programs: /\.(exe|msi|dmg|pkg|deb|rpm|appimage|apk|msix|bat|sh)$/i,
};
function sortFolder(filename) { for (const [k, re] of Object.entries(TYPE_FOLDERS)) if (re.test(filename)) return k; return 'Other'; }

module.exports = { ThrottledDownload, sortFolder };
