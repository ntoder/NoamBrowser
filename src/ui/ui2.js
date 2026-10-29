// NoamBrowser 2.0 — vertical tabs, tab groups, split view, command palette,
// reader / translate / PiP / dark mode buttons, password bar, updates.
'use strict';
window.hooks = {};
state.groups = state.groups || [];
state.split = null;
state.pwOffers = [];

const GROUP_COLORS = [
  ['Violet', '#7C68FA'], ['Blue', '#3E8DEB'], ['Teal', '#14A89B'], ['Green', '#3FAE5A'],
  ['Yellow', '#D9A21B'], ['Orange', '#EE7A2E'], ['Red', '#E5484D'], ['Pink', '#E055A3'], ['Grey', '#7B8094'],
];
const popup = (items, x, y) => nb.invoke('ui:popup-menu', { items, x, y });
const saveGroups = () => nb.invoke('settings:set', { tabs: { groups: state.groups.map(({ id, name, color, collapsed }) => ({ id, name, color, collapsed })) } });
const tabHost = (t) => hostOf(t && t.url);

// ====================================================================== groups
function renderGroups() {
  $$('.group-chip').forEach((c) => { if (c.contains(document.activeElement) && c.querySelector('input')) c.querySelector('input').onblur = null; c.remove(); });
  // drop groups that no longer have tabs
  const used = new Set(state.tabs.map((t) => t.groupId).filter(Boolean));
  const before = state.groups.length;
  state.groups = state.groups.filter((g) => used.has(g.id));
  if (state.groups.length !== before) saveGroups();
  for (const g of state.groups) {
    const tabs = state.tabs.filter((t) => t.groupId === g.id);
    const first = tabs[0];
    if (!first) continue;
    const chip = document.createElement('button');
    chip.className = 'group-chip' + (g.collapsed ? ' collapsed' : '');
    chip.style.setProperty('--gc', g.color);
    chip.title = (g.name || 'Unnamed group') + ' — click to ' + (g.collapsed ? 'expand' : 'collapse');
    chip.innerHTML = (g.name ? esc(g.name) : '') + (g.collapsed ? ` <span class="n">${tabs.length}</span>` : '');
    chip.onclick = () => { g.collapsed = !g.collapsed; saveGroups(); renderGroups(); layoutTabs(); };
    chip.ondblclick = (e) => { e.stopPropagation(); renameGroup(g, chip); };
    chip.oncontextmenu = (e) => { e.preventDefault(); groupMenu(g, e); };
    first.el.parentNode.insertBefore(chip, first.el);
    for (const t of tabs) {
      t.el.style.setProperty('--gc', g.color);
      t.el.classList.toggle('group-hidden', !!g.collapsed && t !== state.active && !(state.split && (state.split.a === t || state.split.b === t)));
    }
  }
  for (const t of state.tabs) if (!t.groupId) t.el.classList.remove('group-hidden');
}
hooks.groupsChanged = () => { renderGroups(); layoutTabs(); };

function renameGroup(g, chip) {
  chip.innerHTML = '';
  const inp = document.createElement('input');
  inp.value = g.name || ''; inp.placeholder = 'Name this group';
  chip.appendChild(inp); inp.focus(); inp.select();
  let finished = false;
  const done = () => { if (finished) return; finished = true; g.name = inp.value.trim().slice(0, 40); saveGroups(); renderGroups(); };
  inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') done(); if (e.key === 'Escape') { finished = true; renderGroups(); } };
  inp.onblur = done;
  inp.onclick = (e) => e.stopPropagation();
}

function moveTabToGroupEnd(tab, g) {
  const members = state.tabs.filter((t) => t.groupId === g.id && t !== tab);
  const anchor = members[members.length - 1];
  if (!anchor) return;
  const from = state.tabs.indexOf(tab); state.tabs.splice(from, 1);
  const to = state.tabs.indexOf(anchor) + 1; state.tabs.splice(to, 0, tab);
  anchor.el.after(tab.el);
}

function addToGroup(tab, g) {
  if (!g) {
    const used = new Set(state.groups.map((x) => x.color));
    const color = (GROUP_COLORS.find(([, c]) => !used.has(c)) || GROUP_COLORS[state.groups.length % GROUP_COLORS.length])[1];
    g = { id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: '', color, collapsed: false };
    state.groups.push(g);
    tab.groupId = g.id;
    tab.render(); saveGroups(); renderGroups(); layoutTabs(); saveSession();
    const chip = $$('.group-chip').find((c) => c.nextElementSibling === tab.el);
    if (chip) renameGroup(g, chip);
    return g;
  }
  tab.groupId = g.id;
  moveTabToGroupEnd(tab, g);
  tab.render(); saveGroups(); renderGroups(); layoutTabs(); saveSession();
  return g;
}
function ungroup(tab) { tab.groupId = null; tab.render(); renderGroups(); layoutTabs(); saveSession(); }

async function groupMenu(g, e) {
  const id = await popup([
    { id: 'rename', label: 'Rename group' },
    { id: 'new', label: 'New tab in group' },
    { label: 'Color', submenu: GROUP_COLORS.map(([n, c]) => ({ id: 'color:' + c, label: n, type: 'checkbox', checked: g.color === c })) },
    { id: 'collapse', label: g.collapsed ? 'Expand group' : 'Collapse group' },
    { type: 'separator' },
    { id: 'ungroup', label: 'Ungroup' },
    { id: 'close', label: 'Close group' },
  ], e.clientX, e.clientY);
  if (!id) return;
  const tabs = state.tabs.filter((t) => t.groupId === g.id);
  if (id === 'rename') { const chip = $$('.group-chip').find((c) => c.nextElementSibling === tabs[0].el); if (chip) renameGroup(g, chip); }
  else if (id === 'new') { const t = newTab({ url: NEWTAB, index: state.tabs.indexOf(tabs[tabs.length - 1]) + 1 }); t.groupId = g.id; t.render(); renderGroups(); saveSession(); }
  else if (id.startsWith('color:')) { g.color = id.slice(6); tabs.forEach((t) => t.render()); saveGroups(); renderGroups(); }
  else if (id === 'collapse') { g.collapsed = !g.collapsed; saveGroups(); renderGroups(); layoutTabs(); }
  else if (id === 'ungroup') { tabs.forEach((t) => { t.groupId = null; t.render(); }); renderGroups(); layoutTabs(); saveSession(); }
  else if (id === 'close') { [...tabs].reverse().forEach((t) => closeTab(t)); }
}

// ====================================================================== tab context menu
hooks.tabMenu = async (tab, e) => {
  const idx = state.tabs.indexOf(tab);
  const otherGroups = state.groups.filter((g) => g.id !== tab.groupId);
  const inSplit = state.split && (state.split.a === tab || state.split.b === tab);
  const items = [
    { id: 'newright', label: 'New tab to the right' },
    { type: 'separator' },
    { id: 'reload', label: 'Reload' },
    { id: 'dup', label: 'Duplicate' },
    { id: 'mute', label: tab.muted ? 'Unmute site' : 'Mute tab' },
    { type: 'separator' },
    { id: 'group-new', label: 'Add tab to new group' },
  ];
  if (otherGroups.length) items.push({ label: 'Add tab to group', submenu: otherGroups.map((g) => ({ id: 'group:' + g.id, label: g.name || GROUP_COLORS.find(([, c]) => c === g.color)?.[0] + ' group' || 'Group' })) });
  if (tab.groupId) items.push({ id: 'ungroup', label: 'Remove from group' });
  items.push({ type: 'separator' });
  if (inSplit) items.push({ id: 'unsplit', label: 'Close split view' });
  else if (tab !== state.active) items.push({ id: 'split', label: 'Open side by side with current tab' });
  else items.push({ id: 'split-next', label: 'Split view with another tab' });
  const extra = (hooks.tabMenuExtra ? hooks.tabMenuExtra(tab) : []).filter(Boolean);
  if (extra.length) items.push({ type: 'separator' }, ...extra);
  items.push({ type: 'separator' },
    { id: 'close', label: 'Close tab' },
    { id: 'others', label: 'Close other tabs', enabled: state.tabs.length > 1 },
    { id: 'right', label: 'Close tabs to the right', enabled: idx < state.tabs.length - 1 },
    { type: 'separator' },
    { id: 'reopen', label: 'Reopen closed tab', enabled: state.closed.length > 0 });
  const id = await popup(items, e.clientX, e.clientY);
  if (!id) return;
  if (id === 'newright') { const t = newTab({ url: NEWTAB, index: idx + 1, private: tab.private, container: tab.container }); if (tab.groupId) { t.groupId = tab.groupId; t.render(); renderGroups(); } }
  else if (id === 'reload') reloadTab(tab);
  else if (id === 'dup') newTab({ url: tab.url, index: idx + 1, private: tab.private, container: tab.container });
  else if (id === 'mute') { tab.muted = !tab.muted; try { tab.wv.setAudioMuted(tab.muted); } catch {} tab.render(); }
  else if (id === 'group-new') addToGroup(tab, null);
  else if (id.startsWith('group:')) addToGroup(tab, state.groups.find((g) => g.id === id.slice(6)));
  else if (id === 'ungroup') ungroup(tab);
  else if (id === 'split') startSplit(state.active, tab);
  else if (id === 'split-next') hooks.splitToggle();
  else if (id === 'unsplit') endSplit();
  else if (id === 'close') closeTab(tab);
  else if (id === 'others') state.tabs.filter((t) => t !== tab).forEach((t) => closeTab(t));
  else if (id === 'right') state.tabs.slice(idx + 1).forEach((t) => closeTab(t));
  else if (id === 'reopen') shortcut({ key: 't', ctrl: true, shift: true });
  else if (hooks.tabMenuAction) hooks.tabMenuAction(tab, id);
};

// ====================================================================== split view
function applySplit() {
  const views = $('#views');
  const s = state.split;
  for (const t of state.tabs) { t.wv.classList.remove('split-pane', 'split-a', 'split-b'); t.el.classList.remove('in-split'); if (t.errorView) { t.errorView.style.left = ''; t.errorView.style.right = ''; t.errorView.style.width = ''; } }
  const show = s && (state.active === s.a || state.active === s.b);
  views.classList.toggle('split', !!show);
  $('#split-divider').hidden = !show;
  if (!s) return;
  s.a.el.classList.add('in-split'); s.b.el.classList.add('in-split');
  if (!show) return;
  const pct = Math.round(s.ratio * 1000) / 10 + '%';
  $('#content').style.setProperty('--split', pct);
  s.a.wv.classList.add('split-pane', 'split-a'); s.b.wv.classList.add('split-pane', 'split-b');
  const place = (t, left) => { if (!t.errorView) return; t.errorView.hidden = false; if (left) { t.errorView.style.right = 'auto'; t.errorView.style.width = `calc(${pct} - 3px)`; } else { t.errorView.style.left = `calc(${pct} + 3px)`; } };
  place(s.a, true); place(s.b, false);
}
function startSplit(a, b) {
  if (!a || !b || a === b) return;
  state.split = { a, b, ratio: 0.5 };
  activate(a);
  toast('Split view — drag the divider to resize, Ctrl+Shift+S to close');
}
function endSplit() {
  if (!state.split) return;
  state.split = null; applySplit();
  if (state.active) activate(state.active);
}
hooks.splitToggle = () => {
  if (state.split) { endSplit(); return; }
  const a = state.active; if (!a) return;
  const i = state.tabs.indexOf(a);
  const b = state.tabs[i + 1] || state.tabs[i - 1] || newTab({ url: NEWTAB, background: true, index: i + 1 });
  startSplit(a, b);
};
hooks.activated = (tab) => {
  if (state.split && !(state.split.a === tab || state.split.b === tab)) {
    // switched away: keep the pair, just show this tab alone
  }
  applySplit();
  // reveal a collapsed group's active tab
  if (tab.groupId) renderGroups();
};
hooks.closing = (tab) => { if (state.split && (state.split.a === tab || state.split.b === tab)) { state.split = null; applySplit(); } };
hooks.closed = () => renderGroups();
(() => {
  const div = $('#split-divider');
  div.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#split-close')) return;
    e.preventDefault(); div.setPointerCapture(e.pointerId); div.classList.add('drag'); $('#views').classList.add('dragging');
    const rect = $('#content').getBoundingClientRect();
    const move = (ev) => { if (!state.split) return; state.split.ratio = Math.min(0.85, Math.max(0.15, (ev.clientX - rect.left) / rect.width)); applySplit(); };
    const up = () => { div.classList.remove('drag'); $('#views').classList.remove('dragging'); div.removeEventListener('pointermove', move); div.removeEventListener('pointerup', up); };
    div.addEventListener('pointermove', move); div.addEventListener('pointerup', up);
  });
  div.addEventListener('dblclick', () => { if (state.split) { state.split.ratio = 0.5; applySplit(); } });
  $('#split-close').onclick = endSplit;
})();

// ====================================================================== vertical tabs
function applyLayout() {
  const t = (state.settings.tabs || {});
  const vertical = t.layout === 'vertical';
  const was = document.body.classList.contains('vtabs');
  document.body.classList.toggle('vtabs', vertical);
  const sb = $('#sidebar');
  sb.hidden = !vertical;
  sb.style.setProperty('--sbw', (t.sidebarWidth || 240) + 'px');
  sb.classList.toggle('collapsed', !!t.sidebarCollapsed);
  $('#sb-collapse').title = t.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
  if (vertical && !was) { $('#sb-tabs').appendChild($('#tabstrip')); $('#toolbar').appendChild($('#wc-space')); }
  if (!vertical && was) { $('#titlebar').insertBefore($('#tabstrip'), $('#newtab')); $('#titlebar').appendChild($('#wc-space')); }
  layoutTabs();
}
hooks.settings = () => applyLayout();
$('#sb-newtab').onclick = () => newTab({ url: NEWTAB });
$('#sb-collapse').onclick = () => nb.invoke('settings:set', { tabs: { sidebarCollapsed: !(state.settings.tabs || {}).sidebarCollapsed } });
(() => {
  const sb = $('#sidebar'); let peekT;
  sb.addEventListener('mouseenter', () => { if (sb.classList.contains('collapsed')) { clearTimeout(peekT); peekT = setTimeout(() => sb.classList.add('peek'), 250); } });
  sb.addEventListener('mouseleave', () => { clearTimeout(peekT); sb.classList.remove('peek'); });
  const h = $('#sb-resize');
  h.addEventListener('pointerdown', (e) => {
    if (sb.classList.contains('collapsed')) return;
    e.preventDefault(); h.setPointerCapture(e.pointerId); h.classList.add('drag');
    document.querySelectorAll('webview').forEach((w) => (w.style.pointerEvents = 'none'));
    let w = 240;
    const move = (ev) => { w = Math.min(420, Math.max(170, ev.clientX - sb.getBoundingClientRect().left)); sb.style.setProperty('--sbw', w + 'px'); };
    const up = () => { h.classList.remove('drag'); document.querySelectorAll('webview').forEach((x) => (x.style.pointerEvents = '')); h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); nb.invoke('settings:set', { tabs: { sidebarWidth: Math.round(w) } }); };
    h.addEventListener('pointermove', move); h.addEventListener('pointerup', up);
  });
})();
function toggleVertical() {
  const v = (state.settings.tabs || {}).layout === 'vertical' ? 'horizontal' : 'vertical';
  nb.invoke('settings:set', { tabs: { layout: v } });
  toast(v === 'vertical' ? 'Vertical tabs on' : 'Tabs back on top');
}

// ====================================================================== reader / PiP / translate / passwords buttons
hooks.loaded = async (tab) => {
  if (!tab.wcId || isInternal(tab.url) || !/^https?:/.test(tab.url)) { tab.readerable = false; if (tab === state.active) hooks.toolbar(tab); return; }
  const wcId = tab.wcId; const url = tab.url;
  const [readerable, tr, logins] = await Promise.all([
    nb.invoke('reader:check', wcId).catch(() => false),
    (state.settings.translate || {}).offer !== false ? nb.invoke('translate:detect', wcId).catch(() => null) : null,
    nb.invoke('passwords:for-tab', wcId).catch(() => []),
  ]);
  if (tab.url !== url) return;
  tab.readerable = !!readerable;
  tab.lang = tr && tr.lang || '';
  tab.offerTranslate = !!(tr && tr.lang && tr.target && tr.lang !== tr.target);
  tab.savedLogins = (logins || []).length;
  if (tab === state.active) hooks.toolbar(tab);
};
hooks.toolbar = (t) => {
  const reader = $('#reader-btn');
  const onReader = /^noam:\/\/reader\//.test(t.url);
  reader.hidden = !(t.readerable || onReader);
  reader.classList.toggle('on', onReader);
  reader.title = onReader ? 'Leave reader view (F9)' : 'Reader view (F9)';
  const tr = $('#translate-btn');
  tr.hidden = !(t.offerTranslate || t.translated);
  tr.classList.toggle('offer', !!t.offerTranslate && !t.translated);
  tr.classList.toggle('on', !!t.translated);
  $('#key-btn').hidden = !t.savedLogins;
  $('#pip-btn').hidden = !t.hasMedia;
  renderPwBar();
};
async function toggleReader() {
  const t = state.active; if (!t) return;
  if (/^noam:\/\/reader\//.test(t.url)) { if (t.wv.canGoBack()) t.wv.goBack(); return; }
  if (!t.wcId || !/^https?:/.test(t.url)) return;
  const url = await nb.invoke('reader:open', t.wcId);
  if (url) t.navigate(url); else toast('This page doesn’t have an article to show in reader view');
}
$('#reader-btn').onclick = toggleReader;

async function pip() {
  const t = state.active; if (!t) return;
  try {
    const r = await t.wv.executeJavaScript(`(async () => {
      if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return 'exit'; }
      const vids = [...document.querySelectorAll('video')].filter((v) => v.readyState > 0 && !v.disablePictureInPicture);
      if (!vids.length) return 'none';
      vids.sort((a, b) => (!b.paused - !a.paused) || (b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight));
      await vids[0].requestPictureInPicture(); return 'on';
    })()`, true);
    if (r === 'none') toast('No video on this page'); else $('#pip-btn').classList.toggle('on', r === 'on');
  } catch (e) { toast('This video doesn’t allow picture in picture'); }
}
$('#pip-btn').onclick = pip;

async function toggleDark() {
  const t = state.active; if (!t || !/^https?:/.test(t.url)) { toast('Dark mode works on websites'); return; }
  const on = await nb.invoke('dark:toggle', tabHost(t));
  toast(on ? 'Dark mode on for ' + tabHost(t).replace(/^www\./, '') : 'Dark mode off for ' + tabHost(t).replace(/^www\./, ''));
  t.wv.reload();
}
$('#sp-dark').onclick = async () => { closePanels(); await toggleDark(); };

// saved logins menu
$('#key-btn').onclick = async (e) => {
  const t = state.active; if (!t || !t.wcId) return;
  const list = await nb.invoke('passwords:for-tab', t.wcId);
  const r = $('#key-btn').getBoundingClientRect();
  const id = await popup([...list.map((c) => ({ id: 'fill:' + c.id, label: 'Fill ' + (c.username || '(no username)') })), { type: 'separator' }, { id: 'manage', label: 'Manage passwords' }], r.left, r.bottom + 4);
  if (!id) return;
  if (id === 'manage') newTab({ url: 'noam://passwords/' });
  else nb.invoke('passwords:fill', { wcId: t.wcId, id: id.slice(5) });
};

// password save bar
nb.on('password:offer', (o) => { state.pwOffers = state.pwOffers.filter((x) => x.wcId !== o.wcId); state.pwOffers.push(o); renderPwBar(); });
function renderPwBar() {
  const bar = $('#pw-bar');
  const t = state.active;
  const o = t && state.pwOffers.find((x) => x.wcId === t.wcId);
  if (!o) { bar.hidden = true; return; }
  let host = o.origin; try { host = new URL(o.origin).host; } catch {}
  bar.querySelector('.pb-text').innerHTML = o.kind === 'update'
    ? `Update the saved password for <b>${esc(o.username || host)}</b> on ${esc(host)}?`
    : `Save the password for <b>${esc(o.username || 'this account')}</b> on ${esc(host)}?`;
  bar.querySelector('[data-act="save"]').textContent = o.kind === 'update' ? 'Update' : 'Save';
  bar.dataset.id = o.id;
  bar.hidden = false;
}
$$('#pw-bar .btn').forEach((b) => (b.onclick = async () => {
  const bar = $('#pw-bar'); const id = bar.dataset.id;
  const act = b.dataset.act;
  state.pwOffers = state.pwOffers.filter((x) => x.id !== id);
  bar.hidden = true;
  if (act !== 'dismiss') {
    await nb.invoke('password:answer', { id, action: act });
    if (act === 'save') { toast('Password saved'); const t = state.active; if (t) { t.savedLogins = Math.max(1, t.savedLogins || 0); hooks.toolbar(t); } }
  }
}));

// ====================================================================== translate
const COMMON_LANGS = ['en', 'he', 'ar', 'ru', 'uk', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'cs', 'bg', 'et', 'is', 'nb', 'fa', 'tr', 'el', 'ja', 'ko', 'zh'];
const langName = (c) => { try { return new Intl.DisplayNames([navigator.language || 'en'], { type: 'language' }).of(c) || c; } catch { return c; } };
let trLangs = null;
hooks.translatePanel = async () => {
  const t = state.active; if (!t) return;
  const from = $('#tp-from'), to = $('#tp-to');
  if (!trLangs) {
    trLangs = await nb.invoke('translate:languages').catch(() => null);
  }
  const fromList = trLangs ? [...new Set([...trLangs.from, 'en'])] : COMMON_LANGS;
  const toList = trLangs ? [...new Set([...trLangs.to, 'en'])] : COMMON_LANGS;
  const opts = (list) => list.map((c) => [c, langName(c)]).sort((a, b) => a[1].localeCompare(b[1])).map(([c, n]) => `<option value="${c}">${esc(n)}</option>`).join('');
  from.innerHTML = opts(fromList); to.innerHTML = opts(toList);
  if (t.lang && fromList.includes(t.lang)) from.value = t.lang; else if (t.lang) { from.insertAdjacentHTML('afterbegin', `<option value="${esc(t.lang)}">${esc(langName(t.lang))}</option>`); from.value = t.lang; }
  to.value = (state.settings.translate || {}).target || 'en';
  if (from.value === to.value) to.value = from.value === 'en' ? 'he' : 'en';
  $('#tp-original').hidden = !t.translated;
  $('#tp-status').textContent = trLangs ? '' : 'Couldn’t load the language list — you may be offline.';
  $('#tp-status').classList.remove('err');
  $('#tp-progress').hidden = true;
};
$('#translate-btn').onclick = () => openPanel('translate');
$('#tp-swap').onclick = () => { const a = $('#tp-from').value; $('#tp-from').value = $('#tp-to').value || a; $('#tp-to').value = a; };
$('#tp-go').onclick = async () => {
  const t = state.active; if (!t || !t.wcId) return;
  const from = $('#tp-from').value, to = $('#tp-to').value;
  const st = $('#tp-status'); st.classList.remove('err');
  st.textContent = 'Getting the ' + langName(from) + ' → ' + langName(to) + ' model ready… (first time can take a minute)';
  $('#tp-progress').hidden = false; $('#tp-progress i').style.width = '3%';
  $('#tp-go').disabled = true;
  try {
    const r = await nb.invoke('translate:page', { wcId: t.wcId, from, to });
    if (r && r.ok) { t.translated = true; t.offerTranslate = false; st.textContent = `Translated to ${langName(to)}.`; $('#tp-original').hidden = false; hooks.toolbar(t); setTimeout(closePanels, 900); }
  } catch (e) {
    st.textContent = String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); st.classList.add('err');
  } finally { $('#tp-go').disabled = false; }
};
$('#tp-original').onclick = async () => {
  const t = state.active; if (!t) return;
  await nb.invoke('translate:restore', t.wcId);
  t.translated = false; t.offerTranslate = !!t.lang; hooks.toolbar(t); closePanels();
};
nb.on('translate:progress', ({ wcId, done, total }) => {
  if (state.active?.wcId !== wcId) return;
  $('#tp-progress i').style.width = Math.max(3, Math.round((done / total) * 100)) + '%';
  if (done > 0) $('#tp-status').textContent = `Translating… ${done} of ${total} parts`;
});

// ====================================================================== updates
function renderUpdate(u) {
  const b = $('#update-btn');
  state.update = u;
  if (!u) { b.hidden = true; return; }
  if (u.status === 'ready') { b.hidden = false; $('#update-label').textContent = 'Restart to update'; b.title = `NoamBrowser ${u.available} is ready — restart to install`; }
  else if (u.status === 'available' && !u.canAutoInstall) { b.hidden = false; $('#update-label').textContent = 'Update available'; b.title = `NoamBrowser ${u.available} is available — click to download`; }
  else b.hidden = true;
}
nb.on('update:status', renderUpdate);
$('#update-btn').onclick = () => nb.invoke('update:install');

// ====================================================================== command palette
const PAL = { open: false, items: [], sel: 0 };
const CMD = (id, label, keys, run, icn = 'cmd') => ({ kind: 'cmd', id, label, keys, run, icon: icn });
function commands() {
  const t = state.active;
  const set = (patch, msg) => () => { nb.invoke('settings:set', patch); if (msg) toast(msg); };
  const presets = [['default', 'Classic'], ['aurora', 'Aurora'], ['sunset', 'Sunset'], ['ocean', 'Ocean'], ['forest', 'Forest'], ['neon', 'Neon'], ['snow', 'Snow'], ['mono', 'Mono']];
  return [
    CMD('newtab', 'New tab', 'Ctrl+T', () => newTab({ url: NEWTAB }), 'plus'),
    CMD('private', 'New private tab', 'Ctrl+Shift+N', () => newTab({ url: NEWTAB, private: true }), 'mask'),
    CMD('window', 'New window', 'Ctrl+N', () => nb.invoke('window:new')),
    CMD('reopen', 'Reopen closed tab', 'Ctrl+Shift+T', () => shortcut({ key: 't', ctrl: true, shift: true })),
    CMD('close', 'Close tab', 'Ctrl+W', () => t && closeTab(t), 'close'),
    CMD('reader', 'Reader view', 'F9', toggleReader, 'book'),
    CMD('translate', 'Translate page', '', () => { $('#translate-btn').hidden = false; openPanel('translate'); }, 'translate'),
    CMD('dark', 'Dark mode for this site', '', toggleDark, 'moon'),
    CMD('split', state.split ? 'Close split view' : 'Split view', 'Ctrl+Shift+S', hooks.splitToggle, 'split'),
    CMD('vertical', (state.settings.tabs || {}).layout === 'vertical' ? 'Tabs on top' : 'Vertical tabs', '', toggleVertical, 'sidebar'),
    CMD('group', 'Add tab to new group', '', () => t && addToGroup(t, null)),
    CMD('pip', 'Picture in picture', '', pip, 'pip'),
    CMD('shot', 'Take screenshot', '', () => shortcut({ key: 'screenshot' })),
    CMD('bookmark', 'Bookmark this page', 'Ctrl+D', () => $('#star').click(), 'star'),
    CMD('vpn', state.vpn.wantOn ? 'Turn VPN off' : 'Turn VPN on', '', () => nb.invoke('vpn:toggle'), 'bolt'),
    CMD('shields', 'Shields on/off for this site', '', () => $('#sp-toggle').click(), 'shield'),
    CMD('find', 'Find in page', 'Ctrl+F', openFind, 'search'),
    CMD('print', 'Print', 'Ctrl+P', () => t && t.wv.print()),
    CMD('history', 'History', 'Ctrl+H', () => newTab({ url: 'noam://history/' })),
    CMD('downloads', 'Downloads', 'Ctrl+J', () => newTab({ url: 'noam://downloads/' }), 'download'),
    CMD('bookmarks', 'Bookmarks', '', () => newTab({ url: 'noam://bookmarks/' }), 'star'),
    CMD('passwords', 'Passwords', '', () => newTab({ url: 'noam://passwords/' }), 'key'),
    CMD('settings', 'Settings', 'Ctrl+,', () => newTab({ url: 'noam://settings/' })),
    CMD('appearance', 'Appearance settings', '', () => newTab({ url: 'noam://settings/#appearance' })),
    CMD('import', 'Import from Chrome, Edge or Brave', '', () => newTab({ url: 'noam://settings/#import' })),
    CMD('sync', 'Sync settings', '', () => newTab({ url: 'noam://settings/#sync' })),
    CMD('updates', 'Check for updates', '', () => newTab({ url: 'noam://settings/#about' }), 'update'),
    CMD('clear', 'Clear browsing data', '', () => newTab({ url: 'noam://settings/#privacy' })),
    CMD('glass', (state.settings.appearance || {}).liquidGlass ? 'Turn Liquid Glass off' : 'Turn Liquid Glass on', '', set({ appearance: { liquidGlass: !(state.settings.appearance || {}).liquidGlass } })),
    ...presets.map(([k, n]) => CMD('theme-' + k, 'Theme: ' + n, '', set({ appearance: { preset: k } }, 'Theme: ' + n))),
    CMD('zoomin', 'Zoom in', 'Ctrl+=', () => setZoom((t?.zoom || 0) + 0.5)),
    CMD('zoomout', 'Zoom out', 'Ctrl+-', () => setZoom((t?.zoom || 0) - 0.5)),
    CMD('zoomreset', 'Reset zoom', 'Ctrl+0', () => setZoom(0)),
    CMD('fullscreen', 'Full screen', 'F11', () => nb.invoke('window:control', 'fullscreen')),
    CMD('devtools', 'Developer tools', 'F12', () => t && (t.wv.isDevToolsOpened() ? t.wv.closeDevTools() : t.wv.openDevTools())),
  ];
}
function score(text, q) {
  text = text.toLowerCase(); q = q.toLowerCase();
  if (!q) return 1;
  const i = text.indexOf(q);
  if (i === 0) return 100 - text.length * 0.1;
  if (i > 0) return (/[\s/.\-:]/.test(text[i - 1]) ? 80 : 60) - i * 0.2;
  let ti = 0, s = 0, run = 0;
  for (const ch of q) { const j = text.indexOf(ch, ti); if (j < 0) return 0; run = j === ti ? run + 1 : 0; s += 1 + run; ti = j + 1; }
  return Math.min(40, s);
}
function hl(text, q) {
  if (!q) return esc(text);
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  return i < 0 ? esc(text) : esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
}
async function palSearch() {
  const q = $('#pal-q').value.trim();
  const tabs = state.tabs.filter((t) => t !== state.active).map((t) => ({ kind: 'tab', label: t.title || t.url, sub: t.url.replace(/^https?:\/\//, ''), tab: t, fav: t.favicon, s: Math.max(score(t.title || '', q), score(t.url, q) * 0.8) })).filter((x) => x.s > 0);
  const cmds = commands().map((c) => ({ ...c, s: score(c.label, q) })).filter((c) => c.s > 0);
  let web = [];
  if (q) {
    const res = await nb.invoke('ui:suggest', q).catch(() => []);
    if ($('#pal-q').value.trim() !== q) return;
    web = res.map((r) => ({ kind: r.kind === 'bookmark' ? 'bookmark' : 'history', label: r.title || r.url, sub: r.url.replace(/^https?:\/\//, ''), url: r.url, fav: r.favicon, s: 50 }));
    web.push({ kind: 'search', label: `Search for “${q}”`, sub: (state.engines[state.settings.searchEngine] || {}).name || '', q, s: 1 });
  }
  tabs.sort((a, b) => b.s - a.s); cmds.sort((a, b) => b.s - a.s);
  const sections = q
    ? [['Commands', cmds.slice(0, 6)], ['Open tabs', tabs.slice(0, 6)], ['Bookmarks & history', web.filter((w) => w.kind !== 'search').slice(0, 6)], ['Search', web.filter((w) => w.kind === 'search')]]
    : [['Open tabs', tabs.slice(0, 8)], ['Commands', cmds.slice(0, 12)]];
  // if a command is a much better match than tabs, keep commands first; otherwise tabs first
  if (q && tabs[0] && (!cmds[0] || tabs[0].s > cmds[0].s)) { const [c, tb] = [sections[0], sections[1]]; sections[0] = tb; sections[1] = c; }
  PAL.items = []; let html = '';
  for (const [name, list] of sections) {
    if (!list.length) continue;
    html += `<div class="pal-sec">${esc(name)}</div>`;
    for (const it of list) {
      const i = PAL.items.push(it) - 1;
      const ic = it.kind === 'cmd' ? icon(it.icon || 'cmd') : it.fav ? `<img src="${esc(it.fav)}" alt="" data-drop>` : icon(it.kind === 'bookmark' ? 'star' : it.kind === 'search' ? 'search' : 'globe');
      html += `<div class="pal-item" data-i="${i}" role="option"><span class="ic">${ic}</span><span class="t">${hl(it.label, q)}</span>${it.sub ? `<span class="u">${esc(it.sub)}</span>` : ''}${it.keys ? `<span class="k">${esc(it.keys)}</span>` : ''}</div>`;
    }
  }
  $('#pal-list').innerHTML = html || '<div class="pal-empty">Nothing matches. Press Enter to search the web.</div>';
  PAL.sel = 0; palSel();
  $$('.pal-item').forEach((el) => {
    el.onmousemove = () => { PAL.sel = +el.dataset.i; palSel(); };
    el.onclick = () => palRun(PAL.items[+el.dataset.i]);
  });
}
function palSel() { $$('.pal-item').forEach((el) => el.classList.toggle('sel', +el.dataset.i === PAL.sel)); const s = $('.pal-item.sel'); if (s) s.scrollIntoView({ block: 'nearest' }); }
function palClose() { $('#palette').hidden = true; PAL.open = false; state.active && state.active.wv.focus(); }
async function palRun(it) {
  const q = $('#pal-q').value.trim();
  palClose();
  if (!it) { if (q) go(q); return; }
  if (it.kind === 'cmd') it.run();
  else if (it.kind === 'tab') activate(it.tab);
  else if (it.kind === 'search') go(it.q);
  else if (it.url) state.active.navigate(it.url);
}
hooks.palette = () => {
  if (PAL.open) { palClose(); return; }
  closePanels(); closeSuggest();
  PAL.open = true; $('#palette').hidden = false;
  const q = $('#pal-q'); q.value = ''; q.focus(); palSearch();
};
$('#pal-q').addEventListener('input', palSearch);
$('#pal-q').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); PAL.sel = Math.min(PAL.items.length - 1, PAL.sel + 1); palSel(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); PAL.sel = Math.max(0, PAL.sel - 1); palSel(); }
  else if (e.key === 'Enter') { e.preventDefault(); palRun(PAL.items[PAL.sel]); }
  else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); palClose(); }
});
$('#palette').addEventListener('mousedown', (e) => { if (e.target.id === 'palette') palClose(); });

// ====================================================================== shortcuts
hooks.shortcut = (key, { ctrl, shift }) => {
  if (key === 'f9' || key === 'reader') { toggleReader(); return true; }
  if (key === 'translate') { $('#translate-btn').hidden = false; openPanel('translate'); return true; }
  if (key === 'dark') { toggleDark(); return true; }
  if (key === 'vertical') { toggleVertical(); return true; }
  if (key === 'escape' && PAL.open) { palClose(); return true; }
  return false;
};

// ====================================================================== init
hooks.init = async () => {
  applyLayout();
  renderGroups();
  layoutTabs();
  renderUpdate(await nb.invoke('update:status').catch(() => null));
};
