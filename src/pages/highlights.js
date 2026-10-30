(async () => {
  await noamReady;
  const COL = { yellow: '#ffd600', green: '#50dc78', pink: '#ff6eb4', blue: '#5aaaff' };
  let items = [], color = null;
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
  $('#dots').innerHTML = '<button class="all on" data-c="">All</button>' + Object.entries(COL).map(([c, v]) => `<button data-c="${c}" style="background:${v}" title="${c}"></button>`).join('');
  $$('#dots button').forEach((b) => (b.onclick = () => { color = b.dataset.c || null; $$('#dots button').forEach((x) => x.classList.toggle('on', x === b)); render(); }));
  const shown = () => { const q = $('#q').value.trim().toLowerCase(); return items.filter((h) => (!color || h.color === color) && (!q || (h.quote + ' ' + h.title + ' ' + h.url).toLowerCase().includes(q))); };
  async function render() {
    const list = shown(); const pages = new Map();
    for (const h of list) { if (!pages.has(h.url)) pages.set(h.url, []); pages.get(h.url).push(h); }
    if (!list.length) { $('#list').innerHTML = `<div class="empty"><div class="big">🖍️</div>${items.length ? 'No highlights match.' : 'No highlights yet. Select some text on a page, right-click it and choose “Highlight”.'}</div>`; return; }
    const links = await Promise.all(list.map((h) => noam.invoke('hl:link', { url: h.url, quote: h.quote })));
    const linkOf = new Map(list.map((h, i) => [h.id, links[i]]));
    $('#list').innerHTML = [...pages].map(([url, hs]) => `<div class="pg"><h2><a href="${esc(url)}" target="_blank">${esc(hs[0].title || url)}</a><small>${esc(host(url))} · ${hs.length}</small></h2>
      ${hs.map((h) => `<div class="h"><span class="c" style="background:${COL[h.color]}"></span><div><q>${esc(h.quote)}</q><small>${dayLabel(h.t)}</small></div><div class="acts"><a class="btn" href="${esc(linkOf.get(h.id))}" target="_blank" title="Open the page at this spot">Go to it ↗</a><button class="btn" data-del="${h.id}" title="Delete">🗑️</button></div></div>`).join('')}</div>`).join('');
    $$('[data-del]').forEach((b) => (b.onclick = async () => { items = await noam.invoke('hl:remove', b.dataset.del); render(); }));
  }
  $('#q').oninput = render;
  $('#copy').onclick = () => {
    const pages = new Map(); for (const h of shown()) { if (!pages.has(h.url)) pages.set(h.url, []); pages.get(h.url).push(h); }
    const md = [...pages].map(([url, hs]) => `## ${hs[0].title || url}\n${url}\n\n${hs.map((h) => '> ' + h.quote.replace(/\n+/g, ' ')).join('\n\n')}`).join('\n\n');
    navigator.clipboard.writeText(md).then(() => { $('#copy').textContent = '✅ Copied'; setTimeout(() => ($('#copy').textContent = '📋 Copy all as notes'), 1500); });
  };
  noam.on('highlights', async () => { items = await noam.invoke('hl:list'); render(); });
  items = await noam.invoke('hl:list'); render();
})();
