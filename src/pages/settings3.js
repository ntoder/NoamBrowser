// Settings for NoamBrowser 2.1: gestures, media, downloads, sidebar, sessions, sync cloud folders.
(async () => {
  let s = await noamReady;
  const setSw = (el, on) => el.setAttribute('aria-checked', String(!!on));
  const save = async (patch) => { s = await noam.invoke('settings:set', patch); render(); };
  const DEFAULT_PANELS = [
    { id: 'notes', kind: 'notes', name: 'Notes' },
    { id: 'reading', kind: 'reading', name: 'Reading list' },
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

  function render() {
    renderBL(); renderZA();
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
    $('#sp-list').innerHTML = panels.map((p, i) => `<div class="item"><div class="txt"><b>${esc(p.name)}</b><span>${esc(p.kind === 'web' ? p.url : { notes: 'Notes for the site you’re on', reading: 'Pages saved for later', calc: 'Calculator and unit converter' }[p.kind] || '')}</span></div>
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
