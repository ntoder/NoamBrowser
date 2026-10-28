// NoamBrowser 2.4 — Focus mode (Pomodoro): toolbar timer, panel, break screen, session report card.
'use strict';
(() => {
  const btn = $('#focus-btn'), lbl = $('#focus-lbl'), panel = $('#focus-panel'), modal = $('#focus-modal');
  let F = { phase: 'idle', left: 0, total: 0 };
  let localTick = Date.now();
  let prefs = { minutes: 25, mode: null };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem('focus-prefs') || '{}')); } catch {}
  const savePrefs = () => { try { localStorage.setItem('focus-prefs', JSON.stringify(prefs)); } catch {} };
  const fmt = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`; };
  const MODES = {
    track: ['👀', 'Just track', 'Nothing is blocked — you’ll just see what distracted you.'],
    gentle: ['🙂', 'Gentle', 'Distracting sites show a reminder. You can still open them after 10 seconds.'],
    strict: ['🔒', 'Strict', 'Distracting sites stay closed until your break. Breaking out takes real effort.'],
  };
  const BREAK_IDEAS = ['🙆 Stand up and stretch your arms up high', '💧 Drink a glass of water', '👀 Look at something far away for 20 seconds', '🚶 Walk around the room', '🌬️ Breathe in for 4… hold for 4… out for 4', '🪟 Look out of the window', '🍎 Grab a healthy snack', '🤸 Do 10 jumping jacks'];
  const curLeft = () => F.phase === 'idle' ? 0 : F.paused ? F.left : Math.max(0, F.left - (Date.now() - localTick));

  // ------------------------------------------------------------------ chime
  function chime(kind) {
    if (F.sound === false) return;
    try {
      const ac = new AudioContext(); const notes = kind === 'break' ? [523, 659, 784] : kind === 'focus' ? [784, 659] : [660];
      notes.forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, ac.currentTime + i * 0.18); g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + i * 0.18 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + i * 0.18 + 0.6); o.connect(g).connect(ac.destination); o.start(ac.currentTime + i * 0.18); o.stop(ac.currentTime + i * 0.18 + 0.7); });
      setTimeout(() => ac.close(), 2000);
    } catch {}
  }

  // ------------------------------------------------------------------ toolbar button
  function renderBtn() {
    const left = curLeft();
    btn.dataset.phase = F.phase; btn.classList.toggle('paused', !!F.paused);
    const p = F.total ? 1 - left / F.total : 0;
    btn.style.setProperty('--p', String(Math.max(0, Math.min(1, p))));
    lbl.textContent = F.phase === 'idle' ? '' : fmt(left);
    btn.title = F.phase === 'focus' ? `Focusing${F.task ? ' on “' + F.task + '”' : ''} — ${fmt(left)} left${F.paused ? ' (paused)' : ''}` : F.phase === 'break' ? `Break — ${fmt(left)} left` : 'Focus timer (Ctrl+Shift+F)';
    document.body.classList.toggle('focusing', F.phase === 'focus' && !F.paused);
    if (!panel.hidden) updatePanelClock();
  }
  setInterval(renderBtn, 1000);

  // ------------------------------------------------------------------ panel
  async function renderPanel() {
    const s = await nb.invoke('focus:stats').catch(() => null);
    const c = (s && s.cfg) || {};
    if (!prefs.mode) prefs.mode = c.mode || 'gentle';
    if (F.phase === 'idle') {
      const mins = [15, 25, 45, 50, 90];
      panel.innerHTML = `<div class="fp-head"><h3>🍅 Focus</h3><button class="link-btn" id="fp-stats">My progress →</button></div>
        <div class="fp-today"><span class="fp-dots">${Array.from({ length: Math.max(s ? s.goal : 4, s ? s.today : 0) }, (_, i) => `<i class="${s && i < s.today ? 'on' : ''}"></i>`).join('')}</span><span>${s ? s.today : 0} of ${s ? s.goal : 4} today</span>${s && s.streak ? `<span class="fp-streak">🔥 ${s.streak}-day streak</span>` : ''}</div>
        <label class="fp-l">What will you work on?</label>
        <input class="fp-in" id="fp-task" placeholder="e.g. Maths homework, page 42" value="${esc(prefs.task || '')}" maxlength="120">
        <label class="fp-l">Make a promise <span>(optional)</span></label>
        <input class="fp-in" id="fp-promise" placeholder="By the end I will have… finished 10 questions" maxlength="200">
        <label class="fp-l">How long?</label>
        <div class="fp-chips">${mins.map((m) => `<button data-m="${m}" class="${prefs.minutes === m ? 'on' : ''}">${m} min</button>`).join('')}<input id="fp-custom" type="number" min="1" max="240" placeholder="other" value="${mins.includes(prefs.minutes) ? '' : prefs.minutes}"></div>
        <label class="fp-l">Distracting sites</label>
        <div class="fp-modes">${Object.entries(MODES).map(([k, [e, n]]) => `<button data-mode="${k}" class="${prefs.mode === k ? 'on' : ''}"><span>${e}</span>${n}</button>`).join('')}</div>
        <p class="fp-note" id="fp-mode-note">${MODES[prefs.mode][2]}${c.holdNotifications ? ' Website notifications are held while you focus.' : ''}</p>
        <button class="btn primary fp-go" id="fp-start">▶ Start focusing</button>
        <button class="link-btn fp-set" id="fp-settings">Choose which sites distract you…</button>`;
      $$('[data-m]', panel).forEach((b) => (b.onclick = () => { prefs.minutes = +b.dataset.m; $('#fp-custom').value = ''; savePrefs(); $$('[data-m]', panel).forEach((x) => x.classList.toggle('on', x === b)); }));
      $('#fp-custom').oninput = (e) => { const v = +e.target.value; if (v > 0) { prefs.minutes = v; savePrefs(); $$('[data-m]', panel).forEach((x) => x.classList.remove('on')); } };
      $$('[data-mode]', panel).forEach((b) => (b.onclick = () => { prefs.mode = b.dataset.mode; savePrefs(); $$('[data-mode]', panel).forEach((x) => x.classList.toggle('on', x === b)); $('#fp-mode-note').textContent = MODES[prefs.mode][2]; }));
      $$('input', panel).forEach((i) => (i.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') $('#fp-start').click(); }));
      $('#fp-start').onclick = async () => {
        prefs.task = $('#fp-task').value.trim(); savePrefs();
        F = await nb.invoke('focus:start', { minutes: prefs.minutes, task: prefs.task, promise: $('#fp-promise').value.trim(), mode: prefs.mode }); localTick = Date.now();
        chime('focus'); renderBtn(); renderPanel(); setTimeout(closePanels, 1200);
      };
      setTimeout(() => $('#fp-task').focus(), 30);
    } else if (F.phase === 'focus') {
      panel.innerHTML = `<div class="fp-head"><h3>${F.paused ? '⏸️ Paused' : '🍅 Focusing'}</h3><button class="link-btn" id="fp-stats">My progress →</button></div>
        <div class="fp-big"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="bg"/><circle cx="60" cy="60" r="52" class="fg" id="fp-arc"/></svg><div><b id="fp-time">${fmt(curLeft())}</b><small>${MODES[F.mode] ? MODES[F.mode][0] + ' ' + MODES[F.mode][1] : ''}</small></div></div>
        ${F.task ? `<div class="fp-task"><span>Working on</span>${esc(F.task)}</div>` : ''}
        ${F.promise ? `<div class="fp-task promise"><span>Your promise</span>${esc(F.promise)}</div>` : ''}
        <div class="fp-live"><span><b id="fp-dist">${F.distractions}</b> distractions</span><span><b>${F.today}/${F.goal}</b> today</span></div>
        <div class="fp-row"><button class="btn" id="fp-pause">${F.paused ? '▶ Resume' : '⏸ Pause'}</button><button class="btn" id="fp-plus">+5 min</button><button class="btn" id="fp-break">☕ Break now</button></div>
        <button class="link-btn danger" id="fp-stop">Stop this session</button>`;
      $('#fp-pause').onclick = async () => { F = await nb.invoke(F.paused ? 'focus:resume' : 'focus:pause'); localTick = Date.now(); renderPanel(); renderBtn(); };
      $('#fp-plus').onclick = async () => { F = await nb.invoke('focus:add-time', 5); localTick = Date.now(); renderBtn(); };
      $('#fp-break').onclick = async () => { F = await nb.invoke('focus:break'); localTick = Date.now(); renderBtn(); renderPanel(); };
      $('#fp-stop').onclick = async () => {
        const b = $('#fp-stop');
        if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Stopping early lowers your score — click again to stop'; return; }
        F = await nb.invoke('focus:stop', { reason: 'Stopped from the panel' }); localTick = Date.now(); renderBtn(); closePanels();
      };
    } else {
      const idea = BREAK_IDEAS[Math.floor(Math.random() * BREAK_IDEAS.length)];
      panel.innerHTML = `<div class="fp-head"><h3>☕ ${F.breakKind === 'long' ? 'Long break' : 'Break time'}</h3><button class="link-btn" id="fp-stats">My progress →</button></div>
        <div class="fp-big brk"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="bg"/><circle cx="60" cy="60" r="52" class="fg" id="fp-arc"/></svg><div><b id="fp-time">${fmt(curLeft())}</b><small>to relax</small></div></div>
        <div class="fp-idea">${esc(idea)}</div>
        <div class="fp-row"><button class="btn primary" id="fp-next">▶ Start next focus now</button><button class="btn" id="fp-skip">Skip break</button></div>`;
      $('#fp-next').onclick = async () => { F = await nb.invoke('focus:start', { minutes: prefs.minutes, task: F.task || prefs.task, mode: prefs.mode }); localTick = Date.now(); chime('focus'); renderBtn(); renderPanel(); };
      $('#fp-skip').onclick = async () => { F = await nb.invoke('focus:skip-break'); localTick = Date.now(); renderBtn(); renderPanel(); };
    }
    const st = $('#fp-stats'); if (st) st.onclick = () => { closePanels(); newTab({ url: 'noam://focus/' }); };
    const se = $('#fp-settings'); if (se) se.onclick = () => { closePanels(); newTab({ url: 'noam://focus/#settings' }); };
    updatePanelClock();
  }
  function updatePanelClock() {
    const t = $('#fp-time'); if (t) t.textContent = fmt(curLeft());
    const arc = $('#fp-arc'); if (arc) { const L = 2 * Math.PI * 52; arc.style.strokeDasharray = L; arc.style.strokeDashoffset = L * (F.total ? curLeft() / F.total : 0); }
    const d = $('#fp-dist'); if (d) d.textContent = F.distractions;
  }
  const togglePanel = () => { const was = !panel.hidden; closePanels(); if (was) return; panel.hidden = false; renderPanel(); placePanel(panel, btn); };
  btn.onclick = togglePanel;

  // ------------------------------------------------------------------ state from main
  nb.on('focus:state', (s) => {
    const prev = F.phase;
    F = s; localTick = Date.now(); renderBtn();
    if (prev !== s.phase) {
      if (s.phase === 'break') { chime('break'); showBreak(); }
      if (prev === 'break' && s.phase !== 'break') { chime('end'); modal.hidden = true; }
      if (!panel.hidden) renderPanel();
    }
  });
  nb.invoke('focus:state').then((s) => { F = s; localTick = Date.now(); renderBtn(); }).catch(() => {});

  // ------------------------------------------------------------------ report card & break screen
  const moodBtns = [['great', '😃'], ['good', '🙂'], ['meh', '😐'], ['hard', '😩']];
  let pendingBreak = false;
  nb.on('focus:done', (r) => { pendingBreak = true; showReport(r); });
  function showReport(r) {
    const visits = Object.entries(r.distractions || {}).sort((a, b) => b[1].visits - a[1].visits);
    const mins = Math.round((r.focusMs || 0) / 60000);
    const color = r.score >= 80 ? 'var(--safe)' : r.score >= 50 ? '#D9A21B' : 'var(--danger)';
    modal.hidden = false;
    modal.innerHTML = `<div class="fm-card">${r.score >= 90 && r.completed ? '<div class="fm-confetti">' + '🎉✨⭐🍅🎊'.repeat(4).split('').filter((c) => c.trim()).map((c, i) => `<i style="--i:${i}">${c}</i>`).join('') + '</div>' : ''}
      <div class="fm-top"><div class="fm-score" style="--c:${color};--p:${r.score}"><b>${r.score}</b><small>focus score</small></div>
      <div><h2>${r.completed ? 'Session complete! 🎉' : 'Session stopped'}</h2><p>${mins} minute${mins === 1 ? '' : 's'} of focus${r.task ? ` on <b>${esc(r.task)}</b>` : ''}. ${r.today}/${r.goal} today${r.streak ? ` · 🔥 ${r.streak}-day streak` : ''}</p></div></div>
      ${r.newBadges && r.newBadges.length ? `<div class="fm-badges">${r.newBadges.map((b) => `<div class="fm-badge"><span>${b.e}</span><b>New badge: ${esc(b.n)}</b><small>${esc(b.d)}</small></div>`).join('')}</div>` : ''}
      <div class="fm-cols"><div><h4>What happened</h4><ul class="fm-parts">${(r.scoreParts || []).map(([t, p]) => `<li><span>${esc(t)}</span><b class="${p < 0 ? 'neg' : 'pos'}">${p < 0 ? p : '✓'}</b></li>`).join('') || '<li><span>Nothing to report — great job</span><b class="pos">✓</b></li>'}</ul></div>
      <div><h4>Distractions</h4>${visits.length ? `<ul class="fm-parts">${visits.map(([k, d]) => `<li><span>${esc(k)}</span><b>${d.visits}× · ${Math.round(d.sec / 60) ? Math.round(d.sec / 60) + ' min' : '<1 min'}</b></li>`).join('')}</ul>` : '<p class="fm-zen">🧘 None at all!</p>'}
        <p class="fm-small">Tab switches: ${r.tabSwitches} · Away from the computer: ${Math.round((r.awaySec || 0) / 60)} min</p></div></div>
      ${r.promise ? `<div class="fm-q"><b>Did you keep your promise?</b><span>“${esc(r.promise)}”</span><div class="fm-opts" data-k="kept"><button data-v="yes">✅ Yes!</button><button data-v="partly">🌓 Partly</button><button data-v="no">❌ Not this time</button></div></div>` : ''}
      <div class="fm-q"><b>How did it feel?</b><div class="fm-opts" data-k="mood">${moodBtns.map(([v, e]) => `<button data-v="${v}">${e}</button>`).join('')}</div></div>
      <input class="fp-in" id="fm-note" placeholder="A note for next time (optional) — what distracted you? what helped?" maxlength="500">
      <div class="fm-acts"><button class="btn" id="fm-progress">📈 My progress</button><button class="btn primary" id="fm-ok">Continue</button></div></div>`;
    $$('.fm-opts', modal).forEach((g) => $$('button', g).forEach((b) => (b.onclick = () => { $$('button', g).forEach((x) => x.classList.toggle('on', x === b)); nb.invoke('focus:rate', { id: r.id, [g.dataset.k]: b.dataset.v }); })));
    const note = $('#fm-note'); note.onkeydown = (e) => e.stopPropagation();
    const close = () => { if (note.value.trim()) nb.invoke('focus:rate', { id: r.id, note: note.value.trim() }); modal.hidden = true; pendingBreak = false; if (F.phase === 'break') showBreak(); };
    $('#fm-ok').onclick = close;
    $('#fm-progress').onclick = () => { close(); newTab({ url: 'noam://focus/' }); };
  }
  function showBreak() {
    if (pendingBreak && !modal.hidden) return; // the report card is showing; the break card follows it
    const ideas = [...BREAK_IDEAS].sort(() => Math.random() - 0.5).slice(0, 3);
    modal.hidden = false;
    modal.innerHTML = `<div class="fm-card brk"><div class="fm-cup">☕</div><h2>${F.breakKind === 'long' ? 'Long break — you earned it!' : 'Break time!'}</h2>
      <div class="fm-clock" id="fm-clock">${fmt(curLeft())}</div><p>Step away from the screen for a bit. Here are some ideas:</p>
      <ul class="fm-ideas">${ideas.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
      <div class="fm-acts"><button class="btn" id="fm-hide">Hide</button><button class="btn" id="fm-skip">Skip break</button><button class="btn primary" id="fm-next">▶ Focus again</button></div></div>`;
    const t = setInterval(() => { const c = $('#fm-clock'); if (!c || F.phase !== 'break') { clearInterval(t); return; } c.textContent = fmt(curLeft()); }, 500);
    $('#fm-hide').onclick = () => { modal.hidden = true; };
    $('#fm-skip').onclick = async () => { F = await nb.invoke('focus:skip-break'); localTick = Date.now(); modal.hidden = true; renderBtn(); };
    $('#fm-next').onclick = async () => { F = await nb.invoke('focus:start', { minutes: prefs.minutes, task: F.task || prefs.task, mode: prefs.mode }); localTick = Date.now(); modal.hidden = true; chime('focus'); renderBtn(); };
  }
  modal.addEventListener('mousedown', (e) => { if (e.target === modal && F.phase !== 'break') { modal.hidden = true; } });

  // ------------------------------------------------------------------ shortcuts, palette, menu
  const _shortcut = hooks.shortcut;
  hooks.shortcut = (key, mods) => {
    if (_shortcut && _shortcut(key, mods)) return true;
    if ((mods && mods.ctrl && mods.shift && key === 'f') || key === 'focus') { togglePanel(); return true; }
    if (key === 'escape' && !modal.hidden) { if (F.phase !== 'break') modal.hidden = true; else modal.hidden = true; return true; }
    return false;
  };
  const _commands = commands;
  commands = function () {
    const extra = F.phase === 'idle'
      ? [CMD('focus-25', 'Start a 25-minute focus session 🍅', 'Ctrl+Shift+F', async () => { F = await nb.invoke('focus:start', { minutes: 25, task: prefs.task, mode: prefs.mode || 'gentle' }); localTick = Date.now(); chime('focus'); renderBtn(); }, 'cmd'),
         CMD('focus-50', 'Start a 50-minute deep-work session', '', async () => { F = await nb.invoke('focus:start', { minutes: 50, task: prefs.task, mode: prefs.mode || 'gentle' }); localTick = Date.now(); chime('focus'); renderBtn(); }, 'cmd')]
      : [CMD('focus-stop', 'Stop the focus session', '', async () => { F = await nb.invoke('focus:stop', { reason: 'Stopped from the command palette' }); localTick = Date.now(); renderBtn(); }, 'cmd')];
    return [..._commands(), ...extra, CMD('focus-stats', 'Focus progress & stats', '', () => newTab({ url: 'noam://focus/' }), 'cmd')];
  };
})();
