// Code Playground: HTML / CSS / JavaScript editors with a live, sandboxed preview.
(async () => {
  await noamReady;
  const T = window.PG_TEMPLATES;
  const KEY = 'pg-projects', CUR = 'pg-current';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
  const persist = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {} };
  let projects = load();
  const fromTemplate = (t) => ({ id: crypto.randomUUID(), name: t.id === 'blank' ? 'My page' : t.name, html: t.html, css: t.css, js: t.js, updated: Date.now() });
  let cur = projects.find((p) => p.id === localStorage.getItem(CUR));
  if (!cur) { cur = projects[0] || fromTemplate(T[0]); if (!projects.length) { projects = [cur]; persist(projects); } }
  let lang = 'html';
  const code = $('#code'), hl = $('#hl'), gut = $('#gut');

  // ---------- highlighting
  const E = esc;
  const HL = {
    html: (s) => E(s).replace(/(&lt;!--[\s\S]*?--&gt;)|(&lt;\/?)([a-zA-Z][\w-]*)|([\w-:]+)(=)(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)/g, (m, com, open, tag, attr, eq, val) => com ? `<span class="t-com">${com}</span>` : tag ? `${open}<span class="t-tag">${tag}</span>` : `<span class="t-attr">${attr}</span>${eq}<span class="t-str">${val}</span>`),
    css: (s) => E(s).replace(/(\/\*[\s\S]*?\*\/)|([^{}\n;]+)(?=\{)|([a-z-]+)(?=\s*:[^{]*?;)|(#[0-9a-fA-F]{3,8}\b|-?\d*\.?\d+(?:px|%|em|rem|s|ms|deg|vh|vw|fr)?\b)/g, (m, com, sel, prop, num) => com ? `<span class="t-com">${com}</span>` : sel ? `<span class="t-sel">${sel}</span>` : prop ? `<span class="t-prop">${prop}</span>` : `<span class="t-num">${num}</span>`),
    js: (s) => E(s).replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(&quot;(?:(?!&quot;).)*?&quot;|&#39;(?:(?!&#39;).)*?&#39;|`[^`]*`)|\b(function|return|if|else|for|while|const|let|var|new|class|true|false|null|undefined|this|async|await|of|in|break|continue|switch|case|default|try|catch|typeof)\b|\b(\d+(?:\.\d+)?)\b/g, (m, com, str, kw, num) => com ? `<span class="t-com">${com}</span>` : str ? `<span class="t-str">${str}</span>` : kw ? `<span class="t-kw">${kw}</span>` : `<span class="t-num">${num}</span>`),
  };
  function paint() {
    hl.innerHTML = HL[lang](code.value) + '\n';
    const n = code.value.split('\n').length;
    gut.innerHTML = Array.from({ length: n }, (_, i) => `<div>${i + 1}</div>`).join('');
    sync();
  }
  const sync = () => { hl.scrollTop = code.scrollTop; hl.scrollLeft = code.scrollLeft; gut.scrollTop = code.scrollTop; };
  code.addEventListener('scroll', sync);

  const TIPS = {
    html: '💡 <b>HTML</b> puts things on the page. Tags come in pairs: <code>&lt;h1&gt;Big title&lt;/h1&gt;</code>. Try adding <code>&lt;img src="https://…"&gt;</code>.',
    css: '💡 <b>CSS</b> decides how things look: <code>h1 { color: red; }</code> makes every big title red. Try changing a colour or a number!',
    js: '💡 <b>JavaScript</b> makes things happen. <code>console.log("hi")</code> writes in the console below. Press <b>Ctrl+Enter</b> to run.',
  };
  const SNIPS = {
    html: [['Heading', '<h2>A heading</h2>'], ['Paragraph', '<p>Some text.</p>'], ['Button', '<button id="myButton">Click me</button>'], ['Picture', '<img src="https://picsum.photos/300/200" alt="a random photo">'], ['Link', '<a href="https://www.wikipedia.org">A link</a>'], ['List', '<ul>\n  <li>One</li>\n  <li>Two</li>\n</ul>'], ['Input box', '<input id="myInput" placeholder="Type here">']],
    css: [['Colour', 'h1 {\n  color: tomato;\n}'], ['Background', 'body {\n  background: lightblue;\n}'], ['Rounded box', '.box {\n  padding: 20px;\n  border-radius: 16px;\n  background: white;\n  box-shadow: 0 4px 12px rgba(0,0,0,.2);\n}'], ['Centre it', 'body {\n  display: grid;\n  place-items: center;\n  height: 100vh;\n}'], ['Animation', '@keyframes spin {\n  to { transform: rotate(360deg); }\n}\nh1 {\n  animation: spin 3s linear infinite;\n}'], ['Hover', 'button:hover {\n  background: gold;\n  transform: scale(1.1);\n}']],
    js: [['Log', "console.log('Hello!');"], ['Click', "document.querySelector('button').onclick = () => {\n  alert('Clicked!');\n};"], ['Variable', 'let score = 0;\nscore = score + 10;\nconsole.log(score);'], ['If', "if (score > 5) {\n  console.log('Big score!');\n} else {\n  console.log('Keep going');\n}"], ['Loop', 'for (let i = 1; i <= 5; i++) {\n  console.log(i);\n}'], ['Timer', "setInterval(() => {\n  console.log('tick');\n}, 1000);"], ['Random', 'const n = Math.floor(Math.random() * 10) + 1;\nconsole.log(n);']],
  };
  function showLang(l) {
    lang = l;
    $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.l === l));
    code.value = cur[l] || '';
    code.placeholder = { html: '<h1>Type HTML here</h1>', css: 'body {\n  background: pink;\n}', js: "console.log('hi');" }[l];
    $('#tip').innerHTML = TIPS[l];
    $('#snips').innerHTML = SNIPS[l].map(([n], i) => `<button class="chip" data-i="${i}">+ ${esc(n)}</button>`).join('');
    $$('#snips .chip').forEach((b) => (b.onclick = () => insert('\n' + SNIPS[lang][+b.dataset.i][1] + '\n')));
    paint(); code.scrollTop = 0; code.focus();
  }
  $$('#tabs button').forEach((b) => (b.onclick = () => showLang(b.dataset.l)));

  function insert(text) {
    const s = code.selectionStart, e = code.selectionEnd;
    code.setRangeText(text, s, e, 'end'); changed();
  }
  let saveT, runT;
  function changed() {
    cur[lang] = code.value; cur.updated = Date.now(); paint();
    clearTimeout(saveT); saveT = setTimeout(() => { const i = projects.findIndex((p) => p.id === cur.id); if (i >= 0) projects[i] = cur; else projects.unshift(cur); persist(projects); }, 300);
    if ($('#auto').checked) { clearTimeout(runT); $('#dot').classList.add('busy'); runT = setTimeout(run, 700); }
  }
  code.addEventListener('input', changed);
  const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
  code.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); insert('  '); }
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const before = code.value.slice(0, code.selectionStart); const line = before.split('\n').pop();
      let ind = line.match(/^\s*/)[0]; if (/[{([>]\s*$/.test(line) && !/<\/\w+>\s*$/.test(line)) ind += '  ';
      insert('\n' + ind);
    } else if (PAIRS[e.key] && code.selectionStart === code.selectionEnd && lang !== 'html') {
      e.preventDefault(); const s = code.selectionStart; code.setRangeText(e.key + PAIRS[e.key], s, s, 'start'); code.selectionStart = code.selectionEnd = s + 1; changed();
    }
  });

  // ---------- running (inside a sandboxed frame that can't touch NoamBrowser)
  const PRELUDE = `<script>(function(){
    var send = function (kind, args) { try { parent.postMessage({ type: 'noam-log', kind: kind, text: Array.prototype.map.call(args, function (a) { try { return typeof a === 'string' ? a : a instanceof Error ? a.toString() : JSON.stringify(a, null, 1) || String(a); } catch (e) { return String(a); } }).join(' ') }, '*'); } catch (e) {} };
    ['log', 'info', 'warn', 'error'].forEach(function (k) { var o = console[k]; console[k] = function () { send(k, arguments); o.apply(console, arguments); }; });
    addEventListener('error', function (e) { var ln = e.lineno ? e.lineno - 1 : 0; /* written documents number lines from the start of the script tag */ send('error', [(e.message || 'Error') + (ln > 0 ? '  (JavaScript line ' + ln + ')' : '')]); });
    addEventListener('unhandledrejection', function (e) { send('error', ['Uncaught (in promise) ' + (e.reason && e.reason.message || e.reason)]); });
    try { localStorage.getItem('x'); } catch (e) { var m = {}; var st = { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; }, clear: function () { m = {}; }, key: function (i) { return Object.keys(m)[i] || null; }, get length() { return Object.keys(m).length; } }; try { Object.defineProperty(window, 'localStorage', { value: st }); } catch (x) {} }
  })();<\/script>`;
  let frame = null, pending = null;
  function build() {
    const head = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${PRELUDE}<style>${cur.css || ''}</style></head><body>${cur.html || ''}<script>\n`;
    return head + (cur.js || '').replace(/<\/script/gi, '<\\/script') + `\n<\/script></body></html>`;
  }
  function run() {
    clearTimeout(runT);
    $('#conlist').innerHTML = ''; errs = 0; $('#errn').hidden = true;
    if (frame) frame.remove();
    frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts allow-modals allow-forms allow-pointer-lock allow-popups allow-popups-to-escape-sandbox');
    frame.src = 'noam://playground/runner.html?' + Date.now();
    pending = build();
    $('#frame').appendChild(frame);
  }
  let errs = 0;
  const EXPLAIN = [
    [/(\S+) is not defined/, (m) => `“${m[1]}” doesn’t exist yet. Check the spelling (capital letters count!) or create it first with <code>let ${m[1]} = …</code>`],
    [/Cannot read properties of (null|undefined)/, () => 'You tried to use something that wasn’t found. If you used <code>getElementById</code>, check the id matches your HTML exactly.'],
    [/is not a function/, () => 'You put <code>()</code> after something that isn’t a function. Check the spelling.'],
    [/Unexpected token|Unexpected end of input|missing \)|Invalid or unexpected token|Unexpected identifier/, () => 'Grammar mistake! Look for a missing <code>)</code>, <code>}</code>, <code>"</code> or comma.'],
    [/Assignment to constant/, () => 'You can’t change a <code>const</code>. Use <code>let</code> instead.'],
  ];
  addEventListener('message', (e) => {
    if (!frame || e.source !== frame.contentWindow) return;
    const d = e.data || {};
    if (d.type === 'noam-ready' && pending != null) { frame.contentWindow.postMessage({ type: 'noam-run', html: pending }, '*'); pending = null; $('#dot').classList.remove('busy'); }
    else if (d.type === 'noam-log') {
      const div = document.createElement('div'); div.className = d.kind; div.textContent = (d.kind === 'error' ? '❌ ' : d.kind === 'warn' ? '⚠️ ' : '› ') + String(d.text).slice(0, 4000);
      $('#conlist').appendChild(div);
      if (d.kind === 'error') {
        errs++; $('#errn').hidden = false; $('#errn').textContent = errs; $('#con').classList.remove('min');
        const ex = EXPLAIN.find(([re]) => re.test(d.text));
        if (ex) { const x = document.createElement('div'); x.className = 'ex'; x.innerHTML = '💡 ' + ex[1](ex[0].exec(d.text)); $('#conlist').appendChild(x); }
      }
      if ($('#conlist').children.length > 500) $('#conlist').firstChild.remove();
      $('#conlist').scrollTop = 1e9;
    }
  });
  $('#run').onclick = run;
  $('#reload').onclick = run;
  $('#conclear').onclick = (e) => { e.stopPropagation(); $('#conlist').innerHTML = ''; errs = 0; $('#errn').hidden = true; };
  $('#conh').onclick = () => $('#con').classList.toggle('min');
  $('#full').onclick = () => { document.body.classList.toggle('pg-full'); $('#full').textContent = document.body.classList.contains('pg-full') ? '✏️ Show code' : '⛶ Big preview'; };

  // ---------- name, projects, files
  $('#name').value = cur.name;
  $('#name').oninput = () => { cur.name = $('#name').value || 'My page'; document.title = cur.name + ' — Code Playground'; changed(); };
  $('#name').onkeydown = (e) => e.stopPropagation();
  document.title = cur.name + ' — Code Playground';
  function openProject(p) { cur = p; try { localStorage.setItem(CUR, p.id); } catch {} $('#name').value = p.name; document.title = p.name + ' — Code Playground'; showLang('html'); run(); }
  $('#new').onclick = () => {
    const m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = `<div class="box"><h2>✨ Start something new</h2><div class="tpls">${T.map((t, i) => `<button class="tpl" data-t="${i}"><span class="e">${t.emoji}</span><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></button>`).join('')}</div>
      ${projects.length ? `<div class="projs"><h2>📁 My projects</h2>${projects.slice().sort((a, b) => b.updated - a.updated).map((p) => `<div class="p"><b data-open="${esc(p.id)}">${esc(p.name)}</b><small>${new Date(p.updated).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</small><button class="chip" data-del="${esc(p.id)}">Delete</button></div>`).join('')}</div>` : ''}
      <div style="text-align:right;margin-top:12px"><button class="btn" id="mclose">Close</button></div></div>`;
    document.body.appendChild(m);
    m.onclick = (e) => { if (e.target === m) m.remove(); };
    m.querySelector('#mclose').onclick = () => m.remove();
    m.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { const p = fromTemplate(T[+b.dataset.t]); projects.unshift(p); persist(projects); m.remove(); openProject(p); }));
    m.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => { m.remove(); openProject(projects.find((p) => p.id === b.dataset.open)); }));
    m.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { if (!confirm('Delete this project?')) return; projects = projects.filter((p) => p.id !== b.dataset.del); persist(projects); m.remove(); if (cur.id === b.dataset.del) openProject(projects[0] || fromTemplate(T[0])); else $('#new').click(); }));
  };
  $('#save').onclick = () => {
    const html = `<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>${esc(cur.name)}</title>\n<style>\n${cur.css}\n</style>\n</head>\n<body>\n${cur.html}\n<script>\n${cur.js}\n<\/script>\n</body>\n</html>\n`;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); a.download = (cur.name.replace(/[^\w\- ]+/g, '').trim() || 'my-page') + '.html'; a.click();
  };
  $('#open').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const doc = new DOMParser().parseFromString(await f.text(), 'text/html');
    const css = [...doc.querySelectorAll('style')].map((s) => s.textContent.trim()).join('\n\n');
    const js = [...doc.querySelectorAll('script:not([src])')].map((s) => s.textContent.trim()).join('\n\n');
    doc.querySelectorAll('style, script:not([src])').forEach((x) => x.remove());
    const p = { id: crypto.randomUUID(), name: f.name.replace(/\.html?$/i, ''), html: doc.body.innerHTML.trim(), css, js, updated: Date.now() };
    projects.unshift(p); persist(projects); openProject(p); e.target.value = '';
  };

  // ---------- resizable split
  $('#split').addEventListener('pointerdown', (e) => {
    const sp = $('#split'); sp.setPointerCapture(e.pointerId); if (frame) frame.style.pointerEvents = 'none';
    const move = (ev) => { const w = Math.min(innerWidth - 240, Math.max(240, ev.clientX)); $('#main').style.gridTemplateColumns = `${w}px 6px minmax(0,1fr)`; };
    const up = () => { sp.removeEventListener('pointermove', move); sp.removeEventListener('pointerup', up); if (frame) frame.style.pointerEvents = ''; };
    sp.addEventListener('pointermove', move); sp.addEventListener('pointerup', up);
  });

  showLang('html');
  run();
})();
