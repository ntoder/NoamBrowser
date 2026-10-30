// NoamBrowser 2.6 — Chrome extensions (toolbar, safety check before installing), tab search,
// share & clean links, organize tabs.
'use strict';

// ====================================================================== extensions
(() => {
  const actions = $('#ext-actions'), btn = $('#ext-btn');
  const _act = hooks.activated;
  hooks.activated = (t) => { _act(t); if (t && t.wcId && !t.private && !t.container) nb.invoke('ext:active', t.wcId).catch(() => {}); };
  // the puzzle button shows once at least one extension is installed
  const count = () => nb.invoke('ext:count').then((n) => { btn.hidden = !n; }).catch(() => {});
  const _init = hooks.init; hooks.init = async (i) => { await _init(i); count(); };
  nb.on('ext:changed', count);
  btn.onclick = () => newTab({ url: 'noam://extensions/' });
  const paint = () => { const t = state.active; if (actions) actions.classList.toggle('dim', !!(t && (t.private || t.container))); };
  const _a2 = hooks.activated; hooks.activated = (t) => { _a2(t); paint(); };

  // the safety check shown before an extension is added
  const RISK = { low: ['🟢', 'Low risk', 'It can only do simple things.'], medium: ['🟡', 'Medium risk', 'It can see some of what you do. Fine if you trust who made it.'], high: ['🔴', 'High risk', 'It could see or change a lot. Only add it if you really trust who made it.'] };
  nb.on('ext:confirm', (d) => {
    const wrap = document.createElement('div'); wrap.className = 'ask ext-ask';
    const [dot, label, explain] = RISK[d.risk] || RISK.medium;
    wrap.innerHTML = `<div class="ask-box ext-box">
      <div class="ext-head">${d.icon ? `<img src="${esc(d.icon)}" alt="">` : '<span class="ext-ph">🧩</span>'}<div><h3>Add “${esc(d.name)}”?</h3><small>Version ${esc(d.version || '')} · from the Chrome Web Store</small></div></div>
      ${d.description ? `<p class="ext-desc">${esc(d.description)}</p>` : ''}
      <div class="ext-risk ${d.risk}">${dot} <b>${label}</b><span>${explain}</span></div>
      <div class="ext-can">It will be able to:</div>
      <ul class="ext-list">${d.items.map((i) => `<li class="l${i.level}">${['✅', '⚠️', '❗'][i.level]} ${esc(i.text)}</li>`).join('')}</ul>
      <p class="ext-note">🔒 Extensions never run in private tabs or containers. You can turn it off or remove it any time in ⋮ → Extensions.</p>
      <div class="ask-acts"><button class="btn ghost" data-a="no">Cancel</button><button class="btn primary" data-a="ok">Add extension</button></div></div>`;
    document.body.appendChild(wrap);
    const done = (ok) => { wrap.remove(); nb.invoke('ext:answer', { id: d.reqId, ok }); if (ok) { toast(`🧩 Added “${d.name}”`); btn.hidden = false; } };
    wrap.querySelector('[data-a=ok]').onclick = () => done(true);
    wrap.querySelector('[data-a=no]').onclick = () => done(false);
    wrap.onkeydown = (e) => { if (e.key === 'Escape') done(false); };
    wrap.querySelector('[data-a=no]').focus();
  });
  const _cmds = commands;
  commands = function () {
    return [..._cmds(),
      CMD('extensions', 'Extensions 🧩', '', () => newTab({ url: 'noam://extensions/' }), 'globe'),
      CMD('webstore', 'Get extensions from the Chrome Web Store', '', () => newTab({ url: 'https://chromewebstore.google.com/' }), 'globe')];
  };
})();

// ====================================================================== tab search (Ctrl+Shift+A)
// Like Chrome's tab search, plus sleeping tabs, the words inside your open pages, pages you've read before
// and history, all in one box.
(() => {
  const el = document.createElement('div'); el.id = 'tabsearch'; el.hidden = true;
  el.innerHTML = `<div class="pal-box ts-box" role="dialog" aria-label="Search tabs">
    <div class="pal-input"><svg><use href="#i-search"/></svg><input id="ts-q" placeholder="Search your tabs, and the words inside them…" spellcheck="false" autocomplete="off"><kbd>Esc</kbd></div>
    <div id="ts-list" role="listbox"></div>
    <div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Del</kbd> close tab</span><span><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>A</kbd> anytime</span></div></div>`;
  document.body.appendChild(el);
  const q = el.querySelector('#ts-q'), list = el.querySelector('#ts-list');
  let items = [], sel = 0, seq = 0, timer = null;
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u || ''; } };
  const fav = (f, u) => f ? `<img src="${esc(f)}" alt="" data-fb="1">` : (/^noam:/.test(u || '') ? icon('noam') : icon('globe'));
  const ago = (t) => { if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
  const mark = (s, words) => { let h = esc(s); for (const w of words) if (w) h = h.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>'); return h; };
  const allTabs = () => state.tabs.filter((t) => !t.closing);
  const tabRow = (t, extra = {}) => ({ kind: 'tab', t, title: t.title || host(t.url), url: t.url, fav: t.private ? null : t.favicon, ...extra });
  function render(words = []) {
    let html = '', last = '';
    items.forEach((it, i) => {
      if (it.sec !== last) { html += `<div class="pal-sec">${it.sec}</div>`; last = it.sec; }
      const tags = it.kind === 'tab' ? `${it.t.asleep ? '<span class="ts-tag">💤 sleeping</span>' : ''}${it.t.private ? '<span class="ts-tag">🕶️ private</span>' : ''}${it.t.container && window.containerById && containerById(it.t.container) ? `<span class="ts-tag">${esc(containerById(it.t.container).icon || '🗂️')} ${esc(containerById(it.t.container).name)}</span>` : ''}${it.t === state.active ? '<span class="ts-tag on">this tab</span>' : ''}` : it.when ? `<span class="ts-tag">${it.when}</span>` : '';
      html += `<div class="pal-item ts-item ${i === sel ? 'sel' : ''}" data-i="${i}"><span class="ic">${it.kind === 'closed' ? '↩️' : fav(it.fav, it.url)}</span>
        <span class="ts-main"><span class="t">${mark(it.title, words)}</span>${tags}<span class="u">${mark(host(it.url), words)}</span>${it.snippet ? `<span class="ts-snip">“${mark(it.snippet, words)}”</span>` : ''}</span>
        ${it.kind === 'tab' ? '<button class="ts-x" title="Close tab">✕</button>' : ''}</div>`;
    });
    list.innerHTML = html || `<div class="pal-empty">${words.length ? 'Nothing found. Try another word.' : 'No tabs open.'}</div>`;
    list.querySelectorAll('.ts-item').forEach((r) => {
      r.onmousemove = () => { if (sel !== +r.dataset.i) { sel = +r.dataset.i; list.querySelectorAll('.ts-item').forEach((x) => x.classList.toggle('sel', +x.dataset.i === sel)); } };
      r.onclick = (e) => { if (e.target.closest('.ts-x')) { closeIt(+r.dataset.i); return; } go(+r.dataset.i); };
    });
    list.querySelectorAll('img[data-fb]').forEach((img) => img.addEventListener('error', () => { img.outerHTML = icon('globe'); }, { once: true }));
    const s = list.querySelector('.sel'); if (s) s.scrollIntoView({ block: 'nearest' });
  }
  function closeIt(i) { const it = items[i]; if (!it || it.kind !== 'tab') return; closeTab(it.t); search(); }
  function go(i) {
    const it = items[i]; if (!it) return; hide();
    if (it.kind === 'tab') { if (it.t.ws !== state.ws && window.switchWs) switchWs(it.t.ws); activate(it.t); }
    else if (it.kind === 'closed') { const k = state.closed.lastIndexOf(it.c); if (k >= 0) state.closed.splice(k, 1); newTab({ url: it.url }); }
    else newTab({ url: it.url });
  }
  async function search() {
    const text = q.value.trim(); const words = text.toLowerCase().split(/\s+/).filter(Boolean); const my = ++seq;
    const tabs = allTabs();
    if (!words.length) {
      items = [...tabs].sort((a, b) => (b === state.active) - (a === state.active) || (b.lastActive || 0) - (a.lastActive || 0)).map((t) => tabRow(t, { sec: `Open tabs (${tabs.length})` }));
      items.push(...[...state.closed].reverse().slice(0, 6).map((c) => ({ kind: 'closed', c, sec: 'Recently closed', title: c.title || host(c.url), url: c.url, fav: c.favicon })));
      sel = 0; render(); return;
    }
    // instant: titles & addresses
    const quick = (s) => words.every((w) => (s || '').toLowerCase().includes(w));
    items = tabs.filter((t) => quick(t.title + ' ' + t.url)).map((t) => tabRow(t, { sec: 'Open tabs' }));
    items.push(...[...state.closed].reverse().filter((c) => quick((c.title || '') + ' ' + c.url)).slice(0, 4).map((c) => ({ kind: 'closed', c, sec: 'Recently closed', title: c.title || host(c.url), url: c.url, fav: c.favicon })));
    sel = 0; render(words);
    // then the words inside pages, pages you've read, and history
    const r = await nb.invoke('find:query', { q: text, tabs: tabs.filter((t) => !t.private).map((t) => ({ id: t.id, wcId: t.wcId, asleep: !!t.asleep, title: t.title, url: t.url })) }).catch(() => null);
    if (!r || my !== seq || el.hidden) return;
    const byId = new Map(tabs.map((t) => [t.id, t]));
    const tabHits = r.tabs.map((x) => byId.get(x.id) && tabRow(byId.get(x.id), { sec: 'Open tabs', snippet: x.snippet })).filter(Boolean);
    const quickIds = new Set(items.filter((i) => i.kind === 'tab').map((i) => i.t.id));
    const closed = items.filter((i) => i.kind === 'closed');
    items = [...items.filter((i) => i.kind === 'tab').map((i) => { const h = tabHits.find((x) => x.t === i.t); return h && h.snippet ? h : i; }), ...tabHits.filter((h) => !quickIds.has(h.t.id)), ...closed,
      ...r.read.map((p) => ({ kind: 'url', sec: '🧠 Pages you’ve read', title: p.title, url: p.url, snippet: p.snippet, when: ago(p.at) })),
      ...r.history.map((h) => ({ kind: 'url', sec: 'History', title: h.title || host(h.url), url: h.url, fav: h.favicon, when: ago(h.at) }))];
    sel = Math.min(sel, Math.max(0, items.length - 1)); render(words);
  }
  function show() { el.hidden = false; q.value = ''; search(); setTimeout(() => q.focus(), 0); }
  function hide() { el.hidden = true; if (state.active && state.active.wv) try { state.active.wv.focus(); } catch {} }
  window.openTabSearch = show;
  q.oninput = () => { clearTimeout(timer); timer = setTimeout(search, 120); };
  q.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') hide();
    else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); render(q.value.toLowerCase().split(/\s+/).filter(Boolean)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); render(q.value.toLowerCase().split(/\s+/).filter(Boolean)); }
    else if (e.key === 'Enter') go(sel);
    else if (e.key === 'Delete' && items[sel] && items[sel].kind === 'tab') { e.preventDefault(); closeIt(sel); }
  };
  el.onmousedown = (e) => { if (e.target === el) hide(); };
  const _sc = hooks.shortcut;
  hooks.shortcut = (key, mods) => {
    if (_sc && _sc(key, mods)) return true;
    if ((mods && mods.ctrl && mods.shift && key === 'a') || key === 'tabsearch') { if (el.hidden) show(); else hide(); return true; }
    return false;
  };
  // a search button next to the tabs, like Chrome's
  const strip = document.getElementById('newtab');
  if (strip) { const b = document.createElement('button'); b.id = 'ts-btn'; b.className = 'icon-btn ts-btn'; b.title = 'Search tabs (Ctrl+Shift+A)'; b.innerHTML = '<svg><use href="#i-search"/></svg>'; b.onclick = show; strip.insertAdjacentElement('afterend', b); }
  const _cmds = commands;
  commands = function () { return [..._cmds(), CMD('tabsearch', 'Search tabs and pages you’ve read', 'Ctrl+Shift+A', show, 'search')]; };
})();

// ====================================================================== share, forget-me sites, dead pages
(() => {
  const hostOfU = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
  const web = (t) => t && !t.private && /^https?:/.test(t.url || '');
  // ---- share: clean link (tracking tags removed) + QR code to open it on your phone
  const sb = $('#share-btn');
  const pop = document.createElement('div'); pop.id = 'share-pop'; pop.className = 'share-pop'; pop.hidden = true; document.body.appendChild(pop);
  const paintBtn = () => { const t = state.active; sb.hidden = !web(t); };
  const _a = hooks.activated; hooks.activated = (t) => { _a(t); paintBtn(); };
  const _l = hooks.loaded; hooks.loaded = (t) => { _l && _l(t); if (t === state.active) paintBtn(); };
  setInterval(paintBtn, 1500);
  async function openShare() {
    const t = state.active; if (!web(t)) return;
    const r = await nb.invoke('share:info', t.url);
    pop.innerHTML = `<div class="sh-head"><b>Share this page</b><button class="sh-x" title="Close">✕</button></div>
      <div class="sh-title">${esc(t.title || '')}</div>
      <div class="sh-link"><input readonly value="${esc(r.clean)}"><button class="btn primary" data-a="copy">Copy link</button></div>
      <div class="sh-note">${r.removed ? `🧹 Removed ${r.removed} tracking tag${r.removed === 1 ? '' : 's'} from the link, so whoever opens it isn’t tracked.` : '🧹 This link is already clean: no tracking tags.'}</div>
      ${r.qr ? `<div class="sh-qr"><img src="${r.qr}" alt="QR code"><span>📱 Point your phone’s camera here to open this page on your phone.</span></div>` : ''}
      <div class="sh-acts"><button class="btn ghost" data-a="md">Copy as link with title</button><button class="btn ghost" data-a="mail">Email it</button><button class="btn ghost" data-a="wa">WhatsApp</button></div>`;
    const r2 = sb.getBoundingClientRect(); pop.style.top = r2.bottom + 8 + 'px'; pop.style.left = Math.max(12, Math.min(window.innerWidth - 352, r2.right - 340)) + 'px';
    pop.hidden = false;
    const copy = (s, msg) => { navigator.clipboard.writeText(s).then(() => toast(msg)).catch(() => toast('Couldn’t copy')); };
    pop.querySelector('.sh-x').onclick = () => (pop.hidden = true);
    pop.querySelector('[data-a=copy]').onclick = () => { copy(r.clean, '🔗 Clean link copied'); pop.hidden = true; };
    pop.querySelector('[data-a=md]').onclick = () => { copy(`${t.title}\n${r.clean}`, '🔗 Title and link copied'); pop.hidden = true; };
    pop.querySelector('[data-a=mail]').onclick = () => { newTab({ url: `mailto:?subject=${encodeURIComponent(t.title || '')}&body=${encodeURIComponent(r.clean)}` }); pop.hidden = true; };
    pop.querySelector('[data-a=wa]').onclick = () => { newTab({ url: `https://wa.me/?text=${encodeURIComponent((t.title ? t.title + ' ' : '') + r.clean)}` }); pop.hidden = true; };
    pop.querySelector('input').onfocus = (e) => e.target.select();
  }
  window.openShare = openShare;
  sb.onclick = (e) => { e.stopPropagation(); if (!pop.hidden) pop.hidden = true; else openShare(); };
  document.addEventListener('mousedown', (e) => { if (!pop.hidden && !pop.contains(e.target) && e.target !== sb && !sb.contains(e.target)) pop.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) pop.hidden = true; });

  // ---- forget-me sites (like Brave's "Forget me when I close this site")
  const fm = $('#sp-forgetme'), fmRow = $('#sp-forgetme-row');
  const syncFm = async () => { const t = state.active; fmRow.hidden = !web(t); if (fmRow.hidden) return; const r = await nb.invoke('forget:get', hostOfU(t.url)); fm.setAttribute('aria-checked', String(r.on)); fm.title = r.site; };
  $('#shield-btn').addEventListener('click', () => setTimeout(syncFm, 0));
  fm.onclick = async () => { const t = state.active; if (!web(t)) return; const on = fm.getAttribute('aria-checked') !== 'true'; const r = await nb.invoke('forget:set', { host: hostOfU(t.url), on }); fm.setAttribute('aria-checked', String(r.on)); toast(r.on ? `🗑️ NoamBrowser will forget ${r.site} when you close it` : `${r.site} will be remembered again`); };
  const _c = hooks.closed;
  hooks.closed = (tab) => {
    _c && _c(tab);
    if (!web(tab) && !(tab.url && /^https?:/.test(tab.url))) return;
    if (tab.private) return;
    const h = hostOfU(tab.url); if (!h) return;
    const site = h.replace(/^www\./, '');
    if (state.tabs.some((t) => !t.private && hostOfU(t.url).endsWith(site.split('.').slice(-2).join('.')))) return;
    nb.invoke('forget:closed', h).then((done) => { if (done) toast(`🗑️ Forgot ${site}: its cookies and data are gone`); }).catch(() => {});
  };

  // ---- dead pages: offer the Wayback Machine's copy, or your own Time machine copy
  const bar = document.createElement('div'); bar.id = 'dead-bar'; bar.className = 'infobar'; bar.hidden = true; $('#content').appendChild(bar);
  nb.on('dead:page', async ({ wcId, url, code }) => {
    const t = state.tabs.find((x) => x.wcId === wcId); if (!t || t !== state.active) return;
    const mine = await nb.invoke('tm:count', url).catch(() => 0);
    bar.innerHTML = `<span class="pb-icon">🕰️</span><div class="pb-text"><b>This page is gone</b> (error ${code}). You can see how it used to look.</div>${mine ? '<button class="btn ghost" data-a="mine">My saved copy</button>' : ''}<button class="btn primary" data-a="wb">Wayback Machine</button><button class="btn ghost" data-a="x">✕</button>`;
    bar.hidden = false; bar.dataset.wc = wcId;
    bar.querySelector('[data-a=wb]').onclick = () => { bar.hidden = true; t.navigate('https://web.archive.org/web/2/' + url); };
    const m = bar.querySelector('[data-a=mine]'); if (m) m.onclick = () => { bar.hidden = true; newTab({ url: 'noam://timemachine/?url=' + encodeURIComponent(url) }); };
    bar.querySelector('[data-a=x]').onclick = () => (bar.hidden = true);
    clearTimeout(bar._t); bar._t = setTimeout(() => (bar.hidden = true), 25000);
  });
  const _a2 = hooks.activated; hooks.activated = (t) => { _a2(t); if (!bar.hidden && (!t || String(t.wcId) !== bar.dataset.wc)) bar.hidden = true; };

  const _cmds = commands;
  commands = function () { return [..._cmds(), CMD('share', 'Share this page (clean link & QR code)', '', openShare, 'globe')]; };
})();

// ====================================================================== organize tabs
// One click sorts your tabs into named groups by topic. Chrome uses AI for this; we do it on your computer.
(() => {
  const TOPICS = [
    ['🎬 Watch & listen', '#E5484D', /(youtube|youtu\.be|netflix|twitch|tiktok|disneyplus|vimeo|spotify|soundcloud|primevideo|kan\.org\.il\/live|music|podcast)/],
    ['💬 Chat & social', '#3E8DEB', /(whatsapp|facebook|instagram|(^|\.)x\.com|twitter|reddit|discord|telegram|linkedin|messenger|snapchat|threads\.net|pinterest)/],
    ['🙏 Torah', '#D9A21B', /(sefaria|chabad|aish\.|torah|hebcal|daf-?yomi|yeshiva|kosher|parsha|parasha|halacha|ou\.org|myzmanim)/],
    ['📚 Learning', '#3FAE5A', /(wikipedia|khanacademy|classroom\.google|coursera|duolingo|quizlet|britannica|\.edu\b|\.ac\.il|edx\.org|udemy|brilliant|wikihow|learn|lesson|homework|tutorial|school)/],
    ['💻 Code', '#7C68FA', /(github|gitlab|stackoverflow|stackexchange|developer\.mozilla|npmjs|codepen|replit|w3schools|devdocs|vercel|netlify|localhost|codesandbox|leetcode|pythonanywhere|anthropic|claude\.ai|chatgpt|openai)/],
    ['💼 Work & docs', '#14A89B', /(docs\.google|drive\.google|sheets|slides|office\.com|sharepoint|onedrive|notion|slack|mail\.|gmail|outlook|calendar|trello|asana|zoom\.us|meet\.google|monday\.com|figma|canva|dropbox)/],
    ['🛒 Shopping', '#EE7A2E', /(amazon|aliexpress|ebay|etsy|walmart|bestbuy|temu|shein|ksp\.co\.il|zap\.co\.il|ivory|bug\.co\.il|shop|store|cart|checkout|price)/],
    ['📰 News', '#7B8094', /(ynet|haaretz|walla|mako|maariv|kan\.org|timesofisrael|jpost|cnn|bbc|nytimes|washingtonpost|reuters|apnews|theguardian|foxnews|news)/],
    ['🎮 Games', '#E055A3', /(roblox|minecraft|crazygames|poki|steam|epicgames|itch\.io|chess\.com|lichess|coolmath|game)/],
    ['🗺️ Places & travel', '#14A89B', /(maps\.google|google\.[a-z.]+\/maps|waze|booking\.com|airbnb|tripadvisor|expedia|skyscanner|moovit|rail\.co\.il)/],
  ];
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  let undo = null;
  function organize() {
    const tabs = state.tabs.filter((t) => t.ws === state.ws && !t.pinned && !t.groupId && /^https?:/.test(t.url || ''));
    if (tabs.length < 3) { toast('Open a few more tabs first: there’s nothing to organize yet'); return; }
    undo = { order: [...state.tabs], groups: new Map(state.tabs.map((t) => [t, t.groupId])), groupList: [...state.groups] };
    const buckets = new Map();
    for (const t of tabs) {
      const key = (t.url + ' ' + (t.title || '')).toLowerCase();
      const topic = TOPICS.find(([, , re]) => re.test(hostOf(t.url)) || re.test(key));
      const k = topic ? topic[0] : 'site:' + hostOf(t.url).split('.').slice(-2).join('.');
      if (!buckets.has(k)) buckets.set(k, { topic, tabs: [] }); buckets.get(k).tabs.push(t);
    }
    let made = 0; const used = new Set(state.groups.map((g) => g.color));
    for (const [k, b] of buckets) {
      if (b.tabs.length < 2) continue;
      const name = b.topic ? b.topic[0] : k.slice(5).split('.')[0].replace(/^./, (c) => c.toUpperCase());
      let color = b.topic ? b.topic[1] : (GROUP_COLORS.find(([, c]) => !used.has(c)) || GROUP_COLORS[made % GROUP_COLORS.length])[1]; used.add(color);
      const g = { id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, color, collapsed: false };
      state.groups.push(g);
      // gather the group's tabs together where its first tab is
      const [first, ...rest] = b.tabs; first.groupId = g.id;
      for (const t of rest) { t.groupId = g.id; moveTabToGroupEnd(t, g); }
      made++;
    }
    if (!made) { undo = null; toast('Your tabs are already about different things: nothing to group'); return; }
    state.tabs.forEach((t) => t.render()); saveGroups(); renderGroups(); layoutTabs(); saveSession();
    toast(`🗂️ Sorted your tabs into ${made} group${made === 1 ? '' : 's'}. Changed your mind? Ctrl+K → “Undo organize tabs”`, 5000);
  }
  function undoOrganize() {
    if (!undo) return toast('Nothing to undo');
    const live = undo.order.filter((t) => state.tabs.includes(t)); const extra = state.tabs.filter((t) => !live.includes(t));
    state.tabs.length = 0; state.tabs.push(...live, ...extra);
    for (const t of state.tabs) { t.groupId = undo.groups.has(t) ? undo.groups.get(t) : t.groupId; t.render(); }
    const strip = state.tabs[0] && state.tabs[0].el.parentNode; if (strip) for (const t of state.tabs) strip.appendChild(t.el);
    state.groups = undo.groupList; undo = null; saveGroups(); renderGroups(); layoutTabs(); saveSession(); toast('↩️ Tabs are back how they were');
  }
  window.organizeTabs = organize;
  const _cmds = commands;
  commands = function () { return [..._cmds(), CMD('organize', 'Organize tabs into groups by topic 🗂️', '', organize, 'globe'), ...(undo ? [CMD('unorganize', 'Undo organize tabs', '', undoOrganize, 'globe')] : [])]; };
  const _tme = hooks.tabMenuExtra; hooks.tabMenuExtra = (t) => [...(_tme ? _tme(t) || [] : []), { id: 'organize', label: '🗂️ Organize all tabs by topic' }];
  const _tma = hooks.tabMenuAction; hooks.tabMenuAction = (t, id) => { if (id === 'organize') { organize(); return true; } return _tma ? _tma(t, id) : false; };
})();
