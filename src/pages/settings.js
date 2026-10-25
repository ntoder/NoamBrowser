(async () => {
  let s = await noamReady;
  const engines = await noam.invoke('search:engines');
  $('#engine').innerHTML = Object.entries(engines).map(([k, e]) => `<option value="${k}">${esc(e.name)}</option>`).join('');

  const save = async (patch) => { s = await noam.invoke('settings:set', patch); render(); };

  function render() {
    $$('[data-k]').forEach((el) => {
      const v = s[el.dataset.k];
      if (el.classList.contains('switch')) el.setAttribute('aria-checked', String(!!v));
      else if (document.activeElement !== el) el.value = v ?? '';
    });
    $$('[data-s]').forEach((el) => el.setAttribute('aria-checked', String(!!s.shields[el.dataset.s])));
    $$('[data-vs]').forEach((el) => el.setAttribute('aria-checked', String(!!s.vpn[el.dataset.vs])));
    $$('[data-v]').forEach((el) => { if (document.activeElement !== el) el.value = s.vpn[el.dataset.v] ?? ''; });
    $('#proxyrow').hidden = s.vpn.mode !== 'custom';
    $$('#accent button').forEach((b) => b.setAttribute('aria-checked', String(!ap().customAccent && b.dataset.v === (s.accent || 'auto'))));
    renderAppearance();
    const off = Object.keys(s.siteShieldsOff || {});
    $('#sites-off').innerHTML = off.length ? off.map((x) => `<li><span>${esc(x)}</span><button class="btn" data-site="${esc(x)}">Turn Shields on</button></li>`).join('') : '<li><span style="color:var(--muted)">Shields are up on every site.</span></li>';
    $$('[data-site]').forEach((b) => (b.onclick = async () => { await noam.invoke('shields:site-set', { site: b.dataset.site, on: true }); s = await noam.invoke('settings:get'); render(); }));
  }

  $$('[data-k]').forEach((el) => {
    if (el.classList.contains('switch')) el.onclick = () => save({ [el.dataset.k]: !s[el.dataset.k] });
    else el.onchange = () => save({ [el.dataset.k]: el.value });
  });
  $$('[data-s]').forEach((el) => (el.onclick = () => save({ shields: { [el.dataset.s]: !s.shields[el.dataset.s] } })));
  $$('[data-vs]').forEach((el) => (el.onclick = () => save({ vpn: { [el.dataset.vs]: !s.vpn[el.dataset.vs] } })));
  $$('[data-v]').forEach((el) => (el.onchange = () => save({ vpn: { [el.dataset.v]: el.value.trim() } })));
  $$('#accent button').forEach((b) => (b.onclick = () => save({ accent: b.dataset.v, appearance: { customAccent: '' } })));
  // ---------- appearance ----------
  const PRESETS = [
    ['default', 'Classic', 'linear-gradient(135deg,#ECEAF4 50%,#16122A 50%)', '#6A55F5'],
    ['aurora', 'Aurora', 'linear-gradient(115deg,#3A1D8F,#0E6E8C,#6B2CA8)', '#8EF3E1'],
    ['sunset', 'Sunset', 'linear-gradient(110deg,#FF5F6D,#C2346B,#6A1B5D)', '#FF9466'],
    ['ocean', 'Ocean', 'linear-gradient(120deg,#023E73,#0A6F8F,#034A6B)', '#4FC3F7'],
    ['forest', 'Forest', 'linear-gradient(120deg,#133A22,#2D5A27,#10301F)', '#9BE15D'],
    ['neon', 'Neon', 'linear-gradient(90deg,#FF3DD8,#7B2CFF,#22F2FF)', '#FF3DD8'],
    ['snow', 'Snow', 'linear-gradient(120deg,#DCE8FF,#F2F7FF,#D8EEF7)', '#2F6BFF'],
    ['mono', 'Mono', 'linear-gradient(120deg,#111,#333)', '#fff'],
  ];
  const WALLS = [
    ['none', 'Plain', 'var(--bg)'], ['aurora', 'Aurora', 'radial-gradient(60% 80% at 20% 20%,#7C68FA,transparent),radial-gradient(60% 80% at 80% 30%,#22D3EE,transparent),radial-gradient(60% 80% at 50% 100%,#F472B6,transparent),#16122A'],
    ['dusk', 'Dusk', 'linear-gradient(160deg,#2B1055,#7597DE)'], ['lagoon', 'Lagoon', 'radial-gradient(90% 90% at 20% 10%,#00C9A7,transparent 60%),radial-gradient(80% 80% at 90% 80%,#3D5AFE,transparent 60%),#071A2C'],
    ['ember', 'Ember', 'radial-gradient(70% 70% at 80% 20%,#FF6A3D,transparent 60%),radial-gradient(80% 80% at 10% 90%,#B5179E,transparent 60%),#1A0710'],
    ['mesh', 'Prism', 'conic-gradient(from 210deg at 60% 40%,#6A55F5,#22D3EE,#A3E635,#F472B6,#6A55F5)'],
    ['grid', 'Grid', 'linear-gradient(rgba(127,127,127,.25) 1px,transparent 1px) 0 0/14px 14px,linear-gradient(90deg,rgba(127,127,127,.25) 1px,transparent 1px) 0 0/14px 14px,var(--bg)'],
    ['custom', 'Your picture', 'var(--surface-2)'],
  ];
  $('#presets').innerHTML = PRESETS.map(([k, n, art, acc]) => `<button class="preset" data-p="${k}"><div class="art" style="background:${art}"><b style="background:${acc}"></b><i></i></div><span>${n}</span></button>`).join('');
  $('#walls').innerHTML = WALLS.map(([k, n, bg]) => `<button class="wall" data-w="${k}" style="background:${bg}"><span>${n}</span></button>`).join('');
  const ap = () => s.appearance || {};
  const setAp = (patch) => save({ appearance: patch });
  $$('.preset').forEach((b) => (b.onclick = () => setAp({ preset: b.dataset.p })));
  $$('.wall').forEach((b) => (b.onclick = () => { if (b.dataset.w === 'custom') $('#wall-file').click(); else setAp({ wallpaper: b.dataset.w }); }));
  $$('[data-a]').forEach((el) => (el.onclick = () => setAp({ [el.dataset.a]: !ap()[el.dataset.a] })));
  $$('[data-ar]').forEach((el) => { el.oninput = () => { renderOutputs(+el.value, el.dataset.ar); clearTimeout(el._t); el._t = setTimeout(() => setAp({ [el.dataset.ar]: +el.value }), 60); }; });
  $$('[data-af]').forEach((el) => (el.onchange = () => setAp({ [el.dataset.af]: el.value })));
  $$('[data-as]').forEach((seg) => $$('button', seg).forEach((b) => (b.onclick = () => setAp({ [seg.dataset.as]: b.dataset.v }))));
  $('#custom-accent').oninput = (e) => { clearTimeout(e.target._t); e.target._t = setTimeout(() => save({ accent: 'auto', appearance: { customAccent: e.target.value } }), 80); };
  $('#wall-file').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 25 * 1024 * 1024) { $('#wall-msg').textContent = 'That picture is over 25 MB.'; return; }
    const r = new FileReader();
    r.onload = async () => { try { s = await noam.invoke('appearance:wallpaper', r.result); render(); $('#wall-msg').textContent = 'Wallpaper set — open a new tab to see it.'; } catch (err) { $('#wall-msg').textContent = String(err.message).replace(/^.*?Error: /, ''); } };
    r.readAsDataURL(f);
    e.target.value = '';
  };
  $('#reset-look').onclick = () => save({ accent: 'auto', theme: 'system', appearance: { preset: 'default', customAccent: '', tabStyle: 'rounded', density: 'comfortable', radius: 100, font: 'manrope', animations: 'full', liquidGlass: false, glassStrength: 60, wallpaper: 'aurora', wallpaperDim: 30 } });
  function renderOutputs(v, k) {
    const a = ap();
    if (!k || k === 'glassStrength') $('#gs-out').textContent = (k ? v : a.glassStrength ?? 60) + '%';
    if (!k || k === 'radius') $('#rad-out').textContent = (k ? v : a.radius ?? 100) + '%';
    if (!k || k === 'wallpaperDim') $('#dim-out').textContent = (k ? v : a.wallpaperDim ?? 30) + '%';
  }
  function renderAppearance() {
    const a = ap();
    $$('.preset').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.p === (a.preset || 'default'))));
    $$('.wall').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.w === (a.wallpaper || 'aurora'))));
    const custom = $('.wall[data-w="custom"]');
    custom.style.backgroundImage = a.wallpaper === 'custom' ? `url("noam://wallpaper/?v=${a.wallpaperRev || 0}")` : '';
    $$('[data-a]').forEach((el) => el.setAttribute('aria-checked', String(!!a[el.dataset.a])));
    $$('[data-ar]').forEach((el) => { if (document.activeElement !== el) el.value = a[el.dataset.ar] ?? el.defaultValue; });
    $$('[data-af]').forEach((el) => (el.value = a[el.dataset.af] || 'manrope'));
    $$('[data-as]').forEach((seg) => $$('button', seg).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === (a[seg.dataset.as] || { tabStyle: 'rounded', density: 'comfortable', animations: 'full' }[seg.dataset.as])))));
    $('#glass-strength-row').hidden = !a.liquidGlass;
    $('.custom-color').classList.toggle('on', !!a.customAccent);
    if (a.customAccent) $('#custom-accent').value = a.customAccent;
    renderOutputs();
  }

  $('#default').onclick = async () => { await noam.invoke('default-browser:set'); $('#default').textContent = 'Choose NoamBrowser in Windows settings'; };

  // filter lists
  const fi = async () => { const i = await noam.invoke('filters:info'); $('#filter-info').textContent = `${i.lists.length} lists · ${i.source === 'updated' ? 'updated' : 'built in'} ${i.built ? new Date(i.built).toLocaleDateString() : ''}`; };
  fi();
  noam.on('filters-progress', (p) => { $('#filter-progress').textContent = `Downloading ${p.name} (${p.step}/${p.total})…`; });
  $('#update-lists').onclick = async () => {
    const b = $('#update-lists'); b.disabled = true; b.textContent = 'Updating…';
    try { await noam.invoke('filters:update'); $('#filter-progress').textContent = 'Filter lists are up to date.'; }
    catch (e) { $('#filter-progress').textContent = 'Update failed: ' + e.message.replace(/^Error invoking remote method[^:]*: /, ''); }
    b.disabled = false; b.textContent = 'Update now'; fi();
  };

  // VPN
  const vr = (v) => {
    const on = v.state === 'on';
    $('#vpnstate').className = 'vpnstate' + (on ? ' on' : '');
    $('#vpnstate span').textContent = { off: 'Off', on: 'Connected', connecting: 'Connecting…', error: 'Needs attention' }[v.state];
    $('#vpnmsg').textContent = on && v.info ? `Exit IP ${v.info.ip || '?'} · ${v.info.loc || ''} · ${v.info.colo || ''}` : v.message || '';
    $('#vpntoggle').textContent = v.wantOn ? 'Turn off' : 'Turn on';
  };
  vr(await noam.invoke('vpn:status'));
  noam.on('vpn', vr);
  $('#vpntoggle').onclick = () => noam.invoke('vpn:toggle');
  $('#newid').onclick = () => noam.invoke('vpn:new-identity');

  // data
  $('#clear').onclick = async () => {
    const what = {}; $$('[data-c]').forEach((c) => (what[c.dataset.c] = c.checked));
    $('#clear').disabled = true;
    await noam.invoke('data:clear', what);
    $('#clear').disabled = false; $('#cleared').textContent = 'Cleared.';
    loadPerms();
  };
  async function loadPerms() {
    const p = await noam.invoke('permissions:list');
    const rows = Object.entries(p).flatMap(([origin, perms]) => Object.entries(perms).map(([k, v]) => ({ origin, k, v })));
    $('#perms').innerHTML = rows.length ? rows.map((r) => `<li><span>${esc(r.origin.replace(/^https?:\/\//, ''))}</span><span class="tag ${r.v}">${esc(r.k)}: ${esc(r.v)}</span><button class="btn" data-o="${esc(r.origin)}">Reset</button></li>`).join('') : '<li><span style="color:var(--muted)">No site has asked for special permissions yet.</span></li>';
    $$('[data-o]').forEach((b) => (b.onclick = async () => { await noam.invoke('permissions:reset', b.dataset.o); loadPerms(); }));
  }
  loadPerms();

  const info = await noam.invoke('app:info');
  $('#ver').textContent = `Version ${info.version} · Chromium ${info.chrome}`;

  // nav highlight
  const links = $$('#nav a');
  const mark = () => {
    let cur = 'general';
    for (const sec of $$('section')) if (sec.getBoundingClientRect().top < 140) cur = sec.id;
    links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + cur));
  };
  addEventListener('scroll', mark, { passive: true });
  noam.on('settings', (ns) => { s = ns; render(); });
  render(); mark();
  if (location.hash) setTimeout(() => document.querySelector(location.hash)?.scrollIntoView(), 50);
})();
