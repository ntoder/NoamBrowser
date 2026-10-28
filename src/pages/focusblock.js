(async () => {
  await noamReady;
  const q = new URLSearchParams(location.search);
  const site = q.get('site') || 'this site', url = q.get('url') || '';
  const QUOTES = [
    'The future depends on what you do today.', 'Small steps every day add up.', 'You don’t have to be great to start, but you have to start to be great.',
    'Focus on being productive instead of busy.', 'It always seems impossible until it’s done.', 'One thing at a time.',
    'Discipline is choosing what you want most over what you want now.', 'Your brain is a muscle — this is the workout.',
    '“אם אין אני לי, מי לי?” — Pirkei Avot 1:14', '“לא עליך המלאכה לגמור, ולא אתה בן חורין להיבטל ממנה” — Pirkei Avot 2:16',
  ];
  $('#quote').textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  $('#site').innerHTML = `<b>${esc(site)}</b> can wait until your break.`;
  document.title = `Focus time — ${site} is paused`;
  const fmt = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  let st = await noam.invoke('focus:block-info');
  const back = async () => { await noam.invoke('focus:resisted', site); if (history.length > 1) history.back(); else location.href = 'noam://newtab/'; };
  const go = async (reason) => { const ok = await noam.invoke('focus:let-through', { site, reason }); if (ok && url) location.replace(url); };

  function renderActs() {
    const a = $('#acts');
    if (st.phase !== 'focus') { // session already over: just go
      $('#title').textContent = st.phase === 'break' ? 'It’s break time! 🎉' : 'Your focus session has ended';
      a.innerHTML = `<button class="btn primary big" id="open">Open ${esc(site)}</button>`;
      $('#open').onclick = () => url && location.replace(url);
      return;
    }
    if (st.mode === 'strict') {
      a.innerHTML = `<button class="btn primary big" id="back">💪 Back to work</button>
        <button class="link" id="need">I really need this site…</button><div id="more" hidden style="width:100%"></div>`;
      $('#need').onclick = () => {
        const PH = 'I choose to break my focus';
        $('#more').hidden = false; $('#need').hidden = true;
        $('#more').innerHTML = `<p class="phrase-q">Strict mode. To open it anyway, type: <b>${PH}</b></p><input class="field phrase" id="ph" autocomplete="off" spellcheck="false"><div class="reasons" style="margin-top:10px"><button class="btn" id="w" disabled>It’s for my work</button><button class="btn" id="b" disabled>Open it anyway</button></div><p class="wait" id="wt"></p>`;
        let wait = 20; const tick = () => { $('#wt').textContent = wait > 0 ? `Take a breath… ${wait}s` : ''; check(); };
        const check = () => { const ok = wait <= 0 && $('#ph').value.trim().toLowerCase() === PH.toLowerCase(); $('#w').disabled = !ok; $('#b').disabled = !ok; };
        const t = setInterval(() => { wait--; tick(); if (wait <= 0) clearInterval(t); }, 1000); tick();
        $('#ph').oninput = check; $('#ph').onpaste = (e) => e.preventDefault(); $('#ph').focus();
        $('#w').onclick = () => go('work'); $('#b').onclick = () => go('broke');
      };
    } else {
      a.innerHTML = `<button class="btn primary big" id="back">💪 Back to work</button>
        <div id="gentle" class="wait">You can open it in <b id="sec">10</b> seconds — but do you really want to?</div><div class="reasons" id="rs" hidden>
        <button class="btn" data-r="work">📚 It’s for my work</button><button class="btn" data-r="quick">👀 A quick look (3 min)</button><button class="btn" data-r="give">😩 I give up for now</button></div>`;
      let n = 10; const t = setInterval(() => { n--; $('#sec').textContent = n; if (n <= 0) { clearInterval(t); $('#gentle').textContent = 'Why do you want to open it?'; $('#rs').hidden = false; } }, 1000);
      $$('[data-r]').forEach((b) => (b.onclick = async () => {
        if (b.dataset.r === 'give') { await noam.invoke('focus:stop', { reason: `Gave up for ${site}` }); if (url) location.replace(url); return; }
        go(b.dataset.r === 'work' ? 'work' : 'quick');
      }));
    }
    $('#back').onclick = back;
  }
  function render() {
    $('#clock').firstChild.textContent = st.phase === 'idle' ? '0:00' : fmt(st.left);
    if (st.task) { $('#task').hidden = false; $('#task b').textContent = st.task; }
    $('#stats').innerHTML = st.phase === 'focus' ? `<span><b>${st.distractions}</b>distractions this session</span><span><b>${st.today}/${st.goal}</b>sessions today</span>` : '';
  }
  renderActs(); render();
  noam.on('focus', (s) => { const phaseChanged = s.phase !== st.phase; st = { ...st, ...s }; render(); if (phaseChanged) renderActs(); });
  setInterval(() => { if (st.phase !== 'idle' && !st.paused) { st.left -= 1000; render(); } }, 1000);
})();
