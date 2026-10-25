(async () => {
  await noamReady;
  let items = await noam.invoke('bookmarks:list'); let q = '';
  function render() {
    const list = items.filter((b) => !q || b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q));
    if (!list.length) { $('#list').innerHTML = `<div class="empty"><b>${q ? 'No matches' : 'No bookmarks yet'}</b>${q ? '' : 'Press the star in the address bar or Ctrl+D to save a page.'}</div>`; return; }
    $('#list').innerHTML = '<div class="rows">' + list.map((b) => `<div class="row" data-id="${b.id}"><span class="fav">${favImg(b.favicon)}</span><a class="main" href="${esc(b.url)}"><span class="t">${esc(b.title)}</span><span class="u">${esc(b.url.replace(/^https?:\/\//, ''))}</span></a><button class="act" data-a="edit" title="Rename">${svg(ICONS.edit)}</button><button class="act" data-a="del" title="Delete">${svg(ICONS.close)}</button></div>`).join('') + '</div>';
    $$('[data-a="del"]').forEach((b) => (b.onclick = async () => { items = await noam.invoke('bookmarks:remove', b.closest('.row').dataset.id); render(); }));
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
  $('#add').onsubmit = async (e) => {
    e.preventDefault();
    let url = $('#aurl').value.trim(); if (!url) return;
    if (!/^(https?|noam):/.test(url)) url = 'https://' + url;
    try { items = await noam.invoke('bookmarks:add', { url, title: $('#atitle').value.trim() || url }); $('#aurl').value = ''; $('#atitle').value = ''; render(); } catch (err) { alert(err.message); }
  };
  render();
})();
