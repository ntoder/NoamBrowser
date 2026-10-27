// NoamBrowser Dev Lab — friendly developer tools for every page.
// core: the drawer, connecting to the active tab, helpers, missions.
'use strict';
const DL = {
  open: false, wcId: null, tab: null, tool: 'home',
  kid: true, tools: [], logs: new Map(), // wcId -> { requests: Map, console: [], firstTs }
  handlers: {}, // tool id -> { render(body), event?(method, params), detach?() }
};
window.DL = DL;
try { DL.kid = localStorage.getItem('dl-kid') !== '0'; DL.tool = localStorage.getItem('dl-tool') || 'home'; } catch {}

const dlEsc = esc;
DL.log = () => { let l = DL.logs.get(DL.wcId); if (!l) { l = { requests: new Map(), order: [], console: [], firstTs: 0, errors: 0 }; DL.logs.set(DL.wcId, l); } return l; };
DL.cmd = (method, params) => nb.invoke('devlab:cmd', { wcId: DL.wcId, method, params }).catch((e) => { throw new Error(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); });
DL.eval = async (expression, { byValue = true, userGesture = true } = {}) => {
  const r = await DL.cmd('Runtime.evaluate', { expression, returnByValue: byValue, awaitPromise: true, userGesture, generatePreview: !byValue, includeCommandLineAPI: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
  return byValue ? r.result.value : r.result;
};
DL.callOn = async (objectId, fn, args = [], byValue = true) => {
  const r = await DL.cmd('Runtime.callFunctionOn', { objectId, functionDeclaration: fn.toString(), arguments: args.map((value) => ({ value })), returnByValue: byValue, awaitPromise: true, userGesture: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
  return byValue ? r.result.value : r.result;
};
DL.explain = (text) => `<p class="dl-explain">💡 ${text}</p>`;
DL.html = (strings, ...vals) => strings.reduce((a, s, i) => a + s + (i < vals.length ? vals[i] : ''), '');
DL.fmtBytes = (b) => { if (!b) return '0 B'; const u = ['B', 'KB', 'MB', 'GB']; const i = Math.min(3, Math.floor(Math.log(b) / Math.log(1024))); return (b / 1024 ** i).toFixed(i ? 1 : 0) + ' ' + u[i]; };
DL.fmtMs = (ms) => ms >= 1000 ? (ms / 1000).toFixed(ms >= 10000 ? 0 : 1) + ' s' : Math.round(ms) + ' ms';
DL.copy = (t) => navigator.clipboard.writeText(String(t)).then(() => toast('Copied ' + (String(t).length > 40 ? '' : t))).catch(() => {});

// ---------------------------------------------------------------- tools list
DL.TOOLS = [
  ['home', '🏠', 'Start', 'Start'],
  ['explore', '🔍', 'Explore', 'Inspector'],
  ['console', '💬', 'Console', 'Console'],
  ['network', '🌐', 'Network', 'Network'],
  ['remix', '🎨', 'Remix', 'Style Editor'],
  ['colors', '🖌️', 'Colours & Fonts', 'Eyedropper & Fonts'],
  ['devices', '📱', 'Devices', 'Responsive Design'],
  ['access', '♿', 'Everyone', 'Accessibility'],
  ['storage', '🍪', 'Cookies & Memory', 'Storage'],
  ['speed', '⚡', 'Speed', 'Performance'],
  ['scripts', '📜', 'Scripts', 'Debugger'],
];

// ---------------------------------------------------------------- missions
DL.MISSIONS = [
  ['pick', 'Pick something on a page with 🔍 Explore'],
  ['text', 'Change the words on a page'],
  ['color', 'Change a colour on a page'],
  ['console', 'Run your first command in 💬 Console'],
  ['network', 'Find out how many files a page downloads'],
  ['device', 'See a page on a phone in 📱 Devices'],
  ['remix', 'Make a remix in 🎨 Remix'],
  ['eyedrop', 'Pick a colour with the eyedropper'],
  ['access', 'Give a page an accessibility checkup'],
  ['speed', 'Get a speed report card'],
  ['cookies', 'Find a cookie a website saved'],
  ['script', 'Read a script that runs on a page'],
];
DL.done = (() => { try { return JSON.parse(localStorage.getItem('dl-missions') || '{}'); } catch { return {}; } })();
DL.mission = (id) => {
  if (DL.done[id]) return;
  DL.done[id] = Date.now();
  try { localStorage.setItem('dl-missions', JSON.stringify(DL.done)); } catch {}
  const m = DL.MISSIONS.find((x) => x[0] === id);
  const n = Object.keys(DL.done).length;
  toast(`⭐ Mission complete: ${m ? m[1].replace(/ with .+$/, '') : id} (${n}/${DL.MISSIONS.length})`, 3500);
  if (n === DL.MISSIONS.length) setTimeout(() => toast('🏆 You finished every Dev Lab mission! You’re a real web developer.', 6000), 3600);
  if (DL.tool === 'home') DL.render();
};

// ---------------------------------------------------------------- drawer
const drawer = document.createElement('section');
drawer.id = 'devlab';
drawer.hidden = true;
drawer.innerHTML = `<div class="dl-resize" title="Drag to resize"></div>
  <header class="dl-head">
    <span class="dl-logo">🧪 <b>Dev Lab</b></span>
    <nav class="dl-tabs"></nav>
    <span class="dl-tools-right">
      <label class="dl-kid" title="Explain things in simple words"><input type="checkbox" id="dl-kid"> <span>Explain</span></label>
      <button class="dl-btn ghost" id="dl-pro" title="Open the full Chromium DevTools (Ctrl+Shift+I)">Pro tools</button>
      <button class="icon-btn small" id="dl-close" title="Close Dev Lab (F12)"><svg><use href="#i-close"/></svg></button>
    </span>
  </header>
  <div class="dl-status" hidden></div>
  <div class="dl-body"></div>`;
$('#content').appendChild(drawer);
const body = drawer.querySelector('.dl-body');
DL.body = body;

function renderTabs() {
  const l = DL.wcId ? DL.log() : null;
  drawer.querySelector('.dl-tabs').innerHTML = DL.TOOLS.map(([id, emo, kid, pro]) => `<button data-tool="${id}" class="${DL.tool === id ? 'on' : ''}" title="${dlEsc(DL.kid ? pro : kid)}"><span class="e">${emo}</span><span class="n">${dlEsc(DL.kid ? kid : pro)}</span>${id === 'console' && l && l.errors ? `<i class="dl-badge">${l.errors > 99 ? '99+' : l.errors}</i>` : ''}${id === 'network' && l && l.order.length ? `<i class="dl-badge soft">${l.order.length > 999 ? '999+' : l.order.length}</i>` : ''}</button>`).join('');
  drawer.querySelectorAll('.dl-tabs button').forEach((b) => (b.onclick = () => DL.show(b.dataset.tool)));
}
DL.renderTabs = renderTabs;
let tabsTimer = null;
DL.tabsSoon = () => { if (!tabsTimer) tabsTimer = setTimeout(() => { tabsTimer = null; if (DL.open) renderTabs(); }, 400); };

DL.render = () => {
  if (!DL.open) return;
  renderTabs();
  drawer.classList.toggle('kid', DL.kid);
  const h = DL.handlers[DL.tool];
  body.dataset.tool = DL.tool;
  if (!DL.wcId && DL.tool !== 'home') { body.innerHTML = `<div class="dl-empty">Open a web page first, then come back here. 🙂</div>`; return; }
  try { h ? h.render(body) : (body.innerHTML = ''); } catch (e) { body.innerHTML = `<div class="dl-empty">Something went wrong: ${dlEsc(e.message)}</div>`; }
};
DL.show = (tool) => {
  if (DL.handlers[DL.tool] && DL.handlers[DL.tool].leave) try { DL.handlers[DL.tool].leave(); } catch {}
  DL.tool = tool; try { localStorage.setItem('dl-tool', tool); } catch {}
  if (!DL.open) return DL.toggle(true);
  DL.render();
};
function status(msg, kind = '') {
  const s = drawer.querySelector('.dl-status');
  s.hidden = !msg; s.className = 'dl-status ' + kind; s.innerHTML = msg || '';
}
DL.status = status;

async function connect(t) {
  const prev = DL.wcId;
  if (prev && prev !== (t && t.wcId)) {
    for (const h of Object.values(DL.handlers)) if (h.detach) try { h.detach(prev); } catch {}
    nb.invoke('devlab:detach', prev).catch(() => {});
  }
  DL.tab = t; DL.wcId = t && t.wcId || null;
  if (!DL.wcId) { status(''); DL.render(); return; }
  try {
    await nb.invoke('devlab:attach', DL.wcId);
    const l = DL.log();
    status(l.order.length || l.console.length ? '' : `Connected to this tab. <button class="dl-link" id="dl-reload">Reload the page</button> to see everything it loads from the start.`);
    const rb = $('#dl-reload'); if (rb) rb.onclick = () => { status(''); DL.tab.wv.reload(); };
  } catch (e) {
    status('Couldn’t connect to this tab: ' + dlEsc(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')) + (/attached|another/i.test(e.message) ? ' — close the Pro tools first.' : ''), 'bad');
  }
  DL.render();
}
DL.connect = connect;

DL.toggle = (force) => {
  const open = typeof force === 'boolean' ? force : !DL.open;
  if (open === DL.open) { if (open) DL.render(); return; }
  DL.open = open;
  drawer.hidden = !open;
  document.body.classList.toggle('devlab-open', open);
  if (open) { connect(state.active); }
  else {
    for (const h of Object.values(DL.handlers)) if (h.detach) try { h.detach(DL.wcId); } catch {}
    if (DL.wcId) nb.invoke('devlab:detach', DL.wcId).catch(() => {});
    DL.wcId = null; DL.tab = null;
  }
  layoutTabs && layoutTabs();
};

// resize
(() => {
  const h = drawer.querySelector('.dl-resize');
  let H = 390; try { H = +localStorage.getItem('dl-h') || 390; } catch {}
  document.documentElement.style.setProperty('--dlh', H + 'px');
  h.addEventListener('pointerdown', (e) => {
    e.preventDefault(); h.setPointerCapture(e.pointerId);
    document.querySelectorAll('webview').forEach((w) => (w.style.pointerEvents = 'none'));
    const move = (ev) => { const r = $('#content').getBoundingClientRect(); H = Math.round(Math.min(r.height - 120, Math.max(160, r.bottom - ev.clientY))); document.documentElement.style.setProperty('--dlh', H + 'px'); };
    const up = () => { document.querySelectorAll('webview').forEach((w) => (w.style.pointerEvents = '')); h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); try { localStorage.setItem('dl-h', H); } catch {} };
    h.addEventListener('pointermove', move); h.addEventListener('pointerup', up);
  });
})();

$('#dl-close').onclick = () => DL.toggle(false);
$('#dl-pro').onclick = () => { if (state.active && state.active.wcId) { nb.invoke('devlab:pro', state.active.wcId); } };
const kidBox = $('#dl-kid'); kidBox.checked = DL.kid;
kidBox.onchange = () => { DL.kid = kidBox.checked; try { localStorage.setItem('dl-kid', DL.kid ? '1' : '0'); } catch {} DL.render(); };

// events from the main process
nb.on('devlab:event', ({ wcId, method, params }) => {
  if (method === 'detached') { if (wcId === DL.wcId) status('Dev Lab was disconnected from this tab (Pro tools or a crash). <button class="dl-link" id="dl-reconnect">Reconnect</button>', 'bad'); const rc = $('#dl-reconnect'); if (rc) rc.onclick = () => { DL.wcId = null; connect(state.active); }; return; }
  const prevWc = DL.wcId; DL.wcId = wcId;
  const l = DL.log(); DL.wcId = prevWc;
  for (const h of Object.values(DL.handlers)) if (h.event) try { h.event(method, params, l, wcId === DL.wcId); } catch (e) { console.warn('devlab', method, e); }
  if (wcId === DL.wcId) DL.tabsSoon();
});

nb.on('devlab:explore-at', async ({ wcId, x, y }) => {
  const t = state.tabs.find((tt) => tt.wcId === wcId); if (!t) return;
  if (t !== state.active) activate(t);
  DL.tool = 'explore';
  if (!DL.open) DL.toggle(true); else if (DL.wcId !== wcId) await connect(t);
  for (let i = 0; i < 20 && DL.wcId !== wcId; i++) await new Promise((r) => setTimeout(r, 100));
  DL.render(); await new Promise((r) => setTimeout(r, 250));
  DL.handlers.explore.selectAt(x, y);
});

// keep following the active tab
const _dlActivated = hooks.activated;
hooks.activated = (t) => { _dlActivated(t); if (DL.open && t.wcId !== DL.wcId) connect(t); };
const _dlLoaded = hooks.loaded;
hooks.loaded = async (t) => { await _dlLoaded(t); if (DL.open && t === state.active && t.wcId !== DL.wcId) connect(t); };
const _dlShortcut = hooks.shortcut;
hooks.shortcut = (key, mods) => {
  if (_dlShortcut && _dlShortcut(key, mods)) return true;
  const { ctrl, shift } = mods || {};
  if (key === 'f12' && !shift) { DL.toggle(); return true; }
  if (ctrl && shift && key === 'i') { if (state.active && state.active.wcId) nb.invoke('devlab:pro', state.active.wcId); return true; }
  if (ctrl && shift && key === 'c') { DL.tool = 'explore'; DL.toggle(true); DL.render(); setTimeout(() => DL.handlers.explore && DL.handlers.explore.pick(), 300); return true; }
  if (key === 'devlab') { DL.toggle(); return true; }
  return false;
};
const _dlCommands = commands;
commands = function () {
  return [..._dlCommands(),
    CMD('devlab', 'Dev Lab — look inside this page', 'F12', () => DL.toggle(true), 'cmd'),
    ...DL.TOOLS.slice(1).map(([id, emo, kid, pro]) => CMD('devlab-' + id, `Dev Lab: ${emo} ${kid} (${pro})`, '', () => DL.show(id), 'cmd')),
    CMD('playground', 'Code Playground — make your own web page', '', () => newTab({ url: 'noam://playground/' }), 'cmd'),
    CMD('devpro', 'Pro DevTools (Chromium)', 'Ctrl+Shift+I', () => state.active && nb.invoke('devlab:pro', state.active.wcId), 'cmd'),
  ];
};

// ---------------------------------------------------------------- Start tab
DL.handlers.home = {
  render(el) {
    const n = Object.keys(DL.done).length;
    el.innerHTML = `<div class="dl-home">
      <div class="dl-hero"><div><h2>Welcome to the Dev Lab 🧪</h2>
        <p>Every website is made of <b>HTML</b> (the things on the page), <b>CSS</b> (how they look) and <b>JavaScript</b> (what they do). Here you can look inside any page, change it, and learn how it works. Don’t worry — nothing you change here breaks the real website. Reload the page and it’s back to normal.</p>
        <div class="dl-row"><button class="dl-btn primary" data-go="explore">🔍 Start exploring</button><button class="dl-btn" id="dl-play">🧑‍💻 Open the Code Playground</button></div></div>
        <div class="dl-missions"><h3>Missions <span>${n}/${DL.MISSIONS.length} ⭐</span></h3><div class="dl-bar"><i style="width:${n / DL.MISSIONS.length * 100}%"></i></div>
        <ul>${DL.MISSIONS.map(([id, t]) => `<li class="${DL.done[id] ? 'done' : ''}">${DL.done[id] ? '✅' : '⬜'} ${dlEsc(t)}</li>`).join('')}</ul>
        ${n ? '<button class="dl-link" id="dl-reset-m">Start the missions again</button>' : ''}</div></div>
      <div class="dl-cards">${DL.TOOLS.slice(1).map(([id, emo, kid, pro]) => `<button class="dl-card" data-go="${id}"><span class="e">${emo}</span><b>${dlEsc(kid)}</b><small>${dlEsc(DL.CARD_TEXT[id] || pro)}</small></button>`).join('')}</div>
    </div>`;
    el.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => DL.show(b.dataset.go)));
    $('#dl-play').onclick = () => newTab({ url: 'noam://playground/' });
    const rm = $('#dl-reset-m'); if (rm) rm.onclick = () => { DL.done = {}; try { localStorage.removeItem('dl-missions'); } catch {} DL.render(); };
  },
};
DL.CARD_TEXT = {
  explore: 'Point at anything to see what it’s made of — and change it',
  console: 'Talk to the page with JavaScript, and see its error messages explained',
  network: 'See every file the page downloads and who it talks to',
  remix: 'Write CSS to restyle any website, live',
  colors: 'Steal colours with the eyedropper, see the page’s colours and fonts',
  devices: 'See the page like a phone, a tablet — or with colour-blind eyes',
  access: 'Check if the page works for everyone, including people who can’t see well',
  storage: 'See the cookies and notes a website saved on your computer',
  speed: 'Get a speed report card and watch the page in slow motion',
  scripts: 'Read the JavaScript code that runs the page, and freeze it',
};
