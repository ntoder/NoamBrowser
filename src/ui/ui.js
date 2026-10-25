// NoamBrowser — browser chrome (tabs, omnibox, panels).
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const state = {
  tabs: [],
  active: null,
  closed: [],
  settings: {},
  engines: {},
  bookmarks: [],
  vpn: { state: 'off' },
  stats: { total: 0 },
  downloads: new Map(),
  paths: null,
  nextId: 1,
  permissionQueue: [],
};

const NEWTAB = 'noam://newtab/';
const isInternal = (u) => /^noam:/.test(u || '');
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id) => `<svg><use href="#i-${id}"/></svg>`;
const fmtBytes = (b) => { if (!b) return '0 B'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; const i = Math.min(4, Math.floor(Math.log(b) / Math.log(1024))); return (b / 1024 ** i).toFixed(i > 1 ? 1 : 0) + ' ' + u[i]; };
const fmtNum = (n) => new Intl.NumberFormat().format(n || 0);

function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => (t.hidden = true), ms);
}

// ------------------------------------------------------------------ theme
function applyTheme() {
  const s = state.settings;
  window.applyNoamTheme(s);
  document.body.classList.toggle('no-bookmarks', !s.showBookmarksBar);
  requestAnimationFrame(layoutTabs);
}
function replay(el, cls, ms) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); clearTimeout(el['_t' + cls]); el['_t' + cls] = setTimeout(() => el.classList.remove(cls), ms); }
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

// ------------------------------------------------------------------ tabs
class Tab {
  constructor({ url = NEWTAB, private: priv = false, background = false, index, opener }) {
    this.id = state.nextId++;
    this.private = !!priv;
    this.url = url;
    this.title = isInternal(url) ? 'New tab' : hostOf(url) || 'New tab';
    this.favicon = '';
    this.loading = false;
    this.progress = 0;
    this.wcId = null;
    this.ready = false;
    this.audible = false;
    this.muted = false;
    this.shields = { blocked: 0, upgraded: 0, cookiesBlocked: 0, paramsStripped: 0, shieldsUp: true, topBlocked: [] };
    this.zoom = 0;
    this.error = null;
    this.opener = opener;
    this.find = { text: '', matches: 0, active: 0 };
    this.pendingPermissions = [];

    const wv = document.createElement('webview');
    wv.setAttribute('partition', this.private ? state.paths.privatePartition : state.paths.mainPartition);
    wv.setAttribute('allowpopups', '');
    wv.setAttribute('webpreferences', 'contextIsolation=yes,sandbox=yes,spellcheck=yes,javascript=yes');
    wv.setAttribute('src', url);
    if (isInternal(url)) wv.classList.add('internal');
    this.wv = wv;

    const el = document.createElement('div');
    el.className = 'tab' + (this.private ? ' private' : '');
    el.setAttribute('role', 'tab');
    el.draggable = true;
    el.innerHTML = `<span class="fav"></span><span class="title"></span><button class="audio" hidden title="Mute tab"></button><button class="x" title="Close tab (Ctrl+W)">${icon('close')}</button>`;
    this.el = el;
    el.addEventListener('mousedown', (e) => { if (e.button === 0 && !e.target.closest('.x,.audio')) activate(this); });
    el.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); closeTab(this); } });
    el.querySelector('.x').addEventListener('click', (e) => { e.stopPropagation(); closeTab(this); });
    el.querySelector('.audio').addEventListener('click', (e) => { e.stopPropagation(); this.muted = !this.muted; try { this.wv.setAudioMuted(this.muted); } catch {} this.render(); });
    el.addEventListener('dblclick', (e) => e.stopPropagation());
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); window.hooks && window.hooks.tabMenu && window.hooks.tabMenu(this, e); });
    setupDrag(this);

    this.bind();
    const strip = $('#tabstrip');
    const views = $('#views');
    const ref = index != null ? state.tabs[index] : null;
    if (ref) { strip.insertBefore(el, ref.el); state.tabs.splice(index, 0, this); }
    else { strip.appendChild(el); state.tabs.push(this); }
    views.appendChild(wv);
    if (state.booted) { replay(el, 'entering', 450); if (!background) replay(wv, 'view-new', 600); }
    this.render();
    if (!background || !state.active) activate(this);
    layoutTabs();
    saveSession();
  }

  bind() {
    const wv = this.wv;
    wv.addEventListener('dom-ready', () => {
      if (!this.ready) {
        this.ready = true;
        this.wcId = wv.getWebContentsId();
        nb.invoke('shields:tab', this.wcId).then((s) => { Object.assign(this.shields, s); if (this === state.active) renderShield(); });
        if (this.muted) wv.setAudioMuted(true);
      }
    });
    wv.addEventListener('did-start-loading', () => { this.loading = true; this.error = null; this.progress = 0.1; this.renderError(); this.render(); });
    wv.addEventListener('did-stop-loading', () => {
      this.loading = false; this.progress = 1;
      try { const u = wv.getURL(); if (u && !this.error) this.url = u; } catch {}
      this.render();
      window.hooks && window.hooks.loaded && window.hooks.loaded(this);
    });
    wv.addEventListener('load-commit', (e) => { if (e.isMainFrame) { if (this === state.active && !isInternal(e.url)) replay(wv, 'view-commit', 500); this.progress = Math.max(this.progress, 0.55); if (this === state.active) renderProgress(); } });
    wv.addEventListener('did-finish-load', () => { this.progress = 1; if (this.error) { this.error = null; this.renderError(); } if (this === state.active) renderProgress(); });
    wv.addEventListener('did-navigate', (e) => {
      this.url = e.url; this.favicon = '';
      if (this.error && e.httpResponseCode > 0) { this.error = null; this.renderError(); }
      wv.classList.toggle('internal', isInternal(e.url));
      if (!this.private) nb.invoke('history:add', { url: e.url, title: this.title });
      this.render(); saveSession();
    });
    wv.addEventListener('did-navigate-in-page', (e) => {
      if (!e.isMainFrame) return;
      this.url = e.url; this.render(); saveSession();
      if (!this.private) nb.invoke('history:add', { url: e.url, title: wv.getTitle() });
    });
    wv.addEventListener('page-title-updated', (e) => {
      this.title = e.title || this.title; this.render();
      if (!this.private) nb.invoke('history:meta', { url: this.url, title: e.title });
      saveSession();
    });
    wv.addEventListener('page-favicon-updated', (e) => {
      const f = (e.favicons || []).find((x) => /^https?:|^data:/.test(x));
      if (f) { this.favicon = f; this.render(); if (!this.private) nb.invoke('history:meta', { url: this.url, favicon: f }); }
    });
    wv.addEventListener('did-fail-load', (e) => {
      if (!e.isMainFrame || e.errorCode === -3) return;
      this.error = { code: e.errorCode, desc: e.errorDescription, url: e.validatedURL };
      if (e.validatedURL) this.url = e.validatedURL;
      this.loading = false; this.render(); this.renderError();
    });
    wv.addEventListener('render-process-gone', (e) => {
      this.error = { code: 'crash', desc: e.details?.reason || 'crashed', url: this.url };
      this.el.classList.add('crashed'); this.renderError();
    });
    wv.addEventListener('close', () => closeTab(this));
    wv.addEventListener('media-started-playing', () => { this.audible = true; this.hasMedia = true; this.render(); });
    wv.addEventListener('media-paused', () => { this.audible = false; this.render(); });
    wv.addEventListener('did-start-navigation', (e) => { if (e.isMainFrame && !e.isInPlace) { this.hasMedia = false; this.readerable = false; this.translated = false; this.savedLogins = 0; this.lang = ''; } });
    wv.addEventListener('found-in-page', (e) => {
      const r = e.result; this.find.matches = r.matches; this.find.active = r.activeMatchOrdinal;
      if (this === state.active) renderFind();
    });
    wv.addEventListener('enter-html-full-screen', () => { document.body.classList.add('html-fs'); nb.invoke('window:set-fullscreen', true); });
    wv.addEventListener('leave-html-full-screen', () => { document.body.classList.remove('html-fs'); nb.invoke('window:set-fullscreen', false); });
    wv.addEventListener('update-target-url', () => {});
    wv.addEventListener('focus', () => { closePanels(); closeSuggest(); if (state.split && state.active !== this && (state.split.a === this || state.split.b === this)) activate(this); });
  }

  render() {
    const el = this.el;
    const fav = el.querySelector('.fav');
    if (this.loading && !isInternal(this.url)) fav.innerHTML = '<span class="spinner"></span>';
    else if (this.private) fav.innerHTML = icon('mask');
    else if (isInternal(this.url)) fav.innerHTML = icon('noam');
    else if (this.favicon) { fav.innerHTML = '<img alt="">'; const img = fav.firstChild; img.src = this.favicon; img.onerror = () => { fav.innerHTML = icon('globe'); }; }
    else fav.innerHTML = icon('globe');
    const t = this.error ? 'Couldn’t load page' : this.title || this.url;
    el.querySelector('.title').textContent = t;
    el.title = t + (this.private ? ' (private)' : '');
    const au = el.querySelector('.audio');
    au.hidden = !(this.audible || this.muted);
    au.innerHTML = icon(this.muted ? 'muted' : 'speaker');
    au.title = this.muted ? 'Unmute tab' : 'Mute tab';
    if (this.groupId) { el.dataset.group = this.groupId; const g = state.groups && state.groups.find((x) => x.id === this.groupId); if (g) el.style.setProperty('--gc', g.color); } else { delete el.dataset.group; el.style.removeProperty('--gc'); }
    if (this === state.active) renderToolbar();
  }

  renderError() {
    let v = this.errorView;
    if (!this.error) { if (v) { v.remove(); this.errorView = null; } return; }
    if (!v) { v = document.createElement('div'); v.className = 'error-view'; $('#content').appendChild(v); this.errorView = v; }
    v.hidden = this !== state.active;
    const e = this.error;
    const host = hostOf(e.url) || e.url;
    const map = {
      '-105': ['Can’t find that site', `The address ${host} doesn’t exist, or your DNS can’t look it up. Check the spelling.`],
      '-106': ['You’re offline', 'Check your internet connection, then try again.'],
      '-102': ['Connection refused', `${host} refused to connect.`],
      '-118': ['The site took too long', `${host} didn’t respond in time.`],
      '-109': ['Can’t reach this address', `${host} isn’t reachable right now.`],
      '-130': ['Proxy isn’t responding', 'The VPN tunnel isn’t passing traffic. Open the VPN panel to reconnect or turn it off.'],
      '-137': ['Can’t resolve through the VPN', 'The VPN couldn’t look up this site. Try reconnecting the VPN.'],
      '-200': ['Connection isn’t private', `The security certificate for ${host} isn’t valid, so NoamBrowser stopped loading it to protect you.`],
      '-201': ['Connection isn’t private', `The certificate for ${host} has expired or the date on this computer is wrong.`],
      '-202': ['Connection isn’t private', `The certificate for ${host} isn’t trusted.`],
      '-20': ['Blocked by NoamBrowser', `${host} is on a malware or scam block list. Turn Shields off for this site if you’re sure it’s safe.`],
      crash: ['This tab crashed', 'The page stopped working. Reloading usually fixes it.'],
    };
    const [title, body] = map[String(e.code)] || ['This page didn’t load', `${host} — ${e.desc || 'unknown error'}.`];
    const killed = state.vpn.wantOn && state.vpn.state !== 'on';
    v.innerHTML = `<div class="error-card"><div class="code">${esc(String(e.code) === 'crash' ? 'Crashed' : host.length > 26 ? host.slice(0, 24) + '…' : host)}</div><h1>${esc(killed ? 'Paused by the VPN kill switch' : title)}</h1><p>${esc(killed ? 'The VPN isn’t connected, so NoamBrowser is holding traffic back to keep your IP hidden.' : body)}</p><p style="font-size:12px">${esc(e.desc || '')} ${esc(String(e.code))}</p><div class="actions"><button class="btn primary" data-a="retry">Try again</button>${killed ? '<button class="btn ghost" data-a="vpn">Open VPN</button>' : ''}</div></div>`;
    v.querySelector('[data-a="retry"]').onclick = () => { this.error = null; this.el.classList.remove('crashed'); this.renderError(); this.wv.loadURL(e.url || this.url).catch(() => {}); };
    const vb = v.querySelector('[data-a="vpn"]'); if (vb) vb.onclick = () => openPanel('vpn');
  }

  navigate(url) {
    this.error = null; this.renderError();
    this.pendingUrl = url;
    this.wv.loadURL(url).catch(() => {});
    this.render();
  }
}

function activate(tab) {
  if (!tab) return;
  if (state.active && state.active !== tab) {
    state.active.el.classList.remove('active');
    state.active.wv.classList.remove('active');
    if (state.active.errorView) state.active.errorView.hidden = true;
    state.active.el.setAttribute('aria-selected', 'false');
  }
  state.active = tab;
  tab.el.classList.add('active');
  tab.el.setAttribute('aria-selected', 'true');
  tab.wv.classList.add('active');
  if (state.booted && !tab.wv.classList.contains('view-new')) replay(tab.wv, 'view-in', 400);
  if (tab.errorView) tab.errorView.hidden = false;
  window.hooks && window.hooks.activated && window.hooks.activated(tab);
  document.body.classList.toggle('private-active', tab.private);
  if (!tab.el.classList.contains('group-hidden')) tab.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  closePanels();
  renderToolbar(); renderShield(); renderFind(); renderPermission();
  if (isInternal(tab.url) && tab.url.startsWith(NEWTAB) && !tab.ready) setTimeout(() => focusOmnibox(false), 0);
  else if (isInternal(tab.url) && tab.url.startsWith(NEWTAB)) setTimeout(() => { urlInput.blur(); tab.wv.focus(); }, 0);
  else setTimeout(() => { urlInput.blur(); tab.wv.focus(); }, 0);
}

function closeTab(tab) {
  const i = state.tabs.indexOf(tab);
  if (i < 0) return;
  if (!tab.private && tab.url) state.closed.push({ url: tab.url, index: i });
  if (state.closed.length > 25) state.closed.shift();
  state.tabs.splice(i, 1);
  window.hooks && window.hooks.closing && window.hooks.closing(tab);
  tab.wv.remove(); if (tab.errorView) tab.errorView.remove();
  if (document.documentElement.dataset.anim !== 'off') { tab.el.classList.add('leaving'); setTimeout(() => tab.el.remove(), 240); } else tab.el.remove();
  if (tab.private && !state.tabs.some((t) => t.private)) nb.invoke('private:clear');
  if (!state.tabs.length) { nb.invoke('window:control', 'close'); return; }
  if (state.active === tab) {
    state.active = null;
    const opener = tab.opener && state.tabs.find((t) => t.wcId === tab.opener);
    activate(opener || state.tabs[Math.min(i, state.tabs.length - 1)]);
  }
  layoutTabs(); saveSession();
  window.hooks && window.hooks.closed && window.hooks.closed(tab);
}

function newTab(opts = {}) {
  if (opts.private && opts.url && opts.url.startsWith(NEWTAB)) opts.url = NEWTAB + '?private=1';
  return new Tab(opts);
}

function layoutTabs() {
  const strip = $('#tabstrip');
  if (document.body.classList.contains('vtabs')) { for (const t of state.tabs) { t.el.style.flexBasis = ''; t.el.style.width = ''; t.el.classList.remove('narrow'); } strip.style.maxWidth = ''; return; }
  const avail = $('#titlebar').clientWidth - 8 - 40 - $('#wc-space').offsetWidth - 40;
  const n = (state.tabs.filter((t) => !t.el.classList.contains('group-hidden')).length || 1) + (state.groups ? state.groups.filter((g) => state.tabs.some((t) => t.groupId === g.id)).length * 0.5 : 0);
  const w = Math.max(40, Math.min(228, Math.floor(avail / n)));
  for (const t of state.tabs) { t.el.style.flexBasis = w + 'px'; t.el.style.width = w + 'px'; t.el.classList.toggle('narrow', w < 72); }
  strip.style.maxWidth = avail + 'px';
}
window.addEventListener('resize', layoutTabs);

let dragTab = null;
function setupDrag(tab) {
  const el = tab.el;
  el.addEventListener('dragstart', (e) => { dragTab = tab; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/uri-list', tab.url); });
  el.addEventListener('dragend', () => { el.classList.remove('dragging'); $$('.tab').forEach((t) => t.classList.remove('drop-before')); dragTab = null; });
  el.addEventListener('dragover', (e) => { if (!dragTab || dragTab === tab) return; e.preventDefault(); $$('.tab').forEach((t) => t.classList.remove('drop-before')); el.classList.add('drop-before'); });
  el.addEventListener('drop', (e) => {
    if (!dragTab || dragTab === tab) return;
    e.preventDefault();
    const from = state.tabs.indexOf(dragTab); state.tabs.splice(from, 1);
    const to = state.tabs.indexOf(tab); state.tabs.splice(to, 0, dragTab);
    $('#tabstrip').insertBefore(dragTab.el, tab.el);
    dragTab.groupId = tab.groupId; dragTab.render();
    window.hooks && window.hooks.groupsChanged && window.hooks.groupsChanged();
    saveSession();
  });
}

let sessionTimer;
function saveSession() {
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => nb.invoke('session:save', state.tabs.filter((t) => !t.private).map((t) => ({ url: t.url, title: t.title, group: t.groupId || undefined }))), 600);
}

// ------------------------------------------------------------------ toolbar
function renderToolbar() {
  const t = state.active; if (!t) return;
  const wv = t.wv;
  let canBack = false, canFwd = false;
  try { canBack = t.ready && wv.canGoBack(); canFwd = t.ready && wv.canGoForward(); } catch {}
  $('#back').disabled = !canBack; $('#fwd').disabled = !canFwd;
  $('#reload').innerHTML = icon(t.loading ? 'stop' : 'reload');
  $('#reload').title = t.loading ? 'Stop (Esc)' : 'Reload (Ctrl+R)';
  const url = $('#url');
  if (document.activeElement !== url || !urlDirty) url.value = displayUrl(t.loading && t.pendingUrl && !t.ready ? t.pendingUrl : t.url);
  url.placeholder = t.private ? 'Search privately — nothing from this tab is saved' : 'Search privately or type an address';
  const badge = $('#site-badge');
  badge.className = 'site-badge';
  let ic = 'search', label = '';
  if (isInternal(t.url)) { ic = 'noam'; badge.classList.add('internal'); label = t.url.startsWith(NEWTAB) ? '' : 'NoamBrowser'; }
  else if (t.url.startsWith('https:')) { ic = 'lock'; badge.classList.add('secure'); }
  else if (t.url.startsWith('http:')) { ic = 'warn'; badge.classList.add('insecure'); label = 'Not secure'; }
  else if (t.url.startsWith('file:')) { ic = 'folder'; }
  if (t.private && !label && isInternal(t.url)) { ic = 'mask'; label = 'Private'; }
  badge.innerHTML = icon(ic) + `<span>${esc(label)}</span>`;
  $('#star').classList.toggle('on', state.bookmarks.some((b) => b.url === t.url));
  const zb = $('#zoom-badge');
  zb.hidden = !t.zoom; zb.textContent = Math.round(Math.pow(1.2, t.zoom) * 100) + '%';
  window.hooks && window.hooks.toolbar && window.hooks.toolbar(t);
  renderProgress();
}
function displayUrl(u) {
  if (!u || u.startsWith(NEWTAB)) return '';
  try { return decodeURI(u); } catch { return u; }
}
function renderProgress() {
  const t = state.active; const p = $('#progress');
  if (!t || !t.loading || isInternal(t.url)) { p.style.width = '100%'; p.classList.remove('on'); setTimeout(() => { if (!state.active?.loading) p.style.width = '0'; }, 300); return; }
  p.classList.add('on'); p.style.width = Math.round(Math.min(0.92, t.progress) * 100) + '%';
}
setInterval(() => { const t = state.active; if (t && t.loading && t.progress < 0.9) { t.progress += (0.9 - t.progress) * 0.08; renderProgress(); } }, 200);

$('#back').onclick = () => state.active?.wv.goBack();
$('#fwd').onclick = () => state.active?.wv.goForward();
$('#reload').onclick = (e) => { const t = state.active; if (!t) return; if (t.loading) t.wv.stop(); else if (e.shiftKey) t.wv.reloadIgnoringCache(); else reloadTab(t); };
$('#home').onclick = () => state.active?.navigate(state.settings.homepage || NEWTAB);
$('#newtab').onclick = () => newTab({ url: NEWTAB });
$('#titlebar').addEventListener('dblclick', (e) => { if (e.target === $('#titlebar') || e.target.classList.contains('drag-fill')) nb.invoke('window:control', 'maximize'); });
$('#menu-btn').onclick = () => { const r = $('#menu-btn').getBoundingClientRect(); nb.invoke('page:menu', { wcId: state.active?.wcId, x: r.right - 260, y: r.bottom + 4 }); };
$('#star').onclick = async () => {
  const t = state.active; if (!t || !t.url || t.url.startsWith(NEWTAB)) return;
  const added = await nb.invoke('bookmarks:toggle', { url: t.url, title: t.title, favicon: t.favicon });
  toast(added ? 'Bookmarked' : 'Bookmark removed');
};
$('#zoom-badge').onclick = () => setZoom(0);

function reloadTab(t) { if (t.error) { const u = t.error.url || t.url; t.error = null; t.renderError(); t.wv.loadURL(u).catch(() => {}); } else t.wv.reload(); }

function setZoom(level) {
  const t = state.active; if (!t || !t.wcId) return;
  t.zoom = Math.max(-5, Math.min(6, level));
  nb.invoke('page:zoom', { wcId: t.wcId, level: t.zoom });
  renderToolbar();
}

// ------------------------------------------------------------------ omnibox
const urlInput = $('#url');
const omni = $('#omnibox');
let sgItems = [], sgSel = 0, typed = '', lastKeyDelete = false, urlDirty = false;

function focusOmnibox(select = true) { urlInput.focus(); if (select) urlInput.select(); }
urlInput.addEventListener('focus', () => { omni.classList.add('focus'); requestAnimationFrame(() => urlInput.select()); });
urlInput.addEventListener('blur', () => { omni.classList.remove('focus'); urlDirty = false; setTimeout(closeSuggest, 120); renderToolbar(); });
urlInput.addEventListener('keydown', (e) => {
  lastKeyDelete = e.key === 'Backspace' || e.key === 'Delete';
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!sgItems.length) return;
    e.preventDefault();
    sgSel = (sgSel + (e.key === 'ArrowDown' ? 1 : -1) + sgItems.length) % sgItems.length;
    renderSuggest(); urlInput.value = sgItems[sgSel].fill ?? urlInput.value;
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const pick = sgItems.length && sgSel > 0 ? sgItems[sgSel] : null;
    go(pick ? pick.url : urlInput.value, e.altKey || e.ctrlKey && e.shiftKey ? 'newtab' : e.ctrlKey ? 'ctrl' : '');
  } else if (e.key === 'Delete' && e.shiftKey && sgItems[sgSel] && sgItems[sgSel].kind === 'history') {
    e.preventDefault();
    const gone = sgItems[sgSel];
    nb.invoke('history:remove-url', gone.url);
    sgItems.splice(sgSel, 1); sgSel = Math.max(0, sgSel - 1);
    urlInput.value = typed; renderSuggest();
    toast('Removed from history');
  } else if (e.key === 'Escape') {
    if (!$('#suggest').hidden) closeSuggest();
    else { urlInput.value = displayUrl(state.active?.url); urlInput.select(); }
    if (urlInput.value === displayUrl(state.active?.url)) state.active?.wv.focus();
  }
});
urlInput.addEventListener('input', async () => {
  typed = urlInput.value; urlDirty = true;
  const q = typed.trim();
  if (!q) { closeSuggest(); return; }
  const results = await nb.invoke('ui:suggest', q);
  if (urlInput.value !== typed) return;
  const eng = state.engines[state.settings.searchEngine] || { name: 'DuckDuckGo' };
  const looksUrl = /^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(q) || /^(https?|noam):/.test(q) || /^localhost/.test(q);
  const first = looksUrl ? { kind: 'go', title: q, url: q } : { kind: 'search', title: q, url: q, sub: `Search with ${eng.name}` };
  sgItems = [first, ...results.map((r) => ({ ...r, fill: r.url }))];
  sgSel = 0;
  // inline autocomplete of a remembered site
  if (!lastKeyDelete && !/\s/.test(q)) {
    const h = results.find((r) => r.url.replace(/^https?:\/\/(www\.)?/, '').toLowerCase().startsWith(q.toLowerCase()));
    if (h) {
      const bare = h.url.replace(/^https?:\/\/(www\.)?/, '');
      const host = bare.split('/')[0];
      const completion = q.includes('/') ? bare.replace(/\/$/, '') : host;
      if (completion.toLowerCase().startsWith(q.toLowerCase()) && completion.length > q.length) {
        urlInput.value = q + completion.slice(q.length);
        urlInput.setSelectionRange(q.length, urlInput.value.length);
        sgItems[0] = { kind: 'go', title: completion, url: h.url.startsWith('http') && !q.includes('/') ? h.url.split('/').slice(0, 3).join('/') + '/' : h.url };
      }
    }
  }
  renderSuggest();
});
function renderSuggest() {
  const box = $('#suggest');
  if (!sgItems.length || document.activeElement !== urlInput) { closeSuggest(); return; }
  const q = typed.trim().toLowerCase();
  const hl = (s) => { s = String(s || ''); const i = s.toLowerCase().indexOf(q); return i < 0 || !q ? esc(s) : esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length)); };
  box.innerHTML = sgItems.map((s, i) => {
    let ic = icon('globe');
    if (s.kind === 'search') ic = icon('search');
    else if (s.kind === 'bookmark') ic = icon('star');
    else if (s.favicon) ic = `<img src="${esc(s.favicon)}" alt="" data-drop>`;
    const title = s.kind === 'search' ? `<span class="t">${esc(s.title)}</span><span class="u">${esc(s.sub)}</span>` :
      s.kind === 'go' ? `<span class="t">${esc(s.title)}</span>` : `<span class="t">${hl(s.title)}</span><span class="u">${hl(s.url.replace(/^https?:\/\//, ''))}</span>`;
    return `<div class="sg${i === sgSel ? ' sel' : ''}" data-i="${i}" role="option"><span class="ic">${ic}</span>${title}</div>`;
  }).join('');
  box.hidden = false; omni.classList.add('open');
  $$('.sg', box).forEach((el) => el.addEventListener('mousedown', (e) => { e.preventDefault(); const s = sgItems[+el.dataset.i]; go(s.url, e.button === 1 ? 'newtab' : ''); }));
}
function closeSuggest() { $('#suggest').hidden = true; omni.classList.remove('open'); sgItems = []; }

async function go(text, mode) {
  text = (text || '').trim();
  if (!text) return;
  if (mode === 'ctrl' && /^[\w-]+$/.test(text)) text = 'www.' + text + '.com';
  const url = await nb.invoke('ui:resolve-input', text);
  if (!url) return;
  closeSuggest(); urlDirty = false;
  if (mode === 'newtab') newTab({ url, private: state.active?.private });
  else { state.active.navigate(url); state.active.wv.focus(); }
}

document.addEventListener('error', (e) => { if (e.target?.tagName === 'IMG' && e.target.hasAttribute('data-drop')) e.target.remove(); }, true);

// ------------------------------------------------------------------ bookmarks bar
function renderBookmarks() {
  const bar = $('#bookmarks-bar');
  bar.innerHTML = '';
  for (const b of state.bookmarks) {
    const a = document.createElement('button');
    a.className = 'bm'; a.title = b.title + '\n' + b.url;
    a.innerHTML = (b.favicon ? `<img alt="">` : icon('globe')) + `<span></span>`;
    if (b.favicon) { const img = a.querySelector('img'); img.src = b.favicon; img.onerror = () => img.replaceWith(Object.assign(document.createElement('span'), { innerHTML: icon('globe') }).firstChild); }
    a.querySelector('span').textContent = b.title || hostOf(b.url);
    a.onclick = (e) => (e.ctrlKey || e.button === 1 ? newTab({ url: b.url, background: true }) : state.active.navigate(b.url));
    a.onauxclick = (e) => { if (e.button === 1) newTab({ url: b.url, background: true }); };
    bar.appendChild(a);
  }
  renderToolbar();
}

// ------------------------------------------------------------------ panels
function closePanels() { $$('.panel').forEach((p) => (p.hidden = true)); }
function placePanel(panel, anchor) {
  const r = anchor.getBoundingClientRect();
  panel.hidden = false;
  const w = panel.offsetWidth;
  panel.style.top = r.bottom + 8 + 'px';
  panel.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w + 20)) + 'px';
}
function openPanel(name) {
  const map = { shield: ['#shield-panel', '#shield-btn'], vpn: ['#vpn-panel', '#vpn-btn'], dl: ['#dl-panel', '#dl-btn'], translate: ['#translate-panel', '#translate-btn'] };
  const [p, a] = map[name];
  const panel = $(p);
  const wasOpen = !panel.hidden;
  closePanels();
  if (wasOpen) return;
  panel.hidden = false;
  if (name === 'shield') renderShield();
  if (name === 'vpn') renderVpn();
  if (name === 'dl') renderDownloads();
  if (name === 'translate' && window.hooks) window.hooks.translatePanel();
  placePanel(panel, $(a));
}
document.addEventListener('mousedown', (e) => { if (!e.target.closest('.panel, .status-pill, #dl-btn, #translate-btn')) closePanels(); });
window.addEventListener('blur', () => setTimeout(() => { if (document.activeElement?.tagName === 'WEBVIEW') closePanels(); }, 0));
$('#shield-btn').onclick = () => openPanel('shield');
$('#vpn-btn').onclick = () => openPanel('vpn');
$('#dl-btn').onclick = () => openPanel('dl');
$('#site-badge').onclick = () => openPanel('shield');

function renderShield() {
  const t = state.active; if (!t) return;
  const s = t.shields;
  const btn = $('#shield-btn');
  const internal = isInternal(t.url) || !/^https?:/.test(t.url);
  btn.classList.toggle('off', !s.shieldsUp || !state.settings.shields?.ads);
  $('#shield-count').textContent = internal ? fmtNum(state.stats.today || 0) : fmtNum(s.blocked);
  btn.title = internal ? 'Blocked today' : `${s.blocked} blocked on this page`;
  const panel = $('#shield-panel');
  if (panel.hidden && !panel.dataset.force) return;
  const host = internal ? '' : hostOf(t.url).replace(/^www\./, '');
  $('#sp-site').textContent = host || 'NoamBrowser page';
  const fav = $('#sp-fav'); fav.hidden = !t.favicon; fav.onerror = () => (fav.hidden = true); if (t.favicon) fav.src = t.favicon;
  const tg = $('#sp-toggle'); tg.setAttribute('aria-checked', String(!!s.shieldsUp)); tg.disabled = internal; tg.style.opacity = internal ? .4 : 1;
  panel.classList.toggle('off', !s.shieldsUp);
  $('#sp-state').textContent = internal ? 'Shields protect every website you visit.' : s.shieldsUp ? 'Shields are up. Ads, trackers and fingerprinting are blocked here.' : 'Shields are down for this site. Turn them back on if you didn’t mean this.';
  $('#sp-blocked').textContent = fmtNum(s.blocked);
  $('#sp-https').textContent = fmtNum(s.upgraded);
  $('#sp-cookies').textContent = fmtNum(s.cookiesBlocked);
  $('#sp-params').textContent = fmtNum(s.paramsStripped);
  $('#sp-list').innerHTML = (s.topBlocked || []).map(([h, n]) => `<li><span>${esc(h)}</span><b>${n}</b></li>`).join('') || '<li><span>Nothing blocked yet</span></li>';
  $('#sp-list-wrap').hidden = internal;
  $('#sp-forget').disabled = internal;
  $('#sp-dark-row').hidden = internal;
  if (!internal) nb.invoke('dark:get', hostOf(t.url)).then((on) => $('#sp-dark').setAttribute('aria-checked', String(!!on)));
  $('#sp-total').textContent = fmtNum(state.stats.total);
  $('#sp-saved').textContent = fmtBytes(state.stats.bytes);
}
$('#sp-toggle').onclick = async () => {
  const t = state.active; if (!t) return;
  const up = await nb.invoke('shields:toggle-site', hostOf(t.url));
  t.shields.shieldsUp = up; renderShield();
  toast(up ? 'Shields up — reloading' : 'Shields down for this site — reloading');
  t.wv.reload();
};
$('#sp-forget').onclick = async () => {
  const t = state.active; if (!t) return;
  await nb.invoke('shields:forget-site', { host: hostOf(t.url), privateTab: t.private });
  closePanels(); toast('Cookies and site data for ' + hostOf(t.url) + ' cleared'); t.wv.reload();
};
$('#sp-settings').onclick = () => { closePanels(); newTab({ url: 'noam://settings/#shields' }); };

function renderVpnPill() {
  const v = state.vpn;
  const pill = $('#vpn-btn');
  const justOn = pill.classList.contains('just-on');
  pill.className = 'status-pill vpn ' + (v.state || 'off') + (justOn ? ' just-on' : '');
  let label = 'VPN';
  if (v.state === 'on') label = v.info?.loc ? `VPN · ${v.info.loc}` : 'VPN on';
  if (v.state === 'connecting') label = 'Connecting';
  if (v.state === 'error') label = 'VPN issue';
  $('#vpn-label').textContent = label;
  pill.title = v.state === 'on' ? `Protected — exit IP ${v.info?.ip || ''}` : v.message || 'Built-in VPN (off)';
}
function renderVpn() {
  renderVpnPill();
  const v = state.vpn; const vs = state.settings.vpn || {};
  const power = $('#vpn-power');
  power.className = 'vpn-power ' + (v.state || 'off');
  const titles = { off: 'VPN is off', connecting: 'Connecting…', on: 'You’re protected', error: 'VPN needs attention' };
  $('#vpn-title').textContent = titles[v.state] || 'VPN';
  $('#vpn-sub').textContent = v.state === 'off' ? 'Sites can see your real IP address. Turn on to hide it and encrypt your traffic.' : v.message || '';
  $('#vpn-info').hidden = v.state !== 'on' || !v.info;
  if (v.info) { $('#vpn-ip').textContent = v.info.ip || '—'; $('#vpn-loc').textContent = countryName(v.info.loc); $('#vpn-colo').textContent = v.info.colo || '—'; }
  $$('.seg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === (vs.mode || 'warp'))));
  $('#vpn-custom').hidden = vs.mode !== 'custom';
  if (document.activeElement !== $('#vpn-proxy')) $('#vpn-proxy').value = vs.customProxy || '';
  $('#vpn-kill').setAttribute('aria-checked', String(!!vs.killSwitch));
  $('#vpn-auto').setAttribute('aria-checked', String(!!vs.autoConnect));
  $('#vpn-newid').disabled = vs.mode === 'custom';
}
function countryName(cc) {
  if (!cc) return '—';
  try { return new Intl.DisplayNames(undefined, { type: 'region' }).of(cc) || cc; } catch { return cc; }
}
$('#vpn-power').onclick = () => nb.invoke('vpn:toggle');
$$('.seg button').forEach((b) => (b.onclick = async () => { state.settings.vpn = await nb.invoke('vpn:set', { mode: b.dataset.mode }); renderVpn(); }));
$('#vpn-proxy-save').onclick = async () => { state.settings.vpn = await nb.invoke('vpn:set', { customProxy: $('#vpn-proxy').value.trim() }); toast('Proxy saved'); renderVpn(); };
$('#vpn-kill').onclick = async () => { state.settings.vpn = await nb.invoke('vpn:set', { killSwitch: !state.settings.vpn.killSwitch }); renderVpn(); };
$('#vpn-auto').onclick = async () => { state.settings.vpn = await nb.invoke('vpn:set', { autoConnect: !state.settings.vpn.autoConnect }); renderVpn(); };
$('#vpn-newid').onclick = () => { nb.invoke('vpn:new-identity'); toast('Getting a fresh VPN identity…'); };

function renderDownloads() {
  const list = [...state.downloads.values()].sort((a, b) => b.started - a.started).slice(0, 8);
  const active = list.filter((d) => d.state === 'progressing');
  const btn = $('#dl-btn');
  btn.hidden = !list.length;
  const tot = active.reduce((a, d) => a + (d.total || 0), 0); const rec = active.reduce((a, d) => a + (d.received || 0), 0);
  $('#dl-ring').style.setProperty('--p', active.length && tot ? Math.round((rec / tot) * 100) : 0);
  $('#dl-ring').hidden = !active.length;
  $('#dl-list').innerHTML = list.map((d) => {
    const pct = d.total ? Math.round((d.received / d.total) * 100) : 0;
    const meta = d.state === 'progressing' ? `${fmtBytes(d.received)} of ${d.total ? fmtBytes(d.total) : '?'}${d.paused ? ' · paused' : ''}` : d.state === 'completed' ? fmtBytes(d.total || d.received) + ' · done' : d.state === 'cancelled' ? 'Cancelled' : 'Failed';
    const acts = d.state === 'progressing'
      ? `<button class="icon-btn small" data-a="cancel" data-id="${d.id}" title="Cancel">${icon('close')}</button>`
      : d.state === 'completed' ? `<button class="icon-btn small" data-a="show" data-id="${d.id}" title="Show in folder">${icon('folder')}</button>` : '';
    return `<li data-id="${d.id}" data-state="${d.state}"><span class="n" title="${esc(d.name)}">${esc(d.name)}</span><span class="m">${esc(meta)}</span><span class="acts">${acts}</span>${d.state === 'progressing' ? `<span class="bar"><i style="width:${pct}%"></i></span>` : ''}</li>`;
  }).join('');
  $$('#dl-list button').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); nb.invoke('downloads:action', { id: b.dataset.id, action: b.dataset.a }); }));
  $$('#dl-list li').forEach((li) => (li.ondblclick = () => { if (li.dataset.state === 'completed') nb.invoke('downloads:action', { id: li.dataset.id, action: 'open' }); }));
}
$('#dl-all').onclick = () => { closePanels(); newTab({ url: 'noam://downloads/' }); };

// ------------------------------------------------------------------ find
function openFind() {
  const fb = $('#findbar'); fb.hidden = false;
  const inp = $('#find-input'); inp.value = state.active?.find.text || ''; inp.focus(); inp.select();
}
function closeFind() {
  const t = state.active; $('#findbar').hidden = true;
  if (t) { t.find = { text: '', matches: 0, active: 0 }; try { t.wv.stopFindInPage('clearSelection'); } catch {} t.wv.focus(); }
}
function renderFind() {
  const t = state.active; const fb = $('#findbar');
  if (!t || !t.find.text) { $('#find-count').textContent = ''; fb.classList.remove('nomatch'); if (t && !t.find.text && document.activeElement !== $('#find-input')) fb.hidden = true; return; }
  $('#find-count').textContent = t.find.matches ? `${t.find.active} of ${t.find.matches}` : 'No results';
  fb.classList.toggle('nomatch', !t.find.matches);
}
$('#find-input').addEventListener('input', (e) => {
  const t = state.active; if (!t) return;
  t.find.text = e.target.value;
  if (t.find.text) t.wv.findInPage(t.find.text); else { t.wv.stopFindInPage('clearSelection'); renderFind(); }
});
$('#find-input').addEventListener('keydown', (e) => {
  const t = state.active; if (!t) return;
  if (e.key === 'Enter' && t.find.text) t.wv.findInPage(t.find.text, { forward: !e.shiftKey, findNext: true });
  if (e.key === 'Escape') closeFind();
});
$('#find-next').onclick = () => { const t = state.active; if (t?.find.text) t.wv.findInPage(t.find.text, { forward: true, findNext: true }); };
$('#find-prev').onclick = () => { const t = state.active; if (t?.find.text) t.wv.findInPage(t.find.text, { forward: false, findNext: true }); };
$('#find-close').onclick = closeFind;

// ------------------------------------------------------------------ permissions
function renderPermission() {
  const bar = $('#permission-bar');
  const t = state.active;
  const req = t && state.permissionQueue.find((p) => p.wcId === t.wcId);
  if (!req) { bar.hidden = true; return; }
  let host = req.origin; try { host = new URL(req.origin).host; } catch {}
  const text = req.permission === 'openExternal'
    ? `<b>${esc(host)}</b> wants to open an app: <b>${esc(String(req.label).slice(0, 60))}</b>`
    : `<b>${esc(host)}</b> wants to use your <b>${esc(req.label.replace('notifications', 'notifications').replace('geolocation', 'location'))}</b>`;
  bar.querySelector('.pb-text').innerHTML = text;
  bar.querySelector('.pb-remember').hidden = req.permission === 'openExternal';
  bar.hidden = false;
  bar.dataset.id = req.id;
}
$$('#permission-bar .btn').forEach((b) => (b.onclick = () => {
  const bar = $('#permission-bar'); const id = bar.dataset.id;
  nb.answerPermission(id, b.dataset.act === 'allow', bar.querySelector('.pb-remember input').checked);
  state.permissionQueue = state.permissionQueue.filter((p) => p.id !== id);
  renderPermission();
}));

// ------------------------------------------------------------------ shortcuts
function tabByOffset(d) { const i = state.tabs.indexOf(state.active); return state.tabs[(i + d + state.tabs.length) % state.tabs.length]; }
async function shortcut({ key, ctrl, shift, alt }) {
  const t = state.active;
  key = (key || '').toLowerCase();
  if (window.hooks && window.hooks.shortcut && window.hooks.shortcut(key, { ctrl, shift, alt })) return true;
  if (key === 'screenshot') { if (t?.wcId) { const f = await nb.invoke('page:screenshot', t.wcId); if (f) toast('Screenshot copied and saved to ' + f, 4000); } return true; }
  if (ctrl) {
    if (key === 't' && shift) { const c = state.closed.pop(); if (c) newTab({ url: c.url, index: Math.min(c.index, state.tabs.length) }); return true; }
    if (key === 't') { newTab({ url: NEWTAB }); return true; }
    if (key === 'n' && shift) { newTab({ url: NEWTAB, private: true }); return true; }
    if (key === 'n') { nb.invoke('window:new'); return true; }
    if (key === 'w' || key === 'f4') { if (t) closeTab(t); return true; }
    if (key === 'k' && window.hooks && window.hooks.palette) { window.hooks.palette(); return true; }
    if (key === 's' && shift && window.hooks) { window.hooks.splitToggle(); return true; }
    if (key === 'l' || key === 'e') { focusOmnibox(); return true; }
    if (key === 'r') { if (t) shift ? t.wv.reloadIgnoringCache() : reloadTab(t); return true; }
    if (key === 'f' || key === 'g') { openFind(); return true; }
    if (key === 'd') { $('#star').click(); return true; }
    if (key === 'h') { newTab({ url: 'noam://history/' }); return true; }
    if (key === 'j') { newTab({ url: 'noam://downloads/' }); return true; }
    if (key === 'p') { t?.wv.print(); return true; }
    if (key === 's') { if (t?.wcId) nb.invoke('page:save', t.wcId); return true; }
    if (key === 'u') { if (t && /^https?:/.test(t.url)) newTab({ url: 'view-source:' + t.url, private: t.private }); return true; }
    if (key === ',') { newTab({ url: 'noam://settings/' }); return true; }
    if (key === 'b' && shift) { const s = await nb.invoke('settings:set', { showBookmarksBar: !state.settings.showBookmarksBar }); state.settings = s; applyTheme(); return true; }
    if (key === 'tab' || key === 'pagedown' || key === 'pageup') { activate(tabByOffset(key === 'pageup' || shift ? -1 : 1)); return true; }
    if (/^[1-8]$/.test(key)) { activate(state.tabs[+key - 1]); return true; }
    if (key === '9') { activate(state.tabs[state.tabs.length - 1]); return true; }
    if (key === '=' || key === '+') { setZoom((t?.zoom || 0) + 0.5); return true; }
    if (key === '-') { setZoom((t?.zoom || 0) - 0.5); return true; }
    if (key === '0') { setZoom(0); return true; }
  }
  if (alt && key === 'arrowleft') { t?.wv.goBack(); return true; }
  if (alt && key === 'arrowright') { t?.wv.goForward(); return true; }
  if (alt && key === 'home') { t?.navigate(state.settings.homepage || NEWTAB); return true; }
  if (alt && key === 'd') { focusOmnibox(); return true; }
  if (key === 'f5') { if (t) ctrl ? t.wv.reloadIgnoringCache() : reloadTab(t); return true; }
  if (key === 'f6') { focusOmnibox(); return true; }
  if (key === 'f11') { nb.invoke('window:control', 'fullscreen'); return true; }
  if (key === 'f12') { if (t) t.wv.isDevToolsOpened() ? t.wv.closeDevTools() : t.wv.openDevTools(); return true; }
  return false;
}
document.addEventListener('keydown', async (e) => {
  if (e.key === 'Escape') {
    if (!$$('.panel').every((p) => p.hidden)) { closePanels(); return; }
    if (!$('#findbar').hidden && document.activeElement === $('#find-input')) return;
    if (state.active?.loading && document.activeElement !== urlInput) state.active.wv.stop();
  }
  const handled = await shortcut({ key: e.key, ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey });
  if (handled) e.preventDefault();
}, true);
nb.on('shortcut', (s) => shortcut(s));

// ------------------------------------------------------------------ events from main
nb.on('tab:open', ({ url, background, opener, private: priv }) => {
  const openerTab = opener && state.tabs.find((t) => t.wcId === opener);
  const index = openerTab ? state.tabs.indexOf(openerTab) + 1 + state.tabs.slice(state.tabs.indexOf(openerTab) + 1).filter((t) => t.opener === opener).length : undefined;
  newTab({ url, background, opener, private: priv ?? openerTab?.private, index });
});
nb.on('shields:update', (s) => {
  const t = state.tabs.find((x) => x.wcId === s.wcId); if (!t) return;
  const before = t.shields.blocked;
  Object.assign(t.shields, s);
  if (s.blocked > before) { state.stats.total = (state.stats.total || 0) + (s.blocked - before); state.stats.today = (state.stats.today || 0) + (s.blocked - before); state.stats.bytes = (state.stats.bytes || 0) + (s.blocked - before) * 23552; }
  if (t === state.active) {
    renderShield();
    if (s.blocked > before) { const b = $('#shield-btn'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
  }
});
nb.on('vpn:status', (v) => { if (v.state === 'on' && state.vpn.state !== 'on') replay($('#vpn-btn'), 'just-on', 1000); state.vpn = v; renderVpnPill(); if (!$('#vpn-panel').hidden) renderVpn(); if (state.active?.error) state.active.renderError(); });
nb.on('settings:changed', (s) => { state.settings = s; applyTheme(); window.hooks && window.hooks.settings && window.hooks.settings(s); renderShield(); if (!$('#vpn-panel').hidden) renderVpn(); });
nb.on('bookmarks:changed', (b) => { state.bookmarks = b; renderBookmarks(); });
nb.on('downloads:update', (d) => {
  const isNew = !state.downloads.has(d.id);
  state.downloads.set(d.id, d); renderDownloads();
  if (isNew) { toast('Downloading ' + d.name); }
  if (d.state === 'completed' && !d._toasted) { d._toasted = true; toast('Downloaded ' + d.name); }
});
nb.on('permission:ask', (req) => { state.permissionQueue.push(req); renderPermission(); });
nb.on('stats:update', (s) => { state.stats = s; if (isInternal(state.active?.url)) renderShield(); });
$$('.wc').forEach((b) => (b.onclick = () => nb.invoke('window:control', b.dataset.wc)));
nb.on('window:state', (s) => {
  if ('maximized' in s) document.body.classList.toggle('maximized', s.maximized); if ('fullscreen' in s) { document.body.classList.toggle('win-fs', s.fullscreen); if (!s.fullscreen) document.body.classList.remove('html-fs'); } layoutTabs(); });
nb.on('zoom:changed', ({ wcId, level }) => { const t = state.tabs.find((x) => x.wcId === wcId); if (t) { t.zoom = level; if (t === state.active) renderToolbar(); } });

nb.on('init', async (init) => {
  state.paths = await nb.invoke('ui:paths');
  state.settings = init.settings; state.engines = init.engines; state.bookmarks = init.bookmarks; state.vpn = init.vpn; state.stats = init.stats;
  for (const d of init.downloads || []) state.downloads.set(d.id, d);
  document.body.classList.toggle('mac', init.platform === 'darwin');
  document.body.classList.toggle('maximized', !!init.maximized);
  applyTheme(); renderBookmarks(); renderVpnPill(); renderDownloads();
  document.body.classList.add('booting'); setTimeout(() => { document.body.classList.remove('booting'); state.booted = true; }, 900);
  const tabs = init.tabs.length ? init.tabs : [{ url: NEWTAB }];
  state.groups = (init.settings.tabs && init.settings.tabs.groups) || [];
  tabs.forEach((t, i) => { const nt = newTab({ url: t.url, private: init.privateTab && i === tabs.length - 1, background: i < tabs.length - 1 }); if (t.group && state.groups.some((g) => g.id === t.group)) { nt.groupId = t.group; nt.render(); } });
  window.hooks && window.hooks.init && window.hooks.init(init);
  activate(state.tabs[state.tabs.length - 1]);
  layoutTabs();
});
