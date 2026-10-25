(async () => {
  await noamReady;
  let offset = 0; let items = []; let q = '';
  async function load(reset) {
    if (reset) { offset = 0; items = []; }
    const r = await noam.invoke('history:list', { q, offset, limit: 300 });
    items = items.concat(r.items); offset += r.items.length;
    $('#more').hidden = offset >= r.total;
    render();
  }
  function render() {
    if (!items.length) {
      $('#list').innerHTML = q ? `<div class="empty"><b>No matches</b>Nothing in your history matches “${esc(q)}”.</div>` : `<div class="empty"><b>No history yet</b>Pages you visit show up here. Private tabs are never recorded.</div>`;
      return;
    }
    let html = ''; let day = '';
    for (const h of items) {
      const d = dayLabel(h.t);
      if (d !== day) { if (day) html += '</div>'; html += `<div class="group-label">${esc(d)}</div><div class="rows">`; day = d; }
      html += `<div class="row"><span class="time">${esc(timeLabel(h.t))}</span><span class="fav">${favImg(h.favicon)}</span><a class="main" href="${esc(h.url)}"><span class="t">${esc(h.title || h.url)}</span><span class="u">${esc(h.url.replace(/^https?:\/\//, ''))}</span></a><button class="act" data-url="${esc(h.url)}" title="Remove from history">${svg(ICONS.close)}</button></div>`;
    }
    $('#list').innerHTML = html + '</div>';
    $$('.act').forEach((b) => (b.onclick = async () => { await noam.invoke('history:delete', [b.dataset.url]); items = items.filter((i) => i.url !== b.dataset.url); render(); }));
  }
  let t; $('#q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { q = e.target.value.trim(); load(true); }, 150); };
  $('#morebtn').onclick = () => load(false);
  $('#clear').onclick = async () => { if (confirm('Clear all browsing history? This can’t be undone.')) { await noam.invoke('history:clear'); load(true); } };
  load(true);
})();
