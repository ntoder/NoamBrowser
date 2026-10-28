(async () => {
  let s = await noamReady;
  let R = null;
  const fmt = (ms) => { const t = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  const hm = (min) => min >= 60 ? `${Math.floor(min / 60)} h ${min % 60 ? (min % 60) + ' min' : ''}`.trim() : `${min} min`;
  const MOOD = { great: '😃', good: '🙂', meh: '😐', hard: '😩' };
  const scoreColor = (v) => v >= 80 ? 'var(--safe)' : v >= 50 ? '#D9A21B' : 'var(--danger)';

  async function load() { R = await noam.invoke('focus:stats'); render(); }
  function renderNow(st) {
    const el = $('#now');
    if (st.phase === 'idle') { el.innerHTML = `<span>Ready when you are</span><button class="btn tomato" id="go">▶ Start ${R ? R.cfg.work : 25} min</button>`; $('#go').onclick = async () => { await noam.invoke('focus:start', {}); load(); }; }
    else el.innerHTML = `<span>${st.phase === 'break' ? '☕ Break' : st.paused ? '⏸ Paused' : '🍅 Focusing'}${st.task ? ': ' + esc(st.task) : ''}</span><span class="t">${fmt(st.left)}</span><button class="btn" id="stop">Stop</button>`;
    const stop = $('#stop'); if (stop) stop.onclick = async () => { await noam.invoke('focus:stop', { reason: 'Stopped from the progress page' }); load(); };
  }
  function render() {
    const r = R; renderNow(r.state);
    $('#h-today').textContent = `${r.today} / ${r.goal}`;
    $('#h-today-s').textContent = r.today >= r.goal ? '🎯 Daily goal reached!' : `${hm(r.todayMinutes)} of focus · ${r.goal - r.today} to go`;
    $('#h-streak').textContent = r.streak ? `🔥 ${r.streak}` : '0';
    $('#h-streak-s').textContent = r.streak ? `day${r.streak === 1 ? '' : 's'} in a row · best ${r.totals.maxStreak}` : 'Finish a session today to start one';
    $('#h-score').textContent = r.scoreNow ?? '—';
    $('#h-score').style.color = r.scoreNow != null ? scoreColor(r.scoreNow) : '';
    const d = r.scoreNow != null && r.scoreBefore != null ? r.scoreNow - r.scoreBefore : null;
    $('#h-score-s').innerHTML = d === null ? 'Average of your last 10 sessions' : d >= 0 ? `<span class="up">▲ ${d}</span> better than the 10 before` : `<span class="down">▼ ${-d}</span> lower than the 10 before`;
    $('#h-total').textContent = hm(r.totals.minutes);
    $('#h-total-s').textContent = `${r.totals.done} sessions · 🛡️ resisted distractions ${r.resisted}×`;

    // chart
    const W = 1000, H = 190, pad = 22, n = r.perDay.length, bw = (W - pad * 2) / n;
    const maxM = Math.max(30, ...r.perDay.map((x) => x.minutes));
    let svg = '';
    for (let i = 0; i <= 2; i++) { const y = pad + (H - pad * 2) * i / 2; svg += `<line x1="${pad}" x2="${W - pad}" y1="${y}" y2="${y}" stroke="currentColor" opacity=".08"/>`; }
    r.perDay.forEach((x, i) => {
      const h = (H - pad * 2) * x.minutes / maxM; const X = pad + i * bw + bw * 0.18;
      svg += `<rect x="${X}" y="${H - pad - h}" width="${bw * 0.64}" height="${Math.max(h, x.minutes ? 2 : 0)}" rx="4" stroke="none" fill="#e5484d" opacity="${i === n - 1 ? 1 : 0.75}"><title>${x.day}: ${x.minutes} min, ${x.sessions} sessions</title></rect>`;
      if (i % 5 === 4 || i === n - 1) svg += `<text x="${X + bw * 0.32}" y="${H - 5}" text-anchor="middle" font-size="11" stroke="none" fill="currentColor" opacity=".55">${new Date(x.day + 'T12:00').toLocaleDateString([], { day: 'numeric', month: 'short' })}</text>`;
    });
    const pts = r.perDay.map((x, i) => x.score == null ? null : [pad + i * bw + bw / 2, H - pad - (H - pad * 2) * x.score / 100]).filter(Boolean);
    if (pts.length > 1) svg += `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>`;
    for (const p of pts) svg += `<circle cx="${p[0]}" cy="${p[1]}" r="3.5" stroke="none" fill="var(--accent)"/>`;
    $('#chart').setAttribute('viewBox', `0 0 ${W} ${H}`); $('#chart').innerHTML = svg;

    // trends
    if (!r.sites.length) $('#trend').innerHTML = '<div class="empty">No distractions recorded yet. 🧘 Keep it up!</div>';
    else $('#trend').innerHTML = `<table class="trend"><tr><th>Site</th><th style="text-align:right">This week</th><th style="text-align:right">Last week</th><th></th></tr>${r.sites.slice(0, 10).map((x) => {
      const nowV = x.now.toFixed(1), was = x.before == null ? '—' : x.before.toFixed(1);
      const change = x.before ? Math.round((x.now - x.before) / x.before * 100) : null;
      const msg = change === null ? '' : change <= -10 ? `<span class="up">▼ ${-change}% less 🎉</span>` : change >= 10 ? `<span class="down">▲ ${change}% more</span>` : '<span style="color:var(--muted)">about the same</span>';
      return `<tr><td><b>${esc(x.key)}</b><br><small style="color:var(--muted)">${x.visits} visit${x.visits === 1 ? '' : 's'} · ${Math.round(x.sec / 60)} min</small></td><td class="n">${nowV}</td><td class="n">${was}</td><td>${msg}</td></tr>`;
    }).join('')}</table><p class="sub" style="margin:8px 0 0">Numbers are visits per focus session.</p>`;

    // heatmap
    const maxH = Math.max(1, ...r.heat.flat());
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    $('#heat').innerHTML = '<span></span>' + Array.from({ length: 24 }, (_, h) => `<span style="text-align:center">${h % 6 === 0 ? h : ''}</span>`).join('') +
      r.heat.map((row, d) => `<span>${days[d]}</span>` + row.map((m, h) => `<i title="${days[d]} ${h}:00 — ${Math.round(m)} min" style="${m ? `background:color-mix(in srgb, #e5484d ${Math.round(15 + 85 * m / maxH)}%, var(--surface-2))` : ''}"></i>`).join('')).join('');

    const p = r.promises;
    $('#promises').innerHTML = p.made ? `<div class="promise"><div class="bar"><i style="width:${p.kept / p.made * 100}%;background:var(--safe)"></i><i style="width:${p.partly / p.made * 100}%;background:#D9A21B"></i></div><b>${p.kept}/${p.made}</b></div><p class="sub" style="margin:6px 0 0">Kept ${p.kept}, partly ${p.partly}, out of ${p.made} promises you made before a session.</p>` : '<p class="sub">When you start a session, write down a promise — like “finish 10 questions” — and see how many you keep.</p>';

    const got = r.badges.filter((b) => b.got).length;
    $('#badge-sub').textContent = `${got} of ${r.badges.length} earned`;
    $('#badges').innerHTML = r.badges.map((b) => `<div class="badge ${b.got ? 'got' : 'locked'}"><span class="e">${b.e}</span><b>${esc(b.n)}</b><small>${esc(b.d)}</small></div>`).join('');

    $('#hist').innerHTML = r.recent.length ? r.recent.map((x) => {
      const dist = Object.entries(x.distractions || {}).map(([k, d]) => `${k} ${d.visits}×`).join(', ');
      return `<li><span class="d">${esc(new Date(x.start).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }))}<br>${esc(new Date(x.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span>
        <span class="t"><b>${esc(x.task || (x.completed ? 'Focus session' : 'Stopped early'))}${x.mood ? ' ' + MOOD[x.mood] : ''}${x.kept === 'yes' ? ' 🤝' : ''}</b><small>${hm(Math.round((x.focusMs || 0) / 60000))}${x.completed ? '' : ' · stopped early'}${dist ? ' · ' + esc(dist) : ' · no distractions'}${x.note ? ' · “' + esc(x.note) + '”' : ''}</small></span>
        <span class="chip" style="background:color-mix(in srgb, ${scoreColor(x.score || 0)} 16%, transparent);color:${scoreColor(x.score || 0)}">${x.score ?? '—'}</span><span>${x.mode === 'strict' ? '🔒' : x.mode === 'track' ? '👀' : '🙂'}</span><button data-del="${esc(x.id)}" title="Delete">✕</button></li>`;
    }).join('') : '<div class="empty">No sessions yet. Click 🍅 in the toolbar (or Ctrl+Shift+F) to start your first one!</div>';
    $$('[data-del]').forEach((b) => (b.onclick = async () => { R = await noam.invoke('focus:delete', b.dataset.del); render(); }));
    renderSettings();
  }

  // settings
  const C = () => (R && R.cfg) || {};
  const save = async (patch) => { s = await noam.invoke('settings:set', { focus: { ...(s.focus || {}), ...patch } }); R = await noam.invoke('focus:stats'); render(); };
  function renderSettings() {
    const c = C();
    $$('[data-n]').forEach((i) => { if (document.activeElement !== i) i.value = c[i.dataset.n]; i.onchange = () => { const v = +i.value; if (v > 0) save({ [i.dataset.n]: v }); }; });
    $$('[data-b]').forEach((b) => { b.setAttribute('aria-checked', String(!!c[b.dataset.b])); b.onclick = () => save({ [b.dataset.b]: !c[b.dataset.b] }); });
    $$('[data-s]').forEach((sel) => { sel.value = c[sel.dataset.s]; sel.onchange = () => save({ [sel.dataset.s]: sel.value }); });
    const chips = (list, key) => list.map((x, i) => `<span>${esc(x)}<button data-${key}="${i}" title="Remove">✕</button></span>`).join('');
    $('#sites').innerHTML = chips(c.sites || [], 'rs');
    $('#allow').innerHTML = chips(c.allow || [], 'ra');
    $('#allow-row').hidden = !c.allowOnly;
    $$('[data-rs]').forEach((b) => (b.onclick = () => save({ sites: c.sites.filter((_, i) => i !== +b.dataset.rs) })));
    $$('[data-ra]').forEach((b) => (b.onclick = () => save({ allow: c.allow.filter((_, i) => i !== +b.dataset.ra) })));
  }
  const clean = (v) => v.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').toLowerCase();
  $('#add-btn').onclick = () => { const v = clean($('#add-site').value); if (v && !C().sites.includes(v)) save({ sites: [...C().sites, v] }); $('#add-site').value = ''; };
  $('#allow-btn').onclick = () => { const v = clean($('#add-allow').value); if (v && !C().allow.includes(v)) save({ allow: [...C().allow, v] }); $('#add-allow').value = ''; };
  $('#add-site').onkeydown = (e) => { if (e.key === 'Enter') $('#add-btn').click(); };
  $('#add-allow').onkeydown = (e) => { if (e.key === 'Enter') $('#allow-btn').click(); };

  noam.on('focus', (st) => { if (R) { const phase = R.state.phase; R.state = st; renderNow(st); if (phase !== st.phase) load(); } });
  noam.on('focus-done', () => load());
  await load();
  if (location.hash === '#settings') $('#settings').scrollIntoView();
})();
