// Imports bookmarks and history from Chromium-based browsers installed on this
// computer (Chrome, Edge, Brave, Vivaldi, Opera, Chromium). Read-only: the
// other browser's files are copied to a temp folder first and never modified.
// Saved passwords aren't read directly (they're locked to that browser), so for
// those we point people to the browser's own CSV export.
const fs = require('fs');
const os = require('os');
const path = require('path');

function roots() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const l = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const r = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return [
      ['chrome', 'Google Chrome', path.join(l, 'Google', 'Chrome', 'User Data')],
      ['edge', 'Microsoft Edge', path.join(l, 'Microsoft', 'Edge', 'User Data')],
      ['brave', 'Brave', path.join(l, 'BraveSoftware', 'Brave-Browser', 'User Data')],
      ['vivaldi', 'Vivaldi', path.join(l, 'Vivaldi', 'User Data')],
      ['opera', 'Opera', path.join(r, 'Opera Software', 'Opera Stable')],
      ['chromium', 'Chromium', path.join(l, 'Chromium', 'User Data')],
    ];
  }
  if (process.platform === 'darwin') {
    const s = path.join(home, 'Library', 'Application Support');
    return [
      ['chrome', 'Google Chrome', path.join(s, 'Google', 'Chrome')],
      ['edge', 'Microsoft Edge', path.join(s, 'Microsoft Edge')],
      ['brave', 'Brave', path.join(s, 'BraveSoftware', 'Brave-Browser')],
      ['vivaldi', 'Vivaldi', path.join(s, 'Vivaldi')],
      ['opera', 'Opera', path.join(s, 'com.operasoftware.Opera')],
      ['chromium', 'Chromium', path.join(s, 'Chromium')],
    ];
  }
  const c = path.join(home, '.config');
  return [
    ['chrome', 'Google Chrome', path.join(c, 'google-chrome')],
    ['edge', 'Microsoft Edge', path.join(c, 'microsoft-edge')],
    ['brave', 'Brave', path.join(c, 'BraveSoftware', 'Brave-Browser')],
    ['vivaldi', 'Vivaldi', path.join(c, 'vivaldi')],
    ['opera', 'Opera', path.join(c, 'opera')],
    ['chromium', 'Chromium', path.join(c, 'chromium')],
    ['chrome-snap', 'Chromium (Snap)', path.join(home, 'snap', 'chromium', 'common', 'chromium')],
  ];
}

function profilesIn(root) {
  if (!fs.existsSync(root)) return [];
  // Opera keeps the profile files in the root itself.
  if (fs.existsSync(path.join(root, 'Bookmarks')) || fs.existsSync(path.join(root, 'History'))) return [{ dir: root, name: 'Default' }];
  let names = {};
  try { names = JSON.parse(fs.readFileSync(path.join(root, 'Local State'), 'utf8')).profile?.info_cache || {}; } catch {}
  const out = [];
  for (const d of fs.readdirSync(root)) {
    if (!(d === 'Default' || /^Profile \d+$/.test(d))) continue;
    const dir = path.join(root, d);
    if (fs.existsSync(path.join(dir, 'Bookmarks')) || fs.existsSync(path.join(dir, 'History'))) out.push({ dir, name: names[d]?.name || d });
  }
  return out;
}

function detect() {
  const found = [];
  for (const [id, label, root] of roots()) {
    for (const p of profilesIn(root)) {
      found.push({
        key: id + '|' + p.dir, browser: label, profile: p.name,
        bookmarks: fs.existsSync(path.join(p.dir, 'Bookmarks')),
        history: fs.existsSync(path.join(p.dir, 'History')),
      });
    }
  }
  return found;
}

function readBookmarks(dir) {
  const out = [];
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(dir, 'Bookmarks'), 'utf8')); } catch { return out; }
  const walk = (node, folder) => {
    if (!node) return;
    if (node.type === 'url' && /^https?:/i.test(node.url || '')) out.push({ url: node.url, title: node.name || node.url, folder });
    for (const ch of node.children || []) walk(ch, node.type === 'folder' && node.name && !['Bookmarks bar', 'Bookmarks Bar', 'Other bookmarks', 'Mobile bookmarks'].includes(node.name) ? node.name : folder);
  };
  for (const k of ['bookmark_bar', 'other', 'synced']) walk(data.roots?.[k], '');
  return out;
}

function readHistory(dir, limit = 20000) {
  const src = path.join(dir, 'History');
  if (!fs.existsSync(src)) return [];
  const tmp = path.join(os.tmpdir(), `noam-import-${process.pid}-${Date.now()}.sqlite`);
  try {
    fs.copyFileSync(src, tmp); // the other browser may hold a lock; read our own copy
    for (const ext of ['-wal', '-journal']) { try { fs.copyFileSync(src + ext, tmp + ext); } catch {} }
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(tmp, { readOnly: true });
    const stmt = db.prepare('SELECT url, title, visit_count, last_visit_time FROM urls WHERE hidden = 0 ORDER BY last_visit_time DESC LIMIT ?');
    stmt.setReadBigInts(true); // Chromium timestamps don't fit in a JS number
    const rows = stmt.all(limit);
    db.close();
    // Chromium time = microseconds since 1601-01-01
    return rows.filter((r) => /^https?:/i.test(r.url)).map((r) => ({
      url: r.url, title: r.title || r.url, visits: Number(r.visit_count) || 1,
      t: Number(BigInt(r.last_visit_time) / 1000n) - 11644473600000,
    })).filter((r) => r.t > 0);
  } finally {
    for (const ext of ['', '-wal', '-journal']) { try { fs.unlinkSync(tmp + ext); } catch {} }
  }
}

function run(key, { bookmarks: doB = true, history: doH = true } = {}) {
  const dir = key.split('|').slice(1).join('|');
  if (!detect().some((d) => d.key === key)) throw new Error('That browser profile is no longer available.');
  return { bookmarks: doB ? readBookmarks(dir) : [], history: doH ? readHistory(dir) : [] };
}

module.exports = { detect, run };
