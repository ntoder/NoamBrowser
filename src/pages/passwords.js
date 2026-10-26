(async () => {
  await noamReady;
  let data = await noam.invoke('passwords:list');
  let q = '';
  let check = null; // id -> result of the last leak check
  const ICON_EYE = '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>';
  const ICON_COPY = '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>';
  const prot = data.protection;
  $('#prot').innerHTML = `Saved passwords are encrypted on this computer with <b>${esc(prot.label)}</b>. NoamBrowser never uploads them${data.syncing ? ', except into your encrypted sync folder' : ''}.`;
  const msg = (t) => { $('#msg').textContent = t; clearTimeout(msg.t); msg.t = setTimeout(() => ($('#msg').textContent = ''), 5000); };
  const host = (o) => { try { return new URL(o).host; } catch { return o; } };

  function flags(id) {
    const r = check && check[id]; if (!r) return '';
    const f = [];
    if (r.pwned) f.push(`<span class="flag pwned" title="This password appears ${r.pwned.toLocaleString()} times in known data breaches">Leaked</span>`);
    if (r.reused) f.push('<span class="flag reused" title="You use this password on more than one site">Reused</span>');
    if (r.strength === 'weak') f.push('<span class="flag weak" title="Short or easy to guess">Weak</span>');
    if (!f.length) f.push('<span class="flag ok">Safe</span>');
    return '<span class="flags">' + f.join('') + '</span>';
  }
  $('#check').onclick = async () => {
    const b = $('#check'); b.disabled = true; b.textContent = 'Checking…';
    try {
      const res = await noam.invoke('passwords:check');
      check = Object.fromEntries(res.results.map((r) => [r.id, r]));
      const leaked = res.results.filter((r) => r.pwned).length, reused = res.results.filter((r) => r.reused).length, weak = res.results.filter((r) => r.strength === 'weak').length;
      const rep = $('#report'); rep.hidden = false;
      rep.innerHTML = (res.offline ? '<p><b class="bad">Couldn’t reach the breach database</b> — only reused and weak passwords were checked. Try again when you’re online.</p>' : '')
        + (!res.results.length ? 'No saved passwords to check.'
          : leaked || reused || weak
            ? `<b class="bad">${leaked} leaked</b> · <b>${reused} reused</b> · <b>${weak} weak</b> out of ${res.results.length}. Change the flagged ones on their sites first, then update them here.`
            : `<b class="good">All ${res.results.length} passwords look safe.</b> None were found in known breaches.`)
        + '<p class="note" style="margin:8px 0 0">How this works: only the first 5 characters of each password’s SHA-1 fingerprint are sent to Have I Been Pwned, so neither they nor anyone else ever sees your passwords.</p>';
      render();
    } catch (e) { msg('Check failed: ' + String(e.message || e).replace(/^.*?Error: /, '')); }
    b.disabled = false; b.textContent = 'Check again';
  };

  function render() {
    const items = data.items.filter((i) => !q || i.origin.toLowerCase().includes(q) || (i.username || '').toLowerCase().includes(q));
    if (!items.length) {
      $('#list').innerHTML = `<div class="empty"><b>${q ? 'No matches' : 'No saved passwords'}</b>${q ? '' : 'When you sign in to a site, NoamBrowser offers to save the password.'}</div>`;
    } else {
      $('#list').innerHTML = '<div class="rows">' + items.map((i) => `<div class="row" data-id="${i.id}">
        <span class="fav">${svg(ICONS.globe)}</span>
        <a class="main" href="${esc(i.origin)}"><span class="t">${esc(host(i.origin))}</span><span class="u">${esc(i.username || '(no username)')}</span></a>
        ${flags(i.id)}
        <span class="pw" data-pw>••••••••••</span>
        <button class="act" data-a="reveal" title="Show password">${svg(ICON_EYE)}</button>
        <button class="act" data-a="copy" title="Copy password">${svg(ICON_COPY)}</button>
        <button class="act" data-a="edit" title="Edit">${svg(ICONS.edit)}</button>
        <button class="act" data-a="del" title="Delete">${svg(ICONS.close)}</button></div>`).join('') + '</div>';
    }
    $$('[data-a]').forEach((b) => (b.onclick = () => act(b.dataset.a, b.closest('.row'))));
    $('#never-wrap').hidden = !data.never.length;
    $('#never').innerHTML = data.never.map((o) => `<div class="row"><span class="main"><span class="t">${esc(host(o))}</span></span><button class="btn" data-n="${esc(o)}">Allow saving</button></div>`).join('');
    $$('[data-n]').forEach((b) => (b.onclick = async () => { data = await noam.invoke('passwords:never-remove', b.dataset.n); render(); }));
  }

  async function act(a, row) {
    const id = row.dataset.id;
    if (a === 'reveal') {
      const el = row.querySelector('[data-pw]');
      if (el.dataset.shown) { el.textContent = '••••••••••'; delete el.dataset.shown; return; }
      el.textContent = await noam.invoke('passwords:reveal', id) || ''; el.dataset.shown = '1';
    } else if (a === 'copy') {
      const p = await noam.invoke('passwords:reveal', id);
      try { await navigator.clipboard.writeText(p); msg('Password copied. It’s cleared from the clipboard in 30 seconds.'); noam.invoke('passwords:clear-clipboard-later', p); } catch { msg('Couldn’t copy.'); }
    } else if (a === 'del') {
      if (!confirm('Delete this saved password?')) return;
      data = await noam.invoke('passwords:remove', id); render();
    } else if (a === 'edit') {
      const item = data.items.find((i) => i.id === id);
      const pw = await noam.invoke('passwords:reveal', id);
      row.outerHTML = `<div class="edit" data-edit="${id}"><input class="field" id="eu" value="${esc(item.username || '')}" placeholder="Username"><input class="field" id="ep" type="text" value="${esc(pw || '')}" placeholder="Password"><button class="btn primary" id="es">Save</button><button class="btn" id="ec">Cancel</button></div>`;
      $('#es').onclick = async () => { data = await noam.invoke('passwords:update', { id, origin: item.origin, username: $('#eu').value, password: $('#ep').value }); render(); msg('Saved.'); };
      $('#ec').onclick = render;
    }
  }

  $('#q').oninput = (e) => { q = e.target.value.trim().toLowerCase(); render(); };
  $('#export').onclick = async () => { const r = await noam.invoke('passwords:export'); if (r) msg('Exported to ' + r + '. Anyone who opens that file can read your passwords — delete it when you’re done.'); };
  $('#csv').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = async () => { try { const res = await noam.invoke('passwords:import', r.result); data = res.data; render(); msg(`Imported ${res.count} password${res.count === 1 ? '' : 's'}.`); } catch (err) { msg(String(err.message).replace(/^.*?Error: /, '')); } };
    r.readAsText(f); e.target.value = '';
  };
  render();
})();
