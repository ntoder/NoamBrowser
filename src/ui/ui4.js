// Blue light filter: a warm overlay (plus optional dimming) over the whole browser window.
// Manual on/off, or automatic from sunset to sunrise (for the widget city) or at set times.
'use strict';
(() => {
  const el = $('#bluelight'), dimEl = $('#bl-dim'), btn = $('#bl-btn');
  const TINTS = { warm: '#ffb46b', amber: '#ff8a1c', candle: '#ff6a00', sunset: '#ff4f2e', red: '#ff1a00', rose: '#ff5c8a' };
  const cfg = () => state.settings.blueLight || {};
  const mins = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  // Returns { on, since } for the schedule, or null when there's no schedule.
  function schedule() {
    const b = cfg(); const now = new Date();
    if (b.schedule === 'custom') {
      const n = now.getHours() * 60 + now.getMinutes(), f = mins(b.from || '21:00'), t = mins(b.to || '07:00');
      const on = f <= t ? n >= f && n < t : n >= f || n < t;
      const since = on ? (n - f + 1440) % 1440 : 0;
      return { on, since };
    }
    if (b.schedule === 'sunset' && window.NoamZmanim) {
      const c = (state.settings.widgets || {}).city || { lat: 31.769, lon: 35.2163, tz: 'Asia/Jerusalem' };
      const z = NoamZmanim.zmanim(c, now, { elevation: !!(state.settings.widgets || {}).elevation });
      if (z.polar) return { on: false, since: 0 };
      const start = new Date(+z.sunset - (+b.sunsetOffset || 0) * 60000);
      const on = now >= start || now < z.sunrise;
      const since = on ? (now >= start ? (now - start) / 60000 : (now - (+start - 86400000)) / 60000) : 0;
      return { on, since };
    }
    return null;
  }
  let lastSched = null, manual = null, videoFs = false;
  // QR codes on screen (WhatsApp login etc.): the tint makes them hard for phones to read
  const qr = new Set(); let qrToast = false;
  const qrVisible = () => [...qr].some((id) => id === (state.active && state.active.wcId) || (typeof webPanels !== 'undefined' && openPanelId && webPanels.get(openPanelId) && (() => { try { return webPanels.get(openPanelId).getWebContentsId() === id; } catch { return false; } })()));
  nb.on('qr:state', ({ wcId, on }) => { if (on) qr.add(wcId); else qr.delete(wcId); const was = el.classList.contains('on'); apply(); if (on && was && !el.classList.contains('on') && !qrToast) { qrToast = true; toast('📷 QR code on screen — night tint paused so your phone can scan it', 4000); setTimeout(() => (qrToast = false), 60000); } });
  function apply() {
    const b = cfg();
    const sc = schedule();
    if (sc && sc.on !== lastSched) { manual = null; lastSched = sc.on; }
    if (!sc) lastSched = null;
    let on = manual !== null ? manual : sc ? sc.on : !!b.enabled;
    if (videoFs && b.pauseVideo !== false) on = false;
    if (on && qrVisible()) on = false;
    let strength = Math.min(0.85, Math.max(0.05, (b.strength ?? 45) / 100));
    // gradual: ease in over the first 45 minutes of a scheduled evening
    if (on && b.ramp && sc && sc.on && manual === null) strength *= Math.max(0.15, Math.min(1, sc.since / 45));
    const color = b.tint === 'custom' ? (b.color || '#ff8a1c') : TINTS[b.tint] || TINTS.amber;
    const r = document.documentElement.style;
    r.setProperty('--bl', String(strength.toFixed(3)));
    r.setProperty('--blc', color);
    r.setProperty('--bld', String(Math.min(0.7, Math.max(0, (+b.dim || 0) / 100))));
    r.setProperty('--blf', (b.fade ?? 1.2) + 's');
    el.classList.toggle('on', on);
    dimEl.classList.toggle('on', on && (+b.dim || 0) > 0);
    btn.hidden = b.button === false;
    btn.classList.toggle('on', on);
    btn.title = `Blue light filter: ${on ? 'on' : 'off'} (Ctrl+Shift+L) — right-click for options`;
    return on;
  }
  const save = (patch) => { state.settings.blueLight = { ...cfg(), ...patch }; nb.invoke('settings:set', { blueLight: patch }); apply(); };
  window.toggleBlueLight = () => {
    const now = !el.classList.contains('on');
    if (schedule()) manual = now; // temporary override until the schedule next changes
    save({ enabled: now });
    toast(now ? 'Blue light filter on' : 'Blue light filter off');
  };
  btn.onclick = toggleBlueLight;
  btn.oncontextmenu = async (e) => {
    e.preventDefault();
    const b = cfg();
    const check = (label, cond, id) => ({ id, label, type: 'checkbox', checked: !!cond });
    const id = await popup([
      check(el.classList.contains('on') ? 'Turn off' : 'Turn on', el.classList.contains('on'), 'toggle'),
      { type: 'separator' },
      { label: 'Strength', submenu: [20, 30, 45, 60, 75].map((v) => check(v + '%', (b.strength ?? 45) === v, 'str:' + v)) },
      { label: 'Colour', submenu: [['warm', 'Soft warm'], ['amber', 'Amber'], ['candle', 'Candlelight'], ['sunset', 'Sunset'], ['red', 'Deep red (darkest)'], ['rose', 'Rose']].map(([k, n]) => check(n, (b.tint || 'amber') === k, 'tint:' + k)) },
      { label: 'Dim the screen', submenu: [0, 10, 20, 35, 50].map((v) => check(v ? v + '%' : 'No dimming', (+b.dim || 0) === v, 'dim:' + v)) },
      { label: 'Turn on automatically', submenu: [check('Never', (b.schedule || 'off') === 'off', 'sch:off'), check('Sunset to sunrise', b.schedule === 'sunset', 'sch:sunset'), check(`At set times (${b.from || '21:00'}–${b.to || '07:00'})`, b.schedule === 'custom', 'sch:custom')] },
      { type: 'separator' },
      { id: 'settings', label: 'More options…' },
    ], e.clientX, e.clientY);
    if (!id) return;
    if (id === 'toggle') toggleBlueLight();
    else if (id === 'settings') newTab({ url: 'noam://settings/#tools' });
    else { const [k, v] = id.split(':'); save(k === 'str' ? { strength: +v } : k === 'tint' ? { tint: v } : k === 'dim' ? { dim: +v } : { schedule: v }); }
  };
  document.addEventListener('fullscreenchange', apply);
  new MutationObserver(() => { const fs = document.body.classList.contains('html-fs'); if (fs !== videoFs) { videoFs = fs; apply(); } }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  setInterval(apply, 30000);

  const _settings = hooks.settings;
  hooks.settings = (s) => { _settings(s); apply(); };
  const _init = hooks.init;
  hooks.init = async (init) => { await _init(init); apply(); };
  const _shortcut = hooks.shortcut;
  hooks.shortcut = (key, mods) => {
    if (_shortcut && _shortcut(key, mods)) return true;
    if (mods && mods.ctrl && mods.shift && key === 'l') { toggleBlueLight(); return true; }
    if (key === 'bluelight') { toggleBlueLight(); return true; }
    return false;
  };
  const _commands = commands;
  commands = function () { return [..._commands(), CMD('bluelight', 'Blue light filter on/off', 'Ctrl+Shift+L', toggleBlueLight, 'moon')]; };
  apply();

  // ---- screen time: tell the main process which tab this window is showing
  const report = () => { const t = state.active; nb.invoke('screentime:active', { wcId: t && t.wcId, favicon: t && t.favicon }).catch(() => {}); };
  const _activated = hooks.activated;
  hooks.activated = (t) => { _activated(t); report(); };
  const _loaded = hooks.loaded;
  hooks.loaded = async (t) => { await _loaded(t); if (t === state.active) report(); };
  setInterval(report, 15000);
  nb.on('screentime:limit', ({ msg }) => toast('⏰ ' + msg, 6000));
  const _commands2 = commands;
  commands = function () { return [..._commands2(), CMD('screentime', 'Screen time — how long I spend on each site', '', () => newTab({ url: 'noam://screentime/' }), 'layers')]; };
})();
