(async () => {
  let s = await noamReady;
  let changedEngine = false;
  const mb = (m) => m >= 1024 ? (m / 1024).toFixed(1) + ' GB' : Math.round(m) + ' MB';
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; };
  const C = (d) => d.cfg;
  async function render() {
    const d = await noam.invoke('perf:state');
    $('#mem').textContent = mb(d.totalMemMB || 0);
    $('#saved').textContent = mb(d.savedMB || 0);
    $('#saved-s').textContent = `${d.sleeping.length} tab${d.sleeping.length === 1 ? '' : 's'} sleeping`;
    const cpu = (d.totalCpu || 0) / (d.cores || 1);
    $('#cpu').textContent = Math.round(cpu) + '%'; $('#cpu').className = 'v' + (cpu > 50 ? ' hot' : '');
    $('#cpu-s').textContent = cpu > 50 ? 'Working hard right now' : 'of your computer’s processor';
    const es = C(d).energySaver === 'always' || (C(d).energySaver === 'battery' && d.onBattery);
    $('#power').textContent = d.onBattery ? '🔋 Battery' : '🔌 Plugged in';
    $('#power-s').textContent = es ? '🍃 Energy saver is on' : 'Energy saver is off';
    const tabs = Object.entries(d.tabs).map(([id, t]) => ({ id: +id, ...t })).filter((t) => !/^noam:\/\/(performance)/.test(t.url)).sort((a, b) => (b.cpu * 20 + b.memMB) - (a.cpu * 20 + a.memMB));
    const maxM = Math.max(200, ...tabs.map((t) => t.memMB));
    $('#awake').innerHTML = tabs.length ? tabs.map((t) => `<div class="t">${/^https?:/.test(t.url) ? `<img src="https://${esc(new URL(t.url).hostname)}/favicon.ico" data-fallback="globe" alt="">` : svg(ICONS.globe)}
      <span class="n">${esc(t.title || t.url)}<small>${esc(t.url)}${t.audible ? ' · 🔊 playing' : ''}</small></span>
      <span class="meter" title="Processor"><i><b style="width:${Math.min(100, t.cpu / (d.cores || 1) * 2)}%;background:${t.cpu > 30 ? 'var(--danger)' : 'var(--accent)'}"></b></i>${Math.round(t.cpu / (d.cores || 1))}%</span>
      <span class="meter" title="Memory"><i><b style="width:${t.memMB / maxM * 100}%;background:#14a89b"></b></i>${mb(t.memMB)}</span>
      <span class="acts"><button class="btn" data-a="show" data-w="${t.id}">Show</button><button class="btn" data-a="sleep" data-w="${t.id}" title="Put to sleep">💤</button><button class="btn" data-a="close" data-w="${t.id}" title="Close">✕</button></span></div>`).join('') : '<div class="empty">No other tabs are open.</div>';
    $('#asleep').innerHTML = d.sleeping.length ? d.sleeping.map((t) => `<div class="t"><img src="${esc(t.favicon || '')}" data-fallback="globe" alt=""><span class="n">${esc(t.title)}<small>${t.since ? 'Asleep since ' + ago(t.since) : 'Not loaded yet (opened from last time)'}${t.memMB ? ' · saving ' + mb(t.memMB) : ''}</small></span><span></span><span></span>
      <span class="acts"><button class="btn" data-a="show" data-t="${t.id}">Open</button><button class="btn" data-a="wake" data-t="${t.id}">Wake up</button><button class="btn" data-a="close" data-t="${t.id}">✕</button></span></div>`).join('') : '<div class="empty">No tabs are sleeping. Tabs you don’t use for a while fall asleep by themselves.</div>';
    $$('[data-a]').forEach((b) => (b.onclick = async () => { await noam.invoke('perf:action', { action: b.dataset.a, wcId: b.dataset.w ? +b.dataset.w : undefined, tabId: b.dataset.t ? +b.dataset.t : undefined }); setTimeout(render, 600); }));
    // settings
    const c = C(d);
    $$('[data-b]').forEach((b) => { b.setAttribute('aria-checked', String(c[b.dataset.b] !== false && !!c[b.dataset.b])); b.onclick = () => save({ [b.dataset.b]: !c[b.dataset.b] }, ['speedMode', 'noAutoplay'].includes(b.dataset.b)); });
    $$('[data-n]').forEach((sel) => { sel.value = String(c[sel.dataset.n]); sel.onchange = () => save({ [sel.dataset.n]: +sel.value }); });
    $$('[data-s]').forEach((sel) => { sel.value = c[sel.dataset.s]; sel.onchange = () => save({ [sel.dataset.s]: sel.value }); });
    $('#keep').innerHTML = (c.keepAwake || []).map((h, i) => `<span>${esc(h)}<button data-k="${i}">✕</button></span>`).join('') || '<span style="background:none;color:var(--muted)">None yet</span>';
    $$('[data-k]').forEach((b) => (b.onclick = () => save({ keepAwake: c.keepAwake.filter((_, i) => i !== +b.dataset.k) })));
    $('#keep-add').onclick = () => { const v = $('#keep-in').value.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''); if (v) save({ keepAwake: [...new Set([...(c.keepAwake || []), v])] }); $('#keep-in').value = ''; };
    $('#restart').hidden = !changedEngine;
  }
  async function save(patch, engine) { if (engine) changedEngine = true; s = await noam.invoke('settings:set', { perf: { ...(s.perf || {}), ...patch } }); render(); }
  $('#sleepall').onclick = async () => { await noam.invoke('perf:action', { action: 'sleep-all' }); setTimeout(render, 1500); };
  noam.on('perf', () => { if (document.visibilityState === 'visible' && !document.activeElement.matches('input,select')) render(); });
  render();
})();
