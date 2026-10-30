(async () => {
  await noamReady;
  const ri = async (r) => { r = r || (await noam.invoke('readindex:stats')); $('#ri-on').setAttribute('aria-checked', String(r.enabled)); $('#ri-clear').textContent = r.count ? `Forget ${fmtNum(r.count)} page${r.count === 1 ? '' : 's'}` : 'Nothing saved yet'; $('#ri-clear').disabled = !r.count; };
  $('#ri-on').onclick = async () => ri(await noam.invoke('readindex:set', $('#ri-on').getAttribute('aria-checked') !== 'true'));
  $('#ri-clear').onclick = async () => { if (confirm('Forget the words of all the pages you’ve read? (Your history stays.)')) ri(await noam.invoke('readindex:clear')); };
  const fg = async (list) => { list = list || (await noam.invoke('forget:list')); $('#fg-row').hidden = !list.length; $('#fg-list').innerHTML = list.map((s) => `<button data-s="${esc(s)}" title="Stop forgetting this site">${esc(s)} ✕</button>`).join(''); $$('#fg-list [data-s]').forEach((b) => (b.onclick = async () => fg(await noam.invoke('forget:remove', b.dataset.s)))); };
  ri(); fg();
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
