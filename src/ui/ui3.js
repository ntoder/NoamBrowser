// NoamBrowser 2.1 — workspaces, side panels (notes, reading list, web apps,
// calculator), media controls, screenshots, omnibox calculator, gestures,
// sessions.
'use strict';
const WS_COLORS = ['#7C68FA', '#3E8DEB', '#14A89B', '#3FAE5A', '#D9A21B', '#EE7A2E', '#E5484D', '#E055A3'];
state.wsLast = {};
state.sessions = [];

// ====================================================================== small text dialog (Electron has no window.prompt)
function askText(title, value = '', placeholder = '') {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'ask';
    wrap.innerHTML = `<div class="ask-box"><h3></h3><input spellcheck="false"><div class="ask-acts"><button class="btn ghost" data-a="no">Cancel</button><button class="btn primary" data-a="ok">OK</button></div></div>`;
    wrap.querySelector('h3').textContent = title;
    const inp = wrap.querySelector('input'); inp.value = value; inp.placeholder = placeholder;
    document.body.appendChild(wrap); inp.focus(); inp.select();
    const done = (v) => { wrap.remove(); resolve(v); };
    wrap.querySelector('[data-a=ok]').onclick = () => done(inp.value.trim() || null);
    wrap.querySelector('[data-a=no]').onclick = () => done(null);
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') done(inp.value.trim() || null); if (e.key === 'Escape') done(null); };
    wrap.onmousedown = (e) => { if (e.target === wrap) done(null); };
  });
}

// ====================================================================== workspaces
const workspaces = () => { const w = (state.settings.tabs || {}).workspaces; return w && w.length ? w : [{ id: 'default', name: 'Personal', color: WS_COLORS[0] }]; };
const saveWorkspaces = (list, activeWs) => nb.invoke('settings:set', { tabs: { workspaces: list, ...(activeWs ? { activeWs } : {}) } });
function applyWs() {
  const ws = workspaces();
  if (!ws.some((w) => w.id === state.ws)) state.ws = ws[0].id;
  const cur = ws.find((w) => w.id === state.ws);
  for (const t of state.tabs) t.el.classList.toggle('ws-hidden', t.ws !== state.ws);
  $('#ws-name').textContent = cur.name;
  $('#ws-btn').style.setProperty('--wc', cur.color);
  $('#ws-btn').classList.toggle('single', ws.length < 2);
  $('#ws-btn').title = `Workspace: ${cur.name} — click to switch`;
  renderGroups(); layoutTabs();
}
function switchWs(id) {
  if (id === state.ws) return;
  if (state.active) state.wsLast[state.ws] = state.active;
  if (state.split) { state.split = null; applySplit(); }
  state.ws = id;
  nb.invoke('settings:set', { tabs: { activeWs: id } });
  applyWs();
  const last = state.wsLast[id];
  const list = visibleTabs();
  if (last && state.tabs.includes(last) && last.ws === id) activate(last);
  else if (list.length) activate(list[list.length - 1]);
  else newTab({ url: NEWTAB, ws: id });
  const cur = workspaces().find((w) => w.id === id);
  toast('Workspace: ' + (cur ? cur.name : ''));
  saveSession();
}
hooks.emptyWorkspace = (ws) => newTab({ url: NEWTAB, ws });
async function wsMenu(x, y) {
  const ws = workspaces();
  const others = ws.filter((w) => w.id !== state.ws);
  const items = [
    ...ws.map((w, i) => ({ id: 'go:' + w.id, label: `${w.name}${i < 9 ? `   (Ctrl+Alt+${i + 1})` : ''}`, type: 'checkbox', checked: w.id === state.ws })),
    { type: 'separator' },
    { id: 'new', label: 'New workspace…' },
    { id: 'rename', label: 'Rename this workspace…' },
    { label: 'Color', submenu: WS_COLORS.map((c, i) => ({ id: 'color:' + c, label: ['Violet', 'Blue', 'Teal', 'Green', 'Yellow', 'Orange', 'Red', 'Pink'][i], type: 'checkbox', checked: ws.find((w) => w.id === state.ws).color === c })) },
  ];
  if (others.length && state.active) items.push({ label: 'Move this tab to', submenu: others.map((w) => ({ id: 'move:' + w.id, label: w.name })) });
  if (ws.length > 1) items.push({ type: 'separator' }, { id: 'delete', label: 'Delete this workspace…' });
  const id = await popup(items, x, y);
  if (!id) return;
  if (id.startsWith('go:')) switchWs(id.slice(3));
  else if (id === 'new') {
    const name = await askText('Name the new workspace', '', 'e.g. School, Coding, Shopping'); if (!name) return;
    const w = { id: 'w' + Date.now().toString(36), name: name.slice(0, 30), color: WS_COLORS[ws.length % WS_COLORS.length] };
    await saveWorkspaces([...ws, w]); state.settings.tabs = { ...(state.settings.tabs || {}), workspaces: [...ws, w] };
    switchWs(w.id);
  } else if (id === 'rename') {
    const cur = ws.find((w) => w.id === state.ws);
    const name = await askText('Rename workspace', cur.name); if (!name) return;
    cur.name = name.slice(0, 30); await saveWorkspaces(ws); applyWs();
  } else if (id.startsWith('color:')) { ws.find((w) => w.id === state.ws).color = id.slice(6); await saveWorkspaces(ws); applyWs(); }
  else if (id.startsWith('move:')) {
    const t = state.active; const target = id.slice(5);
    t.ws = target; t.groupId = null; t.render();
    const left = visibleTabs();
    if (left.length) activate(left[left.length - 1]); else newTab({ url: NEWTAB });
    applyWs(); saveSession();
    toast('Moved to ' + ws.find((w) => w.id === target).name);
  } else if (id === 'delete') {
    const cur = ws.find((w) => w.id === state.ws);
    const n = visibleTabs().length;
    if (!confirm(`Delete the “${cur.name}” workspace${n ? ` and close its ${n} tab${n === 1 ? '' : 's'}` : ''}?`)) return;
    const rest = ws.filter((w) => w.id !== cur.id);
    const doomed = visibleTabs();
    state.ws = rest[0].id;
    await saveWorkspaces(rest, rest[0].id);
    state.settings.tabs = { ...(state.settings.tabs || {}), workspaces: rest, activeWs: rest[0].id };
    applyWs();
    const list = visibleTabs(); if (list.length) activate(list[list.length - 1]); else newTab({ url: NEWTAB });
    doomed.forEach((t) => closeTab(t));
  }
}
$('#ws-btn').onclick = () => { const r = $('#ws-btn').getBoundingClientRect(); wsMenu(r.left, r.bottom + 4); };

// ====================================================================== right side panel
const panels = () => ((state.settings.sidePanel || {}).panels || []);
const PANEL_ICON = { notes: 'note', reading: 'reading', calc: 'calc', web: 'globe', ambient: 'music' };
const webPanels = new Map(); // id -> webview (kept alive so chats stay signed in and loaded)
let openPanelId = null;
function renderRail() {
  const sp = state.settings.sidePanel || {};
  const rail = $('#rail');
  rail.hidden = sp.show === false;
  rail.innerHTML = panels().map((p) => {
    const host = p.kind === 'web' ? hostOf(p.url) : '';
    const fav = host ? `<img src="https://${esc(host)}/favicon.ico" alt="" data-drop>` : '';
    return `<button class="rail-btn${openPanelId === p.id ? ' on' : ''}" data-id="${esc(p.id)}" title="${esc(p.name)}">${fav || icon(PANEL_ICON[p.kind] || 'globe')}${p.kind === 'web' ? icon('globe') : ''}<i class="dot" hidden></i></button>`;
  }).join('') + `<button class="rail-btn add" id="rail-add" title="Add a web panel">${icon('plus')}</button>`;
  $$('.rail-btn[data-id]').forEach((b) => {
    b.onclick = () => togglePanel(b.dataset.id);
    b.oncontextmenu = (e) => { e.preventDefault(); panelMenu(b.dataset.id, e); };
    const img = b.querySelector('img'); if (img) { const fallback = b.querySelectorAll('svg')[0]; if (fallback) fallback.style.display = 'none'; img.onerror = () => { img.remove(); if (fallback) fallback.style.display = ''; }; }
  });
  $('#rail-add').onclick = addWebPanel;
  updateNotesDot();
}
async function addWebPanel() {
  let url = await askText('Add a web panel — type an address', 'https://', 'e.g. https://calendar.google.com'); if (!url) return;
  if (!/^https?:\/\//.test(url)) url = 'https://' + url;
  let host; try { host = new URL(url).hostname; } catch { toast('That address doesn’t look right'); return; }
  const name = host.replace(/^www\./, '').split('.')[0];
  const p = { id: 'p' + Date.now().toString(36), kind: 'web', name: name.charAt(0).toUpperCase() + name.slice(1), url };
  await nb.invoke('settings:set', { sidePanel: { panels: [...panels(), p] } });
  openSide(p.id);
}
async function panelMenu(id, e) {
  const p = panels().find((x) => x.id === id); if (!p) return;
  const items = [{ id: 'open', label: openPanelId === id ? 'Close panel' : 'Open panel' }];
  if (p.kind === 'web') items.push({ id: 'home', label: 'Go to start page' }, { id: 'reload', label: 'Reload' }, { id: 'rename', label: 'Rename…' });
  items.push({ type: 'separator' }, { id: 'remove', label: 'Remove from sidebar' });
  const a = await popup(items, e.clientX, e.clientY);
  if (a === 'open') togglePanel(id);
  else if (a === 'home') webPanels.get(id)?.loadURL(p.url);
  else if (a === 'reload') webPanels.get(id)?.reload();
  else if (a === 'rename') { const n = await askText('Panel name', p.name); if (n) nb.invoke('settings:set', { sidePanel: { panels: panels().map((x) => (x.id === id ? { ...x, name: n } : x)) } }); }
  else if (a === 'remove') { if (openPanelId === id) closeSide(); const wv = webPanels.get(id); if (wv) { wv.remove(); webPanels.delete(id); } nb.invoke('settings:set', { sidePanel: { panels: panels().filter((x) => x.id !== id) } }); }
}
const BUILTIN_PANELS = { notes: { id: 'notes', kind: 'notes', name: 'Notes' }, reading: { id: 'reading', kind: 'reading', name: 'Reading list' }, calc: { id: 'calc', kind: 'calc', name: 'Calculator' }, ambient: { id: 'ambient', kind: 'ambient', name: 'Music & sounds' } };
async function openKind(kind) {
  let p = panels().find((x) => x.kind === kind);
  if (!p) { p = BUILTIN_PANELS[kind]; const s = await nb.invoke('settings:set', { sidePanel: { panels: [...panels(), p] } }); state.settings = s; }
  if (openPanelId === p.id) { const body = $('#rp-body'); if (kind === 'reading') renderReadingPanel(body); return; }
  openSide(p.id);
}
function togglePanel(id) { if (openPanelId === id) closeSide(); else openSide(id); }
function closeSide() { openPanelId = null; $('#rpanel').hidden = true; for (const wv of webPanels.values()) wv.classList.remove('on'); renderRail(); }
function openSide(id) {
  const p = panels().find((x) => x.id === id); if (!p) return;
  openPanelId = id;
  const rp = $('#rpanel'); rp.hidden = false;
  rp.style.setProperty('--rpw', ((state.settings.sidePanel || {}).width || 380) + 'px');
  $('#rp-title').textContent = p.name;
  $('#rp-pop').hidden = p.kind !== 'web';
  $('#rp-zoom').hidden = p.kind !== 'web';
  $('#rp-zval').textContent = Math.round(panelZoom(p) * 100) + '%';
  const body = $('#rp-body');
  for (const wv of webPanels.values()) wv.classList.remove('on');
  [...body.children].forEach((c) => { if (c.tagName !== 'WEBVIEW') c.remove(); });
  if (p.kind === 'web') {
    let wv = webPanels.get(id);
    if (!wv) {
      wv = document.createElement('webview');
      wv.setAttribute('partition', state.paths.mainPartition);
      wv.setAttribute('allowpopups', '');
      wv.setAttribute('webpreferences', 'contextIsolation=yes,sandbox=yes,spellcheck=yes');
      wv.setAttribute('src', p.url);
      wv.className = 'rp-web';
      wv.addEventListener('dom-ready', () => { try { wv.setZoomFactor(panelZoom(panels().find((x) => x.id === id) || p)); } catch {} });
      body.appendChild(wv); webPanels.set(id, wv);
    }
    wv.classList.add('on');
  } else if (p.kind === 'notes') renderNotesPanel(body);
  else if (p.kind === 'reading') renderReadingPanel(body);
  else if (p.kind === 'calc') renderCalcPanel(body);
  else if (p.kind === 'ambient' && window.renderAmbientPanel) window.renderAmbientPanel(body);
  renderRail();
}
$('#rp-close').onclick = closeSide;
// Web panels are narrow, so pages load a little zoomed out (WhatsApp's QR code and chats need the room)
function panelZoom(p) { return p && p.zoom ? p.zoom : 0.85; }
async function setPanelZoom(delta) {
  const p = panels().find((x) => x.id === openPanelId); if (!p || p.kind !== 'web') return;
  const z = Math.round(Math.min(1.5, Math.max(0.5, panelZoom(p) + delta)) * 100) / 100;
  const wv = webPanels.get(p.id); try { wv && wv.setZoomFactor(z); } catch {}
  $('#rp-zval').textContent = Math.round(z * 100) + '%';
  await nb.invoke('settings:set', { sidePanel: { panels: panels().map((x) => (x.id === p.id ? { ...x, zoom: z } : x)) } });
}
$('#rp-zout').onclick = () => setPanelZoom(-0.1);
$('#rp-zin').onclick = () => setPanelZoom(0.1);
// A QR code in a panel (e.g. linking WhatsApp): offer a bigger view
nb.on('qr:state', ({ wcId, on }) => {
  const p = panels().find((x) => x.id === openPanelId); const wv = p && webPanels.get(p.id);
  let mine = false; try { mine = wv && wv.getWebContentsId() === wcId; } catch {}
  if (!mine) return;
  let tip = $('#rp-qrtip');
  if (!on) { if (tip) tip.remove(); return; }
  if (!tip) { tip = document.createElement('div'); tip.id = 'rp-qrtip'; tip.className = 'rp-qrtip'; $('#rpanel').insertBefore(tip, $('#rp-body')); }
  tip.innerHTML = '<span>📷 Scanning a QR code? It’s easier in a full tab.</span><button class="btn primary" id="rp-qrbig">Open bigger</button>';
  $('#rp-qrbig').onclick = () => { tip.remove(); newTab({ url: (wv.getURL && wv.getURL()) || p.url }); };
});
$('#rp-pop').onclick = () => { const p = panels().find((x) => x.id === openPanelId); const wv = webPanels.get(openPanelId); if (p) newTab({ url: (wv && wv.getURL && wv.getURL()) || p.url }); };
(() => {
  const h = $('#rp-resize'), rp = $('#rpanel');
  h.addEventListener('pointerdown', (e) => {
    e.preventDefault(); h.setPointerCapture(e.pointerId); h.classList.add('drag');
    document.querySelectorAll('webview').forEach((w) => (w.style.pointerEvents = 'none'));
    let w = rp.offsetWidth;
    const move = (ev) => { w = Math.min(760, Math.max(280, rp.getBoundingClientRect().right - ev.clientX)); rp.style.setProperty('--rpw', w + 'px'); };
    const up = () => { h.classList.remove('drag'); document.querySelectorAll('webview').forEach((x) => (x.style.pointerEvents = '')); h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); nb.invoke('settings:set', { sidePanel: { width: Math.round(w) } }); };
    h.addEventListener('pointermove', move); h.addEventListener('pointerup', up);
  });
})();

// ---- notes panel (follows the current site)
let noteTimer = null;
async function renderNotesPanel(body) {
  const t = state.active;
  const n = t && /^https?:/.test(t.url) ? await nb.invoke('notes:get', t.url) : null;
  const all = await nb.invoke('notes:all');
  if (!panels().some((p) => p.id === openPanelId && p.kind === 'notes')) return;
  [...body.children].forEach((c) => { if (c.tagName !== 'WEBVIEW') c.remove(); });
  const div = document.createElement('div'); div.className = 'rp-notes';
  if (!n) div.innerHTML = `<p class="rp-empty">Open a website to write notes for it. Notes come back whenever you visit that site again.</p>`;
  else {
    div.innerHTML = `<div class="rp-site">Notes for <b></b></div><textarea placeholder="Write anything about this site — they’re saved automatically, and sync if Sync is on."></textarea><div class="rp-saved"></div>`;
    div.querySelector('b').textContent = n.site;
    const ta = div.querySelector('textarea'); ta.value = n.text || '';
    ta.oninput = () => { clearTimeout(noteTimer); div.querySelector('.rp-saved').textContent = 'Saving…'; noteTimer = setTimeout(async () => { await nb.invoke('notes:set', { url: t.url, text: ta.value }); div.querySelector('.rp-saved').textContent = 'Saved'; updateNotesDot(); }, 500); };
    ta.onkeydown = (e) => e.stopPropagation();
  }
  const others = all.filter((x) => !n || x.site !== n.site).slice(0, 30);
  if (others.length) {
    const h = document.createElement('div'); h.className = 'rp-sub'; h.textContent = 'Other sites with notes';
    const ul = document.createElement('ul'); ul.className = 'rp-list';
    for (const o of others) { const li = document.createElement('li'); li.innerHTML = `<b></b><span></span>`; li.querySelector('b').textContent = o.site; li.querySelector('span').textContent = o.text.slice(0, 80); li.onclick = () => state.active.navigate('https://' + o.site + '/'); ul.appendChild(li); }
    div.append(h, ul);
  }
  body.appendChild(div);
}
async function updateNotesDot() {
  const t = state.active; const np = panels().find((p) => p.kind === 'notes'); const dot = np && $(`.rail-btn[data-id="${CSS.escape(np.id)}"] .dot`); if (!dot) return;
  const n = t && /^https?:/.test(t.url) ? await nb.invoke('notes:get', t.url).catch(() => null) : null;
  dot.hidden = !(n && n.text);
}

// ---- reading list panel
let rlFilter = 'unread';
async function renderReadingPanel(body) {
  const list = await nb.invoke('reading:list');
  [...body.children].forEach((c) => { if (c.tagName !== 'WEBVIEW') c.remove(); });
  const div = document.createElement('div'); div.className = 'rp-reading';
  const t = state.active; const canAdd = t && /^https?:/.test(t.url);
  const shown = list.filter((x) => rlFilter === 'all' || !x.read);
  div.innerHTML = `<div class="rp-tools"><button class="btn primary" id="rl-add" ${canAdd ? '' : 'disabled'}>Add this page</button><div class="seg2"><button data-f="unread" class="${rlFilter === 'unread' ? 'on' : ''}">Unread</button><button data-f="all" class="${rlFilter === 'all' ? 'on' : ''}">All</button></div></div>`
    + (shown.length ? `<ul class="rp-list rl">${shown.map((x) => `<li data-id="${esc(x.id)}" class="${x.read ? 'read' : ''}"><span class="fav">${x.favicon ? `<img src="${esc(x.favicon)}" alt="" data-drop>` : icon('globe')}</span><span class="txt"><b></b><span></span></span><button class="icon-btn small" data-a="read" title="${x.read ? 'Mark unread' : 'Mark read'}">${x.read ? '↺' : '✓'}</button><button class="icon-btn small" data-a="rm" title="Remove">${icon('close')}</button></li>`).join('')}</ul>`
      : `<p class="rp-empty">${list.length ? 'You’ve read everything. 🎉' : 'Save pages to read later with the bookmark-plus button in the address bar.'}</p>`);
  body.appendChild(div);
  $$('.rp-reading li[data-id]').forEach((li, i) => {
    const x = shown[i];
    li.querySelector('b').textContent = x.title; li.querySelector('.txt > span').textContent = hostOf(x.url).replace(/^www\./, '');
    li.onclick = (e) => { if (e.target.closest('button')) return; state.active.navigate(x.url); nb.invoke('reading:read', { id: x.id, read: true }); };
    li.querySelector('[data-a=read]').onclick = () => nb.invoke('reading:read', { id: x.id, read: !x.read });
    li.querySelector('[data-a=rm]').onclick = () => nb.invoke('reading:remove', x.id);
  });
  $('#rl-add').onclick = async () => { const tt = state.active; await nb.invoke('reading:add', { url: tt.url, title: tt.title, favicon: tt.favicon }); toast('Added to reading list'); };
  $$('.rp-reading [data-f]').forEach((b) => (b.onclick = () => { rlFilter = b.dataset.f; renderReadingPanel(body); }));
}

// ---- calculator panel
const calcHistory = [];
function renderCalcPanel(body) {
  [...body.children].forEach((c) => { if (c.tagName !== 'WEBVIEW') c.remove(); });
  const div = document.createElement('div'); div.className = 'rp-calc';
  const keys = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '%', '0', '.', '='];
  div.innerHTML = `<input class="calc-in" placeholder="Type a sum or 10 km in miles" spellcheck="false"><div class="calc-out">0</div><div class="calc-keys">${keys.map((k) => `<button data-k="${k}" class="${k === '=' ? 'eq' : /[÷×−+]/.test(k) ? 'op' : ''}">${k}</button>`).join('')}</div><ul class="calc-hist"></ul>`;
  body.appendChild(div);
  const inp = div.querySelector('.calc-in'), out = div.querySelector('.calc-out'), hist = div.querySelector('.calc-hist');
  const drawHist = () => { hist.innerHTML = calcHistory.slice(0, 12).map((h) => `<li><span>${esc(h.q)}</span><b>${esc(h.a)}</b></li>`).join(''); $$('.calc-hist li', div).forEach((li, i) => (li.onclick = () => { inp.value = calcHistory[i].a.replace(/,/g, ''); live(); inp.focus(); })); };
  const live = async () => { const r = await hooks.calc(inp.value.includes(' in ') || inp.value.includes(' to ') ? inp.value : inp.value || '0', true); out.textContent = r ? r.value : inp.value ? '…' : '0'; return r; };
  const commit = async () => { const r = await live(); if (r && inp.value.trim()) { calcHistory.unshift({ q: inp.value.trim(), a: r.value }); drawHist(); inp.value = r.value.replace(/,/g, ''); } };
  inp.oninput = live;
  inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') commit(); if (e.key === 'Escape') inp.value = '', live(); };
  $$('.calc-keys button', div).forEach((b) => (b.onclick = () => { const k = b.dataset.k; if (k === 'C') inp.value = ''; else if (k === '=') return commit(); else inp.value += k; live(); inp.focus(); }));
  drawHist(); setTimeout(() => inp.focus(), 50);
}

// ====================================================================== calculator in the address bar
const ratesCache = new Map();
hooks.calc = async (q, force) => {
  const C = window.NoamCalc; if (!C) return null;
  let r = force ? (C.compute(q) || (() => { const v = C.evaluate(q.replace(/^=/, '')); return v === null ? null : { text: q + ' = ' + C.fmt(v), value: C.fmt(v), kind: 'math' }; })()) : C.compute(q);
  if (r && r.needRates) {
    let rates = ratesCache.get(r.needRates);
    if (!rates) { try { rates = await nb.invoke('rates:get', r.needRates); ratesCache.set(r.needRates, rates); setTimeout(() => ratesCache.delete(r.needRates), 3600000); } catch { return null; } }
    r = C.compute(q, rates);
  }
  return r && r.text ? r : null;
};

// ====================================================================== media controls
function mediaTabs() { return state.tabs.filter((t) => t.hasMedia && t.wcId); }
function renderMediaBtn() {
  const any = mediaTabs();
  const btn = $('#media-btn');
  btn.hidden = !any.length;
  btn.classList.toggle('playing', state.tabs.some((t) => t.audible));
}
setInterval(renderMediaBtn, 1500);
const MEDIA_STATE = `(() => { const m = [...document.querySelectorAll('video,audio')].filter((x) => x.readyState > 0); if (!m.length) return null; const v = m.find((x) => !x.paused) || m[0]; return { playing: m.some((x) => !x.paused), rate: v.playbackRate, muted: v.muted, boost: window.__noamBoost || 1, title: navigator.mediaSession && navigator.mediaSession.metadata ? navigator.mediaSession.metadata.title : '' }; })()`;
const BOOST = (gain) => `(() => {
  const gain = ${+gain};
  window.__noamBoost = gain;
  if (!window.__noamAC) { if (gain <= 1) return 'ok'; window.__noamAC = new AudioContext(); window.__noamGains = new WeakMap(); }
  const ac = window.__noamAC; let boosted = 0, blocked = 0;
  for (const m of document.querySelectorAll('video,audio')) {
    let g = window.__noamGains.get(m);
    if (!g) {
      const src = m.currentSrc || '';
      const ok = !src || src.startsWith('blob:') || src.startsWith('data:') || new URL(src, location.href).origin === location.origin || m.crossOrigin;
      if (!ok) { blocked++; continue; }
      const node = ac.createMediaElementSource(m); g = ac.createGain(); node.connect(g).connect(ac.destination); window.__noamGains.set(m, g);
    }
    g.gain.value = gain; boosted++;
  }
  ac.resume();
  return blocked && !boosted ? 'blocked' : 'ok';
})()`;
async function renderMediaPanel() {
  const list = $('#media-list');
  const tabs = mediaTabs();
  const states = await Promise.all(tabs.map((t) => t.wv.executeJavaScript(MEDIA_STATE).catch(() => null)));
  const rows = tabs.map((t, i) => [t, states[i]]).filter(([, st]) => st);
  if (!rows.length) { list.innerHTML = '<p class="muted-p">Nothing is playing.</p>'; return; }
  list.innerHTML = rows.map(([t, st], i) => `<div class="m-row" data-i="${i}">
    <div class="m-top"><span class="fav">${t.favicon ? `<img src="${esc(t.favicon)}" alt="" data-drop>` : icon('globe')}</span><span class="m-title"></span>
      <button class="icon-btn small" data-a="play" title="${st.playing ? 'Pause' : 'Play'}">${icon(st.playing ? 'pause' : 'play')}</button>
      <button class="icon-btn small" data-a="mute" title="${t.muted ? 'Unmute' : 'Mute'}">${icon(t.muted ? 'muted' : 'speaker')}</button>
      <button class="icon-btn small" data-a="go" title="Show tab">${icon('fwd')}</button></div>
    <div class="m-ctl"><label>Speed <select data-a="rate">${[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4].map((r) => `<option value="${r}" ${Math.abs(r - st.rate) < 0.01 ? 'selected' : ''}>${r}×</option>`).join('')}</select></label>
    <label class="boost">Volume <input type="range" min="100" max="300" step="10" value="${Math.round((st.boost || 1) * 100)}" data-a="boost"><output>${Math.round((st.boost || 1) * 100)}%</output></label></div></div>`).join('');
  $$('#media-list .m-row').forEach((row) => {
    const [t, st] = rows[+row.dataset.i];
    row.querySelector('.m-title').textContent = st.title || t.title;
    row.querySelector('[data-a=play]').onclick = async () => { await t.wv.executeJavaScript(`(() => { const m = [...document.querySelectorAll('video,audio')]; const playing = m.some((x) => !x.paused); m.forEach((x) => playing ? x.pause() : (x.readyState > 0 && x === (m.find((y) => y.currentTime > 0) || m[0]) && x.play())); })()`, true).catch(() => {}); setTimeout(renderMediaPanel, 250); };
    row.querySelector('[data-a=mute]').onclick = () => { t.muted = !t.muted; try { t.wv.setAudioMuted(t.muted); } catch {} t.render(); renderMediaPanel(); };
    row.querySelector('[data-a=go]').onclick = () => { closePanels(); if (t.ws !== state.ws) switchWs(t.ws); activate(t); };
    row.querySelector('[data-a=rate]').onchange = (e) => t.wv.executeJavaScript(`document.querySelectorAll('video,audio').forEach((m) => m.playbackRate = ${+e.target.value})`).catch(() => {});
    const range = row.querySelector('[data-a=boost]');
    range.oninput = async () => {
      row.querySelector('output').textContent = range.value + '%';
      const r = await t.wv.executeJavaScript(BOOST(range.value / 100), true).catch(() => 'blocked');
      if (r === 'blocked') { row.querySelector('output').textContent = 'n/a'; toast('This site’s media can’t be boosted (it’s served from another domain)'); }
    };
  });
}
$('#media-btn').onclick = () => {
  const p = $('#media-panel'); const was = !p.hidden; closePanels(); if (was) return;
  p.hidden = false; renderMediaPanel(); placePanel(p, $('#media-btn'));
};

// ====================================================================== reading list button
async function updateRlBtn(t) {
  const b = $('#rl-btn');
  if (!t || !/^https?:/.test(t.url)) { b.hidden = true; return; }
  b.hidden = false;
  const has = await nb.invoke('reading:has', t.url);
  b.classList.toggle('on', has);
  b.innerHTML = icon(has ? 'reading-on' : 'reading');
  b.title = has ? 'Remove from reading list' : 'Add to reading list';
}
$('#rl-btn').onclick = async () => { const t = state.active; if (!t) return; const on = await nb.invoke('reading:toggle', { url: t.url, title: t.title, favicon: t.favicon }); toast(on ? 'Added to reading list' : 'Removed from reading list'); updateRlBtn(t); };

// ====================================================================== screenshots
function startShot() {
  const t = state.active;
  if (!t || !t.wcId || isInternal(t.url) && !/^noam:\/\/(reader)/.test(t.url)) { if (!t || !t.wcId) return; }
  closePanels();
  const ov = $('#shot-overlay'); ov.hidden = false;
  const rect = $('#shot-rect'); rect.hidden = true;
  let start = null;
  ov.onpointerdown = (e) => {
    if (e.target.closest('.shot-bar')) return;
    e.preventDefault(); ov.setPointerCapture(e.pointerId);
    const b = ov.getBoundingClientRect(); start = [e.clientX - b.left, e.clientY - b.top]; rect.hidden = false;
    Object.assign(rect.style, { left: start[0] + 'px', top: start[1] + 'px', width: '0px', height: '0px' });
  };
  ov.onpointermove = (e) => {
    if (!start) return;
    const b = ov.getBoundingClientRect(); const x = e.clientX - b.left, y = e.clientY - b.top;
    Object.assign(rect.style, { left: Math.min(x, start[0]) + 'px', top: Math.min(y, start[1]) + 'px', width: Math.abs(x - start[0]) + 'px', height: Math.abs(y - start[1]) + 'px' });
  };
  ov.onpointerup = () => {
    if (!start) return; start = null;
    const r = rect.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) { rect.hidden = true; return; }
    const wr = t.wv.getBoundingClientRect();
    capture('area', { x: r.left - wr.left, y: r.top - wr.top, width: r.width, height: r.height });
  };
  const capture = async (mode, area) => {
    ov.hidden = true;
    try { const url = await nb.invoke('screenshot:capture', { wcId: t.wcId, mode, rect: area }); newTab({ url, index: state.tabs.indexOf(t) + 1 }); }
    catch (e) { toast('Couldn’t take the screenshot: ' + String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); }
  };
  $('#shot-visible').onclick = () => capture('visible');
  $('#shot-full').onclick = () => capture('full');
  $('#shot-cancel').onclick = () => { ov.hidden = true; };
}
$('#shot-btn').onclick = startShot;

// ====================================================================== sessions
async function loadSessions() { state.sessions = await nb.invoke('sessions:list').catch(() => []); }
async function saveSessionAs() {
  const name = await askText('Save open tabs as a session', new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' }), 'Session name');
  if (!name) return;
  const tabs = visibleTabs().filter((t) => !t.private).map((t) => ({ url: t.url, title: t.title, group: t.groupId || undefined }));
  try { state.sessions = await nb.invoke('sessions:save', { name, tabs, groups: state.groups.filter((g) => tabs.some((t) => t.group === g.id)) }); toast(`Saved “${name}” (${tabs.length} tab${tabs.length === 1 ? '' : 's'})`); }
  catch (e) { toast(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); }
}
async function openSession(id) {
  const s = await nb.invoke('sessions:get', id); if (!s) return;
  for (const g of s.groups || []) if (!state.groups.some((x) => x.id === g.id)) state.groups.push({ ...g });
  let first = null;
  for (const t of s.tabs) { const nt = newTab({ url: t.url, background: !!first }); if (t.group) { nt.groupId = t.group; nt.render(); } first = first || nt; }
  renderGroups(); saveGroups(); saveSession();
  toast(`Opened “${s.name}”`);
}
nb.on('session:open', openSession);
nb.on('extras:changed', (what) => {
  if (what === 'sessions' || what === 'all') loadSessions();
  if ((what === 'reading' || what === 'all')) { updateRlBtn(state.active); if (panels().some((p) => p.id === openPanelId && p.kind === 'reading')) renderReadingPanel($('#rp-body')); }
  if ((what === 'notes' || what === 'all')) updateNotesDot();
});

// ====================================================================== palette commands
const _commands = commands;
commands = function () {
  const base = _commands();
  const extra = [
    CMD('shot-area', 'Take a screenshot', 'Ctrl+Shift+X', startShot, 'camera'),
    CMD('reading-add', 'Add page to reading list', '', () => $('#rl-btn').click(), 'reading'),
    CMD('reading', 'Open reading list', '', () => openKind('reading'), 'reading'),
    CMD('notes', 'Notes for this site', '', () => openKind('notes'), 'note'),
    CMD('calc', 'Calculator', '', () => openKind('calc'), 'calc'),
    CMD('media', 'Media controls', '', () => { if (!$('#media-btn').hidden) $('#media-btn').click(); else toast('Nothing is playing'); }, 'music'),
    CMD('panel-add', 'Add a web panel to the sidebar', '', addWebPanel, 'panel'),
    CMD('session-save', 'Save open tabs as a session', '', saveSessionAs, 'layers'),
    CMD('ws-new', 'New workspace', '', () => { const r = $('#ws-btn').getBoundingClientRect(); wsMenu(r.left || 60, r.bottom || 40); }, 'layers'),
    ...workspaces().filter((w) => w.id !== state.ws).map((w) => CMD('ws-' + w.id, 'Switch to workspace: ' + w.name, '', () => switchWs(w.id), 'layers')),
    ...state.sessions.map((s) => CMD('ses-' + s.id, `Open session: ${s.name} (${s.count} tabs)`, '', () => openSession(s.id), 'layers')),
  ];
  return [...base, ...extra];
};

// ====================================================================== shortcuts & gestures
const _shortcut = hooks.shortcut;
hooks.shortcut = (key, mods) => {
  if (_shortcut && _shortcut(key, mods)) return true;
  const { ctrl, shift, alt } = mods || {};
  if (key.startsWith('gesture-')) {
    const g = key.slice(8).toUpperCase(); const t = state.active;
    if (g === 'L') t && t.wv.canGoBack() && t.wv.goBack();
    else if (g === 'R') t && t.wv.canGoForward() && t.wv.goForward();
    else if (g === 'U') newTab({ url: NEWTAB });
    else if (g === 'DR') t && closeTab(t);
    else if (g === 'DL') shortcut({ key: 't', ctrl: true, shift: true });
    else if (g === 'UD' || g === 'LR') t && reloadTab(t);
    else if (g === 'D') t && t.wv.executeJavaScript('scrollBy({ top: innerHeight * .85, behavior: "smooth" })').catch(() => {});
    return true;
  }
  if (ctrl && shift && key === 'x') { startShot(); return true; }
  if (ctrl && alt && /^[1-9]$/.test(key)) { const w = workspaces()[+key - 1]; if (w) switchWs(w.id); return true; }
  if (key === 'save-session') { saveSessionAs(); return true; }
  if (key === 'reading-list') { openKind('reading'); return true; }
  if (key === 'escape' && !$('#shot-overlay').hidden) { $('#shot-overlay').hidden = true; return true; }
  return false;
};

// ====================================================================== hooks into toolbar / activation / settings
const _toolbar = hooks.toolbar;
hooks.toolbar = (t) => { _toolbar(t); updateRlBtn(t); renderMediaBtn(); };
const _activated = hooks.activated;
hooks.activated = (t) => {
  if (t.ws && t.ws !== state.ws) { state.ws = t.ws; nb.invoke('settings:set', { tabs: { activeWs: t.ws } }); applyWs(); }
  _activated(t);
  updateNotesDot();
  const p = panels().find((x) => x.id === openPanelId);
  if (p && p.kind === 'notes') renderNotesPanel($('#rp-body'));
  if (p && p.kind === 'reading') renderReadingPanel($('#rp-body'));
};
const _loaded = hooks.loaded;
hooks.loaded = async (t) => { await _loaded(t); if (t === state.active) { updateNotesDot(); const p = panels().find((x) => x.id === openPanelId); if (p && p.kind === 'notes') renderNotesPanel($('#rp-body')); } };
const _settings = hooks.settings;
hooks.settings = (s) => {
  _settings(s);
  const vertical = (s.tabs || {}).layout === 'vertical';
  const wsb = $('#ws-btn');
  if (vertical && wsb.parentElement.id !== 'sidebar') $('#sidebar').insertBefore(wsb, $('#sb-tabs'));
  if (!vertical && wsb.parentElement.id !== 'titlebar') $('#titlebar').insertBefore(wsb, $('#tabstrip'));
  applyWs(); renderRail();
  const p = panels().find((x) => x.id === openPanelId);
  if (openPanelId && !p) closeSide();
};
const _init = hooks.init;
hooks.init = async (init) => {
  await _init(init);
  hooks.settings(state.settings);
  if (state.active && state.active.ws !== state.ws) { state.ws = state.active.ws; applyWs(); }
  loadSessions();
};
