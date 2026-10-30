(async () => {
  await noamReady;
  const PICKS = [
    ['eimadpbcbfnmbkopoojfekhnkhdbieeh', '🌙', 'Dark Reader', 'Dark mode with lots of options'],
    ['kbfnbcaeplbcioakkpcpgfkobkghlhen', '✍️', 'Grammarly', 'Checks your English writing'],
    ['oldceeleldhonbafppcapldpdifcinji', '📝', 'LanguageTool', 'Spelling & grammar in many languages'],
    ['nngceckbapebfimnlniiiahkandclblb', '🔐', 'Bitwarden', 'Password manager that syncs everywhere'],
    ['mnjggcdmjocbbbhaepdhchncahnbgone', '⏭️', 'SponsorBlock', 'Skips sponsor segments on YouTube'],
    ['gebbhagfogifgggkldgodflihgfeippi', '👎', 'Return YouTube Dislike', 'Shows dislikes on YouTube again'],
    ['bhlhnicpbhignbdhedgjhgdocnmhomnp', '🎨', 'ColorZilla', 'Pick any colour from a page'],
    ['fmkadmapgofadopljbjfkapdkoienihi', '⚛️', 'React Developer Tools', 'For people who build with React'],
  ];
  const RISK = { low: 'Low risk', medium: 'Medium risk', high: 'High risk' };
  let list = [];
  const msg = (t, ok) => { const m = $('#msg'); m.textContent = t || ''; m.className = 'msg ' + (ok ? 'ok' : 'err'); };
  function render() {
    $('#list').innerHTML = list.length ? list.map((x) => `<div class="ext ${x.enabled ? '' : 'off'}" data-id="${x.id}">
      ${x.icon ? `<img src="${esc(x.icon)}" alt="">` : '<span class="ph">🧩</span>'}
      <div><h3>${esc(x.name)} <small>${esc(x.version || '')}</small><span class="tag ${x.risk}">${RISK[x.risk]}</span><span class="tag">${x.source === 'folder' ? '📂 Your folder' : 'Chrome Web Store'}</span></h3>
        ${x.description ? `<p>${esc(x.description)}</p>` : ''}
        <details><summary>What it can do</summary><ul>${x.items.map((i) => `<li>${['✅', '⚠️', '❗'][i.level]} ${esc(i.text)}</li>`).join('')}</ul></details></div>
      <div class="side"><button class="switch" role="switch" aria-checked="${x.enabled}" data-a="toggle" title="${x.enabled ? 'Turn off' : 'Turn on'}"></button>
        <div class="acts">${x.options && x.enabled ? '<button class="btn" data-a="options">Options</button>' : ''}${x.source === 'folder' ? '<button class="btn" data-a="reload">Reload</button>' : ''}<button class="btn" data-a="remove">Remove</button></div></div></div>`).join('')
      : '<div class="empty"><div class="big">🧩</div>No extensions yet. Open the Chrome Web Store or try a popular pick below.</div>';
    $$('#list [data-a]').forEach((b) => (b.onclick = async () => {
      const id = b.closest('.ext').dataset.id, a = b.dataset.a, x = list.find((e) => e.id === id);
      if (a === 'toggle') list = await noam.invoke('ext:toggle', { id, on: !x.enabled });
      if (a === 'options') noam.invoke('ext:options', { id });
      if (a === 'reload') list = await noam.invoke('ext:reload', { id });
      if (a === 'remove') { if (!confirm(`Remove “${x.name}”?`)) return; list = await noam.invoke('ext:remove', { id }); }
      render();
    }));
    const have = new Set(list.map((x) => x.id));
    $('#picks').innerHTML = PICKS.map(([id, e, n, d]) => `<div class="pick"><span class="e">${e}</span><span><b>${n}</b><small>${d}</small></span>${have.has(id) ? '<span class="tag low">Added</span>' : `<button class="btn" data-pick="${id}">Add</button>`}</div>`).join('');
    $$('[data-pick]').forEach((b) => (b.onclick = () => install(b.dataset.pick, b)));
  }
  async function install(id, b) {
    if (b) { b.disabled = true; b.textContent = 'Getting…'; }
    msg('');
    const r = await noam.invoke('ext:install-id', { id });
    if (r.error) msg(r.error); else if (r.added) { msg(`🧩 Added “${r.added}”`, true); }
    if (r.list) list = r.list; else list = (await noam.invoke('ext:list')).list;
    render();
  }
  $('#paste-go').onclick = () => { const v = $('#paste').value.trim(); if (v) install(v); $('#paste').value = ''; };
  $('#paste').onkeydown = (e) => { if (e.key === 'Enter') $('#paste-go').click(); };
  $('#folder').onclick = async () => { const r = await noam.invoke('ext:folder'); list = r.list; if (r.error) msg(r.error); else if (r.added) msg(`🧩 Loaded “${r.added}” from your folder`, true); render(); };
  noam.on('extensions', async () => { list = (await noam.invoke('ext:list')).list; render(); });
  list = (await noam.invoke('ext:list')).list; render();
})();
