// Speed & battery: measures how much processor and memory each tab uses, notices tabs that are
// slowing the computer down, keeps sleeping tabs' history, and tells the window when the laptop
// switches to battery. The decisions (which tab sleeps when) are made in the window (ui/ui7.js).
const { app, webContents, powerMonitor } = require('electron');

const DEFAULTS = { sleep: true, sleepAfter: 30, keepAwake: [], heavyAlerts: true, autoSleepHeavy: false, energySaver: 'battery', speedMode: false, prefetch: true, lazyRestore: true, noAutoplay: false };

module.exports = function setupPerf({ settings, uiHandle, pageHandle, broadcast, broadcastPages }) {
  const cfg = () => ({ ...DEFAULTS, ...(settings.get('perf') || {}) });
  let last = { tabs: {}, at: 0 };
  const strikes = new Map(); // wcId -> consecutive heavy samples
  const warned = new Set();
  let sleeping = [], saved = 0; // reported by the window
  const cores = require('os').cpus().length || 4;

  function sample() {
    const byPid = new Map(app.getAppMetrics().map((m) => [m.pid, m]));
    const tabs = {}; let totalMem = 0, totalCpu = 0;
    for (const m of byPid.values()) { totalMem += (m.memory.workingSetSize || 0) / 1024; totalCpu += m.cpu.percentCPUUsage || 0; }
    // several tabs of the same site can share one process: split its numbers between them
    const groups = new Map();
    for (const wc of webContents.getAllWebContents()) {
      if (wc.isDestroyed() || wc.getType() !== 'webview') continue;
      const pid = wc.getOSProcessId(); if (!groups.has(pid)) groups.set(pid, []); groups.get(pid).push(wc);
    }
    for (const [pid, list] of groups) {
      const m = byPid.get(pid); if (!m) continue;
      for (const wc of list) tabs[wc.id] = { cpu: (m.cpu.percentCPUUsage || 0) / list.length, memMB: Math.round((m.memory.workingSetSize || 0) / 1024 / list.length), url: wc.getURL(), title: wc.getTitle(), audible: wc.isCurrentlyAudible(), shared: list.length };
    }
    last = { tabs, at: Date.now(), totalMemMB: Math.round(totalMem), totalCpu, cores, onBattery: powerMonitor.isOnBatteryPower() };
    return last;
  }
  setInterval(() => {
    const s = sample(); const c = cfg();
    // a tab that keeps the processor busy (in the background, not playing sound) for ~15 s is "heavy"
    for (const [id, t] of Object.entries(s.tabs)) {
      const heavy = (t.cpu > 30 && !t.audible) || t.memMB > 1800;
      const n = heavy ? (strikes.get(id) || 0) + 1 : 0; strikes.set(id, n);
      if (n === 3 && !warned.has(id) && (c.heavyAlerts || c.autoSleepHeavy)) { warned.add(id); broadcast('perf:heavy', { wcId: +id, cpu: Math.round(t.cpu), memMB: t.memMB, title: t.title, url: t.url }); }
    }
    for (const id of strikes.keys()) if (!s.tabs[id]) { strikes.delete(id); warned.delete(id); }
    broadcastPages('perf', 'tick');
  }, 5000);

  powerMonitor.on('on-battery', () => broadcast('perf:power', { onBattery: true }));
  powerMonitor.on('on-ac', () => broadcast('perf:power', { onBattery: false }));

  uiHandle('perf:metrics', () => last.at ? last : sample());
  uiHandle('perf:power', () => powerMonitor.isOnBatteryPower());
  // back/forward history survives a tab going to sleep
  uiHandle('perf:history', (_e, wcId) => {
    const wc = webContents.fromId(wcId); if (!wc || wc.isDestroyed()) return null;
    const h = wc.navigationHistory;
    try { if (h && h.getAllEntries) return { entries: h.getAllEntries().slice(-50).map((e) => ({ url: e.url, title: e.title, pageState: e.pageState })), index: Math.min(49, h.getActiveIndex() - Math.max(0, h.getAllEntries().length - 50)) }; } catch {}
    return { entries: [{ url: wc.getURL(), title: wc.getTitle() }], index: 0 };
  });
  uiHandle('perf:restore', async (_e, { wcId, entries, index }) => {
    const wc = webContents.fromId(wcId); if (!wc || wc.isDestroyed()) throw new Error('gone');
    const h = wc.navigationHistory;
    if (h && h.restore) { try { await h.restore({ entries, index: Math.max(0, Math.min(index, entries.length - 1)) }); return true; } catch {} }
    await wc.loadURL(entries[Math.max(0, Math.min(index, entries.length - 1))].url);
    return true;
  });
  uiHandle('perf:report', (_e, r) => { sleeping = (r.sleeping || []).slice(0, 300); saved = r.savedMB || 0; return true; });

  // the Performance page
  pageHandle('perf:state', () => ({ ...(last.at ? last : sample()), cfg: cfg(), sleeping, savedMB: saved }));
  pageHandle('perf:action', (_e, a) => { broadcast('perf:action', a); return true; });
  return { sample, cfg };
};
module.exports.DEFAULTS = DEFAULTS;
