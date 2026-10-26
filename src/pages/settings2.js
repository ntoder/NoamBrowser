// Settings for NoamBrowser 2.0 features.
(async () => {
  let s = await noamReady;
  const clean = (e) => String(e && e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  const save = async (patch) => { s = await noam.invoke('settings:set', patch); render(); };
  const setSw = (el, on) => el.setAttribute('aria-checked', String(!!on));

  // ---- tabs layout, passwords, translate, updates toggles
  $$('[data-ts]').forEach((seg) => $$('button', seg).forEach((b) => (b.onclick = () => save({ tabs: { [seg.dataset.ts]: b.dataset.v } }))));
  $$('[data-pw]').forEach((el) => (el.onclick = () => save({ passwords: { [el.dataset.pw]: !s.passwords[el.dataset.pw] } })));
  $$('[data-tr]').forEach((el) => (el.onclick = () => save({ translate: { [el.dataset.tr]: !s.translate[el.dataset.tr] } })));
  $$('[data-up]').forEach((el) => (el.onclick = () => save({ updates: { [el.dataset.up]: !s.updates[el.dataset.up] } })));

  const langName = (c) => { try { return new Intl.DisplayNames([navigator.language || 'en'], { type: 'language' }).of(c) || c; } catch { return c; } };
  const fallback = ['en', 'he', 'ar', 'ru', 'uk', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'cs', 'bg', 'et', 'is', 'nb', 'fa', 'tr', 'el'];
  const fillTargets = (list) => { $('#tr-target').innerHTML = list.map((c) => [c, langName(c)]).sort((a, b) => a[1].localeCompare(b[1])).map(([c, n]) => `<option value="${c}">${esc(n)}</option>`).join(''); $('#tr-target').value = s.translate.target || 'en'; };
  fillTargets(fallback);
  noam.invoke('translate:languages').then((l) => { if (l && l.to) fillTargets([...new Set([...l.to, 'en'])]); }).catch(() => {});
  $('#tr-target').onchange = (e) => save({ translate: { target: e.target.value } });

  function render() {
    $$('[data-ts]').forEach((seg) => $$('button', seg).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === ((s.tabs || {})[seg.dataset.ts] || 'horizontal')))));
    $$('[data-pw]').forEach((el) => setSw(el, s.passwords[el.dataset.pw]));
    $$('[data-tr]').forEach((el) => setSw(el, s.translate[el.dataset.tr]));
    $$('[data-up]').forEach((el) => setSw(el, s.updates[el.dataset.up]));
    if (document.activeElement !== $('#tr-target')) $('#tr-target').value = s.translate.target || 'en';
  }
  noam.on('settings', (ns) => { s = ns; render(); });
  render();

  // ---- dark mode
  async function renderDark(d) {
    d = d || await noam.invoke('sitedark:list');
    setSw($('#dark-all'), d.all);
    const sites = Object.keys(d.sites || {});
    $('#dark-sites').innerHTML = sites.length ? sites.map((x) => `<div class="item"><div class="txt"><b>${esc(x)}</b><span>Always dark</span></div><button class="btn" data-ds="${esc(x)}">Remove</button></div>`).join('') : '';
    $$('[data-ds]').forEach((b) => (b.onclick = async () => renderDark(await noam.invoke('sitedark:set', { site: b.dataset.ds, on: false }))));
  }
  $('#dark-all').onclick = async () => renderDark(await noam.invoke('sitedark:set', { all: $('#dark-all').getAttribute('aria-checked') !== 'true' }));
  renderDark();

  // ---- import
  async function renderImport() {
    const found = await noam.invoke('import:detect').catch(() => []);
    const card = $('#imp-card');
    if (!found.length) { card.innerHTML = '<div class="item"><div class="txt"><b>No other browsers found</b><span>NoamBrowser looks for Chrome, Edge, Brave, Vivaldi, Opera and Chromium on this computer.</span></div></div>'; return; }
    card.innerHTML = found.map((f, i) => `<div class="item"><div class="txt"><b>${esc(f.browser)}${f.profile && f.profile !== 'Default' ? ' — ' + esc(f.profile) : ''}</b><span id="imp-s-${i}">${[f.bookmarks && 'Bookmarks', f.history && 'History'].filter(Boolean).join(' and ')}</span></div><button class="btn" data-imp="${i}">Import</button></div>`).join('');
    $$('[data-imp]').forEach((b) => (b.onclick = async () => {
      const f = found[+b.dataset.imp]; const st = $('#imp-s-' + b.dataset.imp);
      b.disabled = true; b.textContent = 'Importing…';
      try {
        const r = await noam.invoke('import:run', { key: f.key, bookmarks: true, history: true });
        st.textContent = `Imported ${r.bookmarks} bookmark${r.bookmarks === 1 ? '' : 's'} and ${r.history} history entr${r.history === 1 ? 'y' : 'ies'}.`;
        b.textContent = 'Imported';
      } catch (e) { st.textContent = clean(e); b.disabled = false; b.textContent = 'Try again'; }
    }));
  }
  renderImport();

  // ---- sync
  let folder = '';
  const syncPw = $('#sync-pw');
  syncPw.onclick = () => setSw(syncPw, syncPw.getAttribute('aria-checked') !== 'true');
  window.setSyncFolder = (f) => { folder = f; $('#sync-folder-label').textContent = f; $$('#sync-clouds button').forEach((b) => b.classList.toggle('on', b.dataset.p === f)); };
  $('#sync-pick').onclick = async () => { const f = await noam.invoke('sync:choose-folder'); if (f) setSyncFolder(f); };
  $('#sync-on').onclick = async () => {
    const msg = $('#sync-msg'); msg.textContent = '';
    if (!folder) { msg.textContent = 'Choose a sync folder first.'; return; }
    $('#sync-on').disabled = true; msg.textContent = 'Setting up…';
    try { renderSync(await noam.invoke('sync:enable', { folder, passphrase: $('#sync-pass').value, passwords: syncPw.getAttribute('aria-checked') === 'true' })); $('#sync-pass').value = ''; }
    catch (e) { msg.textContent = clean(e); }
    $('#sync-on').disabled = false;
  };
  $('#sync-now').onclick = async () => renderSync(await noam.invoke('sync:now'));
  $('#sync-off-btn').onclick = async () => { if (confirm('Turn off sync on this computer? Your data stays here and on your other computers.')) renderSync(await noam.invoke('sync:disable')); };
  function renderSync(st) {
    if (!st) return;
    $('#sync-off').hidden = !!st.enabled; $('#sync-on-card').hidden = !st.enabled;
    if (!st.enabled) return;
    const state = $('#sync-state');
    state.className = 'vpnstate' + (st.state === 'on' || st.state === 'syncing' ? ' on' : '');
    $('#sync-state span').textContent = st.state === 'error' ? 'Sync problem' : st.state === 'syncing' ? 'Syncing…' : 'Sync is on';
    const others = (st.devices || []).map((d) => d.name + (d.error ? ` (${d.error})` : '')).join(', ');
    $('#sync-detail').textContent = st.error || [`Folder: ${st.folder}`, st.last ? `last synced ${new Date(st.last).toLocaleTimeString()}` : '', others ? `other computers: ${others}` : 'no other computers yet', st.passwords ? 'passwords included' : ''].filter(Boolean).join(' · ');
    $('#sync-me').textContent = st.deviceName;
  }
  renderSync(await noam.invoke('sync:status'));
  noam.on('sync', renderSync);

  // ---- updates
  function renderUpd(u) {
    if (!u) return;
    const d = $('#upd-detail'); const title = $('#upd-title');
    $('#upd-install').hidden = !(u.status === 'ready' || (u.status === 'available' && !u.canAutoInstall));
    $('#upd-install').textContent = u.status === 'ready' ? 'Restart to update' : 'Download update';
    const map = {
      unconfigured: 'Updates aren’t set up in this build.',
      dev: 'Updates are off while running from source.',
      idle: 'NoamBrowser checks for new versions every few hours.',
      checking: 'Checking for updates…',
      current: `You’re up to date (version ${u.version}).`,
      available: `Version ${u.available} is available.` + (u.canAutoInstall ? ' Downloading…' : ' Click Download update to get it.'),
      downloading: `Downloading version ${u.available || ''}… ${u.progress || 0}%`,
      ready: `Version ${u.available} is ready. Restart NoamBrowser to finish updating.`,
      error: 'Update check failed: ' + (u.error || 'unknown error'),
    };
    title.textContent = u.status === 'ready' ? 'Update ready' : 'Updates';
    d.textContent = map[u.status] || '';
  }
  $('#upd-check').onclick = async () => renderUpd(await noam.invoke('update:check'));
  $('#upd-install').onclick = () => noam.invoke('update:install');
  renderUpd(await noam.invoke('update:status'));
  noam.on('update', renderUpd);
})();
