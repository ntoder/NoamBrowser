(async () => {
  await noamReady;
  let d = { items: [], every: 6 };
  const fmt = (p, c) => { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: c || 'USD', maximumFractionDigits: 2 }).format(p); } catch { return p; } };
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };
  function spark(h) {
    if (h.length < 2) return '<svg class="spark"></svg>';
    const W = 300, H = 54, ps = h.map((x) => x.price), lo = Math.min(...ps), hi = Math.max(...ps), t0 = h[0].t, t1 = h[h.length - 1].t || t0 + 1;
    const pts = h.map((x) => [6 + (W - 12) * (x.t - t0) / Math.max(1, t1 - t0), H - 8 - (H - 16) * (hi === lo ? 0.5 : (x.price - lo) / (hi - lo))]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const down = ps[ps.length - 1] <= ps[0];
    const col = down ? 'var(--safe)' : 'var(--danger)';
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${line} L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z" fill="${col}" opacity=".12" stroke="none"/><path d="${line}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round"/>${pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="${col}" stroke="none"/>`).join('')}</svg>`;
  }
  function render() {
    $('#every').innerHTML = [1, 3, 6, 12, 24].map((h) => `<option value="${h}" ${d.every === h ? 'selected' : ''}>Check every ${h === 1 ? 'hour' : h + ' hours'}</option>`).join('');
    if (!d.items.length) { $('#grid').innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="big">🛒</div><h2>Nothing tracked yet</h2><p>Go to a product page in any online shop and click 🏷️ in the address bar.</p></div>'; return; }
    $('#grid').innerHTML = d.items.slice().sort((a, b) => b.added - a.added).map((it) => {
      const ps = it.history.map((x) => x.price); const lo = Math.min(...ps), hi = Math.max(...ps);
      const ch = it.first ? (it.price - it.first) / it.first * 100 : 0;
      let site = ''; try { site = new URL(it.url).hostname.replace(/^www\./, ''); } catch {}
      return `<div class="card" data-id="${esc(it.id)}"><div class="img" style="${it.image ? `background-image:url('${esc(it.image.replace(/'/g, '%27').replace(/"/g, '%22'))}')` : ''}">${Math.abs(ch) >= 1 ? `<span class="badge ${ch > 0 ? 'up' : ''}">${ch > 0 ? '▲' : '▼'} ${Math.abs(Math.round(ch))}%</span>` : ''}</div>
        <div class="body"><a class="t" href="${esc(it.url)}">${esc(it.title)}</a><span class="site">${esc(site)}</span>
        <div class="price"><b>${esc(fmt(it.price, it.currency))}</b><span>${it.first && it.first !== it.price ? 'was ' + esc(fmt(it.first, it.currency)) + ' when you started' : 'since ' + new Date(it.added).toLocaleDateString()}</span></div>
        ${spark(it.history)}
        <div class="lows"><span>Lowest <b>${esc(fmt(lo, it.currency))}</b></span><span>Highest <b>${esc(fmt(hi, it.currency))}</b></span></div>
        ${it.target && it.price <= it.target ? `<div class="hit">🎯 Below your target of ${esc(fmt(it.target, it.currency))}!</div>` : ''}
        <div class="row"><label>🎯 Tell me if it’s under <input class="field" type="number" min="0" step="any" data-target value="${it.target || ''}" placeholder="any drop"></label></div>
        <div class="meta">${it.paused ? '⏸ Paused · ' : ''}Checked ${ago(it.lastCheck)}</div>${it.error ? `<div class="err">${esc(it.error)}</div>` : ''}
        <div class="acts"><button class="btn" data-a="check">🔄 Check now</button><button class="btn" data-a="pause">${it.paused ? '▶ Resume' : '⏸ Pause'}</button><button class="btn" data-a="remove">🗑️</button></div></div></div>`;
    }).join('');
    $$('.card').forEach((c) => {
      const id = c.dataset.id;
      c.querySelector('[data-target]').onchange = async (e) => { d.items = await noam.invoke('prices:update', { id, target: e.target.value }); render(); };
      c.querySelector('[data-a=check]').onclick = async (e) => { e.target.textContent = 'Checking…'; e.target.disabled = true; d.items = await noam.invoke('prices:check', id); render(); };
      c.querySelector('[data-a=pause]').onclick = async () => { const it = d.items.find((x) => x.id === id); d.items = await noam.invoke('prices:update', { id, paused: !it.paused }); render(); };
      c.querySelector('[data-a=remove]').onclick = async () => { d.items = await noam.invoke('prices:remove', id); render(); };
    });
  }
  $('#every').onchange = async (e) => { d.every = await noam.invoke('prices:every', +e.target.value); };
  $('#checkall').onclick = async () => { $('#checkall').textContent = 'Checking…'; d.items = await noam.invoke('prices:check'); $('#checkall').textContent = 'Check all now'; render(); };
  noam.on('prices', async () => { d = await noam.invoke('prices:list'); render(); });
  d = await noam.invoke('prices:list'); render();
})();
