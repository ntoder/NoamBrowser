// NoamBrowser password manager.
// The vault is a single encrypted file. On Windows (DPAPI) and macOS (Keychain)
// the key is held by the operating system via safeStorage. On Linux, the system
// keyring is used when present; without one we fall back to an AES-256-GCM key
// stored in a file only your user account can read, and say so in the UI.
const { safeStorage } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class Passwords {
  constructor(userData) {
    this.file = path.join(userData, 'passwords.vault');
    this.keyFile = path.join(userData, 'passwords.key');
    this.items = [];
    this.never = []; // origins the user said "never save" for
    this.load();
  }

  protection() {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const backend = safeStorage.getSelectedStorageBackend ? safeStorage.getSelectedStorageBackend() : 'os';
        if (backend !== 'basic_text') return { level: 'os', label: process.platform === 'win32' ? 'Windows Data Protection' : process.platform === 'darwin' ? 'macOS Keychain' : 'your system keyring' };
      }
    } catch {}
    return { level: 'file', label: 'a private key file (no system keyring found)' };
  }

  fileKey() {
    try { const k = fs.readFileSync(this.keyFile); if (k.length === 32) return k; } catch {}
    const k = crypto.randomBytes(32);
    fs.writeFileSync(this.keyFile, k, { mode: 0o600 });
    return k;
  }

  encrypt(buf) {
    if (this.protection().level === 'os') return Buffer.concat([Buffer.from('NBV1'), safeStorage.encryptString(buf.toString('utf8'))]);
    const key = this.fileKey(); const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([c.update(buf), c.final()]);
    return Buffer.concat([Buffer.from('NBF1'), iv, c.getAuthTag(), enc]);
  }

  decrypt(buf) {
    const tag = buf.subarray(0, 4).toString();
    if (tag === 'NBV1') return Buffer.from(safeStorage.decryptString(buf.subarray(4)), 'utf8');
    if (tag === 'NBF1') {
      const key = this.fileKey(); const iv = buf.subarray(4, 16); const at = buf.subarray(16, 32);
      const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(at);
      return Buffer.concat([d.update(buf.subarray(32)), d.final()]);
    }
    throw new Error('unknown vault format');
  }

  load() {
    try {
      if (!fs.existsSync(this.file)) return;
      const data = JSON.parse(this.decrypt(fs.readFileSync(this.file)).toString('utf8'));
      this.items = data.items || []; this.never = data.never || [];
    } catch (e) { console.error('password vault unreadable:', e.message); this.loadError = e.message; }
  }

  save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, this.encrypt(Buffer.from(JSON.stringify({ items: this.items, never: this.never }))), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  forOrigin(origin) {
    return this.items.filter((i) => i.origin === origin).sort((a, b) => (b.used || 0) - (a.used || 0));
  }

  // Called when a login form is submitted. Returns what the UI should offer.
  captured({ origin, username, password }) {
    if (!origin || !password || password.length > 512) return null;
    if (this.never.includes(origin)) return null;
    const existing = this.items.find((i) => i.origin === origin && i.username === username);
    if (existing && existing.password === password) { existing.used = Date.now(); this.save(); return null; }
    return { kind: existing ? 'update' : 'save', origin, username, password, id: existing ? existing.id : null };
  }

  upsert({ origin, username, password, id }) {
    let item = id ? this.items.find((i) => i.id === id) : this.items.find((i) => i.origin === origin && i.username === username);
    if (item) { item.password = password; item.username = username; item.updated = Date.now(); }
    else { item = { id: crypto.randomUUID(), origin, username, password, created: Date.now(), updated: Date.now(), used: Date.now() }; this.items.push(item); }
    this.save();
    return item;
  }

  neverFor(origin) { if (!this.never.includes(origin)) this.never.push(origin); this.save(); }
  remove(id) { this.items = this.items.filter((i) => i.id !== id); this.save(); }
  markUsed(id) { const i = this.items.find((x) => x.id === id); if (i) { i.used = Date.now(); this.save(); } }
  list() { return this.items.map(({ password, ...rest }) => ({ ...rest, hasPassword: !!password })).sort((a, b) => a.origin.localeCompare(b.origin)); }
  reveal(id) { const i = this.items.find((x) => x.id === id); return i ? i.password : null; }
  removeNever(origin) { this.never = this.never.filter((o) => o !== origin); this.save(); }

  // Merge from sync: newest `updated` wins per (origin, username).
  mergeFrom(remote) {
    let changed = false;
    for (const r of remote || []) {
      const l = this.items.find((i) => i.origin === r.origin && i.username === r.username);
      if (!l) { this.items.push({ ...r }); changed = true; }
      else if ((r.updated || 0) > (l.updated || 0)) { Object.assign(l, r, { id: l.id }); changed = true; }
    }
    if (changed) this.save();
    return changed;
  }

  exportCsv() {
    const q = (s) => '"' + String(s ?? '').replace(/"/g, '""') + '"';
    return 'name,url,username,password\n' + this.items.map((i) => [new URL(i.origin).host, i.origin, i.username, i.password].map(q).join(',')).join('\n');
  }

  importCsv(text) {
    const rows = parseCsv(text);
    if (!rows.length) return 0;
    const head = rows.shift().map((h) => h.toLowerCase());
    const iu = head.indexOf('url'), iuser = head.indexOf('username'), ip = head.indexOf('password');
    if (iu < 0 || ip < 0) throw new Error('This CSV doesn’t have url and password columns.');
    let n = 0;
    for (const r of rows) {
      let origin; try { origin = new URL(r[iu]).origin; } catch { continue; }
      if (!r[ip]) continue;
      this.upsert({ origin, username: r[iuser] || '', password: r[ip] }); n++;
    }
    return n;
  }
}

function parseCsv(text) {
  const rows = []; let row = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x !== ''));
}

module.exports = { Passwords };
