(async () => {
  await noamReady;
  let list = await noam.invoke('downloads:list');
  function render() {
    if (!list.length) { $('#list').innerHTML = '<div class="empty"><b>No downloads</b>Files you download appear here.</div>'; return; }
    let html = ''; let day = '';
    for (const d of list) {
      const dl = dayLabel(d.started);
      if (dl !== day) { if (day) html += '</div>'; html += `<div class="group-label">${esc(dl)}</div><div class="rows">`; day = dl; }
      const pct = d.total ? Math.round((d.received / d.total) * 100) : 0;
      const meta = d.state === 'progressing' ? `${fmtBytes(d.received)} of ${d.total ? fmtBytes(d.total) : 'unknown size'}${d.paused ? ' · Paused' : d.speed ? ` · ${fmtBytes(d.speed)}/s` : ''}${d.limited && !d.paused ? ' (speed limit on)' : ''}` : d.state === 'completed' ? fmtBytes(d.total || d.received) : d.state === 'cancelled' ? 'Cancelled' : 'Failed';
      const acts = d.state === 'progressing'
        ? `<button class="act" data-a="${d.paused ? 'resume' : 'pause'}" data-id="${d.id}" title="${d.paused ? 'Resume' : 'Pause'}">${svg(d.paused ? ICONS.play : ICONS.pause)}</button><button class="act" data-a="cancel" data-id="${d.id}" title="Cancel">${svg(ICONS.close)}</button>`
        : d.state === 'completed' ? `<button class="act" data-a="show" data-id="${d.id}" title="Show in folder">${svg(ICONS.folder)}</button>` : '';
      html += `<div class="row ${d.state === 'completed' || d.state === 'progressing' ? '' : 'failed'}"><span class="fav">${svg(ICONS.file)}</span><div class="main"><a class="t" href="#" data-open="${d.id}">${esc(d.name)}</a><span class="u">${esc(meta)} · ${esc(d.url.replace(/^https?:\/\//, '').slice(0, 80))}</span>${d.state === 'progressing' ? `<span class="bar"><i style="width:${pct}%"></i></span>` : ''}</div>${acts}</div>`;
    }
    $('#list').innerHTML = html + '</div>';
    $$('[data-a]').forEach((b) => (b.onclick = () => noam.invoke('downloads:' + b.dataset.a, b.dataset.id)));
    $$('[data-open]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); noam.invoke('downloads:open', a.dataset.open); }));
  }
  noam.on('downloads', (d) => { const i = list.findIndex((x) => x.id === d.id); if (i >= 0) list[i] = d; else list.unshift(d); render(); });
  noam.on('downloads-list', (l) => { list = l; render(); });
  $('#clear').onclick = async () => { list = await noam.invoke('downloads:clear'); render(); };
  render();
})();
