// NoamBrowser — switching from another browser, part 2:
//  • Firefox (and Waterfox, LibreWolf, Zen): bookmarks with folders and the toolbar, history, open tabs
//  • both kinds of browser: default search engine, home page / startup, installed extensions
// Like importer.js it only reads copies of the other browser's files and never changes them.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const SEP = ' › ';

// ---------------------------------------------------------------- where Firefox-family browsers keep profiles
function firefoxRoots() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const r = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return [['firefox', 'Firefox', path.join(r, 'Mozilla', 'Firefox')], ['waterfox', 'Waterfox', path.join(r, 'Waterfox')], ['librewolf', 'LibreWolf', path.join(r, 'librewolf')], ['zen', 'Zen', path.join(r, 'zen')]];
  }
  if (process.platform === 'darwin') {
    const s = path.join(home, 'Library', 'Application Support');
    return [['firefox', 'Firefox', path.join(s, 'Firefox')], ['waterfox', 'Waterfox', path.join(s, 'Waterfox')], ['librewolf', 'LibreWolf', path.join(s, 'librewolf')], ['zen', 'Zen', path.join(s, 'zen')]];
  }
  return [
    ['firefox', 'Firefox', path.join(home, '.mozilla', 'firefox')],
    ['firefox-snap', 'Firefox (Snap)', path.join(home, 'snap', 'firefox', 'common', '.mozilla', 'firefox')],
    ['firefox-flatpak', 'Firefox (Flatpak)', path.join(home, '.var', 'app', 'org.mozilla.firefox', '.mozilla', 'firefox')],
    ['librewolf', 'LibreWolf', path.join(home, '.librewolf')],
    ['librewolf-flatpak', 'LibreWolf (Flatpak)', path.join(home, '.var', 'app', 'io.gitlab.librewolf-community', '.librewolf')],
    ['waterfox', 'Waterfox', path.join(home, '.waterfox')],
    ['zen', 'Zen', path.join(home, '.zen')],
  ];
}
function firefoxProfiles(root) {
  let ini; try { ini = fs.readFileSync(path.join(root, 'profiles.ini'), 'utf8'); } catch { return []; }
  const sections = []; let cur = null;
  for (const line of ini.split(/\r?\n/)) {
    const h = line.match(/^\[(.+)\]$/); if (h) { cur = { _: h[1] }; sections.push(cur); continue; }
    const kv = line.match(/^([^=]+)=(.*)$/); if (kv && cur) cur[kv[1].trim()] = kv[2].trim();
  }
  const installDefault = sections.filter((s) => s._.startsWith('Install')).map((s) => s.Default).filter(Boolean);
  const out = [];
  for (const s of sections.filter((x) => x._.startsWith('Profile') && x.Path)) {
    const dir = s.IsRelative === '0' ? s.Path : path.join(root, s.Path);
    if (!fs.existsSync(path.join(dir, 'places.sqlite'))) continue;
    const isDefault = installDefault.includes(s.Path) || s.Default === '1';
    let used = 0; try { used = fs.statSync(path.join(dir, 'places.sqlite')).mtimeMs; } catch {}
    out.push({ dir, name: s.Name || path.basename(dir), isDefault, used });
  }
  // the profile you actually use first: the default one, then the most recently used
  return out.sort((a, b) => (b.isDefault - a.isDefault) || (b.used - a.used));
}
function detectFirefox() {
  const found = [];
  for (const [id, label, root] of firefoxRoots()) for (const p of firefoxProfiles(root)) found.push({ key: id + '|' + p.dir, kind: 'firefox', browser: label, profile: p.name === 'default-release' ? 'Default' : p.name, bookmarks: true, history: true });
  return found;
}

// ---------------------------------------------------------------- reading Firefox's database (a copy of it)
function withCopy(file, fn) {
  if (!fs.existsSync(file)) return null;
  const tmp = path.join(os.tmpdir(), `noam-ff-${process.pid}-${Date.now()}-${path.basename(file)}`);
  try {
    try { fs.copyFileSync(file, tmp); } catch (e) { throw new Error(/EBUSY|EPERM|EACCES|locked/i.test(String(e && (e.code || e.message))) ? 'Firefox is open and locked its files. Close Firefox and try again.' : 'Couldn’t read Firefox’s files.'); }
    for (const ext of ['-wal', '-journal']) { try { fs.copyFileSync(file + ext, tmp + ext); } catch {} }
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(tmp, { readOnly: true });
    try { return fn(db); } finally { db.close(); }
  } finally { for (const ext of ['', '-wal', '-journal', '-shm']) { try { fs.unlinkSync(tmp + ext); } catch {} } }
}
// Firefox's toolbar → NoamBrowser's bookmarks bar; Bookmarks Menu, Other Bookmarks and Mobile → folders
const FF_ROOT = { toolbar_____: '', menu________: 'Bookmarks Menu', unfiled_____: 'Other bookmarks', mobile______: 'Mobile bookmarks' };
function readFirefoxBookmarks(dir) {
  return withCopy(path.join(dir, 'places.sqlite'), (db) => {
    const rows = db.prepare('SELECT b.id, b.type, b.parent, b.position, b.title, b.guid, p.url FROM moz_bookmarks b LEFT JOIN moz_places p ON p.id = b.fk ORDER BY b.parent, b.position').all();
    const kids = new Map(); for (const r of rows) { if (!kids.has(r.parent)) kids.set(r.parent, []); kids.get(r.parent).push(r); }
    const out = []; const folders = []; const bar = []; const seen = new Set();
    const addFolder = (f) => { if (f && !folders.includes(f)) folders.push(f); };
    const walk = (id, folder) => {
      for (const r of kids.get(id) || []) {
        if (r.type === 1) {
          if (!r.url || !/^(https?|file):/i.test(r.url)) continue;
          const k = folder + '\n' + r.url; if (seen.has(k)) continue; seen.add(k);
          out.push({ url: r.url, title: r.title || r.url, folder }); if (folder === '') bar.push('u:' + r.url);
        } else if (r.type === 2) {
          const name = String(r.title || 'Folder').replace(/ › /g, ' > ').trim() || 'Folder';
          const f = folder ? folder + SEP + name : name; addFolder(f); if (folder === '') bar.push('f:' + f);
          walk(r.id, f);
        }
      }
    };
    for (const guid of ['toolbar_____', 'menu________', 'unfiled_____', 'mobile______']) {
      const root = rows.find((r) => r.guid === guid); if (!root || !(kids.get(root.id) || []).length) continue;
      const base = FF_ROOT[guid]; if (base) { addFolder(base); bar.push('f:' + base); }
      walk(root.id, base);
    }
    out.folders = folders; out.bar = bar; return out;
  }) || [];
}
function readFirefoxHistory(dir, limit = 20000) {
  return withCopy(path.join(dir, 'places.sqlite'), (db) => {
    const st = db.prepare('SELECT url, title, visit_count, last_visit_date FROM moz_places WHERE last_visit_date IS NOT NULL AND hidden = 0 ORDER BY last_visit_date DESC LIMIT ?');
    st.setReadBigInts(true);
    return st.all(limit).filter((r) => /^https?:/i.test(r.url)).map((r) => ({ url: r.url, title: r.title || r.url, visits: Number(r.visit_count) || 1, t: Number(BigInt(r.last_visit_date) / 1000n) })).filter((r) => r.t > 0);
  }) || [];
}

// ---------------------------------------------------------------- Firefox's compressed JSON files (.jsonlz4 / .mozlz4)
function lz4Block(src, size) {
  const out = Buffer.alloc(size); let i = 0, o = 0;
  while (i < src.length) {
    const tok = src[i++]; let lit = tok >> 4;
    if (lit === 15) { let b; do { b = src[i++]; lit += b; } while (b === 255); }
    src.copy(out, o, i, i + lit); i += lit; o += lit;
    if (i >= src.length) break;
    const off = src[i] | (src[i + 1] << 8); i += 2;
    let len = tok & 15; if (len === 15) { let b; do { b = src[i++]; len += b; } while (b === 255); } len += 4;
    if (!off || off > o) throw new Error('bad lz4');
    for (let k = 0; k < len; k++, o++) out[o] = out[o - off];
  }
  return out.subarray(0, o);
}
function readMozLz4(file) {
  const b = fs.readFileSync(file);
  if (b.subarray(0, 8).toString('latin1') !== 'mozLz40\0') throw new Error('not a mozlz4 file');
  return JSON.parse(lz4Block(b.subarray(12), b.readUInt32LE(8)).toString('utf8'));
}

// ---------------------------------------------------------------- search engine, home page, tabs, extensions
// NoamBrowser's search engines (see main.js SEARCH_ENGINES)
function engineFrom(text) {
  const t = String(text || '').toLowerCase();
  if (/google/.test(t)) return 'google'; if (/duckduckgo|\bddg\b/.test(t)) return 'duckduckgo'; if (/bing/.test(t)) return 'bing';
  if (/startpage/.test(t)) return 'startpage'; if (/brave/.test(t)) return 'brave'; if (/mojeek/.test(t)) return 'mojeek';
  return null;
}
// add-ons that NoamBrowser already does by itself
const BUILT_IN = [
  [/ublock|adblock|adguard|ghostery|privacy badger|disconnect|duckduckgo privacy/i, 'Not needed: NoamBrowser Shields already block ads and trackers.'],
  [/dark ?reader|night ?eye|dark mode/i, 'Built in: turn on dark mode for any site from the shield menu.'],
  [/container/i, 'Built in: Containers keep separate logins in one window.'],
  [/translat/i, 'Built in: NoamBrowser translates pages on your computer.'],
  [/cookie ?auto ?delete|forget/i, 'Built in: “Forget me” sites wipe their cookies when you close them.'],
  [/don.?t care about cookies|consent.?o.?matic|cookie ?(banner|notice)/i, 'Not needed: NoamBrowser hides cookie banners.'],
  [/clearurls|clean ?links|link ?cleaner/i, 'Built in: NoamBrowser removes tracking tags from links.'],
  [/video ?speed|playback ?speed/i, 'Built in: video speed keys work on any site.'],
  [/volume/i, 'Built in: volume boost up to 300%.'],
  [/screenshot|fireshot|awesome screen/i, 'Built in: screenshots with drawing tools.'],
  [/picture.?in.?picture/i, 'Built in: picture-in-picture button in the address bar.'],
  [/tab ?(manager|search|suspender)|great suspender|onetab/i, 'Built in: tab search (Ctrl+Shift+A), sleeping tabs and saved sessions.'],
  [/password ?generator/i, 'Built in: NoamBrowser suggests strong passwords.'],
];
const builtInNote = (name) => { for (const [re, note] of BUILT_IN) if (re.test(name)) return note; return null; };
const storeSearch = (name) => 'https://chromewebstore.google.com/search/' + encodeURIComponent(name);

function readJSON(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
// Chrome stores some names as __MSG_appName__ (translated): look them up in the extension's own files
function chromeExtName(dir, id, man) {
  let name = man && man.name; let base = null;
  try { const vers = fs.readdirSync(path.join(dir, 'Extensions', id)).sort(); base = path.join(dir, 'Extensions', id, vers[vers.length - 1]); if (!name) { const m = readJSON(path.join(base, 'manifest.json')); man = m || man; name = m && m.name; } } catch {}
  const msg = /^__MSG_(.+)__$/.exec(name || '');
  if (msg && base) {
    for (const loc of [man && man.default_locale, 'en', 'en_US'].filter(Boolean)) {
      const m = readJSON(path.join(base, '_locales', loc, 'messages.json'));
      const hit = m && Object.entries(m).find(([k]) => k.toLowerCase() === msg[1].toLowerCase());
      if (hit) { name = hit[1].message; break; }
    }
  }
  return name && !/^__MSG_/.test(name) ? name : null;
}
function chromeExtras(dir) {
  const prefs = readJSON(path.join(dir, 'Preferences')) || {};
  const secure = readJSON(path.join(dir, 'Secure Preferences')) || {};
  const out = { search: null, homepage: null, restore: null, startupUrls: [], tabs: [], extensions: [] };
  const sp = (prefs.default_search_provider_data || {}).template_url_data;
  const id = sp ? engineFrom((sp.url || '') + ' ' + (sp.short_name || '')) : 'google'; // no choice saved = Chrome's default, Google
  out.search = id ? { id, name: sp ? sp.short_name : 'Google' } : sp ? { id: null, name: sp.short_name } : null;
  if (prefs.homepage && prefs.homepage_is_newtabpage === false && /^https?:/i.test(prefs.homepage)) out.homepage = prefs.homepage;
  const sess = prefs.session || {};
  if (sess.restore_on_startup === 1) out.restore = true;
  if (sess.restore_on_startup === 4) out.startupUrls = (sess.startup_urls || []).filter((u) => /^https?:/i.test(u));
  if (!out.homepage && out.startupUrls.length === 1) out.homepage = out.startupUrls[0];
  const exts = { ...((prefs.extensions || {}).settings || {}), ...((secure.extensions || {}).settings || {}) };
  for (const [eid, x] of Object.entries(exts)) {
    if (!/^[a-p]{32}$/.test(eid) || !x || x.location !== 1) continue; // 1 = installed by you from the Chrome Web Store
    if (x.was_installed_by_default || x.was_installed_by_oem) continue;
    const name = chromeExtName(dir, eid, x.manifest); if (!name) continue;
    out.extensions.push({ id: eid, name, enabled: !(x.disable_reasons || x.state === 0), note: builtInNote(name) });
  }
  out.extensions.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}
function firefoxExtras(dir) {
  const out = { search: null, homepage: null, restore: null, startupUrls: [], tabs: [], extensions: [] };
  let prefs = ''; try { prefs = fs.readFileSync(path.join(dir, 'prefs.js'), 'utf8'); } catch {}
  const pref = (k) => { const m = prefs.match(new RegExp('user_pref\\("' + k.replace(/\./g, '\\.') + '",\\s*(?:"((?:[^"\\\\]|\\\\.)*)"|(\\d+|true|false))\\)')); return m ? (m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : m[2]) : null; };
  const home = (pref('browser.startup.homepage') || '').split('|').filter((u) => /^https?:/i.test(u));
  if (home.length) out.homepage = home[0];
  if (pref('browser.startup.page') === '3') out.restore = true;
  try {
    const s = readMozLz4(path.join(dir, 'search.json.mozlz4')); const md = s.metaData || {};
    const cur = md.defaultEngineId || md.current || md.appDefaultEngineId || '';
    const eng = (s.engines || []).find((e) => e.id === cur || e._name === cur || e.name === cur);
    const name = (eng && (eng._name || eng.name)) || cur;
    out.search = { id: engineFrom(name || cur) || engineFrom(cur), name: name || 'Google' };
  } catch { out.search = { id: 'google', name: 'Google' }; } // Firefox's usual default
  // the tabs you had open (Firefox saves them while it runs, and when you close it)
  const files = ['sessionstore-backups/recovery.jsonlz4', 'sessionstore.jsonlz4'].map((f) => path.join(dir, f)).filter((f) => fs.existsSync(f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  for (const f of files) {
    try {
      const s = readMozLz4(f);
      for (const w of s.windows || []) for (const t of w.tabs || []) { const e = (t.entries || [])[(t.index || 1) - 1]; if (e && /^https?:/i.test(e.url || '')) out.tabs.push({ url: e.url, title: e.title || e.url }); }
      if (out.tabs.length) break;
    } catch {}
  }
  out.tabs = out.tabs.slice(0, 60);
  const ext = readJSON(path.join(dir, 'extensions.json'));
  for (const a of (ext && ext.addons) || []) {
    if (a.type !== 'extension' || a.location !== 'app-profile' || a.hidden) continue;
    const name = (a.defaultLocale && a.defaultLocale.name) || a.id;
    out.extensions.push({ id: null, ffId: a.id, name, enabled: !!a.active, note: builtInNote(name), store: builtInNote(name) ? null : storeSearch(name) });
  }
  out.extensions.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

module.exports = { detectFirefox, readFirefoxBookmarks, readFirefoxHistory, chromeExtras, firefoxExtras, readMozLz4, lz4Block, engineFrom, builtInNote };
