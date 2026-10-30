// Settings for NoamBrowser 2.1: gestures, media, downloads, sidebar, sessions, sync cloud folders.
(async () => {
  let s = await noamReady;
  const setSw = (el, on) => el.setAttribute('aria-checked', String(!!on));
  const save = async (patch) => { s = await noam.invoke('settings:set', patch); render(); };
  const DEFAULT_PANELS = [
    { id: 'notes', kind: 'notes', name: 'Notes' },
    { id: 'reading', kind: 'reading', name: 'Reading list' },
    { id: 'ambient', kind: 'ambient', name: 'Music & sounds' },
    { id: 'whatsapp', kind: 'web', name: 'WhatsApp', url: 'https://web.whatsapp.com/' },
    { id: 'chatgpt', kind: 'web', name: 'ChatGPT', url: 'https://chatgpt.com/' },
    { id: 'calc', kind: 'calc', name: 'Calculator' },
  ];

  $$('[data-g]').forEach((el) => (el.onclick = () => save({ gestures: { [el.dataset.g]: !(s.gestures || {})[el.dataset.g] } })));
  $$('[data-m]').forEach((el) => (el.onclick = () => save({ media: { [el.dataset.m]: !(s.media || {})[el.dataset.m] } })));
  $$('[data-dl]').forEach((el) => (el.onclick = () => save({ downloads: { [el.dataset.dl]: !(s.downloads || {})[el.dataset.dl] } })));
  $('#dl-limit').onchange = (e) => save({ downloads: { limitKBps: +e.target.value } });
  $('#sp-show').onclick = () => save({ sidePanel: { show: (s.sidePanel || {}).show === false } });
  $('#sp-reset').onclick = () => {
    const cur = (s.sidePanel || {}).panels || [];
    const missing = DEFAULT_PANELS.filter((d) => !cur.some((c) => c.id === d.id));
    save({ sidePanel: { panels: [...cur, ...missing], show: true } });
  };

  // ---- blue light filter
  const TINTS = { warm: ['#ffb46b', 'Soft warm'], amber: ['#ff8a1c', 'Amber'], candle: ['#ff6a00', 'Candlelight'], sunset: ['#ff4f2e', 'Sunset'], red: ['#ff1a00', 'Deep red'], rose: ['#ff5c8a', 'Rose'] };
  const BL = () => s.blueLight || {};
  $('#bl-tints').innerHTML = Object.entries(TINTS).map(([k, [c, n]]) => `<button data-tint="${k}" title="${n}" style="background:${c}"></button>`).join('') + '<button data-tint="custom" class="custom" title="Pick your own"></button>';
  $$('[data-tint]').forEach((b) => (b.onclick = () => save({ blueLight: { tint: b.dataset.tint } })));
  $('#bl-color').onchange = (e) => save({ blueLight: { color: e.target.value, tint: 'custom' } });
  const sw = (id, key, def) => ($(id).onclick = () => save({ blueLight: { [key]: !(BL()[key] ?? def) } }));
  $('#bl-on').onclick = () => save({ blueLight: { enabled: !BL().enabled } });
  sw('#bl-ramp', 'ramp', false); sw('#bl-pause', 'pauseVideo', true); sw('#bl-button', 'button', true);
  const blPreview = () => {
    const b = BL(); const p = $('#bl-preview').style;
    p.setProperty('--pc', b.tint === 'custom' ? (b.color || '#ff8a1c') : (TINTS[b.tint] || TINTS.amber)[0]);
    p.setProperty('--po', String(+$('#bl-str').value / 100)); p.setProperty('--pd', String(+$('#bl-dim').value / 100));
  };
  $('#bl-str').oninput = (e) => { $('#bl-val').textContent = e.target.value + '%'; blPreview(); };
  $('#bl-str').onchange = (e) => save({ blueLight: { strength: +e.target.value } });
  $('#bl-dim').oninput = (e) => { $('#bl-dim-val').textContent = +e.target.value ? e.target.value + '% darker' : 'Off'; blPreview(); };
  $('#bl-dim').onchange = (e) => save({ blueLight: { dim: +e.target.value } });
  $('#bl-fade').onchange = (e) => save({ blueLight: { fade: +e.target.value } });
  $('#bl-sched').onchange = (e) => save({ blueLight: { schedule: e.target.value } });
  $('#bl-offset').onchange = (e) => save({ blueLight: { sunsetOffset: +e.target.value } });
  $('#bl-from').onchange = (e) => save({ blueLight: { from: e.target.value } });
  $('#bl-to').onchange = (e) => save({ blueLight: { to: e.target.value } });
  function renderBL() {
    const b = BL();
    setSw($('#bl-on'), b.enabled); setSw($('#bl-ramp'), b.ramp); setSw($('#bl-pause'), b.pauseVideo !== false); setSw($('#bl-button'), b.button !== false);
    $$('[data-tint]').forEach((x) => x.classList.toggle('on', x.dataset.tint === (b.tint || 'amber')));
    $('#bl-custom-row').hidden = b.tint !== 'custom'; $('#bl-color').value = b.color || '#ff8a1c';
    $('#bl-str').value = b.strength ?? 45; $('#bl-val').textContent = (b.strength ?? 45) + '%';
    $('#bl-dim').value = b.dim || 0; $('#bl-dim-val').textContent = b.dim ? b.dim + '% darker' : 'Darkens everything a little — great for late at night.';
    $('#bl-fade').value = String(b.fade ?? 1.2);
    $('#bl-sched').value = b.schedule || 'off';
    $('#bl-times').hidden = b.schedule !== 'custom';
    $('#bl-offset-row').hidden = b.schedule !== 'sunset'; $('#bl-offset').value = String(b.sunsetOffset || 0);
    $('#bl-ramp-row').hidden = !b.schedule || b.schedule === 'off';
    $('#bl-from').value = b.from || '21:00'; $('#bl-to').value = b.to || '07:00';
    const city = (s.widgets && s.widgets.city && s.widgets.city.name) || 'Jerusalem';
    $('#bl-sched-note').textContent = b.schedule === 'sunset' ? `Uses sunset and sunrise in ${city} (change the city in the new tab widgets).` : b.schedule === 'custom' ? 'Turns on and off at the times below.' : 'Turn it on yourself here, with Ctrl+Shift+L, or with the 🌙 button.';
    blPreview();
  }

  // ---- zmanim location
  const Z = window.NoamZmanim, P = (window.NoamPlaces || {}).PLACES || [], TAD = (window.NoamPlaces || {}).TIMEANDDATE || {};
  const city = () => (s.widgets && s.widgets.city) || P[0];
  const setCity = async (c) => { s = await noam.invoke('settings:set', { widgets: { ...(s.widgets || {}), city: c } }); render(); };
  $('#zl-preset').innerHTML = '<option value="">— choose a city —</option><optgroup label="Israel">' + P.filter((p) => p.country).map((p) => `<option value="${esc(p.name)}">${esc(p.name)}${p.he ? ' · ' + esc(p.he) : ''}</option>`).join('') + '</optgroup><optgroup label="Abroad">' + P.filter((p) => !p.country).map((p) => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('') + '</optgroup>';
  $('#zl-preset').onchange = (e) => { const p = P.find((x) => x.name === e.target.value); if (p) setCity({ ...p }); };
  const zones = (() => { try { return Intl.supportedValuesOf('timeZone'); } catch { return ['Asia/Jerusalem', 'Europe/London', 'America/New_York']; } })();
  $('#zl-tz').innerHTML = zones.map((z) => `<option>${esc(z)}</option>`).join('');
  $('#zl-save').onclick = () => {
    const lat = parseFloat($('#zl-lat').value), lon = parseFloat($('#zl-lon').value);
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) { $('#zl-lat').focus(); $('#zl-now').textContent = 'Those coordinates don’t look right — latitude is −90 to 90, longitude −180 to 180.'; return; }
    setCity({ name: $('#zl-name').value.trim() || `${lat.toFixed(3)}, ${lon.toFixed(3)}`, lat, lon, elevation: parseFloat($('#zl-elev').value) || 0, tz: $('#zl-tz').value, country: '' });
    $('.zl-manual').open = false;
  };
  $('#zl-elev-on').onclick = () => noam.invoke('settings:set', { widgets: { ...(s.widgets || {}), elevation: !(s.widgets || {}).elevation } }).then((ns) => { s = ns; render(); });
  let zlT;
  $('#zl-q').oninput = (e) => {
    clearTimeout(zlT); const q = e.target.value.trim(); const ul = $('#zl-list');
    if (q.length < 2) { ul.hidden = true; return; }
    zlT = setTimeout(async () => {
      const local = P.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || (p.he && p.he.includes(q))).map((p) => ({ ...p, admin: '' }));
      let res = []; try { res = await noam.invoke('widgets:geocode', q); } catch {}
      const all = [...local, ...res.filter((r) => !local.some((l) => Math.abs(l.lat - r.lat) < 0.02 && Math.abs(l.lon - r.lon) < 0.02))].slice(0, 10);
      ul.innerHTML = all.length ? all.map((r, i) => `<li data-i="${i}">${esc(r.name)}${r.he ? ' · ' + esc(r.he) : ''}<span>${esc([r.admin, r.country].filter(Boolean).join(', ') ? ' — ' + [r.admin, r.country].filter(Boolean).join(', ') : '')}</span></li>`).join('') : '<li><span>No places found (or you’re offline)</span></li>';
      ul.hidden = false;
      $$('#zl-list li[data-i]').forEach((li) => (li.onclick = () => { ul.hidden = true; $('#zl-q').value = ''; setCity(all[+li.dataset.i]); }));
    }, 300);
  };
  function renderZL() {
    const c = city(); const elev = !!(s.widgets || {}).elevation;
    $('#zl-now').textContent = `${c.name}${c.country ? ', ' + c.country : ''} · ${(+c.lat).toFixed(4)}, ${(+c.lon).toFixed(4)} · ${Math.round(c.elevation || 0)} m · ${c.tz}`;
    $('#zl-preset').value = P.some((p) => p.name === c.name) ? c.name : '';
    setSw($('#zl-elev-on'), elev);
    if (!$('#zl-lat').value) { $('#zl-lat').placeholder = String(c.lat); $('#zl-lon').placeholder = String(c.lon); $('#zl-tz').value = c.tz; }
    if (!Z) return;
    const now = new Date(); const z = Z.zmanim(c, now, { elevation: elev });
    const f = (t) => t ? t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: c.tz }) : '—';
    const rows = [['Alot HaShachar', z.alot], ['Sunrise', z.sunrise], ['Latest Shema', z.shma], ['Latest Shacharit', z.tefila], ['Chatzot', z.chatzot], ['Mincha Gedola', z.minchaGedola], ['Plag HaMincha', z.plag], ['Sunset', z.sunset], ['Tzeit', z.tzeit]];
    const next = rows.find(([, t]) => t && t > now);
    const link = TAD[c.name] ? `<a href="${TAD[c.name]}">Compare with timeanddate.com ↗</a>` : '';
    $('#zl-today').innerHTML = z.polar ? '<span class="note">The sun doesn’t rise or set here today.</span>' : `<div class="hd"><span>Today in ${esc(c.name)} ${elev ? '(with elevation)' : '(sea level)'}</span>${link}</div><div class="grid">${rows.map(([n, t]) => `<div class="z${next && t === next[1] ? ' next' : ''}">${esc(n)}<b>${esc(f(t))}</b></div>`).join('')}</div>`;
  }

  // ---- zmanim reminders
  const ZA = () => s.zmanimAlerts || {};
  $('#za-on').onclick = () => save({ zmanimAlerts: { enabled: !ZA().enabled } });
  $('#za-sound').onclick = () => save({ zmanimAlerts: { sound: ZA().sound === false } });
  $('#za-before').onchange = (e) => save({ zmanimAlerts: { before: +e.target.value } });
  $('#za-test').onclick = async () => { const ok = await noam.invoke('zmanim:alerts-test'); $('#za-test').textContent = ok ? 'Sent ✓' : 'Notifications are off on this computer'; setTimeout(() => ($('#za-test').textContent = 'Send a test'), 2500); };
  async function renderZA() {
    let info; try { info = await noam.invoke('zmanim:alerts-info'); } catch { return; }
    const c = info.cfg;
    setSw($('#za-on'), c.enabled); setSw($('#za-sound'), c.sound !== false);
    $('#za-before').value = String(c.before);
    if (!$('#za-list').children.length) {
      $('#za-list').innerHTML = info.list.map((z) => `<label><input type="checkbox" data-z="${z.key}"> ${esc(z.name)}</label>`).join('');
      $$('[data-z]').forEach((cb) => (cb.onchange = () => save({ zmanimAlerts: { which: { ...(info.cfg.which || {}), ...Object.fromEntries($$('[data-z]').map((x) => [x.dataset.z, x.checked])) } } })));
    }
    $$('[data-z]').forEach((cb) => (cb.checked = !!c.which[cb.dataset.z]));
    $('#za-note').textContent = !info.supported ? 'Notifications aren’t supported on this computer.'
      : c.enabled && info.next ? `Next: ${info.next.name} at ${info.next.time} in ${info.city} — you’ll be reminded at ${info.next.remindAt}. Works while NoamBrowser is open.`
      : 'Shows a notification on your computer while NoamBrowser is open.';
  }

  // ---- dictionary
  const DI = () => s.dictionary || {};
  $('#dict-on').onclick = () => save({ dictionary: { ...DI(), enabled: DI().enabled === false } });
  $('#dict-speak').onclick = () => save({ dictionary: { ...DI(), speak: DI().speak === false } });
  $('#dict-to').onchange = (e) => save({ dictionary: { ...DI(), to: e.target.value } });
  function renderDI() { setSw($('#dict-on'), DI().enabled !== false); setSw($('#dict-speak'), DI().speak !== false); $('#dict-to').value = DI().to || 'auto'; }

  // ---- containers
  const CT = () => s.containers || [];
  const CCOLORS = ['#3E8DEB', '#EE7A2E', '#3FAE5A', '#7C68FA', '#E5484D', '#14A89B', '#D9A21B', '#E055A3'];
  const CICONS = ['🏠', '💼', '🎓', '🎮', '🛒', '👪', '💰', '🎵', '📺', '⭐', '🧪', '✈️', '❤️', '🐶'];
  const saveCT = (list) => save({ containers: list });
  $('#ctr-add').onclick = () => { const n = CT().length; saveCT([...CT(), { id: 'c' + Date.now().toString(36), name: 'Container ' + (n + 1), color: CCOLORS[n % CCOLORS.length], icon: CICONS[(n + 3) % CICONS.length] }]); };
  function renderCT() {
    const el = $('#ctr-list'); if (el.contains(document.activeElement)) return;
    el.innerHTML = CT().length ? CT().map((c, i) => `<div class="ctr-row" data-i="${i}">
      <select class="ic" title="Icon">${CICONS.map((e) => `<option ${e === c.icon ? 'selected' : ''}>${e}</option>`).join('')}</select>
      <input class="field nm" value="${esc(c.name)}" maxlength="24">
      <span class="ctr-cols">${CCOLORS.map((col) => `<button style="background:${col}" data-col="${col}" class="${col === c.color ? 'on' : ''}" title="Colour"></button>`).join('')}</span>
      <button class="btn" data-clear>Sign out of everything</button><button class="btn" data-del title="Delete container">🗑️</button></div>`).join('') : '<div class="item"><div class="txt"><span>No containers yet.</span></div></div>';
    $$('.ctr-row').forEach((row) => {
      const i = +row.dataset.i; const upd = (patch) => saveCT(CT().map((c, j) => (j === i ? { ...c, ...patch } : c)));
      row.querySelector('.ic').onchange = (e) => upd({ icon: e.target.value });
      row.querySelector('.nm').onchange = (e) => upd({ name: e.target.value.trim() || 'Container' });
      row.querySelectorAll('[data-col]').forEach((b) => (b.onclick = () => upd({ color: b.dataset.col })));
      row.querySelector('[data-clear]').onclick = async (e) => { await noam.invoke('containers:clear', CT()[i].id); e.target.textContent = 'Done ✓'; setTimeout(() => (e.target.textContent = 'Sign out of everything'), 2000); };
      row.querySelector('[data-del]').onclick = async () => { if (!confirm(`Delete “${CT()[i].name}”? Its logins are removed too. Tabs open in it keep working until you close them.`)) return; await noam.invoke('containers:clear', CT()[i].id); saveCT(CT().filter((_, j) => j !== i)); };
    });
  }

  function render() {
    renderCT();
    renderDI();
    renderBL(); renderZA(); renderZL();
    $$('[data-g]').forEach((el) => setSw(el, (s.gestures || {})[el.dataset.g]));
    $$('[data-m]').forEach((el) => setSw(el, (s.media || {})[el.dataset.m]));
    $$('[data-dl]').forEach((el) => setSw(el, (s.downloads || {})[el.dataset.dl]));
    const lim = String((s.downloads || {}).limitKBps || 0);
    const sel = $('#dl-limit');
    if (![...sel.options].some((o) => o.value === lim)) sel.insertAdjacentHTML('beforeend', `<option value="${lim}">${lim} KB/s</option>`);
    sel.value = lim;
    const sp = s.sidePanel || {};
    setSw($('#sp-show'), sp.show !== false);
    const panels = sp.panels || [];
    $('#sp-list').innerHTML = panels.map((p, i) => `<div class="item"><div class="txt"><b>${esc(p.name)}</b><span>${esc(p.kind === 'web' ? p.url : { notes: 'Notes for the site you’re on', reading: 'Pages saved for later', calc: 'Calculator and unit converter', ambient: 'Rain, waves, café, lo-fi music and more' }[p.kind] || '')}</span></div>
      <span style="display:flex;gap:6px"><button class="btn" data-up="${i}" ${i ? '' : 'disabled'} title="Move up">↑</button><button class="btn" data-rm="${i}">Remove</button></span></div>`).join('');
    $$('[data-rm]').forEach((b) => (b.onclick = () => save({ sidePanel: { panels: panels.filter((_, i) => i !== +b.dataset.rm) } })));
    $$('#sp-list [data-up]').forEach((b) => (b.onclick = () => { const l = [...panels]; const i = +b.dataset.up; [l[i - 1], l[i]] = [l[i], l[i - 1]]; save({ sidePanel: { panels: l } }); }));
  }
  noam.on('settings', (ns) => { s = ns; render(); });
  render();

  // ---- saved sessions
  const preview = (x) => { const hosts = [...new Set((x.tabs || []).map((t) => { try { return new URL(t.url).hostname.replace(/^www\./, ''); } catch { return ''; } }).filter(Boolean))]; return hosts.length ? ' · ' + hosts.slice(0, 4).join(', ') + (hosts.length > 4 ? '…' : '') : ''; };
  async function renderSessions(list) {
    list = list || await noam.invoke('sessions:list');
    const el = $('#ses-list');
    if (!list.length) { el.innerHTML = '<div class="item"><div class="txt"><span>No saved sessions yet.</span></div></div>'; return; }
    el.innerHTML = list.map((x) => `<div class="item"><div class="txt"><b>${esc(x.name)}</b><span>${x.count} tab${x.count === 1 ? '' : 's'} · ${esc(new Date(x.created).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))}${esc(preview(x))}</span></div>
      <span style="display:flex;gap:6px"><button class="btn primary" data-open="${esc(x.id)}">Open</button><button class="btn" data-del="${esc(x.id)}">Delete</button></span></div>`).join('');
    $$('[data-open]').forEach((b) => (b.onclick = () => noam.invoke('sessions:open', b.dataset.open)));
    $$('[data-del]').forEach((b) => (b.onclick = async () => renderSessions(await noam.invoke('sessions:delete', b.dataset.del))));
  }
  renderSessions();
  noam.on('extras', (what) => { if (what === 'sessions' || what === 'all') renderSessions(); });

  // ---- sync: one-click cloud folders
  try {
    const clouds = await noam.invoke('sync:cloud-folders');
    if (clouds.length) {
      $('#sync-clouds').innerHTML = '<span style="width:100%;font-size:12px;color:var(--muted)">Found on this computer:</span>' + clouds.map((c) => `<button data-p="${esc(c.path)}" title="${esc(c.path)}">${esc(c.label)}</button>`).join('');
      $$('#sync-clouds button').forEach((b) => (b.onclick = () => window.setSyncFolder && window.setSyncFolder(b.dataset.p)));
    }
  } catch {}
})();
