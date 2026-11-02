// NoamBrowser — the AI helper tab inside NoamChat. Free and private: it runs on your computer with a small
// built-in model, or with Ollama if you have it. Summarise pages, explain things simply, translate, fix writing.
'use strict';
(() => {
  const MODEL = 'onnx-community/Qwen2.5-0.5B-Instruct';
  const AI = { msgs: [], busy: false, ready: false, loading: false, progress: null, device: '', ollama: null, err: '', reqId: 0, out: '' };
  let worker = null, body = null, curId = null, tick = null;
  const cfg = () => ({ engine: 'builtin', ...(state.settings.ai || {}) });
  const setCfg = async (p) => { state.settings = await nb.invoke('settings:set', { ai: { ...cfg(), ...p } }); };
  const engine = () => cfg().engine;
  const model = () => cfg().model || MODEL;
  const md = (s) => esc(s).replace(/```([\s\S]*?)```/g, '<pre>$1</pre>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/^#{1,3} (.+)$/gm, '<b>$1</b>').replace(/^\s*[-*] (.+)$/gm, '• $1').replace(/\n/g, '<br>');

  // ---------------------------------------------------------------- built-in engine (a worker running the model)
  function startWorker() {
    if (worker) return worker;
    worker = new Worker('vendor/ai-worker.js');
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress') { AI.progress = data; paintProgress(); }
      if (data.type === 'ready') { AI.ready = true; AI.loading = false; AI.device = data.device; AI.progress = null; render(); }
      if (data.type === 'token' && data.id === curId) { AI.out += data.t; paintOut(); }
      if (data.type === 'done' && data.id === curId) finish();
      if (data.type === 'error') { AI.loading = false; if (data.id && data.id === curId) finish(data.error); else { AI.err = friendly(data.error); render(); } }
    };
    worker.onerror = (e) => { AI.loading = false; AI.err = 'The AI couldn’t start: ' + (e.message || 'unknown error'); render(); };
    return worker;
  }
  const friendly = (e) => /fetch|404|download|network|Failed to/i.test(e) ? 'Couldn’t download the AI. Check your internet connection and try again.' : e;
  const builtinOpts = () => ({ model: model(), dtype: cfg().dtype, forceWasm: !!cfg().forceWasm });
  function loadBuiltin() { AI.loading = true; AI.err = ''; render(); startWorker().postMessage({ type: 'load', ...builtinOpts() }); }
  nb.on('ai:token', (d) => {
    if (d.kind === 'dl') { AI.dl = d; paintProgress(); return; }
    if (d.id !== curId) return;
    if (d.token) { AI.out += d.token; paintOut(); }
    if (d.done) finish(d.error);
  });

  // ---------------------------------------------------------------- asking
  const SYSTEM = 'You are the helpful AI assistant built into NoamBrowser. Answer clearly and kindly, in simple words that a 12-year-old understands. Keep answers short unless asked for more. Reply in the same language the user writes in.';
  async function ask(text, opts = {}) {
    if (AI.busy || !text) return;
    let content = text;
    if (opts.page) {
      const t = state.active; const p = t && t.wcId && !t.private ? await nb.invoke('ai:page', t.wcId).catch(() => null) : null;
      if (!p || (!p.text && !p.selection)) { AI.msgs.push({ role: 'assistant', content: 'I can’t read this page. Open a normal web page (not a private tab) and try again.' }); render(); return; }
      const limit = engine() === 'builtin' ? 3500 : 10000;
      const src = opts.selection && p.selection ? p.selection : p.text;
      content = `${text}\n\n---\nPage: ${p.title}\n${p.url}\n\n${src.slice(0, limit)}`;
      opts.show = opts.show || text;
    }
    AI.msgs.push({ role: 'user', content, show: opts.show || text });
    AI.busy = true; AI.out = ''; AI.err = ''; curId = 'q' + ++AI.reqId; render();
    const history = AI.msgs.slice(-8).map((m) => ({ role: m.role, content: m.content }));
    const messages = [{ role: 'system', content: SYSTEM }, ...history];
    if (engine().startsWith('ollama:')) nb.invoke('ai:ollama-chat', { id: curId, model: engine().slice(7), messages });
    else { if (!AI.ready) AI.loading = true; startWorker().postMessage({ type: 'chat', id: curId, messages, maxTokens: opts.long ? 900 : 500, ...builtinOpts() }); }
  }
  function finish(error) {
    if (!AI.busy) return;
    AI.busy = false;
    const text = AI.out.trim();
    if (text) AI.msgs.push({ role: 'assistant', content: text });
    if (error) AI.msgs.push({ role: 'assistant', content: '⚠️ ' + friendly(error), error: true });
    AI.out = ''; curId = null; render();
  }
  function stop() { if (!AI.busy) return; if (engine().startsWith('ollama:')) nb.invoke('ai:ollama-stop', curId); else if (worker) worker.postMessage({ type: 'stop' }); }

  // ---------------------------------------------------------------- the panel
  const ACTIONS = [
    ['📝', 'Summarize this page', () => ask('Summarize this page in 5 short bullet points.', { page: true, long: true })],
    ['🧒', 'Explain it simply', () => ask('Explain what this page is about in very simple words, like to a 10-year-old.', { page: true })],
    ['🔑', 'Key words', () => ask('List the 8 most important words or ideas on this page, each with a one-line meaning.', { page: true })],
    ['🌍', 'Translate selected text', () => ask('Translate this text. If it is in English, translate it to Hebrew; otherwise translate it to English. Only give the translation.', { page: true, selection: true, show: 'Translate the text I selected' })],
    ['✍️', 'Fix my writing', () => ask('Fix the spelling and grammar of this text and make it read well. Give only the fixed text.', { page: true, selection: true, show: 'Fix the writing I selected' })],
    ['🧠', 'Quiz me on this page', () => ask('Make 3 short multiple-choice questions about this page to test me, with the answers at the end.', { page: true, long: true })],
  ];
  function render(el) {
    if (el) body = el; if (!body || !body.isConnected) return;
    const isOllama = engine().startsWith('ollama:');
    const needsDownload = !isOllama && !AI.ready && !(AI.modelBytes > 50e6);
    body.innerHTML = `<div class="ai">
      <div class="ai-top"><select id="ai-engine" class="ai-sel" title="Which AI to use"><option value="builtin" ${!isOllama ? 'selected' : ''}>🔒 Built-in AI (free, private)</option>${(AI.ollama || []).map((m) => `<option value="ollama:${esc(m.name)}" ${engine() === 'ollama:' + m.name ? 'selected' : ''}>🦙 Ollama · ${esc(m.name)}</option>`).join('')}</select>${AI.msgs.length ? '<button class="nc-ib" id="ai-new" title="Start over">🧹 New</button>' : ''}</div>
      ${needsDownload && !AI.msgs.length ? `<div class="nc-card ai-intro"><b>🤖 Your own AI helper</b><p>It runs <b>on your computer</b>: nothing you ask is sent to any company, and it’s free. The first time, NoamBrowser downloads a small AI (about 500 MB). After that it works even offline.</p>
        ${AI.loading ? '<div class="ai-prog"><i id="ai-bar"></i></div><small id="ai-ptext" class="nc-muted">Getting ready…</small>' : `<button class="btn primary nc-wide" id="ai-load">⬇️ Get the AI (about 500 MB)</button>`}
        ${AI.err ? `<div class="nc-err">${esc(AI.err)}</div>` : ''}
        <p class="nc-muted ai-ol">Have <b>Ollama</b> installed? NoamBrowser finds it automatically and can use bigger, smarter models.</p></div>` : ''}
      <div class="ai-msgs" id="ai-msgs">${AI.msgs.length ? AI.msgs.map((m) => `<div class="ai-m ${m.role}${m.error ? ' err' : ''}">${m.role === 'user' ? esc(m.show || m.content) : md(m.content)}${m.role === 'assistant' && !m.error ? '<button class="ai-copy" title="Copy">📋</button>' : ''}</div>`).join('') : ''}
        ${AI.busy ? `<div class="ai-m assistant" id="ai-live">${AI.out ? md(AI.out) : `<span class="ai-dots"><i></i><i></i><i></i></span>${AI.loading ? ' <small class="nc-muted">starting the AI…</small>' : ''}`}</div>` : ''}
        ${!AI.msgs.length && !AI.busy && !needsDownload ? `<div class="nc-empty small"><div>🤖</div><b>Ask me anything</b>or pick something to do with the page you’re on.</div>` : ''}</div>
      ${!AI.busy ? `<div class="ai-acts">${ACTIONS.map(([e, t], i) => `<button data-act="${i}">${e} ${t}</button>`).join('')}</div>` : ''}
      <div class="nc-comp"><textarea id="ai-text" rows="1" placeholder="Ask the AI…"></textarea>${AI.busy ? '<button class="nc-send ai-stop" id="ai-stop" title="Stop">■</button>' : '<button class="nc-send" id="ai-send" title="Send (Enter)">➤</button>'}</div>
      <p class="ai-foot">${isOllama ? '🦙 Using Ollama on your computer.' : AI.ready ? `🔒 Running on your computer${AI.device === 'webgpu' ? ' (graphics card)' : ''}.` : '🔒 Runs on your computer.'} Small AIs can get things wrong, so check important facts.</p></div>`;
    const $b = (s) => body.querySelector(s);
    $b('#ai-engine').onchange = async (e) => { await setCfg({ engine: e.target.value }); render(); };
    const nw = $b('#ai-new'); if (nw) nw.onclick = () => { stop(); AI.msgs = []; render(); };
    const ld = $b('#ai-load'); if (ld) ld.onclick = loadBuiltin;
    const ta = $b('#ai-text');
    ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; ta.style.overflowY = ta.scrollHeight > 120 ? 'auto' : 'hidden'; };
    ta.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const t = ta.value.trim(); if (t) { ta.value = ''; ask(t); } } };
    const sd = $b('#ai-send'); if (sd) sd.onclick = () => { const t = ta.value.trim(); if (t) { ta.value = ''; ask(t); } };
    const st = $b('#ai-stop'); if (st) st.onclick = stop;
    body.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => ACTIONS[+b.dataset.act][2]()));
    body.querySelectorAll('.ai-copy').forEach((b) => (b.onclick = () => navigator.clipboard.writeText(b.parentElement.innerText.replace(/📋$/, '').trim()).then(() => toast('📋 Copied'))));
    const list = $b('#ai-msgs'); if (list) list.scrollTop = list.scrollHeight;
    paintProgress();
    if (!AI.busy) setTimeout(() => ta.focus(), 0);
  }
  function paintOut() { const live = body && body.querySelector('#ai-live'); if (!live) return render(); live.innerHTML = md(AI.out); const l = body.querySelector('#ai-msgs'); if (l) l.scrollTop = l.scrollHeight; }
  function paintProgress() {
    const bar = body && body.querySelector('#ai-bar'), txt = body && body.querySelector('#ai-ptext'); if (!bar) return;
    const p = AI.progress, d = AI.dl;
    const got = p && p.total ? p.loaded : d ? d.got : 0, total = p && p.total ? p.total : d ? d.total : 0;
    if (total) { bar.style.width = Math.min(100, (got / total) * 100) + '%'; txt.textContent = `Downloading the AI… ${Math.round(got / 1048576)} of ${Math.round(total / 1048576)} MB`; }
    else if (got) txt.textContent = `Downloading the AI… ${Math.round(got / 1048576)} MB`;
  }
  async function refreshOllama() { try { const [s, mi] = await Promise.all([nb.invoke('ai:status'), nb.invoke('ai:model-info')]); AI.ollama = s.ollama; AI.modelBytes = mi.bytes; if (body && body.isConnected && !AI.busy) render(); } catch {} }
  window.renderAIPanel = (el) => { render(el); refreshOllama(); };
  window.NoamAI = { ask, stop, state: AI };
})();
