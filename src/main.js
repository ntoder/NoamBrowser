// NoamBrowser — main process.
const {
  app, BrowserWindow, session, ipcMain, protocol, Menu, clipboard, shell, dialog, webContents, nativeTheme, net, nativeImage, systemPreferences,
} = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Store } = require('./store');
const { Shields, siteOf, hostOf, isGoogleAuthHost, FIREFOX_UA } = require('./privacy');
const { VPN } = require('./vpn');
const setupFeatures = require('./features');
const setupFeatures2 = require('./features2');
const { ThrottledDownload, sortFolder } = require('./downloader');
let features2 = null;
let features = null;

const APP_ROOT = path.join(__dirname, '..');
const PAGES_DIR = path.join(__dirname, 'pages');
const UI_DIR = path.join(__dirname, 'ui');
const ASSETS_DIR = path.join(__dirname, 'assets');
const FRAME_PRELOAD = path.join(__dirname, 'frame-preload.js');
const MAIN_PARTITION = 'persist:noam';
const PRIVATE_PARTITION = 'noam-private';
// Test mode only exists in development: release builds don't ship test-hooks.js, so it can't be switched on.
const TEST_MODE = process.env.NOAM_TEST === '1' && fs.existsSync(path.join(__dirname, 'test-hooks.js'));

app.setName('NoamBrowser');
if (process.platform === 'win32') app.setAppUserModelId('com.noam.browser');

// ---------- Chromium hardening (before ready) ----------
const cl = app.commandLine;
cl.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');
cl.appendSwitch('webrtc-ip-handling-policy', 'disable_non_proxied_udp');
cl.appendSwitch('disable-features', [
  'InterestFeedContentSuggestions', 'MediaRouter', 'DialMediaRouteProvider', 'AutofillServerCommunication', 'OptimizationHints',
  'Translate', 'NetworkTimeServiceQuerying', 'UseEcoQoSForBackgroundProcess', 'FedCm', 'PrivacySandboxSettings4', 'BrowsingTopics',
  'InterestGroupStorage', 'AdInterestGroupAPI', 'Fledge', 'AttributionReportingCrossAppWeb', 'PrivateAggregationApi', 'SharedStorageAPI',
].join(','));
cl.appendSwitch('enable-features', 'ThirdPartyStoragePartitioning,PartitionedCookies,ReducedSystemInfo,ReduceUserAgentMinorVersion');
cl.appendSwitch('disable-background-networking');
cl.appendSwitch('disable-domain-reliability');
cl.appendSwitch('disable-breakpad');
cl.appendSwitch('no-pings');
cl.appendSwitch('disable-client-side-phishing-detection');
cl.appendSwitch('enable-smooth-scrolling');
if (TEST_MODE) { cl.appendSwitch('no-sandbox'); cl.appendSwitch('ignore-certificate-errors'); cl.appendSwitch('no-proxy-server'); cl.appendSwitch('host-resolver-rules', 'MAP news.example.org 127.0.0.1, MAP accounts.google.com 127.0.0.1, MAP www.youtube.com 127.0.0.1, MAP geocoding-api.open-meteo.com 127.0.0.1, MAP api.open-meteo.com 127.0.0.1, MAP www.hebcal.com 127.0.0.1, MAP api.frankfurter.app 127.0.0.1, MAP api.pwnedpasswords.com 127.0.0.1'); cl.appendSwitch('autoplay-policy', 'no-user-gesture-required'); }

protocol.registerSchemesAsPrivileged([
  { scheme: 'noam', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: false, stream: true } },
]);

// ---------- single instance ----------
if (!TEST_MODE && !app.requestSingleInstanceLock()) { app.quit(); }

let userData;
if (process.env.NOAM_USERDATA) app.setPath('userData', process.env.NOAM_USERDATA);
userData = app.getPath('userData');

const SEARCH_ENGINES = {
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  brave: { name: 'Brave Search', url: 'https://search.brave.com/search?q=%s' },
  startpage: { name: 'Startpage', url: 'https://www.startpage.com/do/search?q=%s' },
  mojeek: { name: 'Mojeek', url: 'https://www.mojeek.com/search?q=%s' },
  google: { name: 'Google', url: 'https://www.google.com/search?q=%s' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
};

const settings = new Store(userData, 'settings', {
  searchEngine: 'duckduckgo',
  homepage: 'noam://newtab/',
  theme: 'system', // system | dark | light
  accent: 'auto',
  appearance: { preset: 'default', customAccent: '', tabStyle: 'rounded', density: 'comfortable', radius: 100, font: 'manrope', animations: 'full', liquidGlass: false, glassStrength: 60, wallpaper: 'aurora', wallpaperDim: 30 },
  showBookmarksBar: true,
  restoreTabs: true,
  clearOnExit: false,
  askDownloadLocation: false,
  downloadDir: '',
  newTabShowStats: true,
  newTabShowTopSites: true,
  dns: 'cloudflare', // cloudflare | quad9 | mullvad | adguard | system
  shields: { ads: true, youtube: true, httpsOnly: true, stripParams: true, blockThirdPartyCookies: true, fingerprinting: true, gpc: true },
  vpn: { mode: 'warp', customProxy: '', killSwitch: true, autoConnect: false, lastGoodEndpoint: '' },
  siteShieldsOff: {},
  permissions: {}, // origin -> { permission: 'allow'|'deny' }
  zoom: {}, // site -> level
  session: [],
  window: { width: 1320, height: 860, maximized: false },
  siteDark: {},
  topSitesHidden: {},
  gestures: { enabled: true, trail: true },
  media: { speedKeys: true, speedOverlay: true },
  widgets: { clock: true, weather: true, zmanim: true, todo: true, units: 'c', candle: 40, city: { name: 'Jerusalem', admin: 'Jerusalem', country: 'Israel', lat: 31.769, lon: 35.2163, tz: 'Asia/Jerusalem', elevation: 754 }, elevation: false },
  sidePanel: { show: true, width: 380, panels: [
    { id: 'notes', kind: 'notes', name: 'Notes' },
    { id: 'reading', kind: 'reading', name: 'Reading list' },
    { id: 'ambient', kind: 'ambient', name: 'Music & sounds' },
    { id: 'whatsapp', kind: 'web', name: 'WhatsApp', url: 'https://web.whatsapp.com/' },
    { id: 'chatgpt', kind: 'web', name: 'ChatGPT', url: 'https://chatgpt.com/' },
    { id: 'calc', kind: 'calc', name: 'Calculator' },
  ] },
  downloads: { autoSort: false, limitKBps: 0 },
  forceDarkAll: false,
  focus: {},
  perf: {},
  containers: [{ id: 'personal', name: 'Personal', color: '#3E8DEB', icon: '🏠' }, { id: 'work', name: 'Work', color: '#EE7A2E', icon: '💼' }, { id: 'school', name: 'School', color: '#3FAE5A', icon: '🎓' }],
  dictionary: { enabled: true, to: 'auto', speak: true },
  screenTime: { enabled: true, idleMinutes: 2, limits: {} },
  zmanimAlerts: { enabled: false, before: 60, sound: true, which: { shma: true, tefila: true, candles: true, sunset: true } },
  blueLight: { enabled: false, strength: 45, tint: 'amber', color: '#ff8a1c', dim: 0, fade: 1.2, schedule: 'off', from: '21:00', to: '07:00', sunsetOffset: 0, ramp: false, pauseVideo: true, button: true },
  passwords: { offerSave: true, autofill: true },
  translate: { target: 'en', offer: true },
  sync: { enabled: false, folder: '', passwords: false, deviceId: '', settingsUpdated: 0 },
  updates: { auto: true },
  tabs: { layout: 'horizontal', sidebarWidth: 240, sidebarCollapsed: false, groups: [] },
});
// Speed mode / no-autoplay are engine switches, so they apply from the next start.
{ const pf = settings.get('perf') || {}; if (pf.noAutoplay || pf.speedMode) cl.appendSwitch('autoplay-policy', 'document-user-activation-required'); if (pf.speedMode) cl.appendSwitch('force-prefers-reduced-motion'); }

const stats = new Store(userData, 'stats', { totalBlocked: 0, bytesSaved: 0, since: Date.now(), days: {} });
const history = new Store(userData, 'history', { items: [] });
const bookmarks = new Store(userData, 'bookmarks', { items: [], tombstones: [] });
const downloadsStore = new Store(userData, 'downloads', { items: [] });
if (!stats.get('since')) stats.set('since', Date.now());

const sessionSecret = crypto.randomBytes(16).toString('hex');
let mainWindow = null;
const windows = new Set();
let screenTime = null;
let focusApi = null;
let timeMachine = null;
let shields;
let vpn;
const downloads = new Map(); // id -> { item, info }
const pendingPermissions = new Map();
let quitting = false;

const DNS_SERVERS = {
  cloudflare: ['https://cloudflare-dns.com/dns-query'],
  quad9: ['https://dns.quad9.net/dns-query'],
  mullvad: ['https://base.dns.mullvad.net/dns-query'],
  adguard: ['https://dns.adguard-dns.com/dns-query'],
};
function applyDns() {
  const d = settings.get('dns');
  try {
    if (DNS_SERVERS[d]) app.configureHostResolver({ secureDnsMode: 'secure', secureDnsServers: DNS_SERVERS[d] });
    else app.configureHostResolver({ secureDnsMode: 'off' });
  } catch (e) { console.error('DNS config failed', e.message); }
}

function chromeUA() {
  const major = (process.versions.chrome || '140').split('.')[0];
  const os = process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64' : process.platform === 'darwin' ? 'Macintosh; Intel Mac OS X 10_15_7' : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

function mime(file) {
  const ext = path.extname(file).toLowerCase();
  return ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json' })[ext] || 'application/octet-stream';
}

function setupNoamProtocol(ses) {
  if (ses.protocol.isProtocolHandled('noam')) return;
  ses.protocol.handle('noam', async (req) => {
    const u = new URL(req.url);
    const page = u.hostname || 'newtab';
    let rel = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
    let file;
    if (page === 'timemachine' && rel === 'view') {
      // a saved copy of a page — shown with scripts switched off
      const h = timeMachine && timeMachine.html(u.searchParams.get('id') || '');
      if (!h) return new Response('This copy was deleted.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      return new Response(h, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "script-src 'none'; object-src 'none'; frame-ancestors noam:" } });
    }
    if (page === 'wallpaper') {
      const wp = wallpaperFile();
      if (!wp) return new Response('none', { status: 404 });
      return new Response(fs.readFileSync(wp), { headers: { 'content-type': mime(wp), 'cache-control': 'no-store' } });
    }
    if (page === 'assets') file = path.join(ASSETS_DIR, rel);
    else if (rel.startsWith('assets/')) file = path.join(ASSETS_DIR, rel.slice(7));
    else if (!rel || rel === 'index.html') file = path.join(PAGES_DIR, page + '.html');
    else file = path.join(PAGES_DIR, rel);
    const base = page === 'assets' || rel.startsWith('assets/') ? ASSETS_DIR : PAGES_DIR;
    if (!path.resolve(file).startsWith(path.resolve(base)) || !fs.existsSync(file)) {
      return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    }
    if (page === 'playground' && rel === 'runner.html') {
      // The Code Playground preview: runs the user's own code, sandboxed (opaque origin, no access to NoamBrowser).
      return new Response(fs.readFileSync(file), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
        'content-security-policy': "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'; frame-ancestors noam:" } });
    }
    return new Response(fs.readFileSync(file), {
      headers: {
        'content-type': mime(file),
        'x-frame-options': 'DENY',
        'content-security-policy': "default-src 'self' noam:; img-src 'self' noam: https: http: data:; style-src 'self' noam: 'unsafe-inline'; script-src 'self' noam:; font-src noam:; frame-ancestors 'none'",
      },
    });
  });
}

const sessionsReady = new Set();
function browsingSessions() { return [...sessionsReady]; }
function prepareSession(ses) {
  if (sessionsReady.has(ses)) return ses;
  sessionsReady.add(ses);
  ses.setUserAgent(chromeUA());
  setupNoamProtocol(ses);
  shields.attach(ses, { framePreload: FRAME_PRELOAD });
  ses.setPermissionRequestHandler(permissionRequest);
  ses.setPermissionCheckHandler((wc, permission, origin) => {
    if (permission === 'notifications' && focusApi && focusApi.holding()) return false;
    if (['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'background-sync', 'accessibility-events'].includes(permission)) return true;
    const p = settings.get('permissions')[originOf(origin)];
    return p && p[permission] === 'allow';
  });
  ses.on('will-download', onWillDownload);
  ses.setSpellCheckerEnabled(true);
  const rules = vpn && vpn.currentRules();
  if (rules) ses.setProxy({ proxyRules: rules, proxyBypassRules: '<local>' });
  return ses;
}
function mainSession() { return prepareSession(session.fromPartition(MAIN_PARTITION)); }
// Container tabs: each container is its own browsing session (own cookies and logins), with the same protection as normal tabs.
function prepareContainers() { for (const c of settings.get('containers') || []) if (/^[\w-]{1,40}$/.test(c.id)) prepareSession(session.fromPartition('persist:noam-c-' + c.id)); }
function privateSession() { return prepareSession(session.fromPartition(PRIVATE_PARTITION)); }

function originOf(u) { try { return new URL(u).origin; } catch { return u || ''; } }

// ---------- permissions ----------
const ASKABLE = new Set(['media', 'geolocation', 'notifications', 'midi', 'midiSysex', 'idle-detection', 'display-capture', 'window-management', 'storage-access', 'top-level-storage-access', 'speaker-selection', 'keyboardLock']);
function permissionRequest(wc, permission, callback, details) {
  if (permission === 'notifications' && focusApi && focusApi.holding()) return callback(false);
  if (['fullscreen', 'clipboard-sanitized-write', 'pointerLock'].includes(permission)) return callback(true);
  if (permission === 'openExternal') {
    const ext = details && details.externalURL;
    if (!ext) return callback(false);
    return askPermission(wc, 'openExternal', details.requestingUrl, callback, ext);
  }
  if (!ASKABLE.has(permission)) return callback(false);
  const origin = originOf(details.requestingUrl || wc.getURL());
  const saved = settings.get('permissions')[origin];
  if (saved && saved[permission]) return callback(saved[permission] === 'allow');
  if (wc.session === session.fromPartition(PRIVATE_PARTITION) && permission === 'notifications') return callback(false);
  let label = permission;
  if (permission === 'media') {
    const types = (details.mediaTypes || []);
    label = types.includes('video') && types.includes('audio') ? 'camera & microphone' : types.includes('video') ? 'camera' : 'microphone';
  }
  askPermission(wc, permission, origin, callback, label);
}
function askPermission(wc, permission, origin, callback, label) {
  const id = crypto.randomUUID();
  const host = wc.hostWebContents || null;
  const target = host || BrowserWindow.fromWebContents(wc)?.webContents;
  if (!target) return callback(false);
  pendingPermissions.set(id, { callback, origin: originOf(origin), permission });
  target.send('permission:ask', { id, wcId: wc.id, origin: originOf(origin), permission, label });
  setTimeout(() => { if (pendingPermissions.has(id)) { pendingPermissions.get(id).callback(false); pendingPermissions.delete(id); } }, 120000);
}
ipcMain.on('permission:answer', (_e, { id, allow, remember }) => {
  const p = pendingPermissions.get(id);
  if (!p) return;
  pendingPermissions.delete(id);
  if (remember && p.permission !== 'openExternal') {
    const perms = settings.get('permissions');
    perms[p.origin] = { ...(perms[p.origin] || {}), [p.permission]: allow ? 'allow' : 'deny' };
    settings.set('permissions', perms);
  }
  p.callback(!!allow);
});

// ---------- downloads ----------
function uniquePath(dir, name) {
  name = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 180) || 'download';
  let p = path.join(dir, name);
  const ext = path.extname(name); const base = path.basename(name, ext);
  for (let i = 1; fs.existsSync(p) || fs.existsSync(p + '.noamdownload'); i++) p = path.join(dir, `${base} (${i})${ext}`);
  return p;
}
function broadcast(channel, ...args) {
  for (const w of windows) if (!w.isDestroyed()) w.webContents.send(channel, ...args);
}
function broadcastPages(name, data) {
  for (const wc of webContents.getAllWebContents()) {
    try { if (!wc.isDestroyed() && wc.getURL().startsWith('noam:')) wc.send('noam:page-event', name, data); } catch {}
  }
}
function onWillDownload(_e, item, wc) {
  const id = crypto.randomUUID();
  const ds = settings.get('downloads') || {};
  let dir = settings.get('downloadDir') || app.getPath('downloads');
  if (ds.autoSort) { dir = path.join(dir, sortFolder(item.getFilename())); try { fs.mkdirSync(dir, { recursive: true }); } catch {} }
  const isPrivate = wc && wc.session === session.fromPartition(PRIVATE_PARTITION);
  const ask = settings.get('askDownloadLocation');
  if (!ask) item.setSavePath(uniquePath(dir, item.getFilename()));
  const info = { id, name: item.getFilename(), url: item.getURL(), total: item.getTotalBytes(), received: 0, state: 'progressing', path: item.getSavePath(), started: Date.now(), private: isPrivate, paused: false, speed: 0, limited: false };
  const entry = { item, info };
  downloads.set(id, entry);
  const push = () => { broadcast('downloads:update', info); broadcastPages('downloads', info); };
  let lastBytes = 0, lastT = Date.now();
  const speed = () => { const t = Date.now(); if (t - lastT >= 900) { info.speed = Math.max(0, Math.round((info.received - lastBytes) * 1000 / (t - lastT))); lastBytes = info.received; lastT = t; } };
  const finish = (state) => {
    info.state = state; info.paused = false; info.speed = 0; info.name = path.basename(info.path || info.name);
    if (!isPrivate) { const items = downloadsStore.get('items'); items.unshift({ ...info }); downloadsStore.set('items', items.slice(0, 300)); }
    downloads.delete(id); push();
  };
  let mode = 'native';
  item.on('updated', (_ev, state) => {
    if (mode !== 'native') return;
    info.received = item.getReceivedBytes(); info.total = item.getTotalBytes(); info.state = state === 'interrupted' ? 'interrupted' : 'progressing';
    info.paused = item.isPaused(); info.path = item.getSavePath(); info.name = path.basename(info.path || info.name);
    speed(); push();
  });
  let td = null;
  item.once('done', (_ev, state) => {
    if (mode !== 'native') return;
    if (td && !td.accepted) { td.removeAllListeners(); td.cancel(); } // Chromium finished first (tiny file): keep its copy
    info.received = item.getReceivedBytes(); info.path = item.getSavePath();
    finish(state);
  });
  // Speed limit: hand the transfer to the throttled engine (falls back to Chromium's if the server refuses a second request).
  const limit = Math.max(0, +ds.limitKBps || 0) * 1024;
  if (limit > 0 && !ask && /^https?:/i.test(item.getURL())) {
    try { item.pause(); } catch {}
    td = new ThrottledDownload({ url: item.getURL(), session: (wc && wc.session) || mainSession(), savePath: item.getSavePath(), limitBytesPerSec: limit, referrer: wc ? wc.getURL() : '', total: item.getTotalBytes() });
    td.once('accepted', () => {
      if (!downloads.has(id) || info.state !== 'progressing') { td.removeAllListeners(); td.cancel(); return; }
      mode = 'throttled'; info.limited = true; entry.td = td;
      try { item.cancel(); } catch {}
      entry.item = { pause: () => td.pause(), resume: () => td.resume(), cancel: () => td.cancel(), canResume: () => true };
      td.on('updated', () => { info.received = td.received; info.total = td.total; info.paused = td.paused; speed(); push(); });
      td.once('done', (state) => { info.received = td.received; info.total = td.total || td.received; finish(state); });
    });
    td.once('rejected', () => { try { item.resume(); } catch {} });
    td.start();
  }
  push();
}
function allDownloads() {
  const live = [...downloads.values()].map((d) => d.info);
  const ids = new Set(live.map((d) => d.id));
  return [...live, ...downloadsStore.get('items').filter((d) => !ids.has(d.id))];
}

// ---------- history / bookmarks ----------
function addHistory({ url, title }) {
  if (!/^https?:/.test(url)) return;
  const items = history.get('items');
  const i = items.findIndex((h) => h.url === url);
  const now = Date.now();
  if (i >= 0) { const h = items.splice(i, 1)[0]; h.t = now; h.visits = (h.visits || 1) + 1; if (title) h.title = title; items.unshift(h); }
  else items.unshift({ url, title: title || url, t: now, visits: 1 });
  if (items.length > 25000) items.length = 25000;
  history.save();
}
function updateHistoryMeta({ url, title, favicon }) {
  const h = history.get('items').find((x) => x.url === url);
  if (h) { if (title) h.title = title; if (favicon) h.favicon = favicon; history.save(); }
}
function topSites(n = 8) {
  const bySite = new Map();
  const hidden = settings.get('topSitesHidden') || {};
  for (const h of history.get('items').slice(0, 4000)) {
    const host = hostOf(h.url); if (!host || hidden[host]) continue;
    const score = (h.visits || 1) * (1 + Math.max(0, 30 - (Date.now() - h.t) / 86400000) / 30);
    const cur = bySite.get(host);
    if (!cur) bySite.set(host, { url: 'https://' + host + '/', title: h.title, favicon: h.favicon, score, host });
    else { cur.score += score; if (!cur.favicon && h.favicon) cur.favicon = h.favicon; }
  }
  return [...bySite.values()].sort((a, b) => b.score - a.score).slice(0, n);
}
function suggest(q) {
  q = q.toLowerCase().trim();
  if (!q) return [];
  const out = []; const seen = new Set();
  const push = (x, kind) => { if (seen.has(x.url) || out.length >= 7) return; seen.add(x.url); out.push({ url: x.url, title: x.title, favicon: x.favicon, kind }); };
  for (const b of bookmarks.get('items')) if (b.url.toLowerCase().includes(q) || (b.title || '').toLowerCase().includes(q)) push(b, 'bookmark');
  const hist = history.get('items');
  const starts = []; const contains = [];
  for (const h of hist) {
    const u = h.url.toLowerCase().replace(/^https?:\/\/(www\.)?/, '');
    if (u.startsWith(q)) starts.push(h); else if (u.includes(q) || (h.title || '').toLowerCase().includes(q)) contains.push(h);
    if (starts.length > 20 && contains.length > 20) break;
  }
  starts.sort((a, b) => (b.visits || 1) - (a.visits || 1));
  for (const h of [...starts, ...contains]) push(h, 'history');
  return out;
}

// ---------- window ----------
const PRESET_BG = { aurora: '#0E0B1F', sunset: '#1F0E14', ocean: '#061826', forest: '#0C1A12', neon: '#07060C', snow: '#E7EEF6', mono: '#111111' };
function themeColors() {
  const ap = settings.get('appearance') || {};
  if (ap.liquidGlass && (process.platform === 'win32' || process.platform === 'darwin')) return { bg: '#00000000', fg: '#FFFFFF' };
  if (ap.preset === 'daylight') { const h = new Date().getHours(); const night = h < 5 || h >= 17; return night ? { bg: h >= 20 || h < 5 ? '#070B1A' : '#2A1426', fg: '#FFFFFF' } : { bg: h < 8 ? '#F6E9F0' : '#E6F1FB', fg: '#0E2238' }; }
  if (PRESET_BG[ap.preset]) return { bg: PRESET_BG[ap.preset], fg: ap.preset === 'snow' ? '#0F1E33' : '#FFFFFF' };
  const dark = settings.get('theme') === 'dark' || (settings.get('theme') === 'system' && nativeTheme.shouldUseDarkColors);
  return dark ? { bg: '#16122A', fg: '#ECE8F7' } : { bg: '#ECEAF4', fg: '#1D1836' };
}
// Real OS translucency behind the chrome when Liquid Glass is on.
function applyGlass(win) {
  const on = !!(settings.get('appearance') || {}).liquidGlass;
  try {
    if (process.platform === 'win32' && win.setBackgroundMaterial) win.setBackgroundMaterial(on ? 'acrylic' : 'none');
    if (process.platform === 'darwin') win.setVibrancy(on ? 'under-window' : null);
  } catch (e) { console.error('glass', e.message); }
}
function wallpaperFile() {
  for (const ext of ['jpg', 'png', 'webp', 'gif']) { const f = path.join(userData, 'wallpaper.' + ext); if (fs.existsSync(f)) return f; }
  return null;
}
function iconPath() {
  const p = path.join(ASSETS_DIR, process.platform === 'win32' ? 'icon.ico' : 'icon.png');
  return fs.existsSync(p) ? p : undefined;
}
function createWindow({ urls = [], privateTab = false, restore = false } = {}) {
  const ws = settings.get('window');
  const c = themeColors();
  const win = new BrowserWindow({
    width: ws.width, height: ws.height, minWidth: 520, minHeight: 360,
    backgroundColor: c.bg,
    title: 'NoamBrowser',
    icon: iconPath(),
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 14, y: 13 } } : {}),
    show: false,
    webPreferences: {
      preload: path.join(UI_DIR, 'preload-ui.js'),
      partition: MAIN_PARTITION,
      webviewTag: true,
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  windows.add(win);
  applyGlass(win);
  if (!mainWindow) mainWindow = win;
  if (ws.maximized && windows.size === 1) win.maximize();
  win.loadFile(path.join(UI_DIR, 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.once('did-finish-load', () => {
    let initial = urls.map((u) => ({ url: u }));
    if (restore && settings.get('restoreTabs') && settings.get('session').length) initial = settings.get('session').concat(initial);
    win.webContents.send('init', {
      tabs: initial.length ? initial : [{ url: 'noam://newtab/' }],
      privateTab, platform: process.platform, maximized: win.isMaximized(), settings: publicSettings(), vpn: vpn.status(), engines: SEARCH_ENGINES,
      bookmarks: bookmarks.get('items'), stats: statsSummary(), downloads: allDownloads().filter((d) => d.state === 'progressing'),
    });
  });
  const saveBounds = () => {
    if (win.isDestroyed() || win !== mainWindow) return;
    const b = win.getNormalBounds();
    settings.set('window', { width: b.width, height: b.height, maximized: win.isMaximized() });
  };
  win.on('resize', saveBounds);
  win.on('maximize', () => { saveBounds(); win.webContents.send('window:state', { maximized: true }); });
  win.on('unmaximize', () => { saveBounds(); win.webContents.send('window:state', { maximized: false }); });
  win.on('enter-full-screen', () => win.webContents.send('window:state', { fullscreen: true }));
  win.on('leave-full-screen', () => win.webContents.send('window:state', { fullscreen: false }));
  win.on('closed', () => {
    windows.delete(win);
    if (mainWindow === win) mainWindow = [...windows][0] || null;
  });
  return win;
}

function publicSettings() {
  const s = settings.get();
  return { ...s, session: undefined, permissions: undefined };
}
function statsSummary() {
  const s = stats.get();
  const week = Object.entries(s.days).filter(([d]) => Date.now() - Date.parse(d) < 7 * 86400000).reduce((a, [, v]) => a + v, 0);
  const today = s.days[new Date().toISOString().slice(0, 10)] || 0;
  return { total: s.totalBlocked, bytes: s.bytesSaved, since: s.since, week, today, days: s.days };
}

function applyThemeToWindows() {
  nativeTheme.themeSource = settings.get('theme');
  const c = themeColors();
  for (const w of windows) {
    if (w.isDestroyed()) continue;
    applyGlass(w);
    w.setBackgroundColor(c.bg);
  }
}

// ---------- guest (web page) handling ----------
function hostWindowOf(wc) {
  const host = wc.hostWebContents;
  return host ? BrowserWindow.fromWebContents(host) : BrowserWindow.fromWebContents(wc);
}
const SHORTCUT_KEYS = new Set(['t', 'w', 'n', 'l', 'r', 'f', 'd', 'h', 'j', 'p', 's', 'tab', '=', '+', '-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'pageup', 'pagedown', 'k', 'e', 'g', 'u', 'x']);

app.on('web-contents-created', (_e, wc) => {
  const type = wc.getType();
  if (type !== 'webview' && type !== 'window') return;
  if (type === 'window' && wc.session === session.defaultSession) return;
  try { wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp'); } catch {}

  wc.setWindowOpenHandler(({ url, disposition, features }) => {
    if (!/^(https?|noam|about|data|blob):/.test(url) && url !== 'about:blank') {
      if (/^(mailto|tel|sms|magnet|zoommtg|msteams|spotify|steam|discord):/.test(url)) {
        askPermission(wc, 'openExternal', wc.getURL(), (ok) => { if (ok) shell.openExternal(url); }, url);
      }
      return { action: 'deny' };
    }
    if (disposition === 'new-window' && features) {
      // Real popup (OAuth sign-in windows etc.) — keep window.opener working.
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520, height: 700, autoHideMenuBar: true, icon: iconPath(), backgroundColor: themeColors().bg,
          webPreferences: { sandbox: true, contextIsolation: true },
        },
      };
    }
    const win = hostWindowOf(wc);
    if (win) win.webContents.send('tab:open', { url, background: disposition === 'background-tab', opener: wc.id, private: wc.session === session.fromPartition(PRIVATE_PARTITION) });
    return { action: 'deny' };
  });

  wc.on('did-create-window', (child) => { child.setMenuBarVisibility(false); });

  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    const mod = input.control || input.meta;
    const isF = /^f(5|6|9|11|12)$/.test(key) || key === 'escape' && false;
    if ((mod && SHORTCUT_KEYS.has(key)) || (mod && input.shift && (key === 'i' || key === 'c' || key === 'p')) || isF || (input.alt && (key === 'arrowleft' || key === 'arrowright' || key === 'home'))) {
      const win = hostWindowOf(wc);
      if (!win || type !== 'webview') return;
      event.preventDefault();
      win.webContents.send('shortcut', { key, ctrl: mod, shift: input.shift, alt: input.alt, wcId: wc.id });
    }
  });

  wc.on('context-menu', (_ev, params) => {
    // On macOS/Linux the menu event fires on mouse-down, before we know whether the user is drawing a gesture.
    if (process.platform !== 'win32' && type === 'webview' && params.menuSourceType === 'mouse' && settings.get('gestures').enabled && /^https?:/.test(wc.getURL())) {
      pendingMenus.set(wc.id, params);
      setTimeout(() => { if (pendingMenus.get(wc.id) === params) { pendingMenus.delete(wc.id); buildContextMenu(wc, params); } }, 4000);
      return;
    }
    buildContextMenu(wc, params);
  });

  wc.on('did-fail-load', (_ev, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return; // -3 = aborted (user navigated away)
    const host = hostOf(url);
    if (url.startsWith('https://') && shields.tab(wc.id).upgraded > 0 && !shields.httpExceptions.has(host) && [-100, -101, -102, -105, -107, -109, -118, -200, -201, -202, -207, -501].includes(code)) {
      const fallback = shields.httpsFailed(url, wc.id);
      if (fallback) { wc.loadURL(fallback); return; }
    }
  });

  wc.on('did-start-navigation', (ev) => {
    if (!ev.isMainFrame || ev.isSameDocument) return;
    const want = isGoogleAuthHost(hostOf(ev.url)) ? FIREFOX_UA : chromeUA();
    if (wc.getUserAgent() !== want) wc.setUserAgent(want);
  });
  wc.on('did-navigate', (_ev, url) => {
    const z = settings.get('zoom')[siteOf(url)];
    if (typeof z === 'number') wc.setZoomLevel(z);
  });
  wc.on('zoom-changed', (_ev, dir) => {
    const lvl = Math.max(-5, Math.min(6, wc.getZoomLevel() + (dir === 'in' ? 0.5 : -0.5)));
    wc.setZoomLevel(lvl); saveZoom(wc.getURL(), lvl);
    const win = hostWindowOf(wc); if (win) win.webContents.send('zoom:changed', { wcId: wc.id, level: lvl });
  });

  wc.on('certificate-error', () => {}); // default: blocked, page shows Chromium's error
});

const pendingMenus = new Map();
ipcMain.on('noam:qr', (e, on) => { const host = e.sender.hostWebContents; if (host && !host.isDestroyed()) host.send('qr:state', { wcId: e.sender.id, on: !!on }); });
ipcMain.on('noam:gesture-end', (e, g) => {
  const wc = e.sender; const pending = pendingMenus.get(wc.id); pendingMenus.delete(wc.id);
  g = String(g || '');
  if (g && /^[LRUD]{1,3}$/.test(g) && settings.get('gestures').enabled) { const host = wc.hostWebContents; if (host && !host.isDestroyed()) host.send('shortcut', { key: 'gesture-' + g, wcId: wc.id }); return; }
  if (pending) buildContextMenu(wc, pending);
});
function saveZoom(url, lvl) {
  const z = settings.get('zoom'); const s = siteOf(url); if (!s) return;
  if (lvl === 0) delete z[s]; else z[s] = lvl;
  settings.set('zoom', z);
}

function buildContextMenu(wc, p) {
  const win = hostWindowOf(wc);
  const send = (ch, data) => win && win.webContents.send(ch, data);
  const isPrivate = wc.session === session.fromPartition(PRIVATE_PARTITION);
  const t = [];
  if (p.linkURL && /^(https?|noam):/.test(p.linkURL)) {
    t.push({ label: 'Open link in new tab', click: () => send('tab:open', { url: p.linkURL, background: true, opener: wc.id, private: isPrivate }) });
    t.push({ label: 'Open link in private tab', click: () => send('tab:open', { url: p.linkURL, private: true }) });
    t.push({ label: 'Open link in new window', click: () => createWindow({ urls: [p.linkURL] }) });
    t.push({ label: 'Copy link address', click: () => clipboard.writeText(p.linkURL) });
    t.push({ label: 'Save link as…', click: () => wc.downloadURL(p.linkURL) });
    t.push({ type: 'separator' });
  }
  if (p.mediaType === 'image' && p.srcURL) {
    t.push({ label: 'Open image in new tab', click: () => send('tab:open', { url: p.srcURL, background: true, private: isPrivate }) });
    t.push({ label: 'Save image as…', click: () => wc.downloadURL(p.srcURL) });
    t.push({ label: 'Copy image', click: () => wc.copyImageAt(p.x, p.y) });
    t.push({ label: 'Copy image address', click: () => clipboard.writeText(p.srcURL) });
    t.push({ type: 'separator' });
  }
  if (p.mediaType === 'video' || p.mediaType === 'audio') {
    const f = p.mediaFlags || {};
    t.push({ label: f.isPaused ? 'Play' : 'Pause', click: () => wc.executeJavaScript(`(()=>{const m=document.elementFromPoint(${p.x},${p.y});const v=m&&m.closest?m.closest('video,audio'):null;if(v){v.paused?v.play():v.pause()}})()`, true) });
    t.push({ label: f.isMuted ? 'Unmute' : 'Mute', click: () => wc.executeJavaScript(`(()=>{const m=document.elementFromPoint(${p.x},${p.y});const v=m&&m.closest?m.closest('video,audio'):null;if(v)v.muted=!v.muted})()`, true) });
    t.push({ label: 'Loop', type: 'checkbox', checked: !!f.isLooping, click: () => wc.executeJavaScript(`(()=>{const m=document.elementFromPoint(${p.x},${p.y});const v=m&&m.closest?m.closest('video,audio'):null;if(v)v.loop=!v.loop})()`, true) });
    if (p.mediaType === 'video') t.push({ label: 'Picture in picture', click: () => wc.executeJavaScript(`(()=>{const m=document.elementFromPoint(${p.x},${p.y});let v=m&&m.closest?m.closest('video'):null;if(!v)v=[...document.querySelectorAll('video')].find(x=>!x.paused)||document.querySelector('video');if(v){document.pictureInPictureElement?document.exitPictureInPicture():v.requestPictureInPicture()}})()`, true) });
    if (p.srcURL && /^https?:/.test(p.srcURL)) t.push({ label: `Save ${p.mediaType} as…`, click: () => wc.downloadURL(p.srcURL) });
    t.push({ type: 'separator' });
  }
  if (p.isEditable) {
    if (p.misspelledWord && p.dictionarySuggestions.length) {
      for (const s of p.dictionarySuggestions.slice(0, 5)) t.push({ label: s, click: () => wc.replaceMisspelling(s) });
      t.push({ label: 'Add to dictionary', click: () => wc.session.addWordToSpellCheckerDictionary(p.misspelledWord) });
      t.push({ type: 'separator' });
    }
    t.push({ role: 'undo', enabled: p.editFlags.canUndo }, { role: 'redo', enabled: p.editFlags.canRedo }, { type: 'separator' });
    t.push({ role: 'cut', enabled: p.editFlags.canCut }, { role: 'copy', enabled: p.editFlags.canCopy }, { role: 'paste', enabled: p.editFlags.canPaste });
    t.push({ label: 'Paste as plain text', enabled: p.editFlags.canPaste, click: () => wc.pasteAndMatchStyle() });
    t.push({ role: 'selectAll' }, { type: 'separator' });
  } else if (p.selectionText) {
    const sel = p.selectionText.trim();
    t.push({ role: 'copy' });
    const eng = SEARCH_ENGINES[settings.get('searchEngine')] || SEARCH_ENGINES.duckduckgo;
    t.push({ label: `Search ${eng.name} for “${sel.length > 28 ? sel.slice(0, 28) + '…' : sel}”`, click: () => send('tab:open', { url: eng.url.replace('%s', encodeURIComponent(sel)), opener: wc.id, private: isPrivate }) });
    if (/^(https?:\/\/)?[\w-]+(\.[\w-]+)+\S*$/.test(sel)) t.push({ label: 'Go to ' + (sel.length > 40 ? sel.slice(0, 40) + '…' : sel), click: () => send('tab:open', { url: /^https?:/.test(sel) ? sel : 'https://' + sel, private: isPrivate }) });
    t.push({ type: 'separator' });
  }
  if (!t.length || (!p.linkURL && !p.mediaType.match(/image|video|audio/) && !p.isEditable)) {
    t.push({ label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() });
    t.push({ label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() });
    t.push({ label: 'Reload', click: () => wc.reload() });
    t.push({ type: 'separator' });
    t.push({ label: 'Save page as…', click: () => savePage(wc) });
    t.push({ label: 'Print…', click: () => wc.print() });
    t.push({ label: 'View page source', click: () => send('tab:open', { url: 'view-source:' + wc.getURL(), private: isPrivate }) });
    t.push({ type: 'separator' });
  }
  t.push({ label: '🔍 Explore this (Dev Lab)', click: () => send('devlab:explore-at', { wcId: wc.id, x: p.x, y: p.y }) });
  t.push({ label: 'Inspect (pro tools)', click: () => { wc.inspectElement(p.x, p.y); } });
  Menu.buildFromTemplate(t).popup({ window: win || undefined });
}

async function savePage(wc) {
  const win = hostWindowOf(wc);
  const title = (wc.getTitle() || 'page').replace(/[<>:"/\\|?*]/g, '_').slice(0, 100);
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('downloads'), title + '.html'), filters: [{ name: 'Web page, complete', extensions: ['html'] }, { name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return;
  if (r.filePath.toLowerCase().endsWith('.pdf')) fs.writeFileSync(r.filePath, await wc.printToPDF({ printBackground: true }));
  else await wc.savePage(r.filePath, 'HTMLComplete');
}

// ---------- IPC: frame config ----------
ipcMain.on('noam:frame-config', (e, url) => {
  let internal = false;
  try { internal = new URL(url).protocol === 'noam:' && e.senderFrame && e.senderFrame.url.startsWith('noam:'); } catch {}
  const top = (() => { try { return e.sender.getURL(); } catch { return url; } })();
  const host = hostOf(top);
  const isWeb = /^https?:/.test(url) || url === 'about:blank' || url.startsWith('blob:') || url.startsWith('data:');
  const isUI = e.sender.getType() === 'window' && e.sender.session === session.fromPartition(MAIN_PARTITION) && top.startsWith('file:');
  const googleAuth = isGoogleAuthHost(host) || isGoogleAuthHost(hostOf(url));
  const fp = !isUI && isWeb && !googleAuth && settings.get('shields').fingerprinting && shields.shieldsUpFor(host);
  const seed = parseInt(crypto.createHash('sha256').update(sessionSecret + siteOf(top || url)).digest('hex').slice(0, 8), 16);
  const ytHost = hostOf(top || url);
  const youtube = /(^|\.)youtube\.com$/.test(ytHost) && settings.get('shields').ads && settings.get('shields').youtube !== false && shields.shieldsUpFor(ytHost);
  const topFrame = !!e.senderFrame && e.sender.mainFrame === e.senderFrame;
  const dark = !isUI && isWeb && !!features && features.darkFor(hostOf(top || url));
  const pw = !isUI && /^https?:/.test(url) && !!features && features.pwEnabled();
  const gestures = !isUI && isWeb && topFrame && !!settings.get('gestures').enabled;
  const media = !isUI && isWeb ? settings.get('media') : null;
  const dict = !isUI && isWeb && (settings.get('dictionary') || {}).enabled !== false;
  const prefetch = !isUI && isWeb && topFrame && (settings.get('perf') || {}).prefetch !== false;
  e.returnValue = { fp, internal, seed, googleAuth, firefoxUA: FIREFOX_UA, youtube, dark, pw, topFrame, gestures, gestureTrail: !!settings.get('gestures').trail, media, dict, prefetch, dictSpeak: (settings.get('dictionary') || {}).speak !== false };
});
ipcMain.on('noam:yt-blocked', (e) => {
  try { if (/(^|\.)youtube\.com$/.test(hostOf(e.sender.getURL()))) shields.countBlocked(e.sender.id, 'https://www.youtube.com/(video ad)'); } catch {}
});

// ---------- IPC: UI window ----------
function fromUI(e) { const w = BrowserWindow.fromWebContents(e.sender); return w && windows.has(w); }
const uiHandle = (ch, fn) => ipcMain.handle(ch, (e, ...a) => { if (!fromUI(e)) throw new Error('denied'); return fn(e, ...a); });

uiHandle('ui:paths', () => ({ framePreload: 'file://' + FRAME_PRELOAD.replace(/\\/g, '/'), mainPartition: MAIN_PARTITION, privatePartition: PRIVATE_PARTITION }));
uiHandle('ui:suggest', (_e, q) => suggest(q));
uiHandle('ui:resolve-input', (_e, text) => resolveInput(text));
uiHandle('history:add', (_e, h) => addHistory(h));
uiHandle('history:meta', (_e, h) => updateHistoryMeta(h));
uiHandle('history:remove-url', (_e, url) => { history.set('items', history.get('items').filter((h) => h.url !== url)); return true; });
uiHandle('session:save', (_e, tabs) => { settings.set('session', tabs.filter((t) => t.url && !t.url.startsWith('view-source')).slice(0, 60)); });
uiHandle('bookmarks:toggle', (_e, b) => {
  const items = bookmarks.get('items');
  const i = items.findIndex((x) => x.url === b.url);
  if (i >= 0) { items.splice(i, 1); tombstone(b.url); } else items.push({ id: crypto.randomUUID(), url: b.url, title: b.title || b.url, favicon: b.favicon || '', added: Date.now() });
  bookmarks.set('items', items); features && features.syncTouch();
  broadcast('bookmarks:changed', items); broadcastPages('bookmarks', items);
  return i < 0;
});
uiHandle('bookmarks:list', () => bookmarks.get('items'));
uiHandle('shields:tab', (_e, wcId) => shields.tabSummary(wcId));
uiHandle('shields:toggle-site', (_e, host) => {
  const site = siteOf(host); if (!site) return;
  const off = settings.get('siteShieldsOff');
  if (off[site]) delete off[site]; else off[site] = Date.now();
  settings.set('siteShieldsOff', off);
  return !off[site];
});
uiHandle('shields:forget-site', async (_e, { host, privateTab }) => {
  const ses = privateTab ? privateSession() : mainSession();
  const site = siteOf(host);
  const origins = [`https://${host}`, `http://${host}`, `https://${site}`, `https://www.${site}`];
  for (const origin of origins) await ses.clearStorageData({ origin }).catch(() => {});
  const cookies = await ses.cookies.get({});
  for (const c of cookies) {
    const d = c.domain.replace(/^\./, '');
    if (d === site || d.endsWith('.' + site)) await ses.cookies.remove(`http${c.secure ? 's' : ''}://${d}${c.path}`, c.name).catch(() => {});
  }
  return true;
});
uiHandle('vpn:toggle', () => (vpn.wantOn ? vpn.disconnect() : vpn.connect()));
uiHandle('vpn:status', () => vpn.status());
uiHandle('vpn:new-identity', () => vpn.newIdentity());
uiHandle('vpn:set', (_e, patch) => { settings.set('vpn', { ...settings.get('vpn'), ...patch }); if (vpn.wantOn && ('mode' in patch || 'customProxy' in patch)) vpn.connect(); return settings.get('vpn'); });
uiHandle('settings:get', () => publicSettings());
uiHandle('settings:set', (_e, patch) => setSettings(patch));
uiHandle('stats:get', () => statsSummary());
uiHandle('downloads:list', () => allDownloads());
uiHandle('downloads:action', (_e, { id, action }) => downloadAction(id, action));
uiHandle('private:clear', async () => {
  const ses = session.fromPartition(PRIVATE_PARTITION);
  await ses.clearStorageData(); await ses.clearCache(); await ses.clearAuthCache();
});
uiHandle('window:new', (_e, opts = {}) => { createWindow({ urls: opts.url ? [opts.url] : [], privateTab: !!opts.private }); });
uiHandle('window:control', (e, action) => {
  const w = BrowserWindow.fromWebContents(e.sender); if (!w) return;
  if (action === 'minimize') w.minimize();
  else if (action === 'maximize') w.isMaximized() ? w.unmaximize() : w.maximize();
  else if (action === 'close') w.close();
  else if (action === 'fullscreen') w.setFullScreen(!w.isFullScreen());
});
uiHandle('window:set-fullscreen', (e, on) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.setFullScreen(!!on); });
uiHandle('page:zoom', (_e, { wcId, level }) => { const wc = webContents.fromId(wcId); if (wc) { wc.setZoomLevel(level); saveZoom(wc.getURL(), level); } });
uiHandle('page:save', (_e, wcId) => { const wc = webContents.fromId(wcId); if (wc) savePage(wc); });
uiHandle('page:menu', (e, { wcId, x, y }) => appMenu(e.sender, wcId, x, y));
uiHandle('page:screenshot', async (_e, wcId) => {
  const wc = webContents.fromId(wcId); if (!wc) return;
  const img = await wc.capturePage();
  const file = uniquePath(app.getPath('pictures') || app.getPath('downloads'), `Screenshot ${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`);
  fs.writeFileSync(file, img.toPNG());
  await require('./clip').writeImagePng(img.toPNG()).catch(() => {});
  return file;
});
uiHandle('shell:show', (_e, p) => shell.showItemInFolder(p));
uiHandle('containers:prepare', () => { prepareContainers(); return true; });
const clearContainer = async (id) => { if (!/^[\w-]{1,40}$/.test(String(id))) return false; await session.fromPartition('persist:noam-c-' + id).clearStorageData(); return true; };
uiHandle('containers:clear', (_e, id) => clearContainer(id));
pageHandle('containers:clear', (_e, id) => clearContainer(id));
uiHandle('webview:prepare', (_e, isPrivate) => { if (isPrivate) privateSession(); else mainSession(); return true; });

function downloadAction(id, action) {
  const d = downloads.get(id);
  if (action === 'pause' && d) d.item.pause();
  else if (action === 'resume' && d && d.item.canResume()) d.item.resume();
  else if (action === 'cancel' && d) d.item.cancel();
  else if (action === 'open') { const x = allDownloads().find((x) => x.id === id); if (x && x.path && fs.existsSync(x.path)) shell.openPath(x.path); }
  else if (action === 'show') { const x = allDownloads().find((x) => x.id === id); if (x && x.path) shell.showItemInFolder(x.path); }
  else if (action === 'remove') { downloadsStore.set('items', downloadsStore.get('items').filter((x) => x.id !== id)); }
  else if (action === 'clear') { downloadsStore.set('items', []); }
  const list = allDownloads();
  broadcastPages('downloads-list', list);
  return list;
}

function setSettings(patch) {
  const allowed = ['searchEngine', 'homepage', 'theme', 'accent', 'showBookmarksBar', 'restoreTabs', 'clearOnExit', 'askDownloadLocation', 'downloadDir', 'newTabShowStats', 'newTabShowTopSites', 'dns', 'shields', 'vpn', 'appearance', 'passwords', 'translate', 'updates', 'tabs', 'forceDarkAll', 'gestures', 'media', 'widgets', 'sidePanel', 'downloads', 'blueLight', 'zmanimAlerts', 'screenTime', 'focus', 'dictionary', 'perf', 'containers'];
  for (const [k, v] of Object.entries(patch || {})) {
    if (!allowed.includes(k)) continue;
    if (['shields', 'vpn', 'appearance', 'passwords', 'translate', 'updates', 'tabs', 'gestures', 'media', 'widgets', 'sidePanel', 'downloads', 'blueLight', 'zmanimAlerts', 'screenTime', 'focus', 'dictionary', 'perf'].includes(k) && v && typeof v === 'object' && !Array.isArray(v)) settings.set(k, { ...settings.get(k), ...v });
    else if (['gestures', 'media', 'widgets', 'sidePanel', 'downloads', 'blueLight', 'zmanimAlerts', 'screenTime', 'focus', 'dictionary', 'perf'].includes(k)) continue;
    else settings.set(k, v);
  }
  if ('theme' in patch || 'appearance' in patch) applyThemeToWindows();
  if (features && Object.keys(patch || {}).some((k) => ['searchEngine', 'homepage', 'theme', 'accent', 'appearance', 'shields', 'showBookmarksBar', 'widgets', 'gestures', 'media', 'sidePanel', 'blueLight', 'zmanimAlerts', 'focus', 'dictionary', 'perf', 'containers'].includes(k))) { features.syncer.touchSettings(); features.syncTouch(); }
  if (patch.downloads && 'limitKBps' in patch.downloads) for (const d of downloads.values()) if (d.td) { d.td.setLimit(Math.max(0, +patch.downloads.limitKBps || 0) * 1024); d.info.limited = d.td.limit > 0; }
  if (patch.containers) prepareContainers();
  if ('dns' in patch) applyDns();
  if (patch.vpn && vpn.wantOn && ('mode' in patch.vpn || 'customProxy' in patch.vpn)) vpn.connect();
  const pub = publicSettings();
  broadcast('settings:changed', pub); broadcastPages('settings', pub);
  return pub;
}

function resolveInput(text) {
  const t = text.trim();
  if (!t) return null;
  if (/^(https?|noam|about|view-source|file|data):/i.test(t)) return t;
  if (/^localhost(:\d+)?(\/|$)/i.test(t) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(t)) return 'http://' + t;
  if (!/\s/.test(t) && /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(t)) {
    const tld = t.split('/')[0].split(':')[0].split('.').pop();
    if (/^[a-z]{2,24}$/i.test(tld) && !/^\d+$/.test(tld)) return 'https://' + t;
  }
  const eng = SEARCH_ENGINES[settings.get('searchEngine')] || SEARCH_ENGINES.duckduckgo;
  return eng.url.replace('%s', encodeURIComponent(t));
}

function appMenu(sender, wcId, x, y) {
  const win = BrowserWindow.fromWebContents(sender);
  const wc = wcId ? webContents.fromId(wcId) : null;
  const send = (ch, d) => sender.send(ch, d);
  const zoom = wc ? Math.round(Math.pow(1.2, wc.getZoomLevel()) * 100) : 100;
  const tpl = [
    { label: 'New tab', accelerator: 'CmdOrCtrl+T', click: () => send('tab:open', { url: 'noam://newtab/' }) },
    { label: 'New private tab', accelerator: 'CmdOrCtrl+Shift+N', click: () => send('tab:open', { url: 'noam://newtab/', private: true }) },
    { label: 'New window', accelerator: 'CmdOrCtrl+N', click: () => createWindow() },
    { type: 'separator' },
    { label: 'History', accelerator: 'CmdOrCtrl+H', click: () => send('tab:open', { url: 'noam://history/' }) },
    { label: 'Downloads', accelerator: 'CmdOrCtrl+J', click: () => send('tab:open', { url: 'noam://downloads/' }) },
    { label: 'Bookmarks', click: () => send('tab:open', { url: 'noam://bookmarks/' }) },
    { label: 'Passwords', click: () => send('tab:open', { url: 'noam://passwords/' }) },
    { label: 'Focus timer 🍅', accelerator: 'CmdOrCtrl+Shift+F', click: () => send('shortcut', { key: 'focus' }) },
    { label: 'Focus progress', click: () => send('tab:open', { url: 'noam://focus/' }) },
    { label: 'Screen time', click: () => send('tab:open', { url: 'noam://screentime/' }) },
    { label: 'Speed & memory ⚡', click: () => send('tab:open', { url: 'noam://performance/' }) },
    { label: 'Save a copy of this page 🕰️', enabled: !!wc, click: () => send('shortcut', { key: 'snapshot' }) },
    { label: 'Time machine', click: () => send('tab:open', { url: 'noam://timemachine/' }) },
    { label: 'Price tracker 🏷️', click: () => send('tab:open', { url: 'noam://prices/' }) },
    { type: 'separator' },
    { label: 'Command palette…', accelerator: 'CmdOrCtrl+K', click: () => send('shortcut', { key: 'k', ctrl: true }) },
    { label: 'Reader view', accelerator: 'F9', enabled: !!wc, click: () => send('shortcut', { key: 'reader' }) },
    { label: 'Translate page…', enabled: !!wc, click: () => send('shortcut', { key: 'translate' }) },
    { label: 'Dark mode for this site', enabled: !!wc, click: () => send('shortcut', { key: 'dark' }) },
    { label: 'Blue light filter', type: 'checkbox', accelerator: 'CmdOrCtrl+Shift+L', checked: !!(settings.get('blueLight') || {}).enabled, click: () => send('shortcut', { key: 'l', ctrl: true, shift: true }) },
    { label: 'Split view', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('shortcut', { key: 's', ctrl: true, shift: true }) },
    { label: 'Vertical tabs', type: 'checkbox', checked: settings.get('tabs').layout === 'vertical', click: () => send('shortcut', { key: 'vertical' }) },
    { type: 'separator' },
    { label: `Zoom (${zoom}%)`, submenu: [
      { label: 'Zoom in', accelerator: 'CmdOrCtrl+=', click: () => send('shortcut', { key: '=', ctrl: true }) },
      { label: 'Zoom out', accelerator: 'CmdOrCtrl+-', click: () => send('shortcut', { key: '-', ctrl: true }) },
      { label: 'Reset zoom', accelerator: 'CmdOrCtrl+0', click: () => send('shortcut', { key: '0', ctrl: true }) },
    ] },
    { label: 'Find in page…', accelerator: 'CmdOrCtrl+F', click: () => send('shortcut', { key: 'f', ctrl: true }) },
    { label: 'Print…', accelerator: 'CmdOrCtrl+P', enabled: !!wc, click: () => wc && wc.print() },
    { label: 'Save page as…', accelerator: 'CmdOrCtrl+S', enabled: !!wc, click: () => wc && savePage(wc) },
    { label: 'Screenshot…', accelerator: 'CmdOrCtrl+Shift+X', enabled: !!wc, click: () => send('shortcut', { key: 'x', ctrl: true, shift: true }) },
    { label: 'Reading list', click: () => send('shortcut', { key: 'reading-list' }) },
    { label: 'Save tabs as a session…', click: () => send('shortcut', { key: 'save-session' }) },
    { label: 'Full screen', accelerator: 'F11', click: () => win && win.setFullScreen(!win.isFullScreen()) },
    { type: 'separator' },
    { label: 'Clear browsing data…', click: () => send('tab:open', { url: 'noam://settings/#privacy' }) },
    { label: 'Import from another browser…', click: () => send('tab:open', { url: 'noam://settings/#import' }) },
    { label: 'Sync…', click: () => send('tab:open', { url: 'noam://settings/#sync' }) },
    { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: () => send('tab:open', { url: 'noam://settings/' }) },
    { label: 'Dev Lab — look inside this page', accelerator: 'F12', enabled: !!wc, click: () => send('shortcut', { key: 'devlab' }) },
    { label: 'Code Playground', click: () => send('tab:open', { url: 'noam://playground/' }) },
    { label: 'Pro developer tools', accelerator: 'CmdOrCtrl+Shift+I', enabled: !!wc, click: () => wc && (wc.isDevToolsOpened() ? wc.closeDevTools() : wc.openDevTools()) },
    { label: 'About NoamBrowser', click: () => send('tab:open', { url: 'noam://settings/#about' }) },
    { type: 'separator' },
    { label: 'Exit', click: () => app.quit() },
  ];
  Menu.buildFromTemplate(tpl).popup({ window: win, x: Math.round(x), y: Math.round(y) });
}

// ---------- IPC: internal noam:// pages ----------
function pageHandle(ch, fn) {
  ipcMain.handle('noam:page:' + ch, (e, ...a) => {
    const url = e.senderFrame ? e.senderFrame.url : '';
    if (!url.startsWith('noam:')) throw new Error('denied');
    return fn(e, ...a);
  });
}
pageHandle('settings:get', () => publicSettings());
pageHandle('settings:set', (_e, patch) => setSettings(patch));
pageHandle('stats:get', () => statsSummary());
pageHandle('search:engines', () => SEARCH_ENGINES);
pageHandle('topsites:get', () => topSites(8));
pageHandle('topsites:hide', (_e, host) => { const h = settings.get('topSitesHidden'); h[String(host)] = Date.now(); settings.set('topSitesHidden', h); return topSites(8); });
pageHandle('topsites:unhide', (_e, host) => { const h = settings.get('topSitesHidden'); delete h[String(host)]; settings.set('topSitesHidden', h); return topSites(8); });
pageHandle('topsites:reset', () => { settings.set('topSitesHidden', {}); return topSites(8); });
pageHandle('history:list', (_e, { q = '', offset = 0, limit = 200 } = {}) => {
  q = q.toLowerCase();
  const items = q ? history.get('items').filter((h) => h.url.toLowerCase().includes(q) || (h.title || '').toLowerCase().includes(q)) : history.get('items');
  return { total: items.length, items: items.slice(offset, offset + limit) };
});
pageHandle('history:delete', (_e, urls) => { const set = new Set(urls); history.set('items', history.get('items').filter((h) => !set.has(h.url))); return true; });
pageHandle('history:clear', () => { history.set('items', []); return true; });
pageHandle('bookmarks:list', () => bookmarks.get('items'));
function tombstone(url) { const t = bookmarks.get('tombstones') || []; t.push({ url, t: Date.now() }); bookmarks.set('tombstones', t.slice(-2000)); }
pageHandle('bookmarks:remove', (_e, id) => { const gone = bookmarks.get('items').find((b) => b.id === id); if (gone) tombstone(gone.url); const items = bookmarks.get('items').filter((b) => b.id !== id); bookmarks.set('items', items); features && features.syncTouch(); broadcast('bookmarks:changed', items); return items; });
pageHandle('bookmarks:add', (_e, b) => { const items = bookmarks.get('items'); if (!/^(https?|noam):/.test(b.url)) throw new Error('Only web addresses can be bookmarked'); items.push({ id: crypto.randomUUID(), url: b.url, title: b.title || b.url, favicon: '', added: Date.now() }); bookmarks.set('items', items); broadcast('bookmarks:changed', items); features && features.syncTouch(); return items; });
pageHandle('bookmarks:update', (_e, b) => { const items = bookmarks.get('items'); const x = items.find((i) => i.id === b.id); if (x) { if (b.title != null) x.title = b.title; if (b.url) x.url = b.url; x.updated = Date.now(); } bookmarks.set('items', items); features && features.syncTouch(); broadcast('bookmarks:changed', items); return items; });
pageHandle('downloads:list', () => allDownloads());
pageHandle('downloads:open', (_e, id) => downloadAction(id, 'open'));
pageHandle('downloads:show', (_e, id) => downloadAction(id, 'show'));
pageHandle('downloads:cancel', (_e, id) => downloadAction(id, 'cancel'));
pageHandle('downloads:pause', (_e, id) => downloadAction(id, 'pause'));
pageHandle('downloads:resume', (_e, id) => downloadAction(id, 'resume'));
pageHandle('downloads:clear', () => downloadAction(null, 'clear'));
pageHandle('filters:info', () => shields.engineInfo());
pageHandle('filters:update', async (e) => {
  const info = await shields.updateLists((p) => { try { e.sender.send('noam:page-event', 'filters-progress', p); } catch {} });
  return info;
});
pageHandle('vpn:status', () => vpn.status());
pageHandle('vpn:toggle', () => (vpn.wantOn ? vpn.disconnect() : vpn.connect()));
pageHandle('vpn:new-identity', () => vpn.newIdentity());
pageHandle('shields:sites', () => settings.get('siteShieldsOff'));
pageHandle('shields:site-set', (_e, { site, on }) => { const off = settings.get('siteShieldsOff'); if (on) delete off[site]; else off[site] = Date.now(); settings.set('siteShieldsOff', off); return off; });
pageHandle('appearance:wallpaper', (_e, dataUrl) => {
  for (const ext of ['jpg', 'png', 'webp', 'gif']) { try { fs.unlinkSync(path.join(userData, 'wallpaper.' + ext)); } catch {} }
  if (dataUrl) {
    const m = /^data:image\/(jpeg|jpg|png|webp|gif);base64,(.+)$/.exec(dataUrl);
    if (!m) throw new Error('Choose a JPG, PNG, WebP or GIF image.');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 25 * 1024 * 1024) throw new Error('That image is over 25 MB.');
    fs.writeFileSync(path.join(userData, 'wallpaper.' + (m[1] === 'jpeg' ? 'jpg' : m[1])), buf);
  }
  return setSettings({ appearance: { wallpaper: dataUrl ? 'custom' : 'aurora', wallpaperRev: Date.now() } });
});
pageHandle('permissions:list', () => settings.get('permissions'));
pageHandle('permissions:reset', (_e, origin) => { const p = settings.get('permissions'); if (origin) delete p[origin]; else for (const k of Object.keys(p)) delete p[k]; settings.set('permissions', p); return p; });
pageHandle('app:info', () => ({ version: app.getVersion(), chrome: process.versions.chrome, electron: process.versions.electron, userData, platform: process.platform }));
pageHandle('tab:navigate', (e, url) => { const r = resolveInput(url); if (r) e.sender.loadURL(r); });
pageHandle('default-browser:set', () => {
  app.setAsDefaultProtocolClient('http'); app.setAsDefaultProtocolClient('https');
  if (process.platform === 'win32') shell.openExternal('ms-settings:defaultapps');
  return true;
});
pageHandle('data:clear', async (_e, what = {}) => {
  const ses = mainSession();
  if (what.history) history.set('items', []);
  if (what.cookies) { await ses.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'websql', 'serviceworkers', 'cachestorage', 'filesystem', 'shadercache'] }); }
  if (what.cache) { await ses.clearCache(); await ses.clearCodeCaches({}).catch(() => {}); }
  if (what.downloads) downloadsStore.set('items', []);
  if (what.permissions) settings.set('permissions', {});
  if (what.stats) stats.set('totalBlocked', 0), stats.set('bytesSaved', 0), stats.set('days', {}), stats.set('since', Date.now());
  return true;
});

// ---------- app lifecycle ----------
function urlsFromArgv(argv) {
  return argv.slice(1).filter((a) => /^(https?:|file:)/i.test(a) || (/\.(html?|pdf|svg|xhtml)$/i.test(a) && fs.existsSync(a))).map((a) => (/^(https?|file):/i.test(a) ? a : 'file:///' + path.resolve(a).replace(/\\/g, '/')));
}
app.on('second-instance', (_e, argv) => {
  const urls = urlsFromArgv(argv);
  const w = mainWindow;
  if (w && !w.isDestroyed()) {
    if (w.isMinimized()) w.restore();
    w.focus();
    for (const u of urls) w.webContents.send('tab:open', { url: u });
    if (!urls.length) w.webContents.send('tab:open', { url: 'noam://newtab/' });
  } else createWindow({ urls });
});

app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    // macOS needs a real menu bar for Cmd+C/V/Q and window management to work.
    const send = (ch, d) => { const w = BrowserWindow.getFocusedWindow(); if (w && windows.has(w)) w.webContents.send(ch, d); };
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu', label: 'NoamBrowser' },
      { label: 'File', submenu: [
        { label: 'New Tab', accelerator: 'Cmd+T', click: () => send('shortcut', { key: 't', ctrl: true }) },
        { label: 'New Window', accelerator: 'Cmd+N', click: () => createWindow() },
        { label: 'New Private Tab', accelerator: 'Cmd+Shift+N', click: () => send('shortcut', { key: 'n', ctrl: true, shift: true }) },
        { label: 'Reopen Closed Tab', accelerator: 'Cmd+Shift+T', click: () => send('shortcut', { key: 't', ctrl: true, shift: true }) },
        { type: 'separator' },
        { label: 'Close Tab', accelerator: 'Cmd+W', click: () => send('shortcut', { key: 'w', ctrl: true }) },
      ] },
      { role: 'editMenu' },
      { label: 'View', submenu: [
        { label: 'Reload', accelerator: 'Cmd+R', click: () => send('shortcut', { key: 'r', ctrl: true }) },
        { label: 'Find…', accelerator: 'Cmd+F', click: () => send('shortcut', { key: 'f', ctrl: true }) },
        { type: 'separator' }, { role: 'togglefullscreen' },
      ] },
      { role: 'windowMenu' },
    ]));
  } else Menu.setApplicationMenu(null);
  nativeTheme.themeSource = settings.get('theme');
  app.userAgentFallback = chromeUA();
  applyDns();

  shields = new Shields({
    settings, stats, userData, appPath: APP_ROOT,
    onBlocked: (wcId, summary) => {
      const wc = webContents.fromId(wcId);
      const host = wc && wc.hostWebContents;
      if (host && !host.isDestroyed()) host.send('shields:update', { wcId, ...summary });
    },
  });
  await shields.init();
  shields.chromeUA = chromeUA();

  vpn = new VPN({ getSessions: browsingSessions, settings });
  vpn.on('status', (s) => { broadcast('vpn:status', s); broadcastPages('vpn', s); });

  mainSession();
  privateSession();
  prepareContainers();
  features = setupFeatures({ settings, bookmarks, history, userData, broadcast, broadcastPages, uiHandle, pageHandle, siteOf, hostOf, applyThemeToWindows, publicSettings });
  const ctx2 = { settings, userData, broadcast, broadcastPages, uiHandle, pageHandle, siteOf, hostOf, getFetchSession: () => mainSession(), syncTouch: () => features.syncTouch() };
  features2 = setupFeatures2(ctx2);
  try { require('./devlab')({ uiHandle }); } catch (e) { console.error('dev lab', e); }
  try { require('./zmanim-alerts')({ settings, pageHandle, windows }); } catch (e) { console.error('zmanim alerts', e); }
  try { screenTime = require('./screentime')({ settings, userData, uiHandle, pageHandle, windows, privatePartition: PRIVATE_PARTITION }); } catch (e) { console.error('screen time', e); }
  try { timeMachine = require('./timemachine')({ userData, uiHandle, pageHandle, broadcast, broadcastPages, getSession: () => mainSession(), windows }); } catch (e) { console.error('time machine', e); }
  try { require('./prices')({ userData, uiHandle, pageHandle, broadcast, broadcastPages, getSession: () => mainSession(), windows }); } catch (e) { console.error('prices', e); }
  try { require('./perf')({ settings, uiHandle, pageHandle, broadcast, broadcastPages }); } catch (e) { console.error('perf', e); }
  try { focusApi = require('./focus')({ settings, userData, uiHandle, pageHandle, windows, broadcast, broadcastPages, shields, screenTime, keyOf: require('./screentime').keyOf, privatePartition: PRIVATE_PARTITION }); } catch (e) { console.error('focus', e); }
  features.syncer.extra = { snapshot: features2.snapshot, merge: features2.merge };
  pageHandle('passwords:check', () => ctx2.passwordsCheck(features.vault));

  // Proxy auth for custom proxies with user:pass@
  app.on('login', (event, _wc, details, authInfo, cb) => {
    if (authInfo.isProxy && vpn.creds) { event.preventDefault(); cb(vpn.creds.username, vpn.creds.password); }
  });

  if (settings.get('vpn').autoConnect) vpn.connect();
  createWindow({ urls: urlsFromArgv(process.argv), restore: true });

  setInterval(() => broadcast('stats:update', statsSummary()), 5000);
  nativeTheme.on('updated', applyThemeToWindows);

  if (TEST_MODE) require('./test-hooks')({ app, windows, shields, vpn, settings, webContents, features, features2 });
});

app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (!windows.size && app.isReady()) createWindow(); });
app.on('before-quit', async (e) => {
  if (quitting) return;
  quitting = true;
  vpn && vpn.shutdown();
  settings.flush(); stats.flush(); history.flush(); bookmarks.flush(); downloadsStore.flush();
  try { await session.fromPartition(PRIVATE_PARTITION).clearStorageData(); } catch {}
  if (settings.get('clearOnExit')) {
    e.preventDefault();
    try {
      const ses = session.fromPartition(MAIN_PARTITION);
      await ses.clearStorageData(); await ses.clearCache();
      history.set('items', []); history.flush(); settings.set('session', []); settings.flush();
    } catch {}
    app.exit(0);
  }
});
process.on('uncaughtException', (err) => console.error('uncaught', err));
