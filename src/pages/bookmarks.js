(async () => {
  await noamReady;
  let items = await noam.invoke('bookmarks:list'); let folders = await noam.invoke('bookmarks:folders'); let q = '';
  const host = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
  const icon = (b) => b.favicon ? favImg(b.favicon) : /^https?:/.test(b.url) ? favImg(`https://${host(b.url)}/favicon.ico`) : svg(ICONS.globe);
  const allFolders = () => { const l = [...folders]; for (const b of items) if (b.folder && !l.includes(b.folder)) l.push(b.folder); return l; };
  // Electron pages have no prompt(), so ask for a folder name in a little box
  const askName = () => new Promise((res) => {
    const box = document.createElement('form'); box.className = 'namebox';
    box.innerHTML = '<input class="field" placeholder="Folder name, e.g. School" maxlength="60"><button class="btn primary">Create folder</button><button type="button" class="btn">Cancel</button>';
    $('#add').after(box); const inp = box.querySelector('input'); inp.focus();
    const done = (v) => { box.remove(); res(v); };
    box.onsubmit = (e) => { e.preventDefault(); done(inp.value.trim() || null); };
    box.querySelector('[type=button]').onclick = () => done(null);
    inp.onkeydown = (e) => { if (e.key === 'Escape') done(null); };
  });
  function render() {
    const match = (b) => !q || (b.title || '').toLowerCase().includes(q) || b.url.toLowerCase().includes(q) || (b.folder || '').toLowerCase().includes(q);
    const groups = [['', '⭐ Bookmarks bar'], ...allFolders().map((f) => [f, '📁 ' + f])];
    const fl = allFolders();
    const rowHtml = (b) => `<div class="row" data-id="${b.id}" draggable="true"><span class="fav">${icon(b)}</span><a class="main" href="${esc(b.url)}"><span class="t">${esc(b.title)}</span><span class="u">${esc(b.url.replace(/^https?:\/\//, ''))}</span></a>
      <select class="field mv" title="Move to folder"><option value="">⭐ Bookmarks bar</option>${fl.map((f) => `<option value="${esc(f)}" ${f === b.folder ? 'selected' : ''}>📁 ${esc(f)}</option>`).join('')}<option value="__new">➕ New folder…</option></select>
      <button class="act" data-a="edit" title="Rename">${svg(ICONS.edit)}</button><button class="act" data-a="del" title="Delete">${svg(ICONS.close)}</button></div>`;
    let html = '';
    for (const [key, label] of groups) {
      const list = items.filter((b) => (b.folder || '') === key && match(b));
      if (!list.length && q) continue;
      html += `<div class="grp" data-folder="${esc(key)}"><h2>${esc(label)} <small>${list.length}</small></h2><div class="rows">${list.map(rowHtml).join('') || '<div class="emptyf">Empty: drag bookmarks here</div>'}</div></div>`;
    }
    $('#list').innerHTML = html || `<div class="empty"><b>${q ? 'No matches' : 'No bookmarks yet'}</b>${q ? '' : 'Press the star in the address bar or Ctrl+D to save a page.'}</div>`;
    $$('[data-a="del"]').forEach((b) => (b.onclick = async () => { items = await noam.invoke('bookmarks:remove', b.closest('.row').dataset.id); render(); }));
    $$('select.mv').forEach((sel) => (sel.onchange = async () => {
      let f = sel.value; const id = sel.closest('.row').dataset.id;
      if (f === '__new') { f = await askName(); if (!f) return render(); folders = await noam.invoke('bookmarks:folder-new', f); }
      items = await noam.invoke('bookmarks:update', { id, folder: f }); render();
    }));
    $$('.row').forEach((r) => (r.ondragstart = (e) => e.dataTransfer.setData('noam/bm', r.dataset.id)));
    $$('.grp').forEach((g) => { g.ondragover = (e) => { e.preventDefault(); g.classList.add('over'); }; g.ondragleave = () => g.classList.remove('over'); g.ondrop = async (e) => { e.preventDefault(); g.classList.remove('over'); const id = e.dataTransfer.getData('noam/bm'); if (id) { items = await noam.invoke('bookmarks:update', { id, folder: g.dataset.folder }); render(); } }; });
    $$('[data-a="edit"]').forEach((b) => (b.onclick = () => {
      const row = b.closest('.row'); const bm = items.find((x) => x.id === row.dataset.id);
      const main = row.querySelector('.main');
      const inp = Object.assign(document.createElement('input'), { className: 'field', value: bm.title });
      main.replaceWith(inp); inp.focus(); inp.select();
      const save = async () => { items = await noam.invoke('bookmarks:update', { id: bm.id, title: inp.value.trim() || bm.title }); render(); };
      inp.onkeydown = (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') render(); };
      inp.onblur = save;
    }));
  }
  $('#q').oninput = (e) => { q = e.target.value.trim().toLowerCase(); render(); };
  $('#newf').onclick = async () => { const f = await askName(); if (f) { folders = await noam.invoke('bookmarks:folder-new', f); render(); } };
  $('#add').onsubmit = async (e) => {
    e.preventDefault();
    let url = $('#aurl').value.trim(); if (!url) return;
    if (!/^(https?|noam):/.test(url)) url = 'https://' + url;
    try { items = await noam.invoke('bookmarks:add', { url, title: $('#atitle').value.trim() || url }); $('#aurl').value = ''; $('#atitle').value = ''; render(); } catch (err) { alert(err.message); }
  };
  noam.on('bookmarks', async (b) => { items = b || (await noam.invoke('bookmarks:list')); folders = await noam.invoke('bookmarks:folders'); if (!document.activeElement || !document.activeElement.matches('input,select')) render(); });
  render();
})();
