// NoamBrowser auto-updater (GitHub Releases via electron-updater).
//  - Windows installer & Linux AppImage/.deb: download in the background, then
//    "Restart to update".
//  - macOS (unsigned) and the Windows portable exe can't replace themselves, so
//    they only notify and open the download page.
const { app, shell } = require('electron');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

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
      : process.platform === 'darwin' || portable ? 'notify'
      : process.platform === 'linux' && isDeb ? 'deb'
      : 'auto';
    this.state.canAutoInstall = this.mode === 'auto' || this.mode === 'deb';
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
    au.autoDownload = this.mode !== 'notify' && this.settings.get('updates').auto !== false;
    au.autoInstallOnAppQuit = this.mode !== 'notify';
    au.allowPrerelease = false;
    au.logger = null;
    au.on('checking-for-update', () => this.set({ status: 'checking', error: '' }));
    au.on('update-not-available', () => this.set({ status: 'current', lastCheck: Date.now() }));
    au.on('update-available', (info) => this.set({ status: this.mode === 'notify' ? 'available' : au.autoDownload ? 'downloading' : 'available', available: info.version, lastCheck: Date.now(), notes: stripHtml(info.releaseNotes) }));
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
    if (this.mode === 'notify' || !this.au) { if (this.state.releaseUrl) shell.openExternal(this.state.releaseUrl); return; }
    try { this.set({ status: 'downloading', progress: 0 }); await this.au.downloadUpdate(); } catch (e) { this.set({ status: 'error', error: friendly(e) }); }
  }

  install() {
    if (this.state.status !== 'ready' || !this.au) return this.download();
    setImmediate(() => { try { this.au.quitAndInstall(false, true); } catch (e) { this.set({ status: 'error', error: friendly(e) }); } });
  }
}

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
