// NoamBrowser auto-updater (GitHub Releases via electron-updater).
//  - Windows installer & Linux AppImage/.deb: download in the background, then
//    "Restart to update".
//  - macOS: Apple's updater only accepts apps signed with a paid Apple Developer ID, so
//    NoamBrowser swaps itself: it downloads the new .zip, checks its SHA-512, unpacks it,
//    and when you click "Restart to update" a tiny script waits for it to quit, puts the
//    new app in place of the old one and opens it again ("macswap").
//    If the app sits somewhere it can't write to, it falls back to opening the download page.
//  - The Windows portable exe can't replace itself, so it only notifies.
const { app, shell } = require('electron');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;
const DEFAULT_FEED = { provider: 'github', owner: 'ntoder', repo: 'NoamBrowser' };

class Updater extends EventEmitter {
  constructor({ settings }) {
    super();
    this.settings = settings;
    this.state = { status: 'idle', version: app.getVersion(), available: null, progress: 0, error: '', lastCheck: 0, canAutoInstall: false, releaseUrl: '' };
    this.au = null;
    this.publish = null;
    try {
      const yml = path.join(process.resourcesPath || '', 'app-update.yml');
      if (fs.existsSync(yml)) {
        const txt = fs.readFileSync(yml, 'utf8');
        const get = (k) => (new RegExp('^' + k + ':\\s*(.+)$', 'm').exec(txt) || [])[1]?.trim().replace(/^['"]|['"]$/g, '');
        this.publish = { provider: get('provider'), owner: get('owner'), repo: get('repo') };
      }
    } catch {}
    // The macOS build is packaged without app-update.yml, so fall back to the known release feed.
    if (!this.publish || !this.publish.owner) { this.publish = { ...DEFAULT_FEED }; this.needFeed = true; }
    const portable = !!process.env.PORTABLE_EXECUTABLE_DIR;
    const isDeb = process.platform === 'linux' && !process.env.APPIMAGE;
    this.mode = !app.isPackaged ? 'dev'
      : process.platform === 'darwin' ? (macBundle() ? 'macswap' : 'notify')
      : portable ? 'notify'
      : process.platform === 'linux' && isDeb ? 'deb'
      : 'auto';
    this.state.canAutoInstall = this.mode === 'auto' || this.mode === 'deb' || this.mode === 'macswap';
    if (process.platform === 'darwin' && this.mode === 'notify' && app.isPackaged) this.state.hint = 'Move NoamBrowser into your Applications folder to get one-click updates.';
    if (this.publish?.owner && this.publish?.repo) this.state.releaseUrl = `https://github.com/${this.publish.owner}/${this.publish.repo}/releases/latest`;
  }

  configured() { return !!(this.publish && this.publish.owner && this.publish.repo && this.publish.owner !== 'OWNER'); }

  set(patch) { Object.assign(this.state, patch); this.emit('status', { ...this.state }); }

  init() {
    if (this.mode === 'dev' || !this.configured()) { this.set({ status: this.configured() ? 'dev' : 'unconfigured' }); return; }
    let au;
    try { ({ autoUpdater: au } = require('electron-updater')); } catch (e) { this.set({ status: 'error', error: 'Updater missing: ' + e.message }); return; }
    this.au = au;
    if (this.needFeed) { try { au.setFeedURL({ provider: 'github', owner: this.publish.owner, repo: this.publish.repo }); } catch (e) { console.error('feed', e.message); } }
    const mac = this.mode === 'macswap';
    au.autoDownload = !mac && this.mode !== 'notify' && this.settings.get('updates').auto !== false;
    au.autoInstallOnAppQuit = this.mode === 'auto' || this.mode === 'deb';
    au.allowPrerelease = false;
    au.logger = null;
    au.on('checking-for-update', () => this.set({ status: 'checking', error: '' }));
    au.on('update-not-available', () => this.set({ status: 'current', lastCheck: Date.now() }));
    au.on('update-available', (info) => {
      this.info = info;
      this.set({ status: au.autoDownload ? 'downloading' : 'available', available: info.version, lastCheck: Date.now(), notes: stripHtml(info.releaseNotes) });
      if (mac && this.settings.get('updates').auto !== false) this.macDownload();
    });
    au.on('download-progress', (p) => this.set({ status: 'downloading', progress: Math.round(p.percent || 0) }));
    au.on('update-downloaded', (info) => this.set({ status: 'ready', available: info.version, progress: 100 }));
    au.on('error', (err) => this.set({ status: 'error', error: friendly(err), lastCheck: Date.now() }));
    setTimeout(() => this.check(), 15000);
    setInterval(() => this.check(), CHECK_EVERY_MS);
  }

  async check() {
    if (!this.au) return this.state;
    if (this.state.status === 'downloading' || this.state.status === 'ready') return this.state;
    try { await this.au.checkForUpdates(); } catch (e) { this.set({ status: 'error', error: friendly(e) }); }
    return this.state;
  }

  async download() {
    if (this.mode === 'macswap') return this.macDownload();
    if (this.mode === 'notify' || !this.au) { if (this.state.releaseUrl) shell.openExternal(this.state.releaseUrl); return; }
    try { this.set({ status: 'downloading', progress: 0 }); await this.au.downloadUpdate(); } catch (e) { this.set({ status: 'error', error: friendly(e) }); }
  }

  install() {
    if (this.mode === 'macswap') return this.state.status === 'ready' ? this.macInstall() : this.macDownload();
    if (this.state.status !== 'ready' || !this.au) return this.download();
    setImmediate(() => { try { this.au.quitAndInstall(false, true); } catch (e) { this.set({ status: 'error', error: friendly(e) }); } });
  }
}

// ------------------------------------------------------------------ macOS self-update
// The running app, e.g. /Applications/NoamBrowser.app — only if NoamBrowser may replace it.
function macBundle() {
  if (process.platform !== 'darwin') return null;
  const bundle = path.resolve(process.execPath, '..', '..', '..');
  if (!bundle.endsWith('.app') || bundle.includes('/AppTranslocation/') || bundle.startsWith('/Volumes/')) return null; // opened straight from Downloads or the .dmg
  try { fs.accessSync(path.dirname(bundle), fs.constants.W_OK); fs.accessSync(bundle, fs.constants.W_OK); return bundle; } catch { return null; }
}
Updater.prototype.macDownload = async function () {
  if (this.macBusy || this.state.status === 'ready') return;
  const info = this.info; if (!info) return this.check();
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const file = (info.files || []).find((f) => f.url.endsWith(`-${arch}-mac.zip`)) || (info.files || []).find((f) => f.url.endsWith('-mac.zip') && !/arm64|x64/.test(f.url));
  if (!file) { this.set({ status: 'error', error: 'This update has no Mac download for your computer yet.' }); return; }
  this.macBusy = true;
  const dir = path.join(app.getPath('temp'), 'noam-update'); const zip = path.join(dir, path.basename(file.url)); const out = path.join(dir, 'app');
  try {
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
    this.set({ status: 'downloading', available: info.version, progress: 0 });
    const url = `https://github.com/${this.publish.owner}/${this.publish.repo}/releases/download/v${info.version}/${file.url}`;
    const { net } = require('electron');
    const res = await net.fetch(url, { bypassCustomProtocolHandlers: true });
    if (!res.ok) throw new Error('Download failed (' + res.status + ')');
    const total = +res.headers.get('content-length') || file.size || 0;
    const hash = crypto.createHash('sha512'); const ws = fs.createWriteStream(zip); let got = 0, shown = -1;
    for await (const chunk of res.body) {
      const b = Buffer.from(chunk); hash.update(b); got += b.length;
      if (!ws.write(b)) await new Promise((r) => ws.once('drain', r));
      const pc = total ? Math.floor(got / total * 100) : 0; if (pc !== shown) { shown = pc; this.set({ progress: pc }); }
    }
    await new Promise((r, j) => ws.end((e) => (e ? j(e) : r())));
    if (file.sha512 && hash.digest('base64') !== file.sha512) throw new Error('The download was damaged (checksum didn’t match). Try again.');
    execFileSync('/usr/bin/ditto', ['-x', '-k', zip, out]); // keeps the app's signature and links intact
    const fresh = path.join(out, 'NoamBrowser.app');
    const ver = execFileSync('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', path.join(fresh, 'Contents', 'Info.plist')]).toString().trim();
    if (ver !== info.version) throw new Error('The downloaded app is version ' + ver + ', expected ' + info.version + '.');
    try { execFileSync('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', fresh]); } catch {}
    fs.rmSync(zip, { force: true });
    this.macFresh = fresh;
    this.set({ status: 'ready', progress: 100 });
  } catch (e) { this.set({ status: 'error', error: friendly(e) }); }
  finally { this.macBusy = false; }
};
Updater.prototype.macInstall = function () {
  const bundle = macBundle(); const fresh = this.macFresh;
  if (!bundle || !fresh || !fs.existsSync(fresh)) { this.set({ status: 'error', error: 'The update files are gone. Check for updates again.' }); return; }
  const script = path.join(app.getPath('temp'), 'noam-update', 'swap.sh');
  fs.writeFileSync(script, `#!/bin/bash
# NoamBrowser update: wait for the app to close, swap in the new version, open it again.
PID="$1"; OLD="$2"; NEW="$3"
for i in $(seq 1 300); do kill -0 "$PID" 2>/dev/null || break; sleep 0.2; done
kill -0 "$PID" 2>/dev/null && exit 0 # NoamBrowser didn't close (you cancelled), so leave everything as it is
BAK="$OLD.old-version"
rm -rf "$BAK"
if mv "$OLD" "$BAK" && mv "$NEW" "$OLD"; then rm -rf "$BAK"; else [ -d "$OLD" ] || mv "$BAK" "$OLD"; fi
xattr -dr com.apple.quarantine "$OLD" 2>/dev/null
open "$OLD"
rm -rf "$(dirname "$0")"
`, { mode: 0o755 });
  spawn('/bin/bash', [script, String(process.pid), bundle, fresh], { detached: true, stdio: 'ignore' }).unref();
  setImmediate(() => app.quit());
};

function stripHtml(n) {
  if (!n) return '';
  const s = Array.isArray(n) ? n.map((x) => x.note || '').join('\n') : String(n);
  return s.replace(/<[^>]+>/g, '').trim().slice(0, 1200);
}
function friendly(e) {
  const m = String(e && e.message || e);
  if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED|net::ERR/i.test(m)) return 'Couldn’t reach the update server. Check your connection.';
  if (/404/.test(m)) return 'No published release found yet.';
  if (/signature|code sign/i.test(m)) return 'The update’s signature didn’t match, so it wasn’t installed.';
  return m.split('\n')[0].slice(0, 200);
}

module.exports = { Updater };
