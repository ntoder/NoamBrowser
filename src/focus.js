// Focus mode: a Pomodoro timer with self-discipline tools.
// - Track, Gentle (a "are you sure?" pause) or Strict blocking of distracting sites
// - Holds website notifications and can silence other tabs while you focus
// - Logs every distraction (visits, time, tab switches, time away) and gives each session a score
// - Streaks, daily goals, badges and trends so you can see yourself improving
const { BrowserWindow, webContents, Notification, powerMonitor, session } = require('electron');
const path = require('path');
const crypto = require('crypto');
const { Store } = require('./store');

const DEFAULT_SITES = ['YouTube', 'YouTube Music', 'Facebook', 'Instagram', 'TikTok', 'X (Twitter)', 'Reddit', 'WhatsApp', 'Netflix', 'twitch.tv', 'discord.com', 'roblox.com', 'pinterest.com', 'web.telegram.org', 'messenger.com', '9gag.com', 'ynet.co.il', 'web.snapchat.com', 'primevideo.com', 'disneyplus.com'];
const DEFAULTS = {
  work: 25, short: 5, long: 15, longEvery: 4, autoBreak: true, autoNext: false,
  mode: 'gentle', sites: DEFAULT_SITES, allowOnly: false, allow: ['Google Docs', 'Google Sheets', 'Google Slides', 'classroom.google.com', 'wikipedia.org', 'Wikipedia'],
  holdNotifications: true, muteOthers: true, sound: true, dailyGoal: 4, awayPause: false,
};
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

module.exports = function setupFocus({ settings, userData, uiHandle, pageHandle, windows, broadcast, broadcastPages, shields, screenTime, keyOf, privatePartition }) {
  const store = new Store(userData, 'focus', { sessions: [], current: null, stats: { resisted: 0 } });
  const cfg = () => ({ ...DEFAULTS, ...(settings.get('focus') || {}) });
  let st = { phase: 'idle' }; // idle | focus | break   (+ paused flag)
  let log = null; // the running focus session's log
  let cycle = 0; // focus sessions finished in a row (for long breaks)
  const allowedNow = new Map(); // site -> allowed until (ms); Infinity = rest of the session
  const passThrough = new Set(); // the next visit is the one the reminder page just let through — don't count it twice
  const isAllowed = (key) => (allowedNow.get(key) || 0) > Date.now();
  const muted = new Set();

  const now = () => Date.now();
  const isDistraction = (url) => {
    if (!/^https?:/i.test(url || '')) return null;
    const key = keyOf(url); if (!key) return null;
    const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
    const match = (list) => list.some((s) => s && (s === key || host === s || host.endsWith('.' + s)));
    const c = cfg();
    if (c.allowOnly) return match(c.allow) ? null : key;
    return match(c.sites) ? key : null;
  };
  const left = () => st.phase === 'idle' ? 0 : st.paused ? st.remaining : Math.max(0, st.endsAt - now());
  const publicState = () => ({
    phase: st.phase, paused: !!st.paused, left: left(), total: st.total || 0, task: st.task || '', promise: st.promise || '', mode: st.mode || cfg().mode,
    sound: cfg().sound, cycle, longEvery: cfg().longEvery, breakKind: st.breakKind || '', distractions: log ? Object.values(log.distractions).reduce((a, d) => a + d.visits, 0) : 0,
    distractSec: log ? Object.values(log.distractions).reduce((a, d) => a + d.sec, 0) : 0, today: todayDone(), goal: cfg().dailyGoal, sessionId: log ? log.id : null,
  });
  const send = () => { const s = publicState(); broadcast('focus:state', s); broadcastPages('focus', s); };
  const todayDone = () => store.get('sessions').filter((x) => x.completed && dayKey(new Date(x.start)) === dayKey()).length;
  const notify = (title, body) => { try { if (Notification.isSupported()) new Notification({ title, body, silent: !cfg().sound, icon: path.join(__dirname, 'assets', 'icon.png') }).show(); } catch {} };
  const saveCurrent = () => store.set('current', st.phase === 'idle' ? null : { st, log: log && { ...log }, cycle, allowed: [...allowedNow].map(([k, v]) => [k, v === Infinity ? null : v]) });

  // --------------------------------------------------------------- blocking
  const blockUrl = (url, key) => `noam://focusblock/?site=${encodeURIComponent(key)}&url=${encodeURIComponent(url)}`;
  shields.navGuard = (d) => {
    if (st.phase !== 'focus' || st.paused || d.resourceType !== 'mainFrame') return null;
    const wc = webContents.fromId(d.webContentsId); if (!wc || wc.isDestroyed()) return null;
    const key = isDistraction(d.url); if (!key) return null;
    const dd = (log.distractions[key] = log.distractions[key] || { visits: 0, sec: 0, blocked: 0, overrides: 0 });
    if (passThrough.has(key)) passThrough.delete(key); else dd.visits++;
    saveCurrent();
    const mode = st.mode;
    if (mode === 'track' || isAllowed(key)) { send(); return null; }
    dd.blocked++; send();
    setImmediate(() => { if (!wc.isDestroyed()) wc.loadURL(blockUrl(d.url, key)).catch(() => {}); });
    return { cancel: true };
  };
  function sweepTabs() { // tabs already open on a distracting site when a session starts
    if (st.mode === 'track') return;
    for (const wc of webContents.getAllWebContents()) {
      if (wc.isDestroyed() || wc.getType() !== 'webview') continue;
      const url = wc.getURL(); const key = isDistraction(url);
      if (key && !isAllowed(key)) wc.loadURL(blockUrl(url, key)).catch(() => {});
    }
  }
  function muteOthers(on) {
    if (on) {
      if (!cfg().muteOthers) return;
      for (const wc of webContents.getAllWebContents()) {
        if (wc.isDestroyed() || wc.getType() !== 'webview' || wc.isAudioMuted()) continue;
        if (wc.isCurrentlyAudible() && isDistraction(wc.getURL())) { wc.setAudioMuted(true); muted.add(wc.id); }
      }
    } else { for (const id of muted) { const wc = webContents.fromId(id); if (wc && !wc.isDestroyed()) wc.setAudioMuted(false); } muted.clear(); }
  }

  // --------------------------------------------------------------- tracking
  screenTime.onTick((seen, dt, idle, windowFocused) => {
    if (st.phase !== 'focus' || st.paused || !log) return;
    for (const s of seen) { const key = isDistraction(s.url); if (key) { const dd = (log.distractions[key] = log.distractions[key] || { visits: 1, sec: 0, blocked: 0, overrides: 0 }); dd.sec += dt; } }
    if (idle || !windowFocused) log.awaySec += dt;
  });
  screenTime.onActive(() => { if (st.phase === 'focus' && !st.paused && log) log.tabSwitches++; });

  // --------------------------------------------------------------- scoring
  function score(l) {
    const parts = [];
    const visits = Object.values(l.distractions).reduce((a, d) => a + d.visits, 0);
    const sec = Object.values(l.distractions).reduce((a, d) => a + d.sec, 0);
    const overrides = Object.values(l.distractions).reduce((a, d) => a + d.overrides, 0);
    let s = 100;
    if (visits) { const p = Math.min(40, visits * 6); s -= p; parts.push([`Tried to open distracting sites ${visits}×`, -p]); }
    if (sec >= 30) { const p = Math.min(30, Math.round(sec / 30)); s -= p; parts.push([`${Math.round(sec / 60) || '<1'} min on distracting sites`, -p]); }
    if (overrides) { const p = Math.min(20, overrides * 10); s -= p; parts.push([`Broke through the block ${overrides}×`, -p]); }
    const extraSwitches = Math.max(0, l.tabSwitches - Math.round(l.planned / 60000 / 2.5));
    if (extraSwitches > 0) { const p = Math.min(15, Math.round(extraSwitches / 2)); if (p) { s -= p; parts.push([`Jumped between tabs a lot (${l.tabSwitches}×)`, -p]); } }
    if (l.pauses) { const p = Math.min(10, l.pauses * 3); s -= p; parts.push([`Paused ${l.pauses}×`, -p]); }
    if (!l.completed) { const done = Math.min(1, l.focusMs / l.planned); const p = Math.round((1 - done) * 30); if (p) { s -= p; parts.push(['Stopped early', -p]); } }
    if (!visits && l.completed) parts.push(['Not a single distraction 🧘', 0]);
    return { score: Math.max(0, Math.min(100, Math.round(s))), parts };
  }

  // --------------------------------------------------------------- state machine
  function startFocus({ minutes, task, promise, mode } = {}) {
    const c = cfg(); const ms = Math.max(1, Math.min(240, +minutes || c.work)) * 60000;
    allowedNow.clear();
    st = { phase: 'focus', endsAt: now() + ms, total: ms, task: String(task || '').slice(0, 120), promise: String(promise || '').slice(0, 200), mode: ['track', 'gentle', 'strict'].includes(mode) ? mode : c.mode };
    log = { id: crypto.randomUUID(), start: now(), planned: ms, task: st.task, promise: st.promise, mode: st.mode, distractions: {}, tabSwitches: 0, awaySec: 0, pauses: 0, focusMs: 0, lastResume: now() };
    sweepTabs(); muteOthers(true); saveCurrent(); send();
    return publicState();
  }
  function finishFocus(completed, reason) {
    if (!log) return null;
    if (!st.paused) log.focusMs += now() - log.lastResume;
    log.completed = completed; log.end = now(); log.reason = reason || '';
    if (completed) log.focusMs = Math.max(log.focusMs, log.planned - 1000);
    const sc = score(log); log.score = sc.score; log.scoreParts = sc.parts;
    const { lastResume, ...rec } = log;
    const sessions = store.get('sessions'); sessions.push(rec); if (sessions.length > 3000) sessions.splice(0, sessions.length - 3000);
    store.save();
    const summary = { ...rec, today: todayDone(), goal: cfg().dailyGoal, streak: streak(), newBadges: newBadges(rec) };
    log = null; muteOthers(false); allowedNow.clear();
    broadcast('focus:done', summary); broadcastPages('focus-done', summary);
    return summary;
  }
  function startBreak() {
    const c = cfg(); cycle++;
    const long = cycle % c.longEvery === 0;
    const ms = (long ? c.long : c.short) * 60000;
    st = { phase: 'break', endsAt: now() + ms, total: ms, breakKind: long ? 'long' : 'short', task: st.task };
    saveCurrent(); send();
  }
  function stopAll() { st = { phase: 'idle' }; saveCurrent(); send(); }

  setInterval(() => {
    if (st.phase === 'idle' || st.paused) return;
    if (st.phase === 'focus' && cfg().awayPause && powerMonitor.getSystemIdleTime() > 180) { pause(); notify('Focus paused', 'You stepped away, so your focus timer is paused. Welcome back!'); return; }
    if (now() < st.endsAt) { if (Math.floor(left() / 1000) % 5 === 0) send(); return; }
    if (st.phase === 'focus') {
      finishFocus(true);
      const c = cfg();
      notify('🍅 Focus session done!', c.autoBreak ? `Great work. Take a ${cycle + 1 >= 1 && (cycle + 1) % c.longEvery === 0 ? c.long : c.short}-minute break.` : 'Great work! Start a break when you’re ready.');
      if (c.autoBreak) startBreak(); else { cycle++; stopAll(); }
    } else if (st.phase === 'break') {
      const task = st.task;
      notify('Break’s over ⏰', cfg().autoNext ? 'Next focus session starting now.' : 'Ready for another focus session?');
      if (cfg().autoNext) startFocus({ task }); else stopAll();
    }
  }, 1000);
  setInterval(() => {
    if (st.phase !== 'idle') send();
    // a "quick look" is over: put the reminder back
    if (st.phase === 'focus' && !st.paused) for (const [k, until] of allowedNow) if (until <= Date.now()) { allowedNow.delete(k); sweepTabs(); notify('Quick look’s over 👀', `Back to work — ${k} is paused again.`); }
  }, 1000);

  function pause() { if (st.phase === 'idle' || st.paused) return; st.remaining = left(); st.paused = true; if (log) { log.pauses++; log.focusMs += now() - log.lastResume; } saveCurrent(); send(); }
  function resume() { if (!st.paused) return; st.endsAt = now() + st.remaining; st.paused = false; delete st.remaining; if (log) log.lastResume = now(); saveCurrent(); send(); }

  // resume a session that was running when the browser closed
  (() => {
    const cur = store.get('current'); if (!cur || !cur.st) return;
    st = cur.st; log = cur.log; cycle = cur.cycle || 0; for (const a of cur.allowed || []) allowedNow.set(Array.isArray(a) ? a[0] : a, Array.isArray(a) ? (a[1] === null ? Infinity : a[1]) : Infinity);
    if (log) log.lastResume = now();
    if (!st.paused && now() >= st.endsAt) { if (st.phase === 'focus') finishFocus(true, 'Finished while NoamBrowser was closed'); st = { phase: 'idle' }; saveCurrent(); }
  })();

  // --------------------------------------------------------------- stats
  function streak() {
    const days = new Set(store.get('sessions').filter((x) => x.completed).map((x) => dayKey(new Date(x.start))));
    let n = 0; const d = new Date();
    if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1); // today not done yet doesn't break the streak
    while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  const BADGES = [
    ['first', '🍅', 'First tomato', 'Finish your first focus session', (S) => S.done >= 1],
    ['ten', '🎯', 'Ten in the bag', 'Finish 10 focus sessions', (S) => S.done >= 10],
    ['fifty', '🏅', 'Focus pro', 'Finish 50 focus sessions', (S) => S.done >= 50],
    ['zen', '🧘', 'Zen master', 'A whole session without a single distraction', (S) => S.zen >= 1],
    ['zen5', '🪷', 'Calm mind', '5 sessions without distractions', (S) => S.zen >= 5],
    ['perfect', '💯', 'Perfect score', 'Score 100 in a session', (S) => S.best >= 100],
    ['streak3', '🔥', 'On fire', 'Focus 3 days in a row', (S) => S.maxStreak >= 3],
    ['streak7', '🏆', 'Unstoppable', 'Focus 7 days in a row', (S) => S.maxStreak >= 7],
    ['marathon', '🏃', 'Marathon', '4 sessions in one day', (S) => S.maxDay >= 4],
    ['goal', '✅', 'Goal getter', 'Reach your daily goal', (S) => S.goalDays >= 1],
    ['hundred', '⏱️', '100 minutes', 'Focus for 100 minutes in total', (S) => S.minutes >= 100],
    ['thousand', '🚀', '1,000 minutes', 'Focus for 1,000 minutes in total', (S) => S.minutes >= 1000],
    ['resist', '🛡️', 'Strong will', 'Walk away from a blocked site 10 times', (S) => S.resisted >= 10],
    ['early', '🌅', 'Early bird', 'Finish a session before 8 in the morning', (S) => S.early >= 1],
    ['owl', '🦉', 'Night owl', 'Finish a session after 10 at night', (S) => S.owl >= 1],
    ['promise', '🤝', 'Promise keeper', 'Keep 5 promises you made before a session', (S) => S.kept >= 5],
  ];
  function summaryStats(list = store.get('sessions')) {
    const done = list.filter((x) => x.completed);
    const perDay = {}; for (const x of done) { const k = dayKey(new Date(x.start)); perDay[k] = (perDay[k] || 0) + 1; }
    const days = Object.keys(perDay).sort(); let maxStreak = 0, run = 0, prev = null;
    for (const d of days) { const t = new Date(d + 'T12:00'); run = prev && (t - prev) / 86400000 < 1.5 ? run + 1 : 1; maxStreak = Math.max(maxStreak, run); prev = t; }
    const goal = cfg().dailyGoal;
    return {
      done: done.length, zen: done.filter((x) => !Object.values(x.distractions || {}).some((d) => d.visits)).length,
      best: Math.max(0, ...list.map((x) => x.score || 0)), maxStreak, maxDay: Math.max(0, ...Object.values(perDay)),
      goalDays: Object.values(perDay).filter((n) => n >= goal).length, minutes: Math.round(list.reduce((a, x) => a + (x.focusMs || 0), 0) / 60000),
      resisted: store.get('stats').resisted || 0, early: done.filter((x) => new Date(x.end).getHours() < 8).length, owl: done.filter((x) => new Date(x.end).getHours() >= 22).length,
      kept: list.filter((x) => x.kept === 'yes').length,
    };
  }
  function newBadges(rec) {
    const before = summaryStats(store.get('sessions').filter((x) => x.id !== rec.id)); const after = summaryStats();
    return BADGES.filter((b) => !b[4](before) && b[4](after)).map(([id, e, n, d]) => ({ id, e, n, d }));
  }
  function report() {
    const list = store.get('sessions');
    const S = summaryStats();
    const days30 = Array.from({ length: 30 }, (_, i) => dayKey(new Date(now() - (29 - i) * 86400000)));
    const perDay = days30.map((d) => { const xs = list.filter((x) => dayKey(new Date(x.start)) === d); return { day: d, minutes: Math.round(xs.reduce((a, x) => a + (x.focusMs || 0), 0) / 60000), sessions: xs.filter((x) => x.completed).length, score: xs.length ? Math.round(xs.reduce((a, x) => a + (x.score || 0), 0) / xs.length) : null }; });
    const recent = list.slice(-40);
    // distraction trends: this week vs last week, per session
    const wk = (from, to) => { const xs = list.filter((x) => x.start >= from && x.start < to); const by = {}; for (const x of xs) for (const [k, d] of Object.entries(x.distractions || {})) { by[k] = by[k] || { visits: 0, sec: 0 }; by[k].visits += d.visits; by[k].sec += d.sec; } return { n: xs.length, by }; };
    const t = now(); const thisW = wk(t - 7 * 86400000, t + 1), lastW = wk(t - 14 * 86400000, t - 7 * 86400000);
    const sites = [...new Set([...Object.keys(thisW.by), ...Object.keys(lastW.by)])].map((k) => ({
      key: k, now: thisW.n ? (thisW.by[k]?.visits || 0) / thisW.n : 0, before: lastW.n ? (lastW.by[k]?.visits || 0) / lastW.n : null,
      visits: thisW.by[k]?.visits || 0, sec: thisW.by[k]?.sec || 0,
    })).sort((a, b) => b.visits - a.visits);
    // when do you focus best? minutes by weekday × hour (last 60 days)
    const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const x of list) if (x.start > t - 60 * 86400000) { const d = new Date(x.start); heat[d.getDay()][d.getHours()] += (x.focusMs || 0) / 60000; }
    const scored = list.filter((x) => typeof x.score === 'number');
    const avg = (xs) => xs.length ? Math.round(xs.reduce((a, x) => a + x.score, 0) / xs.length) : null;
    return {
      cfg: cfg(), state: publicState(), streak: streak(), today: todayDone(), todayMinutes: perDay[29].minutes, goal: cfg().dailyGoal,
      totals: S, perDay, recent: recent.reverse(), sites, heat, resisted: store.get('stats').resisted || 0,
      scoreNow: avg(scored.slice(-10)), scoreBefore: avg(scored.slice(-20, -10)),
      promises: { made: list.filter((x) => x.promise).length, kept: list.filter((x) => x.kept === 'yes').length, partly: list.filter((x) => x.kept === 'partly').length },
      badges: BADGES.map(([id, e, n, d, test]) => ({ id, e, n, d, got: test(S) })),
    };
  }

  if (process.env.NOAM_TEST) require('electron').app.on('noam-test-seed-focus', (list) => { store.set('sessions', [...list, ...store.get('sessions')]); });

  // --------------------------------------------------------------- IPC
  const both = (ch, fn) => { uiHandle(ch, fn); pageHandle(ch, fn); };
  both('focus:state', () => publicState());
  both('focus:start', (_e, opts) => startFocus(opts || {}));
  both('focus:pause', () => { pause(); return publicState(); });
  both('focus:resume', () => { resume(); return publicState(); });
  both('focus:stop', (_e, { reason } = {}) => { if (st.phase === 'focus') finishFocus(false, reason); stopAll(); return publicState(); });
  both('focus:break', () => { if (st.phase === 'focus') finishFocus(true, 'Ended early for a break'); startBreak(); return publicState(); });
  both('focus:skip-break', () => { if (st.phase === 'break') { const task = st.task; stopAll(); if (cfg().autoNext) startFocus({ task }); } return publicState(); });
  both('focus:add-time', (_e, min) => { if (st.phase !== 'idle') { const ms = Math.max(-st.total + 60000, (+min || 5) * 60000); if (st.paused) st.remaining += ms; else st.endsAt += ms; st.total += ms; if (log) log.planned += ms; saveCurrent(); send(); } return publicState(); });
  both('focus:rate', (_e, { id, mood, note, kept }) => {
    const x = store.get('sessions').find((s) => s.id === id); if (!x) return false;
    if (mood) x.mood = mood; if (note !== undefined) x.note = String(note).slice(0, 500); if (kept) x.kept = kept;
    store.save(); return true;
  });
  both('focus:stats', () => report());
  pageHandle('focus:delete', (_e, id) => { store.set('sessions', id ? store.get('sessions').filter((x) => x.id !== id) : []); return report(); });
  // from the reminder page shown instead of a blocked site
  pageHandle('focus:resisted', (_e, site) => { const s = store.get('stats'); s.resisted = (s.resisted || 0) + 1; store.save(); return s.resisted; });
  pageHandle('focus:let-through', (_e, { site, reason }) => {
    if (st.phase !== 'focus' || !log) return true;
    if (st.mode === 'strict' && !['broke', 'work'].includes(reason)) return false;
    allowedNow.set(site, reason === 'quick' ? Date.now() + 3 * 60000 : Infinity); passThrough.add(site);
    const dd = (log.distractions[site] = log.distractions[site] || { visits: 1, sec: 0, blocked: 0, overrides: 0 });
    if (reason === 'work') { const c = cfg(); if (!c.allowOnly) settings.set('focus', { ...c, sites: c.sites.filter((s) => s !== site) }); dd.visits = Math.max(0, dd.visits - 1); }
    else dd.overrides++;
    saveCurrent(); send(); return true;
  });
  pageHandle('focus:block-info', () => ({ ...publicState(), cfg: cfg() }));
  // websites can't send notifications while you focus
  const holding = () => st.phase === 'focus' && !st.paused && cfg().holdNotifications;
  return { holding, state: publicState, isDistraction };
};
