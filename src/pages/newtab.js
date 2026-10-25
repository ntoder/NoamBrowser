(async () => {
  const s = await noamReady;
  const engines = await noam.invoke('search:engines');
  const sel = $('#engine');
  sel.innerHTML = Object.entries(engines).map(([k, e]) => `<option value="${k}"${k === s.searchEngine ? ' selected' : ''}>${esc(e.name)}</option>`).join('');
  sel.onchange = () => noam.invoke('settings:set', { searchEngine: sel.value });
  $('#f').onsubmit = (e) => { e.preventDefault(); const v = $('#q').value.trim(); if (v) noam.invoke('tab:navigate', v); };
  setTimeout(() => $('#q').focus(), 50);

  const applyWall = (st) => {
    const ap = st.appearance || {};
    const w = ap.liquidGlass && ap.wallpaper === 'none' ? 'none' : (ap.wallpaper || 'aurora');
    const wall = $('#wall');
    wall.className = w;
    wall.style.setProperty('--dim', String((ap.wallpaperDim ?? 30) / 100));
    wall.style.backgroundImage = w === 'custom' ? `url("noam://wallpaper/?v=${ap.wallpaperRev || 0}")` : '';
    document.body.classList.toggle('has-wall', w !== 'none');
  };
  applyWall(s);
  noam.on('settings', applyWall);
  const priv = new URLSearchParams(location.search).has('private');
  if (priv) { $('#wall').className = 'none'; document.body.classList.remove('has-wall'); document.body.classList.add('private'); document.documentElement.style.background = '#1E1030'; $('#pnote').hidden = false; document.title = 'Private tab'; }
  const renderSites = (sites) => {
    $('#sites').innerHTML = sites.map((x) => {
      const name = x.host.replace(/^www\./, '').split('.')[0];
      const ic = x.favicon ? `<img src="${esc(x.favicon)}" alt="" data-letter="${esc(name[0] || '?')}">` : esc((name[0] || '?').toUpperCase());
      return `<a class="site" href="${esc(x.url)}" title="${esc(x.title || x.host)}" data-host="${esc(x.host)}"><span class="ic">${ic}</span><span class="n">${esc(name)}</span><button class="rm" title="Remove ${esc(x.host.replace(/^www\./, ''))} from this page" aria-label="Remove"><svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg></button></a>`;
    }).join('');
    $$('.site .rm').forEach((b) => (b.onclick = async (e) => {
      e.preventDefault(); e.stopPropagation();
      const tile = b.closest('.site'); const host = tile.dataset.host;
      tile.classList.add('going');
      const next = await noam.invoke('topsites:hide', host);
      setTimeout(() => renderSites(next), 260);
      $('#undo').hidden = false;
      $('#undo-text').textContent = `Removed ${host.replace(/^www\./, '')}`;
      $('#undo-btn').onclick = async () => { renderSites(await noam.invoke('topsites:unhide', host)); $('#undo').hidden = true; };
    }));
  };
  $('#undo-all').onclick = async () => { renderSites(await noam.invoke('topsites:reset')); $('#undo').hidden = true; };
  if (s.newTabShowTopSites && !priv) {
    renderSites(await noam.invoke('topsites:get'));
    document.addEventListener('error', (e) => { const t = e.target; if (t.tagName === 'IMG' && t.dataset.letter) t.replaceWith(document.createTextNode(t.dataset.letter.toUpperCase())); }, true);
  }

  const renderStats = (st) => {
    if (!s.newTabShowStats || priv) return;
    $('#receipt').hidden = false;
    const el = $('#week');
    const from = +(el.dataset.v || 0); el.dataset.v = st.week;
    if (document.documentElement.dataset.anim === 'off' || from === st.week) el.textContent = fmtNum(st.week);
    else { const t0 = performance.now(); const step = (t) => { const k = Math.min(1, (t - t0) / 900); const e = 1 - Math.pow(1 - k, 4); el.textContent = fmtNum(Math.round(from + (st.week - from) * e)); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }
    $('#saved').textContent = `${fmtNum(st.total)} in total, about ${fmtBytes(st.bytes)} you didn’t have to download.`;
    const days = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(Date.now() - i * 86400000); days.push([d.toISOString().slice(0, 10), d]); }
    const max = Math.max(1, ...days.map(([k]) => st.days[k] || 0));
    $('#bars').innerHTML = days.map(([k, d], i) => `<div class="${i === 6 ? 'today' : ''}" style="height:${Math.max(7, ((st.days[k] || 0) / max) * 100)}%" data-d="${d.toLocaleDateString(undefined, { weekday: 'narrow' })}" title="${fmtNum(st.days[k] || 0)} blocked"></div>`).join('');
  };
  renderStats(await noam.invoke('stats:get'));

  const renderVpn = (v) => {
    const on = v.state === 'on';
    $('#vpnline').classList.toggle('on', on);
    $('#vpntext').textContent = on ? `VPN on — sites see ${v.info?.ip || 'a Cloudflare address'}, not you` : v.state === 'connecting' ? 'VPN connecting…' : v.state === 'error' ? v.message : 'VPN is off — sites can see your real IP';
    $('#vpnbtn').textContent = on || v.wantOn ? 'Turn off' : 'Turn on';
  };
  renderVpn(await noam.invoke('vpn:status'));
  noam.on('vpn', renderVpn);
  $('#vpnbtn').onclick = () => noam.invoke('vpn:toggle');
  setInterval(async () => { if (!document.hidden) renderStats(await noam.invoke('stats:get')); }, 8000);
})();
