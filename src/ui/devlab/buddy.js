// Code Buddy — developer tools for beginners. Lives in the Dev Lab drawer as its own mode:
// 🐣 Code Buddy (simple, guided)  |  🧪 Dev Lab (all the tools)  |  Pro tools (Chromium DevTools)
'use strict';
(() => {
  const drawer = $('#devlab');
  const E = dlEsc;
  const B = { view: 'what', det: null, code: [], tick: -1, poll: null, teach: false, mode: 'buddy' };
  try { B.mode = localStorage.getItem('dl-mode') || 'buddy'; B.teach = localStorage.getItem('buddy-teach') === '1'; B.code = JSON.parse(localStorage.getItem('buddy-code') || '[]'); } catch {}
  DL.mode = B.mode;
  const saveCode = () => { try { localStorage.setItem('buddy-code', JSON.stringify(B.code.slice(-40))); } catch {} };

  // ------------------------------------------------------------------ mode switch in the header
  const logo = drawer.querySelector('.dl-logo');
  logo.outerHTML = `<div class="dl-modes" role="tablist"><button data-mode="buddy" title="Simple tools for beginners">🐣 <b>Code Buddy</b></button><button data-mode="lab" title="All the developer tools">🧪 <b>Dev Lab</b></button></div>`;
  const setMode = (m) => {
    B.mode = DL.mode = m; try { localStorage.setItem('dl-mode', m); } catch {}
    if (m === 'lab') { quest('lab'); pageMode(B.teach ? 'teach' : 'off'); stopPoll(); }
    DL.render();
  };
  drawer.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));

  // ------------------------------------------------------------------ talking to the page
  const wv = () => (DL.tab && DL.tab.wv) || (state.active && state.active.wv);
  const run = (code) => { const w = wv(); return w ? w.executeJavaScript(code).catch(() => null) : Promise.resolve(null); };
  const inject = (w) => (w || wv()) && (w || wv()).executeJavaScript(`(${window.NOAM_BUDDY_PAGE.toString()})(); true`).catch(() => false);
  const call = async (expr) => { await inject(); return run(`window.__noamBuddy && window.__noamBuddy.${expr}`); };
  const pageMode = (m) => call(`mode(${JSON.stringify(m)})`);
  function startPoll() {
    stopPoll();
    B.poll = setInterval(async () => {
      if (!DL.open || B.mode !== 'buddy') return stopPoll();
      const s = await run('window.__noamBuddy && window.__noamBuddy.state()');
      if (!s) return;
      for (const [k, v] of s.events || []) {
        if (k === 'pick') { if (/^h[1-6]$/.test(v)) quest('heading'); if (v === 'a') quest('link'); if (v === 'img') quest('picture'); }
      }
      if (s.tick !== B.tick) { B.tick = s.tick; if (s.sel) { B.det = await call('details()'); if (B.view === 'what' || B.view === 'pick') B.view = 'what'; render(); } }
      const pickBtn = DL.body.querySelector('#bd-pick'); if (pickBtn) pickBtn.classList.toggle('on', s.mode === 'pick');
    }, 300);
  }
  function stopPoll() { clearInterval(B.poll); B.poll = null; }

  // ------------------------------------------------------------------ quests
  const QUESTS = [
    ['heading', '📰', 'Pick a heading', 'Click 👆 Pick, then click a big title on the page.'],
    ['link', '🔗', 'Find out where a link goes', 'Pick a link — Code Buddy tells you where it would take you.'],
    ['picture', '🖼️', 'Pick a picture', 'Does it have a description? People who can’t see need one!'],
    ['words', '✍️', 'Change the words of something', 'Pick a heading and type new words in ✏️ Change it.'],
    ['color', '🎨', 'Paint something a new colour', 'Pick anything, then click a colour.'],
    ['bigger', '🔍', 'Make something bigger', 'Use the Bigger button.'],
    ['round', '⭕', 'Give something round corners', 'Try it on a button or a picture.'],
    ['fun', '🌈', 'Do something silly', 'Spin it, tilt it, or make it rainbow.'],
    ['code', '👀', 'Look at the code of something', 'Pick anything, then open 👀 See the code.'],
    ['copy', '📋', 'Copy the code you wrote', 'Every change you make writes real CSS code. Copy it!'],
    ['playground', '🧑‍💻', 'Make your own page', 'Send your code to the Playground and keep building.'],
    ['lab', '🧪', 'Level up: open the Dev Lab', 'When you’re ready for all the tools, switch to 🧪 Dev Lab at the top.'],
  ];
  let done = {}; try { done = JSON.parse(localStorage.getItem('buddy-quests') || '{}'); } catch {}
  function quest(id) {
    if (done[id]) return;
    done[id] = Date.now(); try { localStorage.setItem('buddy-quests', JSON.stringify(done)); } catch {}
    const q = QUESTS.find((x) => x[0] === id); const n = Object.keys(done).length;
    toast(`⭐ Quest done: ${q ? q[2] : id} (${n}/${QUESTS.length})`, 3200);
    if (n === QUESTS.length) setTimeout(() => toast('🏆 You finished every Code Buddy quest. You’re a web developer now!', 6000), 3400);
    if (DL.mode === 'buddy' && B.view === 'quests') render();
  }

  // ------------------------------------------------------------------ views
  const COLORS = ['#e5484d', '#ee7a2e', '#f5c518', '#3fae5a', '#14a89b', '#3e8deb', '#7c68fa', '#e055a3', '#ffffff', '#111111'];
  const CNAME = { '#e5484d': 'red', '#ee7a2e': 'orange', '#f5c518': 'yellow', '#3fae5a': 'green', '#14a89b': 'teal', '#3e8deb': 'blue', '#7c68fa': 'purple', '#e055a3': 'pink', '#ffffff': 'white', '#111111': 'black' };
  const FONTS = [['Comic Sans MS, Comic Neue, cursive', 'Comic'], ['Georgia, serif', 'Fancy'], ['Courier New, monospace', 'Typewriter'], ['Impact, Haettenschweiler, sans-serif', 'Poster'], ['system-ui, sans-serif', 'Normal']];
  const side = () => `<nav class="bd-nav">
    <div class="bd-mascot"><span>🐣</span><div>${B.mascot || 'Hi! I’m Code Buddy. Let’s look inside this page!'}</div></div>
    ${[['what', '🔦', 'What is this?'], ['change', '✏️', 'Change it'], ['code', '👀', 'See the code'], ['quests', '🎓', 'Quests']].map(([v, e, n]) => `<button data-view="${v}" class="${B.view === v ? 'on' : ''}"><span>${e}</span>${n}${v === 'quests' ? `<i>${Object.keys(done).length}/${QUESTS.length}</i>` : ''}</button>`).join('')}
    <label class="bd-teach" title="Show a little explanation bubble whenever you hover something, on every page"><input type="checkbox" id="bd-teach" ${B.teach ? 'checked' : ''}> Teach me on every page</label>
  </nav>`;
  const needPick = (what) => `<div class="bd-empty"><div class="big">👆</div><h3>First, pick something on the page</h3><p>Click <b>Pick</b>, then click anything on the page — a title, a picture, a button…</p><button class="dl-btn primary big" id="bd-pick2">👆 Pick something</button><p class="muted">${what}</p></div>`;
  function viewWhat() {
    const d = B.det;
    return `<div class="bd-main">
      <div class="bd-top"><button class="dl-btn primary big" id="bd-pick">👆 Pick something</button><span class="muted">Or just move your mouse over the page — I’ll tell you what everything is.</span></div>
      ${d ? `<div class="bd-card"><div class="bd-emoji">${d.e}</div><div class="bd-info"><h3>${E(d.t)}</h3><p>${E(d.d)}</p>
        <div class="bd-chips"><span class="chip code">${E(d.c)}</span><span class="chip">${d.w} × ${d.h} pixels</span>${d.id ? `<span class="chip">id: ${E(d.id)}</span>` : ''}${d.cls.length ? `<span class="chip">class: ${E(d.cls.join(' '))}</span>` : ''}</div>
        <div class="bd-row"><button class="dl-btn" data-go="change">✏️ Change it</button><button class="dl-btn" data-go="code">👀 See its code</button><button class="dl-btn ghost" id="bd-parent">⬆️ The box it’s inside</button></div></div></div>
        ${DL.kid !== false ? `<p class="bd-tip">💡 Every website is built from pieces like this one. The <b>code name</b> (like <code>${E(d.c)}</code>) is how the website’s code says what it is.</p>` : ''}`
      : `<div class="bd-hello"><div class="big">🔦</div><h3>What is this thing?</h3><p>Hover over anything on the page and a bubble tells you what it is.<br>Click <b>👆 Pick something</b> to choose one — then you can change it or see its code.</p></div>`}
    </div>`;
  }
  function viewChange() {
    const d = B.det; if (!d) return `<div class="bd-main">${needPick('Then you can change its words, colours and size.')}</div>`;
    return `<div class="bd-main bd-change"><div class="bd-ctl">
      <div class="bd-sel">${d.e} <b>${E(d.t)}</b> <span class="chip code">${E(d.c)}</span><button class="dl-link" id="bd-pick3">pick something else</button></div>
      ${d.text !== null ? `<label class="bd-l">✍️ Words</label><div class="bd-words"><input class="dl-input" id="bd-text" value="${E((d.text || '').slice(0, 300))}"><button class="dl-btn primary" id="bd-text-go">Change</button></div>` : ''}
      <label class="bd-l">🎨 Text colour</label><div class="bd-sw">${COLORS.map((c) => `<button data-color="${c}" style="background:${c}" title="${CNAME[c]}"></button>`).join('')}</div>
      <label class="bd-l">🖌️ Background</label><div class="bd-sw">${COLORS.map((c) => `<button data-bg="${c}" style="background:${c}" title="${CNAME[c]}"></button>`).join('')}</div>
      <label class="bd-l">🔠 Size & shape</label><div class="bd-row"><button class="dl-btn" data-ch="bigger">🔍 Bigger</button><button class="dl-btn" data-ch="smaller">🔎 Smaller</button><button class="dl-btn" data-round="0">⬛ Square</button><button class="dl-btn" data-round="14">▢ Round</button><button class="dl-btn" data-round="999">⚪ Very round</button><button class="dl-btn" data-ch="center">↔️ Centre</button></div>
      <label class="bd-l">🔤 Font</label><div class="bd-row">${FONTS.map(([f, n]) => `<button class="dl-btn" data-font="${E(f)}" style="font-family:${E(f)}">${n}</button>`).join('')}</div>
      <label class="bd-l">🤪 Fun</label><div class="bd-row"><button class="dl-btn" data-ch="spin">🌀 Spin</button><button class="dl-btn" data-ch="tilt">↪️ Tilt</button><button class="dl-btn" data-ch="rainbow">🌈 Rainbow</button><button class="dl-btn" data-ch="shadow">🌑 Shadow</button><button class="dl-btn" data-border="#ff9f1c">🟧 Border</button><button class="dl-btn" data-ch="hide">🙈 Hide it</button></div>
      <div class="bd-row" style="margin-top:12px"><button class="dl-btn" id="bd-undo" ${d.canUndo ? '' : 'disabled'}>↩️ Undo</button><button class="dl-btn ghost" id="bd-reload">🔄 Put the page back</button></div>
    </div>
    <div class="bd-mycode"><h4>📜 The code you wrote</h4><p class="muted">Every change you make is real CSS — the language that styles websites. ${B.code.length ? '' : 'Make a change and watch!'}</p>
      <pre class="bd-pre">${B.code.map((c, i) => `<span class="${i === B.code.length - 1 ? 'new' : ''}">${hlCSS(c)}</span>`).join('\n') || '<span class="muted">/* your code will appear here */</span>'}</pre>
      ${B.code.length ? `<p class="bd-explain">${explainCSS(B.code[B.code.length - 1])}</p><div class="bd-row"><button class="dl-btn" id="bd-copy">📋 Copy my code</button><button class="dl-btn primary" id="bd-play">🧑‍💻 Build a page with it</button><button class="dl-link" id="bd-clear">clear</button></div>` : ''}
    </div></div>`;
  }
  function hlCSS(c) {
    if (c.startsWith('<')) return `<span class="h-tag">${E(c)}</span>`;
    const m = /^(.*?)\s*\{\s*(.*?)\s*\}$/.exec(c); if (!m) return E(c);
    return `<span class="h-sel">${E(m[1])}</span> { ${m[2].split(';').filter((x) => x.trim()).map((p) => { const [k, ...v] = p.split(':'); return `<span class="h-prop">${E(k.trim())}</span>: <span class="h-val">${E(v.join(':').trim())}</span>;`; }).join(' ')} }`;
  }
  const PROP = { color: 'colour of the words', 'background-color': 'colour behind it', 'background-image': 'a picture or gradient behind it', 'font-size': 'how big the letters are', 'border-radius': 'how round the corners are', border: 'a line around it', 'font-family': 'which font the letters use', 'text-align': 'where the words line up', visibility: 'whether you can see it', transform: 'spin, move or stretch it', 'box-shadow': 'a shadow under it' };
  function explainCSS(c) {
    if (c.startsWith('<')) return '💡 That’s <b>HTML</b>: the opening tag, your words, then the closing tag with a <b>/</b>.';
    const m = /^(.*?)\s*\{\s*([a-z-]+)/.exec(c); if (!m) return '';
    return `💡 <code>${E(m[1])}</code> chooses <b>which thing</b> to style. <code>${E(m[2])}</code> means <b>${E(PROP[m[2]] || m[2])}</b>. Each rule ends with a <code>;</code>`;
  }
  function viewCode() {
    const d = B.det; if (!d) return `<div class="bd-main">${needPick('Then you’ll see the HTML code that makes it.')}</div>`;
    quest('code');
    const tok = E(d.code).replace(/(&lt;\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+(?:=(?:&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|[^\s&]+))?)*)(\s*\/?&gt;)/g, (m, open, tag, attrs, close) =>
      `<span class="h-tag">${open}${tag}</span>${attrs.replace(/([\w:-]+)(=)(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|[^\s&]+)/g, '<span class="h-attr">$1</span>$2<span class="h-str">$3</span>')}<span class="h-tag">${close}</span>`);
    return `<div class="bd-main bd-codeview"><div class="bd-sel">${d.e} <b>${E(d.t)}</b> <span class="chip code">${E(d.c)}</span><button class="dl-link" id="bd-pick3">pick something else</button></div>
      <div class="bd-legend"><span><i class="h-tag">&lt;tag&gt;</i> what it is</span><span><i class="h-attr">name</i>=<i class="h-str">"value"</i> its settings</span><span><i>Plain words</i> what you see</span></div>
      <pre class="bd-pre big">${tok}</pre>
      <p class="bd-tip">💡 HTML is like a sandwich 🥪: <code>&lt;${E(d.tag)}&gt;</code> opens it, <code>&lt;/${E(d.tag)}&gt;</code> closes it, and what’s in between is the filling. Things inside other things are pushed to the right so you can see what’s inside what.</p>
      <div class="bd-row"><button class="dl-btn" id="bd-copy-html">📋 Copy this code</button><button class="dl-btn ghost" id="bd-parent">⬆️ Show the box it’s inside</button></div></div>`;
  }
  function viewQuests() {
    const n = Object.keys(done).length; const next = QUESTS.find((q) => !done[q[0]]);
    return `<div class="bd-main"><div class="bd-qhead"><h3>🎓 Quests</h3><span>${n}/${QUESTS.length} ⭐</span></div><div class="dl-bar"><i style="width:${n / QUESTS.length * 100}%"></i></div>
      ${next ? `<div class="bd-next"><span>${next[1]}</span><div><b>Next: ${E(next[2])}</b><small>${E(next[3])}</small></div></div>` : '<div class="bd-next win"><span>🏆</span><div><b>You did them all!</b><small>Try the 🧪 Dev Lab missions next, or build your own page in the Playground.</small></div></div>'}
      <ul class="bd-quests">${QUESTS.map(([id, e, t]) => `<li class="${done[id] ? 'done' : ''}"><span>${done[id] ? '✅' : e}</span>${E(t)}</li>`).join('')}</ul>
      ${n ? '<button class="dl-link" id="bd-reset">Start the quests again</button>' : ''}</div>`;
  }
  function render() {
    const body = DL.body;
    body.innerHTML = `<div class="bd">${side()}${B.view === 'change' ? viewChange() : B.view === 'code' ? viewCode() : B.view === 'quests' ? viewQuests() : viewWhat()}</div>`;
    wire(body);
  }

  async function change(kind, value) {
    const r = await call(`change(${JSON.stringify(kind)}, ${JSON.stringify(value)})`);
    if (!r) return;
    const line = r.css || r.html; if (line) { B.code.push(line); saveCode(); }
    if (kind === 'text' && /^h[1-6]$/.test(B.det.tag)) quest('words'); else if (kind === 'text') quest('words');
    if (kind === 'color' || kind === 'bg') quest('color');
    if (kind === 'bigger') quest('bigger');
    if (kind === 'round' && +value > 0) quest('round');
    if (['spin', 'tilt', 'rainbow'].includes(kind)) quest('fun');
    B.mascot = ['Ooh, nice!', 'Look at that!', 'You’re coding! 🎉', 'Great change!', 'Wow!'][Math.floor(Math.random() * 5)];
    B.det = await call('details()'); render();
  }
  function wire(el) {
    el.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => { B.view = b.dataset.view; B.mascot = null; render(); }));
    el.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { B.view = b.dataset.go; render(); }));
    const pick = async () => { await pageMode('pick'); B.mascot = 'Now click something on the page! (Esc to cancel)'; render(); el.querySelector('#bd-pick') && el.querySelector('#bd-pick').classList.add('on'); };
    for (const id of ['#bd-pick', '#bd-pick2', '#bd-pick3']) { const b = el.querySelector(id); if (b) b.onclick = () => { if (id !== '#bd-pick') B.view = B.view === 'quests' ? 'what' : B.view; pick(); }; }
    const par = el.querySelector('#bd-parent'); if (par) par.onclick = async () => { await call('parent()'); B.det = await call('details()'); render(); };
    const teach = el.querySelector('#bd-teach'); if (teach) teach.onchange = () => { B.teach = teach.checked; try { localStorage.setItem('buddy-teach', B.teach ? '1' : '0'); } catch {} applyTeachAll(); toast(B.teach ? '🐣 Teach me is on — hover anything on any page' : 'Teach me is off'); };
    const tx = el.querySelector('#bd-text'); if (tx) { tx.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') change('text', tx.value); }; el.querySelector('#bd-text-go').onclick = () => change('text', tx.value); }
    el.querySelectorAll('[data-color]').forEach((b) => (b.onclick = () => change('color', CNAME[b.dataset.color] === 'white' || CNAME[b.dataset.color] === 'black' ? CNAME[b.dataset.color] : b.dataset.color)));
    el.querySelectorAll('[data-bg]').forEach((b) => (b.onclick = () => change('bg', CNAME[b.dataset.bg] === 'white' || CNAME[b.dataset.bg] === 'black' ? CNAME[b.dataset.bg] : b.dataset.bg)));
    el.querySelectorAll('[data-ch]').forEach((b) => (b.onclick = () => change(b.dataset.ch)));
    el.querySelectorAll('[data-round]').forEach((b) => (b.onclick = () => change('round', b.dataset.round)));
    el.querySelectorAll('[data-font]').forEach((b) => (b.onclick = () => change('font', b.dataset.font)));
    el.querySelectorAll('[data-border]').forEach((b) => (b.onclick = () => change('border', b.dataset.border)));
    const u = el.querySelector('#bd-undo'); if (u) u.onclick = async () => { await call('undo()'); B.code.pop(); saveCode(); B.det = await call('details()'); render(); };
    const rl = el.querySelector('#bd-reload'); if (rl) rl.onclick = () => { B.det = null; wv() && wv().reload(); render(); };
    const cp = el.querySelector('#bd-copy'); if (cp) cp.onclick = () => { DL.copy(B.code.join('\n')); quest('copy'); };
    const ch = el.querySelector('#bd-copy-html'); if (ch) ch.onclick = () => DL.copy(B.det.code);
    const cl = el.querySelector('#bd-clear'); if (cl) cl.onclick = () => { B.code = []; saveCode(); render(); };
    const pl = el.querySelector('#bd-play'); if (pl) pl.onclick = () => { quest('playground'); newTab({ url: 'noam://playground/?buddy-css=' + encodeURIComponent(B.code.filter((c) => !c.startsWith('<')).join('\n')) }); };
    const rs = el.querySelector('#bd-reset'); if (rs) rs.onclick = () => { done = {}; try { localStorage.removeItem('buddy-quests'); } catch {} render(); };
  }

  // ------------------------------------------------------------------ "Teach me" on every page
  async function applyTeach(t) {
    if (!t || !t.wv || !t.wcId || t.private) return;
    if (B.teach || (DL.open && DL.mode === 'buddy' && t === state.active)) { await inject(t.wv); t.wv.executeJavaScript(`window.__noamBuddy && window.__noamBuddy.state().mode !== 'pick' && window.__noamBuddy.mode(${JSON.stringify(DL.open && DL.mode === 'buddy' && t === state.active && B.view === 'what' ? 'explore' : 'teach')})`).catch(() => {}); }
    else t.wv.executeJavaScript('window.__noamBuddy && window.__noamBuddy.mode("off")').catch(() => {});
  }
  const applyTeachAll = () => state.tabs.forEach(applyTeach);

  // ------------------------------------------------------------------ hook into the Dev Lab drawer
  const _render = DL.render;
  DL.render = () => {
    if (!DL.open) return;
    drawer.classList.toggle('buddy', DL.mode === 'buddy');
    drawer.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === DL.mode));
    if (DL.mode !== 'buddy') { stopPoll(); return _render(); }
    if (!DL.tab || !DL.tab.wcId) { DL.body.innerHTML = '<div class="dl-empty">Open a web page first, then come back here. 🙂</div>'; return; }
    render(); startPoll(); applyTeach(DL.tab);
  };
  const _toggle = DL.toggle;
  DL.toggle = (force) => { _toggle(force); if (!DL.open) { stopPoll(); B.det = null; B.tick = -1; state.tabs.forEach((t) => t.wv && t.wcId && t.wv.executeJavaScript('window.__noamBuddy && window.__noamBuddy.clear()').catch(() => {})); applyTeachAll(); } };
  const _act = hooks.activated;
  hooks.activated = (t) => { _act(t); if (DL.open && DL.mode === 'buddy') { B.det = null; B.tick = -1; } applyTeachAll(); };
  const _loaded = hooks.loaded;
  hooks.loaded = async (t) => { await _loaded(t); if (t === state.active && DL.open && DL.mode === 'buddy') { B.det = null; B.tick = -1; render(); } applyTeach(t); };
  const _cmds = commands;
  commands = function () {
    return [..._cmds(),
      CMD('buddy', 'Code Buddy — dev tools for beginners 🐣', 'F12', () => { setMode('buddy'); DL.toggle(true); }, 'cmd'),
      CMD('teach', `${B.teach ? 'Turn off' : 'Turn on'} “Teach me” bubbles on every page`, '', () => { B.teach = !B.teach; try { localStorage.setItem('buddy-teach', B.teach ? '1' : '0'); } catch {} applyTeachAll(); toast(B.teach ? '🐣 Teach me is on' : 'Teach me is off'); }, 'cmd'),
    ];
  };
  window.__buddyRefresh = () => applyTeach(state.active);
  setTimeout(applyTeachAll, 1500);
})();
