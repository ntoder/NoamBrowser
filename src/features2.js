// NoamBrowser 2.1 features (main process): widgets data, sessions, reading list,
// per-site notes, to-dos, screenshots, breach alerts, currency rates, gestures,
// cloud-folder detection.
const { ipcMain, BrowserWindow, dialog, clipboard, nativeImage, webContents, app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { Store } = require('./store');

module.exports = function setupFeatures2(ctx) {
  const { settings, userData, broadcast, broadcastPages, uiHandle, pageHandle, getFetchSession, siteOf, hostOf, syncTouch } = ctx;
  const extras = new Store(userData, 'extras', { readingList: [], sessions: [], notes: {}, todos: [], tombstones: [] });
  const now = () => Date.now();
  const tomb = (kind, id) => { const t = extras.get('tombstones'); t.push({ kind, id, t: now() }); extras.set('tombstones', t.slice(-3000)); };
  const changed = (what) => { broadcast('extras:changed', what); broadcastPages('extras', what); syncTouch(); };

  // ------------------------------------------------------------ cached fetch through the browsing session (so the VPN applies)
  const cache = new Map();
  async function getJSON(url, ttlMs, opts = {}) {
    const hit = cache.get(url);
    if (hit && now() - hit.t < ttlMs) return hit.v;
    const ses = getFetchSession();
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await ses.fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json', ...(opts.headers || {}) }, cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const v = opts.text ? await res.text() : await res.json();
      cache.set(url, { t: now(), v });
      return v;
    } catch (e) {
      if (hit) return hit.v; // stale is better than nothing
      throw new Error(e.name === 'AbortError' ? 'timed out' : e.message);
    } finally { clearTimeout(timer); }
  }

  // ------------------------------------------------------------ widgets
  pageHandle('widgets:geocode', async (_e, q) => {
    q = String(q || '').trim().slice(0, 80); if (!q) return [];
    const r = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`, 86400000);
    return (r.results || []).map((x) => ({ name: x.name, admin: x.admin1 || '', country: x.country || '', lat: x.latitude, lon: x.longitude, tz: x.timezone, elevation: x.elevation || 0 }));
  });
  pageHandle('widgets:weather', async (_e, { lat, lon, units }) => {
    const t = units === 'f' ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : '';
    return getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${+lat}&longitude=${+lon}&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=4&timezone=auto${t}`, 20 * 60000);
  });
  pageHandle('widgets:jewish', async (_e, { lat, lon, tz, candle }) => {
    const base = `latitude=${+lat}&longitude=${+lon}&tzid=${encodeURIComponent(tz || 'Asia/Jerusalem')}`;
    const d = new Date(); const ymd = (x) => x.toISOString().slice(0, 10);
    const end = new Date(d.getTime() + 8 * 86400000);
    const [shabbat, hol] = await Promise.all([
      getJSON(`https://www.hebcal.com/shabbat?cfg=json&${base}&M=on&b=${Math.max(0, Math.min(90, +candle || 18))}`, 6 * 3600000).catch(() => null),
      getJSON(`https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=on&mod=on&nx=on&ss=on&mf=on&i=${/Jerusalem|Tel_Aviv/.test(tz || '') ? 'on' : 'off'}&start=${ymd(d)}&end=${ymd(end)}`, 6 * 3600000).catch(() => null),
    ]);
    return { shabbat, holidays: hol };
  });
  pageHandle('todos:list', () => extras.get('todos').filter((t) => !t.deleted));
  pageHandle('todos:save', (_e, list) => {
    const clean = (Array.isArray(list) ? list : []).slice(0, 200).map((t) => ({ id: String(t.id || crypto.randomUUID()), text: String(t.text || '').slice(0, 300), done: !!t.done, updated: +t.updated || now() }));
    const old = extras.get('todos');
    for (const o of old) if (!clean.some((c) => c.id === o.id)) tomb('todo', o.id);
    extras.set('todos', clean); changed('todos');
    return clean;
  });

  // ------------------------------------------------------------ currency rates for the omnibox converter
  uiHandle('rates:get', async (_e, base) => {
    base = String(base || 'USD').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    const r = await getJSON(`https://api.frankfurter.app/latest?from=${base}`, 6 * 3600000);
    return { base: r.base, date: r.date, rates: { ...r.rates, [r.base]: 1 } };
  });

  // ------------------------------------------------------------ reading list
  const rl = () => extras.get('readingList');
  const rlPublic = () => rl().filter((x) => !x.deleted).sort((a, b) => b.added - a.added);
  const rlAdd = ({ url, title, favicon }) => {
    if (!/^https?:/.test(url || '')) throw new Error('Only web pages can be saved.');
    const items = rl(); let it = items.find((x) => x.url === url);
    if (it) { it.deleted = false; it.read = false; it.updated = now(); }
    else items.push({ id: crypto.randomUUID(), url, title: String(title || url).slice(0, 300), favicon: favicon || '', added: now(), updated: now(), read: false });
    extras.set('readingList', items); changed('reading');
    return rlPublic();
  };
  const rlRemove = (id) => { const items = rl().filter((x) => x.id !== id); tomb('reading', id); extras.set('readingList', items); changed('reading'); return rlPublic(); };
  const rlRead = (id, read) => { const it = rl().find((x) => x.id === id); if (it) { it.read = !!read; it.updated = now(); extras.save(); changed('reading'); } return rlPublic(); };
  uiHandle('reading:list', () => rlPublic());
  uiHandle('reading:add', (_e, p) => rlAdd(p));
  uiHandle('reading:remove', (_e, id) => rlRemove(id));
  uiHandle('reading:read', (_e, { id, read }) => rlRead(id, read));
  uiHandle('reading:has', (_e, url) => rl().some((x) => x.url === url && !x.deleted));
  uiHandle('reading:toggle', (_e, p) => { const it = rl().find((x) => x.url === p.url && !x.deleted); if (it) { rlRemove(it.id); return false; } rlAdd(p); return true; });
  pageHandle('reading:list', () => rlPublic());
  pageHandle('reading:remove', (_e, id) => rlRemove(id));
  pageHandle('reading:read', (_e, { id, read }) => rlRead(id, read));

  // ------------------------------------------------------------ per-site notes
  const noteKey = (url) => { try { const u = new URL(url); return /^https?:/.test(u.protocol) ? siteOf(u.hostname) || u.hostname : ''; } catch { return ''; } };
  uiHandle('notes:get', (_e, url) => { const k = noteKey(url); return k ? { site: k, ...(extras.get('notes')[k] || { text: '' }) } : null; });
  uiHandle('notes:set', (_e, { url, text }) => {
    const k = noteKey(url); if (!k) return false;
    const notes = extras.get('notes');
    text = String(text || '').slice(0, 20000);
    if (!text.trim()) { delete notes[k]; tomb('note', k); } else notes[k] = { text, updated: now() };
    extras.set('notes', notes); changed('notes');
    return true;
  });
  uiHandle('notes:all', () => Object.entries(extras.get('notes')).map(([site, n]) => ({ site, ...n })).sort((a, b) => b.updated - a.updated));
  pageHandle('notes:all', () => Object.entries(extras.get('notes')).map(([site, n]) => ({ site, ...n })).sort((a, b) => b.updated - a.updated));

  // ------------------------------------------------------------ sessions
  const sesPublic = () => extras.get('sessions').filter((s) => !s.deleted).map((s) => ({ id: s.id, name: s.name, created: s.created, count: s.tabs.length, tabs: s.tabs.slice(0, 50).map((t) => ({ url: t.url, title: t.title })) })).sort((a, b) => b.created - a.created);
  uiHandle('sessions:save', (_e, { name, tabs, groups }) => {
    const clean = (tabs || []).filter((t) => /^(https?|noam):/.test(t.url || '')).slice(0, 200).map((t) => ({ url: t.url, title: String(t.title || '').slice(0, 300), group: t.group || undefined }));
    if (!clean.length) throw new Error('There are no tabs to save.');
    const s = { id: crypto.randomUUID(), name: String(name || '').trim().slice(0, 60) || new Date().toLocaleString(), created: now(), updated: now(), tabs: clean, groups: (groups || []).slice(0, 40) };
    const list = extras.get('sessions'); list.push(s); extras.set('sessions', list); changed('sessions');
    return sesPublic();
  });
  uiHandle('sessions:list', () => sesPublic());
  uiHandle('sessions:get', (_e, id) => extras.get('sessions').find((s) => s.id === id) || null);
  uiHandle('sessions:delete', (_e, id) => { extras.set('sessions', extras.get('sessions').filter((s) => s.id !== id)); tomb('session', id); changed('sessions'); return sesPublic(); });
  pageHandle('sessions:list', () => sesPublic());
  pageHandle('sessions:delete', (_e, id) => { extras.set('sessions', extras.get('sessions').filter((s) => s.id !== id)); tomb('session', id); changed('sessions'); return sesPublic(); });
  pageHandle('sessions:open', (e, id) => { const host = e.sender.hostWebContents; if (host) host.send('session:open', id); return true; });

  // ------------------------------------------------------------ screenshots
  const shots = new Map();
  uiHandle('screenshot:capture', async (_e, { wcId, mode, rect }) => {
    const wc = webContents.fromId(wcId); if (!wc) throw new Error('Tab is gone.');
    let img;
    if (mode === 'full') {
      // Scroll through the page and stitch the pieces together in the editor. (Tabs are <webview>
      // guests, and Chromium's "capture beyond viewport" just repeats the visible area there.)
      const info = await wc.executeJavaScript(`(() => { const se = document.scrollingElement || document.documentElement; return { x: scrollX, y: scrollY, w: innerWidth, cw: document.documentElement.clientWidth || innerWidth, h: innerHeight, H: Math.max(se.scrollHeight, document.body ? document.body.scrollHeight : 0) }; })()`);
      const H = Math.min(info.H, 20000);
      const tiles = [];
      const HIDE = `(() => { window.__noamHidden = []; for (const el of document.querySelectorAll('body *')) { const p = getComputedStyle(el).position; if (p === 'fixed' || p === 'sticky') { window.__noamHidden.push([el, el.style.visibility]); el.style.setProperty('visibility', 'hidden', 'important'); } } })()`;
      const SHOW = `(() => { for (const [el, v] of window.__noamHidden || []) el.style.visibility = v; window.__noamHidden = null; })()`;
      try {
        for (let y = 0, i = 0; y < H && i < 40; i++) {
          const actual = await wc.executeJavaScript(`(window.scrollTo({ top: ${y}, behavior: 'instant' }), new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(scrollY)))))`);
          await new Promise((r) => setTimeout(r, 120));
          const im = await wc.capturePage();
          tiles.push({ y: actual, png: im.toPNG(), w: im.getSize().width, h: im.getSize().height });
          if (i === 0) await wc.executeJavaScript(HIDE).catch(() => {});
          if (actual + info.h >= H - 1) break;
          y = actual + info.h;
        }
      } finally {
        await wc.executeJavaScript(SHOW).catch(() => {});
        await wc.executeJavaScript(`scrollTo({ left: ${info.x}, top: ${info.y}, behavior: 'instant' })`).catch(() => {});
      }
      if (!tiles.length) throw new Error('Couldn’t capture this page.');
      const scale = tiles[0].w / info.w;
      const id = crypto.randomBytes(8).toString('hex');
      shots.set(id, { tiles: tiles.map((t) => ({ y: Math.round(t.y * scale), png: t.png })), width: Math.round(info.cw * scale), height: Math.round(Math.min(H, tiles[tiles.length - 1].y + info.h) * scale), title: wc.getTitle(), url: wc.getURL(), t: now() });
      if (shots.size > 12) shots.delete(shots.keys().next().value);
      return 'noam://screenshot/?id=' + id;
    } else if (mode === 'area' && rect) {
      const r = { x: Math.max(0, Math.round(rect.x)), y: Math.max(0, Math.round(rect.y)), width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) };
      img = await wc.capturePage(r);
    } else img = await wc.capturePage();
    if (!img || img.isEmpty()) throw new Error('Couldn’t capture this page.');
    const id = crypto.randomBytes(8).toString('hex');
    shots.set(id, { png: img.toPNG(), title: wc.getTitle(), url: wc.getURL(), t: now() });
    if (shots.size > 12) shots.delete(shots.keys().next().value);
    return 'noam://screenshot/?id=' + id;
  });
  const b64 = (png) => 'data:image/png;base64,' + png.toString('base64');
  pageHandle('screenshot:get', (_e, id) => {
    const s = shots.get(id); if (!s) return null;
    if (s.tiles) return { tiles: s.tiles.map((t) => ({ y: t.y, dataUrl: b64(t.png) })), width: s.width, height: s.height, title: s.title, url: s.url };
    return { dataUrl: b64(s.png), title: s.title, url: s.url };
  });
  const decodePng = (dataUrl) => { const m = /^data:image\/png;base64,(.+)$/.exec(String(dataUrl || '')); if (!m) throw new Error('bad image'); return Buffer.from(m[1], 'base64'); };
  pageHandle('screenshot:copy', async (_e, dataUrl) => { await require('./clip').writeImagePng(decodePng(dataUrl)); return true; });
  pageHandle('screenshot:save', async (e, { dataUrl, title }) => {
    const win = BrowserWindow.fromWebContents(e.sender.hostWebContents || e.sender);
    const name = `${(title || 'Screenshot').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 60)} ${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
    const dir = app.getPath('pictures') || app.getPath('downloads');
    const r = await dialog.showSaveDialog(win, { defaultPath: path.join(dir, name), filters: [{ name: 'PNG image', extensions: ['png'] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, decodePng(dataUrl));
    return r.filePath;
  });

  // ------------------------------------------------------------ breach alerts (k-anonymity: only 5 hex chars of a SHA-1 ever leave the computer)
  async function pwnedCount(password) {
    const sha = crypto.createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
    const prefix = sha.slice(0, 5), suffix = sha.slice(5);
    const body = await getJSON(`https://api.pwnedpasswords.com/range/${prefix}`, 3600000, { text: true, headers: { 'Add-Padding': 'true' } });
    for (const line of String(body).split(/\r?\n/)) { const [s, c] = line.split(':'); if (s === suffix) return +c || 0; }
    return 0;
  }
  function strength(p) {
    let s = 0; if (p.length >= 8) s++; if (p.length >= 12) s++; if (p.length >= 16) s++;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^\w]/.test(p)) s++;
    if (/^(.)\1+$/.test(p) || /^(?:123456|password|qwerty|abc123|111111|letmein|iloveyou)/i.test(p)) s = 0;
    return s <= 2 ? 'weak' : s <= 4 ? 'ok' : 'strong';
  }
  ctx.passwordsCheck = async (vault) => {
    const items = vault.items;
    const byPw = new Map(); for (const i of items) byPw.set(i.password, (byPw.get(i.password) || 0) + 1);
    const out = []; let failed = false;
    for (const i of items) {
      let pwned = null;
      if (!failed) { try { pwned = await pwnedCount(i.password); } catch { failed = true; } }
      out.push({ id: i.id, origin: i.origin, username: i.username, pwned, reused: byPw.get(i.password) > 1, strength: strength(i.password) });
    }
    return { results: out, offline: failed, checked: now() };
  };
  ctx.passwordStrength = strength;

  // ------------------------------------------------------------ cloud folders for sync
  pageHandle('sync:cloud-folders', () => {
    const home = os.homedir(); const found = [];
    const add = (label, p) => { try { if (p && fs.existsSync(p) && fs.statSync(p).isDirectory() && !found.some((f) => f.path === p)) found.push({ label, path: p }); } catch {} };
    try { for (const d of fs.readdirSync(home)) { if (/^OneDrive/i.test(d)) add(d.replace(/^OneDrive\s*-\s*/i, 'OneDrive – ') || 'OneDrive', path.join(home, d)); if (/^Dropbox/i.test(d)) add('Dropbox', path.join(home, d)); if (/^(Google Drive|GoogleDrive|My Drive)$/i.test(d)) add('Google Drive', path.join(home, d)); if (d === 'iCloudDrive') add('iCloud Drive', path.join(home, d)); } } catch {}
    add('OneDrive', process.env.OneDrive); add('OneDrive', process.env.OneDriveConsumer); add('OneDrive (work)', process.env.OneDriveCommercial);
    if (process.platform === 'win32') for (const L of 'DEFGHIJKLMNOPQRSTUVWXYZ') add('Google Drive', `${L}:\\My Drive`);
    if (process.platform === 'darwin') {
      add('iCloud Drive', path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'));
      const cs = path.join(home, 'Library', 'CloudStorage');
      try { for (const d of fs.readdirSync(cs)) { const p = path.join(cs, d); if (/^GoogleDrive/i.test(d)) { add('Google Drive', fs.existsSync(path.join(p, 'My Drive')) ? path.join(p, 'My Drive') : p); } else if (/^OneDrive/i.test(d)) add('OneDrive', p); else if (/^Dropbox/i.test(d)) add('Dropbox', p); } } catch {}
    }
    return found;
  });

  // ------------------------------------------------------------ sync hooks
  return {
    extras,
    snapshot: () => ({ readingList: extras.get('readingList'), sessions: extras.get('sessions'), notes: extras.get('notes'), todos: extras.get('todos'), tombstones: extras.get('tombstones') }),
    merge(remote) {
      if (!remote) return false;
      let any = false;
      const dead = new Map(extras.get('tombstones').map((t) => [t.kind + ':' + t.id, t.t]));
      for (const t of remote.tombstones || []) { const k = t.kind + ':' + t.id; if ((dead.get(k) || 0) < t.t) { dead.set(k, t.t); any = true; } }
      const mergeList = (key, kind) => {
        const mine = new Map(extras.get(key).map((x) => [x.id, x]));
        for (const r of remote[key] || []) { const l = mine.get(r.id); if (!l || (r.updated || 0) > (l.updated || 0)) { mine.set(r.id, { ...r }); any = true; } }
        const list = [...mine.values()].filter((x) => !((dead.get(kind + ':' + x.id) || 0) >= (x.updated || x.added || x.created || 0)));
        if (list.length !== extras.get(key).length) any = true;
        extras.set(key, list);
      };
      mergeList('readingList', 'reading'); mergeList('sessions', 'session'); mergeList('todos', 'todo');
      const notes = { ...extras.get('notes') };
      for (const [k, n] of Object.entries(remote.notes || {})) if (!notes[k] || (n.updated || 0) > (notes[k].updated || 0)) { notes[k] = n; any = true; }
      for (const k of Object.keys(notes)) if ((dead.get('note:' + k) || 0) >= (notes[k].updated || 0)) { delete notes[k]; any = true; }
      extras.set('notes', notes);
      extras.set('tombstones', [...dead].map(([k, t]) => { const i = k.indexOf(':'); return { kind: k.slice(0, i), id: k.slice(i + 1), t }; }).slice(-3000));
      if (any) { broadcast('extras:changed', 'all'); broadcastPages('extras', 'all'); }
      return any;
    },
  };
};
