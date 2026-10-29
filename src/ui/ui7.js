// NoamBrowser 2.5 — speed (sleeping tabs, heavy-tab alerts, energy saver, speed mode)
// and container tabs (several accounts on the same site at once).
'use strict';
(() => {
  // ================================================================== containers
  const containers = () => (state.settings && state.settings.containers) || [];
  window.containerById = (id) => containers().find((c) => c.id === id) || null;
  function paintContainer(t) {
    const c = t.container && containerById(t.container);
    t.el.classList.toggle('in-ctr', !!c);
    let ic = t.el.querySelector('.ctr-ic');
    if (c) {
      t.el.style.setProperty('--cc', c.color); t.el.title = `${c.icon || ''} ${c.name} — ${t.title}`;
      if (!ic) { ic = document.createElement('span'); ic.className = 'ctr-ic'; t.el.insertBefore(ic, t.el.querySelector('.fav')); }
      ic.textContent = c.icon || '•';
    } else { t.el.style.removeProperty('--cc'); if (ic) ic.remove(); }
  }
  const chip = document.createElement('button');
  chip.id = 'ctr-chip'; chip.className = 'ctr-chip'; chip.hidden = true; chip.title = 'This tab is in a container — its own separate logins. Click to switch.';
  $('#url').parentElement.insertBefore(chip, $('#url'));
  function renderChip() {
    const t = state.active; const c = t && t.container && containerById(t.container);
    chip.hidden = !c;
    if (c) { chip.innerHTML = `<span>${esc(c.icon || '')}</span>${esc(c.name)}`; chip.style.setProperty('--cc', c.color); }
  }
  const ctrMenu = (current, includeDefault = true) => [
    ...(includeDefault ? [{ id: 'ctr:', label: '🌐 Default (your normal logins)', type: 'checkbox', checked: !current }] : []),
    ...containers().map((c) => ({ id: 'ctr:' + c.id, label: `${c.icon || '•'} ${c.name}`, type: 'checkbox', checked: current === c.id })),
    { type: 'separator' }, { id: 'ctr-new', label: '➕ New container…' }, { id: 'ctr-manage', label: 'Manage containers…' },
  ];
  async function newContainer() {
    const name = await askText('Name the new container', '', 'e.g. Gaming, Shopping, Family');
    if (!name) return null;
    const COLORS = ['#7C68FA', '#E5484D', '#14A89B', '#D9A21B', '#E055A3', '#3E8DEB', '#EE7A2E', '#3FAE5A'];
    const ICONS = ['⭐', '🎮', '🛒', '👪', '💰', '🎵', '📺', '🧪'];
    const n = containers().length;
    const c = { id: 'c' + Date.now().toString(36), name: name.slice(0, 24), color: COLORS[n % COLORS.length], icon: ICONS[n % ICONS.length] };
    state.settings = await nb.invoke('settings:set', { containers: [...containers(), c] });
    await nb.invoke('containers:prepare');
    return c;
  }
  async function openIn(id, url, opts = {}) {
    if (id === 'ctr-new') { const c = await newContainer(); if (!c) return; id = 'ctr:' + c.id; }
    if (id === 'ctr-manage') return newTab({ url: 'noam://settings/#containers' });
    const cid = id.slice(4) || null;
    await nb.invoke('containers:prepare');
    return newTab({ url: url || NEWTAB, container: cid, ...opts });
  }
  $('#newtab').addEventListener('contextmenu', async (e) => { e.preventDefault(); const r = $('#newtab').getBoundingClientRect(); const id = await popup(ctrMenu(null, true).map((x) => (x.type === 'checkbox' ? { ...x, type: undefined, checked: undefined } : x)), r.left, r.bottom + 4); if (id) openIn(id); });
  chip.onclick = async () => { const t = state.active; const r = chip.getBoundingClientRect(); const id = await popup(ctrMenu(t.container), r.left, r.bottom + 4); if (!id) return; if (id.startsWith('ctr:') && (id.slice(4) || null) === t.container) return; const nt = await openIn(id, t.url, { index: state.tabs.indexOf(t) + 1 }); if (nt && id.startsWith('ctr:')) closeTab(t); };

  // ================================================================== speed
  const P = () => ({ sleep: true, sleepAfter: 30, keepAwake: [], heavyAlerts: true, autoSleepHeavy: false, energySaver: 'battery', speedMode: false, ...((state.settings && state.settings.perf) || {}) });
  let onBattery = false, savedMB = 0;
  const tabMem = new Map(); // tab id -> MB it used before sleeping
  nb.invoke('perf:power').then((b) => { onBattery = b; applyModes(); }).catch(() => {});
  const energyOn = () => P().energySaver === 'always' || (P().energySaver === 'battery' && onBattery);
  function applyModes() {
    document.documentElement.classList.toggle('energy-saver', energyOn());
    document.documentElement.classList.toggle('speed-mode', !!P().speedMode);
    const b = $('#energy-badge'); if (b) b.hidden = !energyOn();
  }
  nb.on('perf:power', ({ onBattery: ob }) => {
    const was = energyOn(); onBattery = ob; applyModes();
    if (!was && energyOn()) toast('🍃 On battery — Energy saver is on: unused tabs sleep sooner and heavy tabs are paused', 4500);
    if (was && !energyOn()) toast('🔌 Plugged in — Energy saver is off');
  });
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  const keptAwake = (t) => { const h = host(t.url); return P().keepAwake.some((s) => s && (h === s || h.endsWith('.' + s))); };
  const inSplit = (t) => state.split && (state.split.a === t || state.split.b === t);
  const canSleep = (t) => t && !t.asleep && t !== state.active && t.wcId && !t.audible && !t.loading && !inSplit(t) && !keptAwake(t) && !t.pinned && !(t.pendingPermissions && t.pendingPermissions.length);
  async function dirtyForm(t) {
    try { return await t.wv.executeJavaScript(`[...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]), textarea')].some((e) => e.value && e.value !== e.defaultValue) || [...document.querySelectorAll('[contenteditable=true]')].some((e) => e.textContent.length > 0 && document.activeElement === e)`); } catch { return true; }
  }
  async function trySleep(t, why) {
    if (!canSleep(t) || await dirtyForm(t)) return false;
    const m = await nb.invoke('perf:metrics').catch(() => null);
    const mem = m && m.tabs[t.wcId] ? m.tabs[t.wcId].memMB : 0;
    if (!(await sleepTab(t))) return false;
    tabMem.set(t.id, mem); savedMB += mem; report();
    return true;
  }
  setInterval(async () => {
    if (!P().sleep && !energyOn()) return;
    const after = (energyOn() ? Math.min(10, P().sleepAfter) : P().speedMode ? Math.min(15, P().sleepAfter) : P().sleepAfter) * 60000;
    for (const t of [...state.tabs]) if (canSleep(t) && Date.now() - (t.lastActive || 0) > after) await trySleep(t, 'idle');
  }, 60000);

  // tabs that slow the computer down
  const bar = document.createElement('div');
  bar.id = 'heavy-bar'; bar.className = 'infobar'; bar.hidden = true;
  $('#content').appendChild(bar);
  nb.on('perf:heavy', async ({ wcId, cpu, memMB }) => {
    const t = state.tabs.find((x) => x.wcId === wcId); if (!t) return;
    const what = memMB > 1800 ? `uses ${(memMB / 1024).toFixed(1)} GB of memory` : `is using ${cpu}% of the processor`;
    if (t !== state.active && (P().autoSleepHeavy || energyOn())) { if (await trySleep(t, 'heavy')) toast(`💤 Put “${t.title}” to sleep — it ${what} in the background`, 4500); return; }
    if (t === state.active) return; // the page you're using: that's on purpose
    bar.hidden = false;
    bar.innerHTML = `<span class="pb-icon">🐢</span><div class="pb-text"><b></b> ${esc(what)} and is slowing your computer down.</div><button class="btn ghost" data-a="keep">Keep it running</button><button class="btn ghost" data-a="always">Always keep this site</button><button class="btn primary" data-a="sleep">💤 Put it to sleep</button>`;
    bar.querySelector('b').textContent = `“${t.title}”`;
    bar.querySelector('[data-a=sleep]').onclick = async () => { bar.hidden = true; if (!(await trySleep(t, 'heavy'))) toast('That tab is busy (playing sound or has something typed in it), so it stays awake'); };
    bar.querySelector('[data-a=keep]').onclick = () => { bar.hidden = true; };
    bar.querySelector('[data-a=always]').onclick = async () => { bar.hidden = true; const h = host(t.url); if (h) state.settings = await nb.invoke('settings:set', { perf: { ...P(), keepAwake: [...new Set([...P().keepAwake, h])] } }); toast(`${h} will always stay awake`); };
    clearTimeout(bar._t); bar._t = setTimeout(() => (bar.hidden = true), 30000);
  });

  // report to the Performance page
  function report() {
    const sleeping = state.tabs.filter((t) => t.asleep).map((t) => ({ id: t.id, title: t.title, url: t.url, favicon: t.favicon, since: t.sleptAt || 0, memMB: tabMem.get(t.id) || 0, container: t.container }));
    nb.invoke('perf:report', { sleeping, savedMB: sleeping.reduce((a, s) => a + s.memMB, 0) }).catch(() => {});
  }
  setInterval(report, 10000);
  nb.on('perf:action', async ({ action, wcId, tabId }) => {
    const t = state.tabs.find((x) => (tabId != null && x.id === tabId) || (wcId != null && x.wcId === wcId));
    if (action === 'sleep-all') { let n = 0; for (const x of [...state.tabs]) if (await trySleep(x, 'manual')) n++; toast(n ? `💤 Put ${n} tab${n === 1 ? '' : 's'} to sleep` : 'No tabs could sleep right now'); report(); return; }
    if (!t) return;
    if (action === 'sleep') { if (!(await trySleep(t, 'manual'))) toast('That tab can’t sleep right now (it’s open, playing sound, or has something typed in it)'); }
    if (action === 'wake') { wakeTab(t); t.lastActive = Date.now(); }
    if (action === 'show') { if (t.ws !== state.ws && window.switchWs) switchWs(t.ws); activate(t); }
    if (action === 'close') closeTab(t);
    report();
  });

  // ================================================================== hooks
  const _created = hooks.tabCreated;
  hooks.tabCreated = (t) => { if (_created) _created(t); t.lastActive = Date.now(); if (t.asleep) t.sleptAt = 0; paintContainer(t); };
  hooks.slept = (t) => { t.el.title = `💤 Sleeping to save memory — click to wake up\n${t.title}`; report(); };
  hooks.woke = (t) => { savedMB -= tabMem.get(t.id) || 0; tabMem.delete(t.id); paintContainer(t); report(); };
  const _act = hooks.activated;
  hooks.activated = (t) => { _act(t); t.lastActive = Date.now(); renderChip(); };
  const _settings = hooks.settings;
  hooks.settings = (s) => { _settings(s); applyModes(); state.tabs.forEach(paintContainer); renderChip(); };
  const _extra = hooks.tabMenuExtra;
  hooks.tabMenuExtra = (t) => [
    ...(_extra ? _extra(t) : []),
    t !== state.active && !t.asleep ? { id: 'perf-sleep', label: '💤 Put tab to sleep' } : null,
    { id: 'perf-sleep-others', label: '💤 Put other tabs to sleep' },
    !t.private && /^https?:/.test(t.url) ? { label: '🗂️ Open in container', submenu: ctrMenu(t.container).map((x) => ({ ...x, id: x.id && x.id.startsWith('ctr') && x.id !== 'ctr-manage' && x.id !== 'ctr-new' ? 'reopen-' + x.id : x.id })) } : null,
  ];
  const _action = hooks.tabMenuAction;
  hooks.tabMenuAction = async (t, id) => {
    if (_action) _action(t, id);
    if (id === 'perf-sleep') { if (!(await trySleep(t, 'manual'))) toast('That tab can’t sleep right now (it’s playing sound or has something typed in it)'); }
    if (id === 'perf-sleep-others') { let n = 0; for (const x of [...state.tabs]) if (x !== t && await trySleep(x, 'manual')) n++; toast(n ? `💤 Put ${n} tab${n === 1 ? '' : 's'} to sleep` : 'No other tabs could sleep right now'); }
    if (id.startsWith('reopen-ctr:')) { const cid = id.slice(11) || null; if (cid === t.container) return; const nt = await openIn('ctr:' + (cid || ''), t.url, { index: state.tabs.indexOf(t) + 1 }); if (nt) closeTab(t); }
    if (id === 'ctr-new' || id === 'ctr-manage') { const nt = await openIn(id, t.url, { index: state.tabs.indexOf(t) + 1 }); if (nt && id === 'ctr-new') closeTab(t); }
  };
  const _commands = commands;
  commands = function () {
    return [..._commands(),
      ...containers().map((c) => CMD('ctr-' + c.id, `New ${c.icon || ''} ${c.name} tab (separate logins)`, '', () => openIn('ctr:' + c.id), 'cmd')),
      CMD('ctr-new', 'New container (another set of logins)…', '', () => openIn('ctr-new'), 'cmd'),
      CMD('sleep-others', 'Put other tabs to sleep 💤', '', () => hooks.tabMenuAction(state.active, 'perf-sleep-others'), 'cmd'),
      CMD('perf', 'Speed & memory — what’s slowing things down', '', () => newTab({ url: 'noam://performance/' }), 'cmd'),
    ];
  };
  const _init = hooks.init;
  hooks.init = async (init) => { await _init(init); applyModes(); state.tabs.forEach(paintContainer); renderChip(); };
})();
