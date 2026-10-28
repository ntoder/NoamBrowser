(async () => {
  await noamReady;
  let data = { snaps: [], watches: [] }, curUrl = new URLSearchParams(location.search).get('url'), curId = null, cmpId = null;
  const thumbs = new Map();
  const when = (t) => new Date(t).toLocaleString([], { day: 'numeric', month: 'short', year: new Date(t).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined, hour: '2-digit', minute: '2-digit' });
  const groups = () => { const g = new Map(); for (const s of data.snaps) { if (!g.has(s.url)) g.set(s.url, []); g.get(s.url).push(s); } for (const w of data.watches) if (!g.has(w.url)) g.set(w.url, []); return g; };

  async function load() { data = await noam.invoke('tm:list'); render(); }
  async function thumb(id) { if (!thumbs.has(id)) thumbs.set(id, await noam.invoke('tm:thumb', id)); return thumbs.get(id); }

  async function render() {
    const g = groups();
    if (!curUrl || !g.has(curUrl)) curUrl = g.keys().next().value || null;
    $('#pages').innerHTML = [...g].map(([url, list]) => {
      const last = list[0]; const watching = data.watches.some((w) => w.url === url);
      return `<div class="pg ${url === curUrl ? 'on' : ''}" data-url="${esc(url)}"><span class="th" data-th="${last ? esc(last.id) : ''}"></span><span><b>${esc(last ? last.title : url)}</b><small>${esc(last ? last.site : '')} · ${list.length} cop${list.length === 1 ? 'y' : 'ies'}</small>${watching ? '<br><span class="eye">👀 Watching</span>' : ''}</span></div>`;
    }).join('') || '<p class="lede">Nothing saved yet.</p>';
    $$('.pg').forEach((el) => (el.onclick = () => { curUrl = el.dataset.url; curId = null; cmpId = null; render(); }));
    $$('[data-th]').forEach(async (el) => { if (el.dataset.th) { const u = await thumb(el.dataset.th); if (u) el.style.backgroundImage = `url(${u})`; } });
    if (!curUrl) return;
    const list = g.get(curUrl) || [];
    if (!curId || !list.some((s) => s.id === curId)) curId = list[0] && list[0].id;
    const w = data.watches.find((x) => x.url === curUrl);
    const cur = list.find((s) => s.id === curId);
    $('#main').innerHTML = `<div class="bar"><h2 title="${esc(curUrl)}">${esc(cur ? cur.title : curUrl)}</h2>
        <a class="btn" href="${esc(curUrl)}">Open the live page ↗</a><span class="grow"></span>
        ${list.length > 1 ? `<label style="font-size:12.5px;font-weight:700;color:var(--muted)">Compare with <select class="field" id="cmp"><option value="">— nothing —</option>${list.filter((s) => s.id !== curId).map((s) => `<option value="${s.id}" ${s.id === cmpId ? 'selected' : ''}>${esc(when(s.t))}</option>`).join('')}</select></label>` : ''}
        <select class="field" id="watch"><option value="0">🔕 Don’t watch</option>${[3, 6, 12, 24, 72].map((h) => `<option value="${h}" ${w && w.hours === h ? 'selected' : ''}>👀 Check every ${h < 24 ? h + ' hours' : h / 24 + ' day' + (h > 24 ? 's' : '')}</option>`).join('')}</select>
        ${w ? '<button class="btn" id="checknow">Check now</button>' : ''}
        ${cur ? '<button class="btn" id="del">Delete this copy</button>' : ''}</div>
      ${w && w.error ? `<div class="bar" style="color:var(--danger);font-size:12.5px">Last check failed: ${esc(w.error)}</div>` : ''}
      <div class="tl">${list.map((s, i) => `<button data-id="${s.id}" class="${s.id === curId ? 'on' : ''} ${s.id === cmpId ? 'cmp' : ''}">${esc(when(s.t))}${s.auto ? ' 🤖' : ''}<small>${s.changed ? `<span class="ch">+${s.changed.added}</span> <span class="rm">−${s.changed.removed}</span> lines` : i === list.length - 1 ? 'first copy' : 'no changes'} · ${s.words.toLocaleString()} words</small></button>`).join('')}</div>
      <div class="view" id="view">${cur ? `<iframe sandbox="" src="noam://timemachine/view?id=${cur.id}" title="Saved copy"></iframe>` : '<div class="empty">No copies yet — the first check will save one.</div>'}</div>`;
    $$('.tl button').forEach((b) => (b.onclick = () => { if (b.dataset.id === curId) return; curId = b.dataset.id; if (cmpId === curId) cmpId = null; render(); }));
    const cmp = $('#cmp'); if (cmp) cmp.onchange = () => { cmpId = cmp.value || null; render(); };
    $('#watch').onchange = async (e) => { const h = +e.target.value; await noam.invoke('tm:watch', { url: curUrl, hours: h, on: h > 0 }); load(); };
    const cn = $('#checknow'); if (cn) cn.onclick = async () => { cn.disabled = true; cn.textContent = 'Checking…'; await noam.invoke('tm:check', curUrl); load(); };
    const del = $('#del'); if (del) del.onclick = async () => { await noam.invoke('tm:delete', curId); curId = null; load(); };
    if (cmpId && cur) showDiff(cmpId, curId);
  }

  // line-by-line comparison (longest common subsequence)
  function diff(a, b) {
    a = a.split('\n').map((l) => l.trim()).filter(Boolean); b = b.split('\n').map((l) => l.trim()).filter(Boolean);
    const n = a.length, m = b.length;
    if (n * m > 6e6) { const A = new Set(a), B = new Set(b); return [...a.filter((l) => !B.has(l)).map((l) => ['del', l]), ...b.map((l) => [A.has(l) ? 'same' : 'add', l])]; }
    const dp = new Uint32Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i * (m + 1) + j] = a[i] === b[j] ? dp[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1]);
    const out = []; let i = 0, j = 0;
    while (i < n && j < m) { if (a[i] === b[j]) { out.push(['same', a[i]]); i++; j++; } else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1]) out.push(['del', a[i++]]); else out.push(['add', b[j++]]); }
    while (i < n) out.push(['del', a[i++]]); while (j < m) out.push(['add', b[j++]]);
    return out;
  }
  async function showDiff(olderId, newerId) {
    const sOld = data.snaps.find((s) => s.id === olderId), sNew = data.snaps.find((s) => s.id === newerId);
    let [A, Bn] = [sOld, sNew]; if (A.t > Bn.t) [A, Bn] = [Bn, A];
    const [ta, tb] = await Promise.all([noam.invoke('tm:text', A.id), noam.invoke('tm:text', Bn.id)]);
    const d = diff(ta, tb);
    const add = d.filter((x) => x[0] === 'add').length, del = d.filter((x) => x[0] === 'del').length;
    // show changes with a little context; fold long unchanged stretches
    let html = '', run = [];
    const flush = (last) => { if (run.length > 6) { html += run.slice(0, 2).map((l) => `<div class="l same">${esc(l)}</div>`).join('') + `<div class="gap">… ${run.length - 4} lines that didn’t change …</div>` + run.slice(-2).map((l) => `<div class="l same">${esc(l)}</div>`).join(''); } else html += run.map((l) => `<div class="l same">${esc(l)}</div>`).join(''); run = []; };
    for (const [k, l] of d) { if (k === 'same') { run.push(l); continue; } flush(); html += `<div class="l ${k}">${k === 'add' ? '＋ ' : '－ '}${esc(l)}</div>`; }
    flush();
    $('#view').innerHTML = `<div class="diff"><div class="sum">From ${esc(when(A.t))} to ${esc(when(Bn.t))}: <span class="a">${add} new line${add === 1 ? '' : 's'}</span>, <span class="r">${del} gone</span>${add + del === 0 ? ' — the words didn’t change at all.' : ''}</div>${html}</div>`;
  }
  noam.on('timemachine', () => load());
  load();
})();
