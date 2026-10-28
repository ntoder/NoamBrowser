// NoamBrowser 2.0 features (main process side): passwords, reader view,
// translation, import, sync, updates, per-site dark mode, popup menus.
const { ipcMain, Menu, BrowserWindow, dialog, clipboard, webContents, safeStorage, app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Passwords } = require('./passwords');
const { Translator, guessLang } = require('./translator');
const importer = require('./importer');
const { Sync } = require('./sync');
const { Updater } = require('./updater');

module.exports = function setupFeatures(ctx) {
  const { settings, bookmarks, history, userData, broadcast, broadcastPages, uiHandle, pageHandle, siteOf, hostOf, applyThemeToWindows, publicSettings } = ctx;

  // ------------------------------------------------------------ popup menus
  uiHandle('ui:popup-menu', (e, { items, x, y }) => new Promise((resolve) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    let picked = null;
    const build = (list) => list.map((it) => it.type === 'separator' ? { type: 'separator' } : {
      label: it.label, type: it.type === 'checkbox' ? 'checkbox' : it.submenu ? 'submenu' : 'normal', checked: !!it.checked, enabled: it.enabled !== false,
      submenu: it.submenu ? build(it.submenu) : undefined, click: it.submenu ? undefined : () => { picked = it.id; },
    });
    const menu = Menu.buildFromTemplate(build(items));
    menu.popup({ window: win, x: Math.round(x), y: Math.round(y), callback: () => setTimeout(() => resolve(picked), 0) });
  }));

  // ------------------------------------------------------------ passwords
  const vault = new Passwords(userData);
  const offers = new Map(); // id -> { origin, username, password, existingId }
  const lastUser = new Map(); // wcId -> { origin, value, t }
  const hostWin = (wc) => (wc && wc.hostWebContents) || null;
  const pwCfg = () => settings.get('passwords');

  ipcMain.on('noam:pw-username', (e, value) => {
    const origin = e.senderFrame && e.senderFrame.origin; if (!origin) return;
    lastUser.set(e.sender.id, { origin, value: String(value || '').slice(0, 200), t: Date.now() });
  });
  ipcMain.on('noam:pw-captured', (e, { username, password }) => {
    if (!pwCfg().offerSave) return;
    const origin = e.senderFrame && e.senderFrame.origin;
    if (!origin || !/^https:|^http:\/\/(localhost|127\.)/.test(origin)) return;
    if (!username) { const lu = lastUser.get(e.sender.id); if (lu && lu.origin === origin && Date.now() - lu.t < 10 * 60 * 1000) username = lu.value; }
    const offer = vault.captured({ origin, username: String(username || ''), password: String(password || '') });
    if (!offer) return;
    const id = crypto.randomUUID();
    offers.set(id, offer);
    setTimeout(() => offers.delete(id), 5 * 60 * 1000);
    const host = hostWin(e.sender);
    if (host && !host.isDestroyed()) host.send('password:offer', { id, wcId: e.sender.id, origin, username: offer.username, kind: offer.kind });
  });
  ipcMain.handle('noam:pw-fill', (e) => {
    if (!pwCfg().autofill) return null;
    if (!e.senderFrame || e.senderFrame !== e.sender.mainFrame) return null;
    const list = vault.forOrigin(e.senderFrame.origin);
    if (!list.length) return null;
    vault.markUsed(list[0].id);
    return { username: list[0].username, password: list[0].password };
  });
  uiHandle('password:answer', (_e, { id, action }) => {
    const o = offers.get(id); offers.delete(id);
    if (!o) return false;
    if (action === 'save') { vault.upsert({ origin: o.origin, username: o.username, password: o.password, id: o.id }); sync.touch(); return true; }
    if (action === 'never') { vault.neverFor(o.origin); return true; }
    return false;
  });
  uiHandle('passwords:for-tab', (_e, wcId) => {
    const wc = webContents.fromId(wcId); if (!wc) return [];
    let origin; try { origin = new URL(wc.getURL()).origin; } catch { return []; }
    return vault.forOrigin(origin).map((i) => ({ id: i.id, username: i.username }));
  });
  uiHandle('passwords:fill', (_e, { wcId, id }) => {
    const wc = webContents.fromId(wcId); if (!wc) return false;
    let origin; try { origin = new URL(wc.getURL()).origin; } catch { return false; }
    const item = vault.items.find((i) => i.id === id && i.origin === origin);
    if (!item) return false;
    vault.markUsed(id);
    wc.send('noam:pw-fill-now', { username: item.username, password: item.password });
    return true;
  });
  const pwData = () => ({ items: vault.list(), never: vault.never, protection: vault.protection(), syncing: !!(settings.get('sync').enabled && settings.get('sync').passwords) });
  pageHandle('passwords:list', () => pwData());
  pageHandle('passwords:reveal', (_e, id) => vault.reveal(id));
  pageHandle('passwords:remove', (_e, id) => { vault.remove(id); sync.touch(); return pwData(); });
  pageHandle('passwords:update', (_e, p) => { vault.upsert(p); sync.touch(); return pwData(); });
  pageHandle('passwords:never-remove', (_e, origin) => { vault.removeNever(origin); return pwData(); });
  pageHandle('passwords:clear-clipboard-later', (_e, value) => { setTimeout(async () => { const clip = require('./clip'); try { if (await clip.readText() === value) await clip.writeText(''); } catch {} }, 30000); return true; });
  pageHandle('passwords:export', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender.hostWebContents || e.sender);
    const r = await dialog.showSaveDialog(win, { defaultPath: path.join(app.getPath('documents'), 'NoamBrowser Passwords.csv'), filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, vault.exportCsv(), { mode: 0o600 });
    return r.filePath;
  });
  pageHandle('passwords:import', (_e, text) => { const count = vault.importCsv(String(text || '')); sync.touch(); return { count, data: pwData() }; });

  // ------------------------------------------------------------ reader view
  const articles = new Map();
  const rdDir = path.dirname(require.resolve('@mozilla/readability/package.json'));
  const READABILITY = fs.readFileSync(path.join(rdDir, 'Readability.js'), 'utf8');
  const READERABLE = fs.readFileSync(path.join(rdDir, 'Readability-readerable.js'), 'utf8');
  const runIsolated = (wc, code) => wc.executeJavaScriptInIsolatedWorld(1999, [{ code }], false);
  uiHandle('reader:check', async (_e, wcId) => {
    const wc = webContents.fromId(wcId); if (!wc || !/^https?:/.test(wc.getURL())) return false;
    try { return !!(await runIsolated(wc, `(function(){ var module; ${READERABLE}; return isProbablyReaderable(document, { minContentLength: 180, minScore: 22 }); })()`)); } catch { return false; }
  });
  uiHandle('reader:open', async (_e, wcId) => {
    const wc = webContents.fromId(wcId); if (!wc) return null;
    const art = await runIsolated(wc, `(function(){ var module; ${READABILITY}; var doc = document.cloneNode(true); var a = new Readability(doc, { charThreshold: 300 }).parse(); return a && { title: a.title, byline: a.byline, content: a.content, siteName: a.siteName, lang: a.lang || document.documentElement.lang, dir: a.dir || document.dir, url: location.href }; })()`).catch(() => null);
    if (!art || !art.content) return null;
    const id = crypto.randomBytes(8).toString('hex');
    articles.set(id, art);
    if (articles.size > 40) articles.delete(articles.keys().next().value);
    return 'noam://reader/?id=' + id;
  });
  pageHandle('reader:get', (_e, id) => articles.get(id) || null);

  // ------------------------------------------------------------ translation
  const translator = new Translator();
  // Double-click dictionary: translate one word or a short phrase on any page (works offline once the model is downloaded)
  const LANG_TESTS = [['he', /[\u0590-\u05FF]/], ['ar', /[\u0600-\u06FF]/], ['ru', /[\u0400-\u04FF]/], ['el', /[\u0370-\u03FF]/]];
  ipcMain.handle('noam:dict', async (e, { text }) => {
    const d = settings.get('dictionary') || {};
    if (d.enabled === false) return { error: 'off' };
    text = String(text || '').trim().slice(0, 80);
    if (!text) return { error: 'empty' };
    const from = (LANG_TESTS.find(([, re]) => re.test(text)) || ['en'])[0];
    let to = d.to && d.to !== 'auto' ? d.to : from === 'he' ? 'en' : 'he';
    if (to === from) to = from === 'en' ? 'he' : 'en';
    try {
      const [out] = await translator.call('translate', { from, to, texts: [text] }, 90000);
      return { text, from, to, translation: out };
    } catch (err) {
      const m = String(err.message || err);
      return { text, from, to, error: /model|download|fetch|network/i.test(m) ? 'The dictionary needs to download its language pack once (about 20 MB). Make sure you’re online and try again.' : m };
    }
  });
  uiHandle('translate:detect', async (_e, wcId) => {
    const r = await translator.detect(wcId);
    if (!r) return null;
    return { lang: r.lang || guessLang(r.chars), target: settings.get('translate').target || 'en' };
  });
  uiHandle('translate:page', async (e, { wcId, from, to }) => {
    const t = settings.get('translate');
    if (to && to !== t.target) settings.set('translate', { ...t, target: to });
    return translator.translatePage(wcId, from, to || t.target, (p) => { try { e.sender.send('translate:progress', { wcId, ...p }); } catch {} });
  });
  uiHandle('translate:restore', (_e, wcId) => translator.restore(wcId));
  uiHandle('translate:languages', () => translator.languages().catch(() => null));
  pageHandle('translate:languages', () => translator.languages().catch(() => null));

  // ------------------------------------------------------------ import
  pageHandle('import:detect', () => importer.detect());
  pageHandle('import:run', (_e, { key, bookmarks: doB, history: doH }) => {
    const data = importer.run(key, { bookmarks: doB, history: doH });
    let nb = 0, nh = 0;
    if (data.bookmarks.length) {
      const items = bookmarks.get('items'); const have = new Set(items.map((b) => b.url));
      for (const b of data.bookmarks) if (!have.has(b.url)) { items.push({ id: crypto.randomUUID(), url: b.url, title: b.title, favicon: '', added: Date.now(), folder: b.folder || '' }); have.add(b.url); nb++; }
      bookmarks.set('items', items); broadcast('bookmarks:changed', items);
    }
    if (data.history.length) {
      const items = history.get('items'); const byUrl = new Map(items.map((h) => [h.url, h]));
      for (const h of data.history) {
        const x = byUrl.get(h.url);
        if (x) { x.visits = Math.max(x.visits || 1, h.visits); if (h.t > x.t) x.t = h.t; }
        else { const n = { url: h.url, title: h.title, t: h.t, visits: h.visits }; items.push(n); byUrl.set(h.url, n); nh++; }
      }
      items.sort((a, b) => b.t - a.t); if (items.length > 25000) items.length = 25000;
      history.set('items', items);
    }
    sync.touch();
    return { bookmarks: nb, history: nh };
  });
  pageHandle('import:passwords-help', () => ({
    steps: 'In Chrome, Edge or Brave: open Settings → Passwords (Password Manager) → Settings → Export passwords. Save the CSV, then use “Import from CSV” on NoamBrowser’s Passwords page. Delete the CSV afterwards.',
  }));

  // ------------------------------------------------------------ sync
  const syncer = new Sync({ settings, bookmarks, passwords: vault, userData, safeStorage });
  const sync = { touch: () => setTimeout(() => syncer.run().catch(() => {}), 1500) };
  syncer.on('status', (s) => broadcastPages('sync', s));
  syncer.on('merged', (r) => {
    if (r.bookmarks) broadcast('bookmarks:changed', bookmarks.get('items'));
    if (r.settings) { applyThemeToWindows(); const pub = publicSettings(); broadcast('settings:changed', pub); broadcastPages('settings', pub); }
  });
  pageHandle('sync:status', () => ({ ...syncer.status, ...syncer.publicCfg() }));
  pageHandle('sync:choose-folder', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender.hostWebContents || e.sender);
    const r = await dialog.showOpenDialog(win, { title: 'Choose a folder your cloud drive syncs', properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  pageHandle('sync:enable', async (_e, opts) => { await syncer.enable(opts); return { ...syncer.status, ...syncer.publicCfg() }; });
  pageHandle('sync:disable', () => { syncer.disable(); return { ...syncer.status, ...syncer.publicCfg() }; });
  pageHandle('sync:now', async () => { await syncer.run(); return { ...syncer.status, ...syncer.publicCfg() }; });
  syncer.start();

  // ------------------------------------------------------------ updates
  const updater = new Updater({ settings });
  updater.on('status', (s) => { broadcast('update:status', s); broadcastPages('update', s); });
  updater.init();
  uiHandle('update:status', () => updater.state);
  uiHandle('update:install', () => updater.install());
  pageHandle('update:status', () => updater.state);
  pageHandle('update:check', () => updater.check());
  pageHandle('update:install', () => updater.install());

  // ------------------------------------------------------------ dark mode per site
  uiHandle('dark:toggle', (_e, host) => {
    const site = siteOf(host); if (!site) return false;
    const d = settings.get('siteDark');
    if (d[site]) delete d[site]; else d[site] = Date.now();
    settings.set('siteDark', d);
    return !!d[site];
  });
  uiHandle('dark:get', (_e, host) => !!settings.get('siteDark')[siteOf(host)] || !!settings.get('forceDarkAll'));
  pageHandle('sitedark:list', () => ({ sites: settings.get('siteDark'), all: !!settings.get('forceDarkAll') }));
  pageHandle('sitedark:set', (_e, { site, on, all }) => {
    if (typeof all === 'boolean') settings.set('forceDarkAll', all);
    if (site) { const d = settings.get('siteDark'); if (on) d[site] = Date.now(); else delete d[site]; settings.set('siteDark', d); }
    return { sites: settings.get('siteDark'), all: !!settings.get('forceDarkAll') };
  });

  return {
    darkFor: (host) => !!settings.get('forceDarkAll') || !!settings.get('siteDark')[siteOf(host)],
    pwEnabled: () => pwCfg().offerSave || pwCfg().autofill,
    syncTouch: sync.touch, syncer, updater, vault, translator,
    selftest: () => translator.selftest(),
  };
};
