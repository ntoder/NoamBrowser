// Screen time: how long you spend on each site, measured on this computer only.
// Counts the tab you're looking at while the window is focused and you're active
// (or while it's playing sound, so watching a video counts). Private tabs are never counted.
const { BrowserWindow, webContents, powerMonitor, Notification, session } = require('electron');
const path = require('path');
const { Store } = require('./store');

const NAMES = {
  'youtube.com': 'YouTube', 'm.youtube.com': 'YouTube', 'music.youtube.com': 'YouTube Music', 'facebook.com': 'Facebook', 'm.facebook.com': 'Facebook',
  'instagram.com': 'Instagram', 'web.whatsapp.com': 'WhatsApp', 'x.com': 'X (Twitter)', 'twitter.com': 'X (Twitter)', 'tiktok.com': 'TikTok', 'reddit.com': 'Reddit',
  'mail.google.com': 'Gmail', 'drive.google.com': 'Google Drive', 'calendar.google.com': 'Google Calendar', 'google.com': 'Google Search', 'google.co.il': 'Google Search',
  'chatgpt.com': 'ChatGPT', 'claude.ai': 'Claude', 'github.com': 'GitHub', 'netflix.com': 'Netflix', 'linkedin.com': 'LinkedIn', 'wikipedia.org': 'Wikipedia',
  'en.wikipedia.org': 'Wikipedia', 'he.wikipedia.org': 'Wikipedia', 'outlook.live.com': 'Outlook', 'outlook.office.com': 'Outlook', 'canva.com': 'Canva', 'ynet.co.il': 'Ynet',
};

function keyOf(url) {
  let u; try { u = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^www\./, '');
  if (host === 'docs.google.com') {
    const app = u.pathname.split('/')[1];
    return { spreadsheets: 'Google Sheets', document: 'Google Docs', presentation: 'Google Slides', forms: 'Google Forms' }[app] || 'Google Docs';
  }
  return NAMES[host] || host;
}
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtDur = (sec) => { const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };

module.exports = function setupScreenTime({ settings, userData, uiHandle, pageHandle, windows, privatePartition }) {
  const store = new Store(userData, 'screentime', { days: {}, icons: {}, hosts: {} });
  const cfg = () => ({ enabled: true, idleMinutes: 2, limits: {}, ...(settings.get('screenTime') || {}) });
  const activeByWin = new Map(); // window webContents id -> { wcId, favicon }
  const warned = new Set();
  let last = Date.now();

  function prune() {
    const keep = new Set(Array.from({ length: 120 }, (_, i) => dayKey(new Date(Date.now() - i * 86400000))));
    const days = store.get('days'); for (const k of Object.keys(days)) if (!keep.has(k)) delete days[k];
  }
  prune();

  function countable(wc) {
    if (!wc || wc.isDestroyed()) return null;
    if (wc.session === session.fromPartition(privatePartition)) return null;
    return keyOf(wc.getURL());
  }

  const tickListeners = [], activeListeners = [];
  function tick() {
    const now = Date.now(); const dt = Math.min(15, (now - last) / 1000); last = now;
    if (dt <= 0) return;
    const idle = powerMonitor.getSystemIdleTime() >= (cfg().idleMinutes || 2) * 60;
    const focused = BrowserWindow.getFocusedWindow();
    const counted = new Set(); const seen = [];
    for (const w of windows) {
      if (w.isDestroyed()) continue;
      const a = activeByWin.get(w.webContents.id); if (!a || !a.wcId) continue;
      const wc = webContents.fromId(a.wcId); const key = countable(wc); if (!key || counted.has(key)) continue;
      const audible = wc.isCurrentlyAudible();
      const looking = w === focused && !w.isMinimized() && !idle;
      if (!looking && !audible) continue;
      counted.add(key); seen.push({ key, wcId: a.wcId, url: wc.getURL(), looking, audible });
      if (!cfg().enabled) continue;
      const day = dayKey(); const days = store.get('days');
      days[day] = days[day] || {};
      days[day][key] = (days[day][key] || 0) + dt;
      if (a.favicon) store.get('icons')[key] = a.favicon;
      try { store.get('hosts')[key] = new URL(wc.getURL()).origin; } catch {}
      store.save();
      checkLimit(key, days[day][key]);
    }
    for (const fn of tickListeners) try { fn(seen, dt, idle, !!focused); } catch (e) { console.error(e); }
  }
  function checkLimit(key, sec) {
    const lim = +cfg().limits[key]; if (!lim) return;
    const id = dayKey() + key;
    if (sec >= lim * 60 && !warned.has(id)) {
      warned.add(id);
      const msg = `You’ve spent ${fmtDur(sec)} on ${key} today — your limit is ${fmtDur(lim * 60)}.`;
      if (Notification.isSupported()) new Notification({ title: 'Time limit reached', body: msg, icon: path.join(__dirname, 'assets', 'icon.png') }).show();
      for (const w of windows) if (!w.isDestroyed()) w.webContents.send('screentime:limit', { key, msg });
    }
  }
  setInterval(tick, 5000);
  if (process.env.NOAM_TEST) require('electron').app.on('noam-test-seed-screentime', (days) => { const cur = store.get('days'); for (const [d, m] of Object.entries(days)) cur[d] = { ...m, ...(cur[d] || {}) }; store.save(); });

  uiHandle('screentime:active', (e, { wcId, favicon }) => {
    const prev = activeByWin.get(e.sender.id);
    activeByWin.set(e.sender.id, { wcId, favicon });
    if (!prev || prev.wcId !== wcId) for (const fn of activeListeners) try { fn(wcId, prev && prev.wcId); } catch {}
    return true;
  });

  function report(range) {
    const days = store.get('days');
    const n = range === 'today' || range === 'yesterday' ? 1 : range === '30' ? 30 : 7;
    const start = range === 'yesterday' ? 1 : 0;
    const list = Array.from({ length: n }, (_, i) => dayKey(new Date(Date.now() - (start + i) * 86400000))).reverse();
    const prevList = Array.from({ length: n }, (_, i) => dayKey(new Date(Date.now() - (start + n + i) * 86400000)));
    const sites = {}; let total = 0; let prevTotal = 0;
    const perDay = list.map((d) => { let t = 0; for (const [k, v] of Object.entries(days[d] || {})) { sites[k] = (sites[k] || 0) + v; t += v; } total += t; return { day: d, total: t }; });
    for (const d of prevList) for (const v of Object.values(days[d] || {})) prevTotal += v;
    const icons = store.get('icons'), hosts = store.get('hosts'), limits = cfg().limits;
    const todayMap = days[dayKey()] || {};
    return {
      range, total, prevTotal, perDay, daysWithData: perDay.filter((d) => d.total > 0).length,
      sites: Object.entries(sites).sort((a, b) => b[1] - a[1]).map(([key, sec]) => ({ key, sec, icon: icons[key] || '', url: hosts[key] || '', limit: limits[key] || 0, today: todayMap[key] || 0 })),
      enabled: cfg().enabled,
    };
  }
  pageHandle('screentime:get', (_e, range) => report(String(range || 'today')));
  pageHandle('screentime:set-limit', (_e, { key, minutes }) => {
    const limits = { ...cfg().limits }; if (+minutes > 0) limits[key] = +minutes; else delete limits[key];
    settings.set('screenTime', { ...cfg(), limits }); warned.clear(); return report('today');
  });
  pageHandle('screentime:clear', (_e, key) => {
    const days = store.get('days');
    if (key) for (const d of Object.values(days)) delete d[key]; else store.set('days', {});
    store.save(); return true;
  });
  pageHandle('screentime:csv', () => {
    const rows = [['date', 'site', 'minutes']];
    for (const [d, m] of Object.entries(store.get('days')).sort()) for (const [k, v] of Object.entries(m)) rows.push([d, k, Math.round(v / 6) / 10]);
    return rows.map((r) => r.map((x) => /[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : x).join(',')).join('\n');
  });
  return { tick, report, keyOf, store, onTick: (fn) => tickListeners.push(fn), onActive: (fn) => activeListeners.push(fn) };
};
module.exports.keyOf = keyOf;
