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
    ['chrome-beta', 'Google Chrome Beta', path.join(c, 'google-chrome-beta')],
    // Flatpak installs keep their data under ~/.var/app
    ['chrome-flatpak', 'Google Chrome (Flatpak)', path.join(home, '.var', 'app', 'com.google.Chrome', 'config', 'google-chrome')],
    ['brave-flatpak', 'Brave (Flatpak)', path.join(home, '.var', 'app', 'com.brave.Browser', 'config', 'BraveSoftware', 'Brave-Browser')],
    ['chromium-flatpak', 'Chromium (Flatpak)', path.join(home, '.var', 'app', 'org.chromium.Chromium', 'config', 'chromium')],
    ['edge-flatpak', 'Microsoft Edge (Flatpak)', path.join(home, '.var', 'app', 'com.microsoft.Edge', 'config', 'microsoft-edge')],
    ['vivaldi-flatpak', 'Vivaldi (Flatpak)', path.join(home, '.var', 'app', 'com.vivaldi.Vivaldi', 'config', 'vivaldi')],
  ];
}

// Newer Chrome keeps the bookmarks you sync with your Google account in a separate "AccountBookmarks" file.
const BOOKMARK_FILES = ['Bookmarks', 'AccountBookmarks'];
const hasBookmarks = (dir) => BOOKMARK_FILES.some((f) => fs.existsSync(path.join(dir, f)));
const hasData = (dir) => hasBookmarks(dir) || fs.existsSync(path.join(dir, 'History'));

function profilesIn(root) {
  if (!fs.existsSync(root)) return [];
  // Opera keeps the profile files in the root itself.
  if (hasData(root)) return [{ dir: root, name: 'Default' }];
  let names = {};
  try { names = JSON.parse(fs.readFileSync(path.join(root, 'Local State'), 'utf8')).profile?.info_cache || {}; } catch {}
  const out = [];
  for (const d of fs.readdirSync(root)) {
    if (!(d === 'Default' || /^Profile \d+$/.test(d))) continue;
    const dir = path.join(root, d);
    if (hasData(dir)) out.push({ dir, name: names[d]?.name || d });
  }
  return out;
}

function detect() {
  const found = [];
  for (const [id, label, root] of roots()) {
    for (const p of profilesIn(root)) {
      found.push({
        key: id + '|' + p.dir, browser: label, profile: p.name,
        bookmarks: hasBookmarks(p.dir),
        history: fs.existsSync(path.join(p.dir, 'History')),
      });
    }
  }
  return found;
}

function readBookmarks(dir) {
  const out = []; const seen = new Set();
  const walk = (node, folder) => {
    if (!node) return;
    if (node.type === 'url' && /^https?:/i.test(node.url || '') && !seen.has(node.url)) { seen.add(node.url); out.push({ url: node.url, title: node.name || node.url, folder }); }
    for (const ch of node.children || []) walk(ch, node.type === 'folder' && node.name && !ROOT_NAMES.has(node.name) ? node.name : folder);
  };
  let read = 0;
  for (const f of BOOKMARK_FILES) {
    let data; try { data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); read++; } catch { continue; }
    for (const k of Object.keys(data.roots || {})) if (data.roots[k] && typeof data.roots[k] === 'object') walk(data.roots[k], '');
  }
  if (!read && hasBookmarks(dir)) throw new Error('Couldn’t read that browser’s bookmarks file.');
  return out;
}
const ROOT_NAMES = new Set(['Bookmarks bar', 'Bookmarks Bar', 'Other bookmarks', 'Other Bookmarks', 'Mobile bookmarks', 'Favorites bar', 'Other favorites', 'Speed Dials', 'Trash']);

// A bookmarks file exported from any browser ("Netscape bookmark file" HTML)
function parseBookmarksHtml(html) {
  const out = []; const seen = new Set(); const stack = []; let pending = null;
  const dec = (t) => String(t || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).trim();
  const re = /<(\/?)(dl|h3|a)\b([^>]*)>([\s\S]*?)(?=<)/gi; let m;
  while ((m = re.exec(html))) {
    const [, close, tag, attrs, text] = m; const t = tag.toLowerCase();
    if (t === 'h3' && !close) pending = dec(text);
    else if (t === 'dl') { if (close) stack.pop(); else { stack.push(pending && !ROOT_NAMES.has(pending) ? pending : stack[stack.length - 1] || ''); pending = null; } }
    else if (t === 'a' && !close) {
      const href = (attrs.match(/href\s*=\s*"([^"]*)"/i) || attrs.match(/href\s*=\s*'([^']*)'/i) || [])[1];
      const url = dec(href);
      if (/^https?:/i.test(url) && !seen.has(url)) { seen.add(url); out.push({ url, title: dec(text) || url, folder: stack[stack.length - 1] || '' }); }
    }
  }
  return out;
}

function readHistory(dir, limit = 20000) {
  const src = path.join(dir, 'History');
  if (!fs.existsSync(src)) return [];
  const tmp = path.join(os.tmpdir(), `noam-import-${process.pid}-${Date.now()}.sqlite`);
  try {
    try { fs.copyFileSync(src, tmp); } catch (e) { // the other browser may hold a lock; read our own copy
      throw new Error(/EBUSY|EPERM|EACCES|locked/i.test(String(e && (e.code || e.message))) ? 'History couldn’t be read while that browser is open. Close it and press Import again to bring your history too.' : 'Couldn’t read that browser’s history.');
    }
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

// Each part is read separately, so if one fails (say history is locked) the other still comes in.
function run(key, { bookmarks: doB = true, history: doH = true } = {}) {
  const dir = key.split('|').slice(1).join('|');
  if (!detect().some((d) => d.key === key)) throw new Error('That browser profile is no longer available.');
  const out = { bookmarks: [], history: [], errors: [] };
  if (doB) { try { out.bookmarks = readBookmarks(dir); } catch (e) { out.errors.push(e.message); } }
  if (doH) { try { out.history = readHistory(dir); } catch (e) { out.errors.push(e.message); } }
  return out;
}

module.exports = { detect, run, parseBookmarksHtml };
