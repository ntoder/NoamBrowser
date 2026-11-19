// NoamBrowser Sync — no server needed.
// Each computer writes its own encrypted file into a folder you choose that is
// already synced by OneDrive / Google Drive / Dropbox / iCloud Drive / a USB
// stick. Every computer reads the other computers' files and merges them.
// Encryption: scrypt(passphrase) -> AES-256-GCM. Without the passphrase the
// files are unreadable, even to the cloud provider.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { EventEmitter } = require('events');

const MAGIC = 'NBSYNC1';
const SYNCED_SETTINGS = ['searchEngine', 'homepage', 'theme', 'accent', 'appearance', 'shields', 'showBookmarksBar', 'siteShieldsOff', 'siteDark', 'translate', 'widgets', 'gestures', 'media', 'sidePanel', 'topSitesHidden', 'blueLight', 'zmanimAlerts', 'focus', 'dictionary', 'perf', 'containers'];

function deriveKey(pass, salt) { return crypto.scryptSync(pass, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }); }

function seal(obj, pass) {
  const salt = crypto.randomBytes(16); const iv = crypto.randomBytes(12);
  const key = deriveKey(pass, salt);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj)), c.final()]);
  return Buffer.concat([Buffer.from(MAGIC), salt, iv, c.getAuthTag(), enc]);
}
function open(buf, pass) {
  if (buf.subarray(0, MAGIC.length).toString() !== MAGIC) throw new Error('not a NoamBrowser sync file');
  let o = MAGIC.length;
  const salt = buf.subarray(o, o += 16), iv = buf.subarray(o, o += 12), tag = buf.subarray(o, o += 16);
  const d = crypto.createDecipheriv('aes-256-gcm', deriveKey(pass, salt), iv); d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(buf.subarray(o)), d.final()]).toString('utf8'));
}

class Sync extends EventEmitter {
  constructor({ settings, bookmarks, passwords, userData, safeStorage }) {
    super();
    this.settings = settings; this.bookmarks = bookmarks; this.passwords = passwords; this.safe = safeStorage;
    this.secretFile = path.join(userData, 'sync.secret');
    this.timer = null; this.busy = false;
    this.status = { state: 'off', last: 0, devices: [], error: '' };
  }

  cfg() { return this.settings.get('sync'); }
  deviceId() {
    const c = this.cfg();
    if (!c.deviceId) { c.deviceId = crypto.randomBytes(6).toString('hex'); this.settings.set('sync', c); }
    return c.deviceId;
  }
  deviceName() { return os.hostname().replace(/[^\w.-]+/g, '-').slice(0, 40) || 'computer'; }

  passphrase() {
    try {
      const b = fs.readFileSync(this.secretFile);
      return this.safe.isEncryptionAvailable() && b.subarray(0, 4).toString() === 'NBS1' ? this.safe.decryptString(b.subarray(4)) : b.subarray(4).toString('utf8');
    } catch { return null; }
  }
  storePassphrase(p) {
    const body = this.safe.isEncryptionAvailable() ? Buffer.concat([Buffer.from('NBS1'), this.safe.encryptString(p)]) : Buffer.concat([Buffer.from('NBS0'), Buffer.from(p, 'utf8')]);
    fs.writeFileSync(this.secretFile, body, { mode: 0o600 });
  }

  setStatus(p) { Object.assign(this.status, p); this.emit('status', { ...this.status, ...this.publicCfg() }); }
  publicCfg() { const c = this.cfg(); return { enabled: !!c.enabled, folder: c.folder || '', passwords: !!c.passwords, deviceName: this.deviceName() }; }

  async enable({ folder, passphrase, passwords }) {
    if (!folder || !fs.existsSync(folder)) throw new Error('Choose a folder that exists.');
    if (!passphrase || passphrase.length < 8) throw new Error('Use a sync passphrase of at least 8 characters.');
    // If other devices already sync here, make sure the passphrase matches.
    const others = this.otherFiles(folder);
    for (const f of others) { try { open(fs.readFileSync(f), passphrase); break; } catch (e) { if (/not a NoamBrowser/.test(e.message)) continue; throw new Error('That passphrase doesn’t match the one your other computers use.'); } }
    this.storePassphrase(passphrase);
    this.settings.set('sync', { ...this.cfg(), enabled: true, folder, passwords: !!passwords });
    await this.run();
    this.start();
    return this.status;
  }

  disable() {
    this.settings.set('sync', { ...this.cfg(), enabled: false });
    clearInterval(this.timer); this.timer = null;
    try { fs.unlinkSync(this.secretFile); } catch {}
    this.setStatus({ state: 'off', error: '' });
  }

  start() {
    clearInterval(this.timer);
    if (!this.cfg().enabled) { this.setStatus({ state: 'off' }); return; }
    this.timer = setInterval(() => this.run().catch(() => {}), 60 * 1000);
    setTimeout(() => this.run().catch(() => {}), 5000);
  }

  otherFiles(folder) {
    const dir = path.join(folder, 'NoamBrowser Sync');
    if (!fs.existsSync(dir)) return [];
    const mine = `device-${this.deviceId()}.nbsync`;
    return fs.readdirSync(dir).filter((f) => f.endsWith('.nbsync') && f !== mine).map((f) => path.join(dir, f));
  }

  snapshot() {
    const s = {};
    for (const k of SYNCED_SETTINGS) s[k] = this.settings.get(k);
    const c = this.cfg();
    return {
      device: { id: this.deviceId(), name: this.deviceName(), platform: process.platform },
      written: Date.now(),
      settingsUpdated: c.settingsUpdated || 0,
      settings: s,
      bookmarks: this.bookmarks.get('items'),
      bookmarkTombstones: this.bookmarks.get('tombstones') || [],
      // the bookmarks bar order and the order of folders
      bookmarkLayout: { t: this.bookmarks.get('layoutUpdated') || 0, folders: this.bookmarks.get('folders') || [], bar: this.bookmarks.get('barOrder') || [] },
      passwords: c.passwords ? this.passwords.items : undefined,
      extras: this.extra ? this.extra.snapshot() : undefined,
    };
  }

  merge(remote) {
    let changed = false;
    // bookmarks: the same bookmark (same id, or same folder + address) is matched up; the newest edit wins (name,
    // folder, address); a deletion wins if it's newer. The same link in two folders stays two bookmarks.
    const local = this.bookmarks.get('items');
    const tkey = (t) => (t.id ? 'id:' + t.id : 'url:' + t.url);
    const tomb = new Map((this.bookmarks.get('tombstones') || []).map((t) => [tkey(t), t]));
    for (const t of remote.bookmarkTombstones || []) { const k = tkey(t); if (!tomb.has(k) || tomb.get(k).t < t.t) { tomb.set(k, t); changed = true; } }
    const fu = (b) => (b.folder || '') + '\n' + b.url;
    const all = local.map((b) => ({ ...b }));
    const byId = new Map(all.filter((b) => b.id).map((b) => [b.id, b])); const byFu = new Map(all.map((b) => [fu(b), b]));
    const when = (b) => b.updated || b.added || 0;
    for (const rb of remote.bookmarks || []) {
      const lb = (rb.id && byId.get(rb.id)) || byFu.get(fu(rb));
      if (!lb) { const n = { ...rb }; all.push(n); if (n.id) byId.set(n.id, n); byFu.set(fu(n), n); changed = true; continue; }
      if (when(rb) > when(lb) && (rb.title !== lb.title || (rb.folder || '') !== (lb.folder || '') || rb.url !== lb.url)) {
        byFu.delete(fu(lb)); Object.assign(lb, { title: rb.title, folder: rb.folder || '', url: rb.url, updated: rb.updated }); byFu.set(fu(lb), lb); changed = true;
      }
    }
    const dead = (b) => { const a = b.id && tomb.get('id:' + b.id), u = tomb.get('url:' + b.url); return Math.max(a ? a.t : 0, u ? u.t : 0) > when(b); };
    // the same bookmark twice (from two older copies) is kept once
    const seen = new Set(); const merged = all.filter((b) => { if (dead(b)) return false; const k = b.id || fu(b); if (seen.has(k)) return false; seen.add(k); return true; });
    if (merged.length !== local.length) changed = true;
    if (changed) { this.bookmarks.set('items', merged); this.bookmarks.set('tombstones', [...tomb.values()].sort((a, b) => a.t - b.t).slice(-2000)); }
    const L = remote.bookmarkLayout;
    if (L && L.t > (this.bookmarks.get('layoutUpdated') || 0)) { this.bookmarks.set('folders', Array.isArray(L.folders) ? L.folders : []); this.bookmarks.set('barOrder', Array.isArray(L.bar) ? L.bar : []); this.bookmarks.set('layoutUpdated', L.t); changed = true; }
    // settings: whole-snapshot, newest wins
    let settingsChanged = false;
    if ((remote.settingsUpdated || 0) > (this.cfg().settingsUpdated || 0) && remote.settings) {
      for (const k of SYNCED_SETTINGS) if (remote.settings[k] !== undefined) this.settings.set(k, remote.settings[k]);
      this.settings.set('sync', { ...this.cfg(), settingsUpdated: remote.settingsUpdated });
      settingsChanged = true;
    }
    let extrasChanged = false;
    if (this.extra && remote.extras) extrasChanged = this.extra.merge(remote.extras);
    let pwChanged = false;
    if (this.cfg().passwords && remote.passwords) pwChanged = this.passwords.mergeFrom(remote.passwords);
    return { bookmarks: changed, settings: settingsChanged, passwords: pwChanged, extras: extrasChanged };
  }

  async run() {
    const c = this.cfg();
    if (!c.enabled || this.busy) return this.status;
    this.busy = true;
    try {
      const pass = this.passphrase();
      if (!pass) throw new Error('Sync passphrase missing — set up sync again.');
      if (!fs.existsSync(c.folder)) throw new Error('The sync folder isn’t available. Is the drive connected?');
      this.setStatus({ state: 'syncing', error: '' });
      const devices = [];
      const result = { bookmarks: false, settings: false, passwords: false };
      for (const f of this.otherFiles(c.folder)) {
        try {
          const remote = open(fs.readFileSync(f), pass);
          devices.push({ name: remote.device?.name || 'computer', platform: remote.device?.platform, written: remote.written });
          const r = this.merge(remote);
          for (const k of Object.keys(r)) result[k] = result[k] || r[k];
        } catch (e) { devices.push({ name: path.basename(f), error: 'can’t read (different passphrase?)' }); }
      }
      const dir = path.join(c.folder, 'NoamBrowser Sync');
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `device-${this.deviceId()}.nbsync`);
      fs.writeFileSync(file + '.tmp', seal(this.snapshot(), pass));
      fs.renameSync(file + '.tmp', file);
      this.setStatus({ state: 'on', last: Date.now(), devices });
      this.emit('merged', result);
    } catch (e) {
      this.setStatus({ state: 'error', error: e.message });
    } finally { this.busy = false; }
    return this.status;
  }

  touchSettings() { this.settings.set('sync', { ...this.cfg(), settingsUpdated: Date.now() }); } // also used by the NoamBrowser account
}

module.exports = { Sync, seal, open };
