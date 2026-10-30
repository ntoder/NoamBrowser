// NoamBrowser — Chrome extensions. Install from the Chrome Web Store (or load your own folder), with a
// plain-language safety check before anything is added. Extensions run in normal tabs only: never in
// private tabs or containers.
'use strict';
const { app, BrowserWindow, webContents, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// ---------------------------------------------------------------- plain-language permissions
const PERMS = {
  tabs: ['See the titles and web addresses of your tabs', 1],
  history: ['See and delete your browsing history', 2],
  cookies: ['Read and change cookies (it could act as you on sites you’re signed in to)', 2],
  webRequest: ['Watch the pages your browser loads', 1],
  webRequestBlocking: ['Block or change what web pages load', 1],
  declarativeNetRequest: ['Block or change parts of web pages (like an ad blocker)', 1],
  declarativeNetRequestWithHostAccess: ['Block or change parts of web pages (like an ad blocker)', 1],
  storage: ['Save its own settings', 0], unlimitedStorage: ['Save lots of its own data', 0],
  notifications: ['Show you notifications', 0], alarms: ['Run things on a timer', 0],
  contextMenus: ['Add items to the right-click menu', 0], activeTab: ['Work on a page only when you click it', 0],
  sidePanel: ['Open its own side panel', 0], offscreen: ['Do work in the background', 0], idle: ['Know when you step away from the computer', 0],
  scripting: ['Run its own code on the pages it’s allowed on', 1],
  clipboardRead: ['Read what you copy', 2], clipboardWrite: ['Put things on your clipboard', 0],
  downloads: ['Manage your downloads', 1], bookmarks: ['Read and change your bookmarks', 1],
  geolocation: ['Know where you are', 2], identity: ['Sign you in to its own service', 1],
  management: ['See, turn off or remove your other extensions', 2], nativeMessaging: ['Talk to programs on your computer', 2],
  proxy: ['Change how you connect to the internet (it could see all your traffic)', 2], privacy: ['Change your privacy settings', 1],
  debugger: ['Fully control web pages, like developer tools', 2], webNavigation: ['See every page you go to', 1],
  topSites: ['See the sites you visit most', 1], tts: ['Read text aloud', 0], fontSettings: ['Change fonts', 0],
  desktopCapture: ['Record your screen', 2], tabCapture: ['Record what’s in a tab', 2], pageCapture: ['Save copies of pages', 1],
  downloads_open: ['Open files you downloaded', 1], browsingData: ['Delete your browsing data', 1], sessions: ['See tabs you closed recently', 1],
  power: ['Keep the computer awake', 0], system_cpu: ['See your computer’s details', 0], system_memory: ['See your computer’s details', 0], system_display: ['See your screen setup', 0],
};
const ALL_SITES = /^(<all_urls>|\*:\/\/\*\/\*|https?:\/\/\*\/\*|\*:\/\/\*\/|file:\/\/\/\*)$/;
function describe(m) {
  const items = []; let risk = 0; const seen = new Set();
  const add = (text, lvl) => { if (seen.has(text)) return; seen.add(text); items.push({ text, level: lvl }); risk = Math.max(risk, lvl); };
  const hosts = new Set([...(m.host_permissions || []), ...(m.content_scripts || []).flatMap((c) => c.matches || [])]);
  for (const p of [...(m.permissions || []), ...(m.optional_permissions || []).map((x) => '?' + x)]) {
    if (typeof p !== 'string') continue;
    const opt = p.startsWith('?'), name = opt ? p.slice(1) : p;
    if (/[:/*]/.test(name)) { if (!opt) hosts.add(name); continue; }
    const d = PERMS[name.replace('.', '_')];
    if (d) add(d[0] + (opt ? ' (only if you say yes later)' : ''), opt ? Math.min(d[1], 1) : d[1]);
  }
  const hl = [...hosts];
  if (hl.some((h) => ALL_SITES.test(h))) add('Read and change everything on every website you visit', 2);
  else if (hl.length) {
    const names = [...new Set(hl.map((h) => h.replace(/^[^:]+:\/\//, '').replace(/\/.*$/, '').replace(/^\*\./, '')))];
    add('Read and change these sites: ' + names.slice(0, 6).join(', ') + (names.length > 6 ? ` and ${names.length - 6} more` : ''), 1);
  }
  if (!items.length) add('Nothing special: it can’t read your pages or data', 0);
  items.sort((a, b) => b.level - a.level);
  return { risk: ['low', 'medium', 'high'][risk], items };
}
const iconOf = (ext) => {
  const icons = (ext.manifest && (ext.manifest.icons || (ext.manifest.action || ext.manifest.browser_action || {}).default_icon)) || {};
  const best = typeof icons === 'string' ? icons : icons[Object.keys(icons).sort((a, b) => Math.abs(48 - a) - Math.abs(48 - b))[0]];
  if (!best || !ext.path) return null;
  try { const buf = fs.readFileSync(path.join(ext.path, best)); return 'data:image/png;base64,' + buf.toString('base64'); } catch { return null; }
};
const cmpVer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };

module.exports = async function setupExtensions({ settings, uiHandle, pageHandle, broadcast, broadcastPages, getSession, hostWindowOf, menuExtras }) {
  let ECE, CWS;
  try { ECE = require('electron-chrome-extensions'); CWS = require('electron-chrome-web-store'); } catch (e) { console.error('extensions unavailable', e); return null; }
  const ses = getSession();
  const EXT_DIR = path.join(app.getPath('userData'), 'Extensions');
  const cfg = () => ({ disabled: [], unpacked: [], ...(settings.get('extensions') || {}) });
  const setCfg = (patch) => settings.set('extensions', { ...cfg(), ...patch });
  const known = new Map(); // id -> { id, name, version, path, manifest, source }
  const remember = (ext, source) => { known.set(ext.id, { id: ext.id, name: ext.name, version: ext.version || (ext.manifest || {}).version, path: ext.path, manifest: ext.manifest, source: source || (known.get(ext.id) || {}).source || 'store' }); };
  const changed = () => { broadcastPages('extensions', {}); broadcast('ext:changed', {}); };

  // which window should get tabs an extension opens
  const pickWin = (id) => (id && BrowserWindow.fromId(id)) || [BrowserWindow.getFocusedWindow(), ...BrowserWindow.getAllWindows()].find((w) => w && !w.isDestroyed() && w.webContents.getURL().startsWith('file:') && w.webContents.session === ses) || null;
  const waiters = [];
  let quiet = false;
  const ext = new ECE.ElectronChromeExtensions({
    session: ses,
    async createTab(details) {
      const win = pickWin(details.windowId);
      if (!win) throw new Error('no window');
      const got = new Promise((res, rej) => { const w = { win, res }; waiters.push(w); setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); rej(new Error('tab timeout')); } }, 10000); });
      win.webContents.send('tab:open', { url: details.url || 'noam://newtab/', background: details.active === false });
      return [await got, win];
    },
    selectTab(tab, win) { if (!quiet && win && !win.isDestroyed()) win.webContents.send('perf:action', { action: 'show', wcId: tab.id }); },
    removeTab(tab, win) { if (!tab.isDestroyed() && win && !win.isDestroyed()) win.webContents.send('perf:action', { action: 'close', wcId: tab.id }); },
    createWindow(details) {
      const url = Array.isArray(details.url) ? details.url[0] : details.url;
      const win = pickWin(); if (win && url) win.webContents.send('tab:open', { url });
      return win;
    },
  });
  ECE.ElectronChromeExtensions.handleCRXProtocol(ses);
  try { ses.registerPreloadScript({ id: 'noam-ext-sw', type: 'service-worker', filePath: path.join(__dirname, 'ext-sw-preload.js') }); } catch (e) { console.error('sw preload', e); }

  // every tab (a <webview> in a browser window) becomes visible to extensions' chrome.tabs
  const track = (host) => host.on('did-attach-webview', (_e, wc) => {
    if (wc.session !== ses) return;
    const win = BrowserWindow.fromWebContents(host); if (!win) return;
    try { ext.addTab(wc, win); } catch {}
    const i = waiters.findIndex((w) => w.win === win); if (i >= 0) waiters.splice(i, 1)[0].res(wc);
  });
  app.on('web-contents-created', (_e, wc) => { if (wc.getType() === 'window') track(wc); });
  for (const w of BrowserWindow.getAllWindows()) track(w.webContents);
  uiHandle('ext:active', (_e, wcId) => { const wc = wcId && webContents.fromId(wcId); if (!wc || wc.session !== ses) return; quiet = true; try { ext.selectTab(wc); } catch {} quiet = false; });
  // extension items in the right-click menu
  menuExtras.push((wc, params) => { if (wc.session !== ses) return []; try { return ext.getContextMenuItems(wc, params); } catch { return []; } });

  // ---------------------------------------------------------------- install from the Chrome Web Store
  const asks = new Map(); let askN = 0;
  uiHandle('ext:answer', (_e, { id, ok }) => { const r = asks.get(id); if (r) { asks.delete(id); r(!!ok); } });
  async function confirmInstall({ id, name, manifest, icon, wc }) {
    const win = (wc && hostWindowOf(wc)) || pickWin(); if (!win) return false;
    const reqId = ++askN;
    const info = describe(manifest);
    win.webContents.send('ext:confirm', { reqId, id, name, version: manifest.version, icon, description: manifest.description && !/^__MSG_/.test(manifest.description) ? manifest.description : '', ...info });
    return new Promise((res) => { asks.set(reqId, res); setTimeout(() => { if (asks.has(reqId)) { asks.delete(reqId); res(false); } }, 5 * 60000); });
  }
  try {
    await CWS.installChromeWebStore({
      session: ses, extensionsPath: EXT_DIR, loadExtensions: false, autoUpdate: true,
      async beforeInstall(d) {
        let wc = null; try { wc = webContents.fromFrame(d.frame); } catch {}
        let icon = null; try { icon = d.icon && !d.icon.isEmpty() ? d.icon.toDataURL() : null; } catch {}
        const ok = await confirmInstall({ id: d.id, name: d.localizedName, manifest: d.manifest, icon, wc });
        return { action: ok ? 'allow' : 'deny' };
      },
    });
  } catch (e) { console.error('web store', e); }

  // ---------------------------------------------------------------- loading
  const sesx = ses.extensions || ses;
  sesx.on('extension-loaded', (_e, x) => { remember(x); changed(); });
  sesx.on('extension-unloaded', () => changed());
  function discover() {
    const out = [];
    let ids = []; try { ids = fs.readdirSync(EXT_DIR); } catch {}
    for (const id of ids) {
      let best = null;
      let vers = []; try { vers = fs.readdirSync(path.join(EXT_DIR, id)); } catch { continue; }
      for (const v of vers) { const p = path.join(EXT_DIR, id, v); try { const m = JSON.parse(fs.readFileSync(path.join(p, 'manifest.json'), 'utf8')); if (!best || cmpVer(m.version, best.manifest.version) > 0) best = { id, path: p, manifest: m }; } catch {} }
      if (best) out.push({ ...best, source: 'store' });
    }
    for (const p of cfg().unpacked) { try { out.push({ path: p, manifest: JSON.parse(fs.readFileSync(path.join(p, 'manifest.json'), 'utf8')), source: 'folder' }); } catch {} }
    return out;
  }
  async function loadOne(x) {
    try {
      const e = await sesx.loadExtension(x.path, { allowFileAccess: false });
      remember(e, x.source);
      if (e.manifest.manifest_version === 3 && e.manifest.background && e.manifest.background.service_worker) await ses.serviceWorkers.startWorkerForScope(`chrome-extension://${e.id}`).catch(() => {});
      return e;
    } catch (err) { console.error('extension load failed', x.path, err && err.message); return null; }
  }
  const nameOf = (m) => (m && m.name && !/^__MSG_/.test(m.name) ? m.name : 'Extension');
  for (const x of discover()) {
    if (x.id && cfg().disabled.includes(x.id)) { known.set(x.id, { id: x.id, name: nameOf(x.manifest), version: x.manifest.version, path: x.path, manifest: x.manifest, source: x.source }); continue; }
    await loadOne(x);
  }

  // ---------------------------------------------------------------- the extensions page
  const listAll = () => {
    const loaded = new Map(sesx.getAllExtensions().map((e) => [e.id, e]));
    for (const e of loaded.values()) if (!known.has(e.id)) remember(e);
    return [...known.values()].map((k) => {
      const e = loaded.get(k.id) || k; const m = e.manifest || {};
      const opts = m.options_ui ? m.options_ui.page : m.options_page;
      return { id: k.id, name: e.name && !/^__MSG_/.test(e.name) ? e.name : nameOf(m), version: m.version || k.version, description: m.description && !/^__MSG_/.test(m.description) ? m.description : '', icon: iconOf({ ...e, path: e.path || k.path }), enabled: loaded.has(k.id), source: k.source, options: !!opts, mv: m.manifest_version, ...describe(m) };
    }).sort((a, b) => a.name.localeCompare(b.name));
  };
  uiHandle('ext:count', () => known.size);
  pageHandle('ext:list', () => ({ list: listAll(), dir: EXT_DIR }));
  pageHandle('ext:toggle', async (_e, { id, on }) => {
    const k = known.get(id); if (!k) return listAll();
    const dis = new Set(cfg().disabled);
    if (on) { dis.delete(id); setCfg({ disabled: [...dis] }); if (!sesx.getExtension(id)) await loadOne(k); }
    else { dis.add(id); setCfg({ disabled: [...dis] }); if (sesx.getExtension(id)) sesx.removeExtension(id); }
    changed(); return listAll();
  });
  pageHandle('ext:remove', async (_e, { id }) => {
    const k = known.get(id); if (!k) return listAll();
    if (k.source === 'folder') { if (sesx.getExtension(id)) sesx.removeExtension(id); setCfg({ unpacked: cfg().unpacked.filter((p) => p !== k.path) }); }
    else await CWS.uninstallExtension(id, { session: ses, extensionsPath: EXT_DIR }).catch(() => {});
    known.delete(id); setCfg({ disabled: cfg().disabled.filter((x) => x !== id) }); changed(); return listAll();
  });
  pageHandle('ext:options', (_e, { id }) => {
    const e = sesx.getExtension(id); if (!e) return false; const m = e.manifest; const page = m.options_ui ? m.options_ui.page : m.options_page; if (!page) return false;
    const win = pickWin(); if (win) win.webContents.send('tab:open', { url: `chrome-extension://${id}/${page}` }); return true;
  });
  pageHandle('ext:folder', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender.hostWebContents || e.sender) || pickWin();
    const r = await dialog.showOpenDialog(win, { title: 'Pick the folder with your extension’s manifest.json', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return { list: listAll() };
    const p = r.filePaths[0];
    if (!fs.existsSync(path.join(p, 'manifest.json'))) return { list: listAll(), error: 'That folder has no manifest.json file in it.' };
    const x = await loadOne({ path: p, source: 'folder' });
    if (!x) return { list: listAll(), error: 'That extension couldn’t be loaded. Check its manifest.json for mistakes.' };
    setCfg({ unpacked: [...new Set([...cfg().unpacked, p])] }); changed();
    return { list: listAll(), added: x.name };
  });
  pageHandle('ext:reload', async (_e, { id }) => { const k = known.get(id); if (!k) return listAll(); if (sesx.getExtension(id)) sesx.removeExtension(id); await loadOne(k); changed(); return listAll(); });
  pageHandle('ext:install-id', async (e, { id }) => {
    const m = String(id || '').match(/[a-p]{32}/); if (!m) return { error: 'That doesn’t look like a Chrome Web Store link.' };
    if (sesx.getExtension(m[0])) return { error: 'That extension is already added.' };
    // fetch first so the safety check can show what it can do
    try {
      const dir = await CWS.downloadExtension(m[0], EXT_DIR);
      const man = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      const ok = await confirmInstall({ id: m[0], name: nameOf(man), manifest: man, icon: iconOf({ manifest: man, path: dir }), wc: e.sender });
      if (!ok) { fs.rmSync(path.join(EXT_DIR, m[0]), { recursive: true, force: true }); return { cancelled: true }; }
      const x = await loadOne({ path: dir, source: 'store' }); changed();
      return x ? { added: x.name, list: listAll() } : { error: 'It downloaded but couldn’t start in NoamBrowser.' };
    } catch (err) { return { error: 'Couldn’t download it: ' + ((err && err.message) || err) }; }
  });
  pageHandle('ext:describe', (_e, manifest) => describe(manifest || {}));

  const api = { ext, describe, list: listAll, loadFolder: async (p) => { const x = await loadOne({ path: p, source: 'folder' }); if (x) setCfg({ unpacked: [...new Set([...cfg().unpacked, p])] }); changed(); return x; } };
  global.noamExtensions = api;
  return api;
};
module.exports.describe = describe;
