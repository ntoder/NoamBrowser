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

  function render() {
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
