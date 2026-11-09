// noam://folder/ — the files in a folder on your computer.
(async () => {
  const u = new URLSearchParams(location.search).get('u') || '';
  let data = null, sort = { by: 'name', dir: 1 }, sel = -1, shown = [];
  try { sort = JSON.parse(localStorage.getItem('folder-sort')) || sort; } catch {}
  $('#hidden').checked = localStorage.getItem('folder-hidden') === '1';
  const ICON = (it) => {
    if (it.dir) return '📁';
    const e = (it.name.split('.').pop() || '').toLowerCase();
    if (/^(html?|xhtml|shtml|mhtml)$/.test(e)) return '🌐'; if (e === 'pdf') return '📕';
    if (/^(png|jpe?g|gif|webp|avif|bmp|ico|svg|heic)$/.test(e)) return '🖼️'; if (/^(mp4|webm|mov|mkv|avi)$/.test(e)) return '🎬';
    if (/^(mp3|ogg|wav|m4a|flac|aac)$/.test(e)) return '🎵'; if (/^(zip|rar|7z|tar|gz|xz)$/.test(e)) return '🗜️';
    if (/^(js|ts|py|css|json|xml|java|c|cpp|cs|go|rs|sh|bat|ps1)$/.test(e)) return '🧩'; if (/^(txt|md|log|csv|rtf)$/.test(e)) return '📄';
    if (/^(doc|docx|odt)$/.test(e)) return '📘'; if (/^(xls|xlsx|ods)$/.test(e)) return '📗'; if (/^(ppt|pptx|odp)$/.test(e)) return '📙';
    if (/^(exe|msi|deb|appimage|dmg|pkg|apk)$/.test(e)) return '⚙️'; return '📄';
  };
  const when = (t) => (t ? new Date(t).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  const open = (it) => (it.dir ? (location.href = 'noam://folder/?u=' + encodeURIComponent(it.url)) : noam.invoke('files:open', it.url));
  function render() {
    if (!data) return;
    if (data.error) { $('#list').innerHTML = `<div class="err">⚠️ ${esc(data.error)}</div>`; return; }
    const q = $('#q').value.trim().toLowerCase(), showHidden = $('#hidden').checked;
    shown = data.items.filter((it) => (showHidden || !it.hidden) && (!q || it.name.toLowerCase().includes(q)));
    const k = sort.by;
    shown.sort((a, b) => (b.dir - a.dir) || (k === 'size' ? (a.size || 0) - (b.size || 0) : k === 'mtime' ? a.mtime - b.mtime : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })) * sort.dir);
    const arrow = (c) => (sort.by === c ? (sort.dir > 0 ? ' ▲' : ' ▼') : '');
    const hiddenCount = data.items.filter((it) => it.hidden).length;
    $('#list').innerHTML = shown.length ? `<table><thead><tr><th data-s="name">Name${arrow('name')}</th><th data-s="mtime">Changed${arrow('mtime')}</th><th class="r" data-s="size">Size${arrow('size')}</th></tr></thead><tbody>${shown.map((it, i) => `<tr data-i="${i}" class="${it.hidden ? 'hid' : ''}${i === sel ? ' sel' : ''}"><td class="n"><span class="ic">${ICON(it)}</span><b dir="auto">${esc(it.name)}</b></td><td class="m">${esc(when(it.mtime))}</td><td class="m r">${it.dir ? '' : esc(fmtBytes(it.size))}</td></tr>`).join('')}</tbody></table>${data.more ? '<p class="empty">Only the first 5,000 items are shown.</p>' : ''}`
      : `<div class="empty">${q ? 'Nothing matches.' : 'This folder is empty.'}${!showHidden && hiddenCount ? ` (${hiddenCount} hidden item${hiddenCount > 1 ? 's' : ''})` : ''}</div>`;
    $$('th[data-s]').forEach((th) => (th.onclick = () => { sort = { by: th.dataset.s, dir: sort.by === th.dataset.s ? -sort.dir : 1 }; localStorage.setItem('folder-sort', JSON.stringify(sort)); render(); }));
    $$('tbody tr').forEach((tr) => (tr.onclick = () => open(shown[+tr.dataset.i])));
  }
  data = await noam.invoke('files:list', u);
  if (data.path) {
    const parts = data.path.split(/[\\/]/).filter(Boolean); const name = parts[parts.length - 1] || data.path;
    document.title = name; $('#title').textContent = '📁 ' + name;
    // clickable path: / › home › noam
    const root = data.sep === '/' ? '/' : (data.path.match(/^([a-z]:\\|\\\\[^\\]+\\[^\\]+\\?)/i) || [''])[0];
    const segs = data.path.slice(root.length).split(/[\\/]/).filter(Boolean);
    const crumbs = [{ label: root || '/', p: root }]; let acc = root;
    for (const s of segs) { acc = acc + (acc.endsWith(data.sep) || !acc ? '' : data.sep) + s; crumbs.push({ label: s, p: acc }); }
    const toUrl = (p) => 'file://' + (p.startsWith('/') ? '' : '/') + p.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/').replace(/^\/([a-zA-Z])%3A/, '/$1:');
    $('#crumbs').innerHTML = crumbs.map((c, i) => `${i ? '<span>›</span>' : ''}<button data-c="${i}" dir="auto">${esc(c.label)}</button>`).join('');
    $$('#crumbs button').forEach((b) => (b.onclick = () => { const c = crumbs[+b.dataset.c]; location.href = 'noam://folder/?u=' + encodeURIComponent(+b.dataset.c === crumbs.length - 1 ? data.url : toUrl(c.p)); }));
  }
  $('#up').disabled = !data.parent;
  $('#up').onclick = () => { if (data.parent) location.href = 'noam://folder/?u=' + encodeURIComponent(data.parent); };
  $('#q').oninput = () => { sel = -1; render(); };
  $('#hidden').onchange = () => { localStorage.setItem('folder-hidden', $('#hidden').checked ? '1' : '0'); render(); };
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' && e.key !== 'ArrowDown' && e.key !== 'Enter') return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { sel = Math.max(0, Math.min(shown.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1))); render(); e.preventDefault(); const r = $('tr.sel'); r && r.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter' && shown[sel]) open(shown[sel]);
    else if (e.key === 'Backspace' && data.parent) $('#up').click();
  });
  render();
})();
