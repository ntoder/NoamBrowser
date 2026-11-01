// NoamBrowser — bookmarks bar: folders, an "All bookmarks" menu, site icons, drag to reorder or into a
// folder, drop links onto the bar, and right-click to edit, move or delete.
'use strict';
(() => {
  let folders = [];
  const bar = $('#bookmarks-bar');
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u || ''; } };
  // site icon: the saved one, or the site's own favicon.ico, or a globe
  function favEl(b) {
    const wrap = document.createElement('span'); wrap.className = 'bm-ic';
    const src = b.favicon || (/^https?:/.test(b.url) ? `https://${new URL(b.url).hostname}/favicon.ico` : '');
    if (/^noam:/.test(b.url)) { wrap.innerHTML = icon('noam'); return wrap; }
    if (!src) { wrap.innerHTML = icon('globe'); return wrap; }
    const img = document.createElement('img'); img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
    img.onerror = () => { if (b.favicon && img.src !== `https://${host(b.url)}/favicon.ico` && /^https?:/.test(b.url)) { b.favicon = ''; img.src = `https://${new URL(b.url).hostname}/favicon.ico`; } else wrap.innerHTML = icon('globe'); };
    img.src = src; wrap.appendChild(img); return wrap;
  }
  const open = (b, e) => { if (e && (e.ctrlKey || e.metaKey || e.button === 1)) newTab({ url: b.url, background: true }); else if (e && e.shiftKey) newTab({ url: b.url }); else state.active ? state.active.navigate(b.url) : newTab({ url: b.url }); };
  const inFolder = (name) => state.bookmarks.filter((b) => (b.folder || '') === name);
  const allFolders = () => { const l = [...folders]; for (const b of state.bookmarks) if (b.folder && !l.includes(b.folder)) l.push(b.folder); return l; };

  // ---------------------------------------------------------------- right-click menus
  async function bookmarkMenu(b, x, y) {
    const fl = allFolders();
    const id = await popup([
      { id: 'open', label: 'Open' }, { id: 'tab', label: 'Open in new tab' }, { id: 'private', label: 'Open in private tab' },
      { type: 'separator' },
      { id: 'rename', label: 'Rename…' }, { id: 'url', label: 'Change address…' },
      { label: 'Move to', submenu: [{ id: 'mv:', label: '⭐ Bookmarks bar', enabled: !!b.folder }, ...fl.map((f) => ({ id: 'mv:' + f, label: '📁 ' + f, enabled: f !== b.folder })), { type: 'separator' }, { id: 'mvnew', label: '➕ New folder…' }] },
      { id: 'copy', label: 'Copy link' },
      { type: 'separator' }, { id: 'del', label: '🗑️ Delete' },
    ], x, y);
    if (!id) return;
    if (id === 'open') open(b); else if (id === 'tab') newTab({ url: b.url, background: true }); else if (id === 'private') newTab({ url: b.url, private: true });
    else if (id === 'rename') { const t = await askText('Bookmark name', b.title || ''); if (t) await nb.invoke('bm:update', { id: b.id, title: t }); }
    else if (id === 'url') { let u = await askText('Bookmark address', b.url); if (u) { if (!/^[a-z]+:/i.test(u)) u = 'https://' + u; await nb.invoke('bm:update', { id: b.id, url: u }); } }
    else if (id.startsWith('mv:')) await nb.invoke('bm:update', { id: b.id, folder: id.slice(3) });
    else if (id === 'mvnew') { const f = await askText('New folder name', '', 'e.g. School'); if (f) { await nb.invoke('bm:folder-new', f); await nb.invoke('bm:update', { id: b.id, folder: f.trim() }); } }
    else if (id === 'copy') { navigator.clipboard.writeText(b.url).then(() => toast('🔗 Link copied')); }
    else if (id === 'del') { const copy = { ...b }; await nb.invoke('bm:remove', [b.id]); undoToast(`Deleted “${b.title || host(b.url)}”`, () => nb.invoke('bm:add', copy)); }
  }
  async function folderMenu(name, x, y) {
    const n = inFolder(name).length;
    const id = await popup([
      { id: 'all', label: `Open all (${n})`, enabled: n > 0 }, { id: 'allwin', label: 'Open all in a new tab group', enabled: n > 1 },
      { type: 'separator' }, { id: 'rename', label: 'Rename folder…' }, { id: 'new', label: 'New folder…' },
      { type: 'separator' }, { id: 'keep', label: '🗑️ Delete folder (keep its bookmarks on the bar)', enabled: n > 0 }, { id: 'del', label: n ? `🗑️ Delete folder and its ${n} bookmark${n === 1 ? '' : 's'}` : '🗑️ Delete folder' },
    ], x, y);
    if (!id) return;
    if (id === 'all') openAll(name);
    else if (id === 'allwin') openAll(name, true);
    else if (id === 'rename') { const t = await askText('Folder name', name); if (t) folders = await nb.invoke('bm:folder-rename', { from: name, to: t }); }
    else if (id === 'new') newFolder();
    else if (id === 'keep') folders = await nb.invoke('bm:folder-delete', { name, keep: true });
    else if (id === 'del') { const items = inFolder(name).map((b) => ({ ...b })); folders = await nb.invoke('bm:folder-delete', { name }); undoToast(`Deleted folder “${name}”`, async () => { await nb.invoke('bm:folder-new', name); for (const b of items) await nb.invoke('bm:add', b); }); }
    render();
  }
  async function barMenu(x, y) {
    const t = state.active; const canAdd = t && /^(https?|noam):/.test(t.url || '') && !state.bookmarks.some((b) => b.url === t.url);
    const id = await popup([{ id: 'add', label: '⭐ Bookmark this page', enabled: !!canAdd }, { id: 'new', label: '📁 New folder…' }, { type: 'separator' }, { id: 'manage', label: 'Manage bookmarks' }, { id: 'hide', label: 'Hide the bookmarks bar' }], x, y);
    if (id === 'add') nb.invoke('bm:add', { url: t.url, title: t.title, favicon: t.favicon });
    if (id === 'new') newFolder();
    if (id === 'manage') newTab({ url: 'noam://bookmarks/' });
    if (id === 'hide') { state.settings = await nb.invoke('settings:set', { showBookmarksBar: false }); applyTheme(); toast('Bookmarks bar hidden. Turn it back on in Settings → Appearance (or Ctrl+Shift+B)'); }
  }
  async function newFolder() { const f = await askText('New folder name', '', 'e.g. School'); if (f) { folders = await nb.invoke('bm:folder-new', f); render(); } }
  function openAll(name, group) {
    const list = name === null ? state.bookmarks : inFolder(name); if (!list.length) return;
    if (list.length > 15 && !confirm(`Open ${list.length} tabs?`)) return;
    const made = list.map((b, i) => newTab({ url: b.url, background: i > 0 }));
    if (group && made[0] && window.addToGroup) { const g = addToGroup(made[0], { id: 'g' + Date.now().toString(36), name, color: '#3E8DEB', collapsed: false }); if (!state.groups.includes(g)) state.groups.push(g); made.slice(1).forEach((t) => t && addToGroup(t, g)); saveGroups(); renderGroups(); }
  }
  function undoToast(msg, undo) {
    const t = $('#toast'); t.innerHTML = ''; t.append(msg + '  ');
    const u = document.createElement('button'); u.className = 'toast-undo'; u.textContent = 'Undo'; u.onclick = () => { undo(); t.hidden = true; }; t.appendChild(u);
    t.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => (t.hidden = true), 6000);
  }

  // ---------------------------------------------------------------- dropdowns (folders, overflow, all bookmarks)
  const drop = document.createElement('div'); drop.className = 'bm-drop'; drop.hidden = true; document.body.appendChild(drop);
  let dropFor = null;
  const closeDrop = () => { drop.hidden = true; dropFor = null; $$('.bm.open').forEach((x) => x.classList.remove('open')); };
  function row(b) {
    const r = document.createElement('div'); r.className = 'bd-row'; r.title = b.url; r.draggable = true;
    r.append(favEl(b)); const s = document.createElement('span'); s.textContent = b.title || host(b.url); r.append(s);
    r.onclick = (e) => { closeDrop(); open(b, e); };
    r.onauxclick = (e) => { if (e.button === 1) { e.preventDefault(); newTab({ url: b.url, background: true }); } };
    r.oncontextmenu = (e) => { e.preventDefault(); bookmarkMenu(b, e.clientX, e.clientY); };
    r.ondragstart = (e) => { e.dataTransfer.setData('noam/bm', b.id); e.dataTransfer.setData('text/uri-list', b.url); };
    return r;
  }
  function showDrop(anchor, kind, payload) {
    if (dropFor === anchor && !drop.hidden) { closeDrop(); return; }
    closeDrop(); dropFor = anchor; anchor.classList.add('open'); drop.innerHTML = '';
    if (kind === 'folder') {
      const list = inFolder(payload);
      const head = document.createElement('div'); head.className = 'bd-head'; head.innerHTML = `<b>📁 ${esc(payload)}</b>`;
      if (list.length) { const a = document.createElement('button'); a.textContent = `Open all (${list.length})`; a.onclick = () => { closeDrop(); openAll(payload); }; head.append(a); }
      drop.append(head);
      list.forEach((b) => drop.append(row(b)));
      if (!list.length) { const e = document.createElement('div'); e.className = 'bd-empty'; e.textContent = 'Empty folder. Drag bookmarks here, or right-click a bookmark → Move to.'; drop.append(e); }
      drop.ondragover = (e) => { if (e.dataTransfer.types.includes('noam/bm')) e.preventDefault(); };
      drop.ondrop = async (e) => { const id = e.dataTransfer.getData('noam/bm'); if (id) { e.preventDefault(); await nb.invoke('bm:update', { id, folder: payload }); } };
    } else if (kind === 'overflow') {
      payload.forEach((x) => drop.append(x.folder != null ? folderRow(x.folder) : row(x.b)));
    } else if (kind === 'all') {
      const box = document.createElement('div'); box.className = 'bd-search'; box.innerHTML = `<input placeholder="Search bookmarks" spellcheck="false">`; drop.append(box);
      const listEl = document.createElement('div'); drop.append(listEl);
      const fill = (q) => {
        listEl.innerHTML = ''; q = q.trim().toLowerCase();
        const match = (b) => !q || (b.title + ' ' + b.url).toLowerCase().includes(q);
        const sec = (title, items, folder) => {
          if (!items.length && q) return;
          const h = document.createElement('div'); h.className = 'bd-sec'; h.textContent = title;
          if (folder != null && items.length) { const a = document.createElement('button'); a.textContent = 'Open all'; a.onclick = () => { closeDrop(); openAll(folder); }; h.append(a); }
          listEl.append(h); items.forEach((b) => listEl.append(row(b)));
          if (!items.length) { const e = document.createElement('div'); e.className = 'bd-empty'; e.textContent = 'Empty'; listEl.append(e); }
        };
        sec('⭐ Bookmarks bar', state.bookmarks.filter((b) => !b.folder && match(b)), null);
        for (const f of allFolders()) sec('📁 ' + f, inFolder(f).filter(match), f);
        if (q && !listEl.children.length) listEl.innerHTML = '<div class="bd-empty">No bookmarks match.</div>';
      };
      const inp = box.querySelector('input'); inp.oninput = () => fill(inp.value); inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Escape') closeDrop(); if (e.key === 'Enter') { const f = listEl.querySelector('.bd-row'); if (f) f.click(); } };
      fill('');
      const foot = document.createElement('div'); foot.className = 'bd-foot';
      foot.innerHTML = '<button data-a="new">📁 New folder</button><button data-a="manage">Manage bookmarks</button>';
      foot.querySelector('[data-a=new]').onclick = () => { closeDrop(); newFolder(); };
      foot.querySelector('[data-a=manage]').onclick = () => { closeDrop(); newTab({ url: 'noam://bookmarks/' }); };
      drop.append(foot);
      setTimeout(() => inp.focus(), 0);
    }
    drop.hidden = false;
    const r = anchor.getBoundingClientRect(); const w = drop.offsetWidth;
    drop.style.top = r.bottom + 4 + 'px'; drop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, kind === 'all' || kind === 'overflow' ? r.right - w : r.left)) + 'px';
  }
  function folderRow(name) {
    const r = document.createElement('div'); r.className = 'bd-row bd-folder';
    r.innerHTML = `<span class="bm-ic">📁</span><span>${esc(name)}</span><i>▸</i>`;
    r.onclick = (e) => { e.stopPropagation(); showDrop(r, 'folder', name); };
    r.oncontextmenu = (e) => { e.preventDefault(); folderMenu(name, e.clientX, e.clientY); };
    return r;
  }
  document.addEventListener('mousedown', (e) => { if (!drop.hidden && !drop.contains(e.target) && !(dropFor && dropFor.contains(e.target))) closeDrop(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !drop.hidden) closeDrop(); });
  window.addEventListener('resize', () => { closeDrop(); layout(); });

  // ---------------------------------------------------------------- the bar
  let dragId = null, dragFolder = null;
  function chip(b) {
    const a = document.createElement('button'); a.className = 'bm'; a.title = (b.title || '') + '\n' + b.url; a.draggable = true; a.dataset.id = b.id;
    a.append(favEl(b)); const s = document.createElement('span'); s.textContent = b.title || host(b.url); a.append(s);
    a.onclick = (e) => open(b, e);
    a.onauxclick = (e) => { if (e.button === 1) { e.preventDefault(); newTab({ url: b.url, background: true }); } };
    a.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); bookmarkMenu(b, e.clientX, e.clientY); };
    a.ondragstart = (e) => { dragId = b.id; e.dataTransfer.setData('noam/bm', b.id); e.dataTransfer.setData('text/uri-list', b.url); e.dataTransfer.effectAllowed = 'move'; };
    a.ondragend = () => { dragId = null; $$('.bm.drop-before').forEach((x) => x.classList.remove('drop-before')); };
    a.ondragover = (e) => { if (dragId || dragFolder || e.dataTransfer.types.includes('text/uri-list')) { e.preventDefault(); $$('.bm.drop-before').forEach((x) => x.classList.remove('drop-before')); a.classList.add('drop-before'); } };
    a.ondragleave = () => a.classList.remove('drop-before');
    a.ondrop = async (e) => { e.preventDefault(); e.stopPropagation(); a.classList.remove('drop-before'); const id = e.dataTransfer.getData('noam/bm'); if (id && id !== b.id) await nb.invoke('bm:move', { id, beforeId: b.id, folder: '' }); else if (!id) addDropped(e, b.id); };
    return a;
  }
  function folderChip(name) {
    const a = document.createElement('button'); a.className = 'bm bm-folder'; a.title = `${name} (${inFolder(name).length})`; a.draggable = true;
    a.innerHTML = `<span class="bm-ic">📁</span><span>${esc(name)}</span>`;
    a.onclick = (e) => { e.stopPropagation(); showDrop(a, 'folder', name); };
    a.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); folderMenu(name, e.clientX, e.clientY); };
    a.ondragstart = (e) => { dragFolder = name; e.dataTransfer.setData('noam/folder', name); };
    a.ondragend = () => { dragFolder = null; };
    a.ondragover = (e) => { if (dragId || dragFolder || e.dataTransfer.types.includes('text/uri-list')) { e.preventDefault(); a.classList.add('drop-into'); } };
    a.ondragleave = () => a.classList.remove('drop-into');
    a.ondrop = async (e) => {
      e.preventDefault(); e.stopPropagation(); a.classList.remove('drop-into');
      const id = e.dataTransfer.getData('noam/bm'), f = e.dataTransfer.getData('noam/folder');
      if (id) { await nb.invoke('bm:update', { id, folder: name }); toast(`Moved into 📁 ${name}`); }
      else if (f && f !== name) { folders = await nb.invoke('bm:folder-move', { name: f, before: name }); render(); }
      else if (!f) addDropped(e, null, name);
    };
    return a;
  }
  async function addDropped(e, beforeId, folder = '') {
    const url = (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '').split('\n').find((l) => /^https?:/.test(l.trim()));
    if (!url) return;
    const title = (e.dataTransfer.getData('text/plain') || '').trim();
    const items = await nb.invoke('bm:add', { url: url.trim(), title: title && !/^https?:/.test(title) ? title : host(url), folder });
    if (beforeId && items) { const last = items[items.length - 1]; await nb.invoke('bm:move', { id: last.id, beforeId, folder }); }
    toast('⭐ Bookmarked');
  }
  bar.ondragover = (e) => { if (dragId || e.dataTransfer.types.includes('text/uri-list')) e.preventDefault(); };
  bar.ondrop = async (e) => { e.preventDefault(); const id = e.dataTransfer.getData('noam/bm'); if (id) await nb.invoke('bm:move', { id, beforeId: null, folder: '' }); else addDropped(e, null); };
  bar.oncontextmenu = (e) => { if (e.target === bar || e.target.classList.contains('bm-hint') || e.target.classList.contains('bm-space')) { e.preventDefault(); barMenu(e.clientX, e.clientY); } };

  let overflowBtn, allBtn;
  function render() {
    closeDrop();
    bar.innerHTML = '';
    const fl = allFolders();
    const loose = state.bookmarks.filter((b) => !b.folder);
    const strip = document.createElement('div'); strip.className = 'bm-strip';
    fl.forEach((f) => strip.append(folderChip(f)));
    loose.forEach((b) => strip.append(chip(b)));
    if (!fl.length && !loose.length) { const h = document.createElement('span'); h.className = 'bm-hint'; h.textContent = 'Bookmarks you add with the ☆ star appear here. Drag links here too.'; strip.append(h); }
    bar.append(strip);
    overflowBtn = document.createElement('button'); overflowBtn.className = 'bm bm-more'; overflowBtn.title = 'More bookmarks'; overflowBtn.textContent = '»'; overflowBtn.hidden = true;
    const sp = document.createElement('span'); sp.className = 'bm-space';
    allBtn = document.createElement('button'); allBtn.className = 'bm bm-all'; allBtn.title = 'All your bookmarks';
    allBtn.innerHTML = `<span class="bm-ic">📚</span><span>All bookmarks</span>`;
    allBtn.onclick = (e) => { e.stopPropagation(); showDrop(allBtn, 'all'); };
    allBtn.oncontextmenu = (e) => { e.preventDefault(); barMenu(e.clientX, e.clientY); };
    bar.append(overflowBtn, sp, allBtn);
    allBtn.hidden = !state.bookmarks.length && !fl.length;
    layout();
    renderToolbar();
  }
  // whatever doesn't fit goes into the » menu
  function layout() {
    const strip = bar.querySelector('.bm-strip'); if (!strip || !overflowBtn) return;
    const kids = [...strip.children].filter((k) => k.classList.contains('bm')); kids.forEach((k) => (k.hidden = false)); overflowBtn.hidden = true;
    const limit = bar.clientWidth - (allBtn.hidden ? 0 : allBtn.offsetWidth) - 50;
    if (strip.scrollWidth <= limit + 40) return;
    const hidden = [];
    for (const k of kids) { if (k.offsetLeft + k.offsetWidth > limit) { k.hidden = true; hidden.push(k); } }
    if (!hidden.length) return;
    overflowBtn.hidden = false;
    overflowBtn.onclick = (e) => { e.stopPropagation(); showDrop(overflowBtn, 'overflow', hidden.map((k) => (k.classList.contains('bm-folder') ? { folder: k.querySelector('span:last-child').textContent } : { b: state.bookmarks.find((b) => b.id === k.dataset.id) })).filter((x) => x.folder != null || x.b)); };
  }
  window.renderBookmarks = render;
  nb.on('bookmarks:folders', (f) => { folders = f; render(); });
  const _init = hooks.init; hooks.init = async (i) => { if (_init) await _init(i); folders = await nb.invoke('bm:folders').catch(() => []); render(); };
  const _cmds = commands;
  commands = function () { return [..._cmds(), CMD('allbm', 'All bookmarks 📚', '', () => { if (!state.settings.showBookmarksBar) newTab({ url: 'noam://bookmarks/' }); else showDrop(allBtn, 'all'); }, 'star'), CMD('bmfolder', 'New bookmarks folder', '', newFolder, 'star')]; };
})();
