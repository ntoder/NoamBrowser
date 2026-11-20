// noam://switch — bring everything over from Chrome, Edge, Brave, Firefox… in a few clicks.
(async () => {
  await noamReady;
  const STEPS = ['Pick browser', 'What to bring', 'Passwords', 'Extensions', 'Make it yours', 'Where’s everything'];
  const clean = (e) => String(e && e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  const LOGO = { chrome: '🟡', edge: '🌊', brave: '🦁', vivaldi: '🎨', opera: '⭕', chromium: '🔵', firefox: '🦊', waterfox: '💧', librewolf: '🐺', zen: '🧘' };
  const logo = (d) => { const k = Object.keys(LOGO).find((x) => (d.browser || '').toLowerCase().includes(x)); return LOGO[k] || '🌐'; };
  const st = { step: 0, list: [], pick: null, prev: null, res: null };
  const isFF = () => st.pick && st.pick.kind === 'firefox';
  const view = $('#view');

  function steps() {
    $('#steps').innerHTML = STEPS.map((s, i) => `<span class="${i === st.step ? 'on' : i < st.step ? 'done' : ''}">${i < st.step ? '✓ ' : ''}${esc(s)}</span>`).join('');
  }
  const go = (n) => { st.step = n; steps(); [pickStep, whatStep, pwStep, extStep, yoursStep, mapStep][n](); window.scrollTo(0, 0); };
  const open = (url) => window.open(url, '_blank');

  // ---------------------------------------------------------- 1. which browser
  async function pickStep() {
    view.innerHTML = `<div class="card"><h2>Where are you coming from?</h2><p class="sub">NoamBrowser found these on this computer. Pick the one you used most. It only reads a copy, so nothing changes in your old browser.</p><div class="pick" id="pick">Looking…</div>
      <div class="acts"><button class="btn" id="file">I have a bookmarks file (.html)</button><button class="btn" id="skip">Skip, start fresh</button></div><div class="err" id="err"></div></div>`;
    $('#skip').onclick = () => go(4);
    $('#file').onclick = async () => {
      try { const r = await noam.invoke('import:file', {}); if (r) { st.res = { bookmarks: r.bookmarks, history: 0 }; st.pick = { kind: 'chromium', browser: 'your file' }; go(2); } } catch (e) { $('#err').textContent = clean(e); }
    };
    try { st.list = await noam.invoke('import:detect'); } catch { st.list = []; }
    $('#pick').innerHTML = st.list.length ? st.list.map((d, i) => `<button data-i="${i}"><span class="logo">${logo(d)}</span><span><b>${esc(d.browser)}</b><small>${esc(d.profile || '')}</small></span></button>`).join('')
      : '<p class="sub">No other browsers found. If you have one on another computer, export its bookmarks to a file and use the button below.</p>';
    $$('#pick button').forEach((b) => (b.onclick = () => { st.pick = st.list[+b.dataset.i]; go(1); }));
  }

  // ---------------------------------------------------------- 2. what to bring
  async function whatStep() {
    view.innerHTML = `<div class="card"><h2>${logo(st.pick)} From ${esc(st.pick.browser)}</h2><p class="sub">Looking at what’s there…</p></div>`;
    let p; try { p = st.prev = await noam.invoke('import:preview', st.pick.key); } catch (e) { view.innerHTML = `<div class="card"><h2>Couldn’t read ${esc(st.pick.browser)}</h2><p class="err">${esc(clean(e))}</p><div class="acts"><button class="btn" id="back">Back</button><button class="btn primary" id="again">Try again</button></div></div>`; $('#back').onclick = () => go(0); $('#again').onclick = () => go(1); return; }
    const tabsN = p.tabs.length || p.startupUrls.length;
    const opt = (id, on, title, sub, off) => `<label class="opt ${off ? 'off' : ''}"><input type="checkbox" id="${id}" ${on && !off ? 'checked' : ''} ${off ? 'disabled' : ''}><div><b>${title}</b><span>${sub}</span></div></label>`;
    view.innerHTML = `<div class="card"><h2>${logo(st.pick)} What should come over from ${esc(st.pick.browser)}?</h2><p class="sub">Everything stays on this computer${'' } (and in your NoamAccount if sync is on).</p>
      ${opt('o-b', true, `Bookmarks <small>(${fmtNum(p.bookmarks)})</small>`, `Same folders and the same order on the bookmarks bar${p.folders ? ` · ${p.folders} folders` : ''}.`, !p.bookmarks)}
      ${opt('o-h', true, `History <small>(${fmtNum(p.history)} sites)</small>`, 'Your address bar will suggest the sites you visit, and new tabs show your most-visited sites.', !p.history)}
      ${opt('o-s', !!(p.search && p.search.id), `Search engine${p.search ? `: ${esc(p.search.name)}` : ''}`, p.search && p.search.id ? 'Keep searching the way you’re used to. (You can switch to a private one later in Settings.)' : p.search ? 'NoamBrowser doesn’t have that one. You can pick one in Settings.' : 'Not found.', !(p.search && p.search.id))}
      ${opt('o-hp', true, `Home page${p.homepage ? `: ${esc(p.homepage)}` : ''}`, p.homepage ? 'The page the Home button opens.' : 'You used the new tab page, so nothing to change.', !p.homepage)}
      ${opt('o-t', true, `Open tabs <small>(${tabsN})</small>`, tabsN ? (p.tabs.length ? 'The tabs you had open last time, so you can pick up where you left off.' : 'The pages your browser opened when it started.') : 'No open tabs found.', !tabsN)}
      ${opt('o-r', false, 'Replace my NoamBrowser bookmarks', 'Make NoamBrowser’s bookmarks exactly the same as the other browser’s. Your old ones are saved to a backup file first.', !p.bookmarks)}
      ${p.errors.length ? `<p class="err">${esc(p.errors.join(' '))}</p>` : ''}
      <div class="acts"><button class="btn" id="back">Back</button><button class="btn primary" id="go">Bring it over</button></div></div>`;
    $('#back').onclick = () => go(0);
    const v = (id) => !!($('#' + id) && $('#' + id).checked);
    $('#go').onclick = async () => {
      $('#go').disabled = true; $('#go').textContent = 'Bringing it over…';
      try {
        st.res = await noam.invoke('import:apply', { key: st.pick.key, bookmarks: v('o-b'), history: v('o-h'), replace: v('o-r'), search: v('o-s'), homepage: v('o-hp'), startup: true, tabs: v('o-t') });
        go(2);
      } catch (e) { $('#go').disabled = false; $('#go').textContent = 'Bring it over'; view.querySelector('.card').insertAdjacentHTML('beforeend', `<p class="err">${esc(clean(e))}</p>`); }
    };
  }

  // ---------------------------------------------------------- 3. passwords
  function pwStep() {
    const r = st.res || {}; const done = [];
    if (r.bookmarks) done.push(`${fmtNum(r.bookmarks)} bookmarks`); if (r.history) done.push(`${fmtNum(r.history)} history sites`);
    if (r.search) done.push(`search with ${esc(r.search)}`); if (r.homepage) done.push('your home page'); if (r.tabs) done.push(`${r.tabs} tabs (opened in the background)`);
    const ff = isFF();
    const how = ff
      ? `<ol class="how"><li>In Firefox, type <code>about:logins</code> in the address bar.</li><li>Click the <b>⋯</b> menu (top right) → <b>Export Passwords…</b> → <b>Export</b>. Firefox may ask for your computer password.</li><li>Save the file (it’s called <code>logins.csv</code>).</li><li>Click <b>Open NoamBrowser Passwords</b> below → <b>Import from CSV</b> → pick that file.</li><li>Delete the CSV file afterwards. Anyone who opens it can read your passwords.</li></ol>`
      : `<ol class="how"><li>In ${esc(st.pick && st.pick.browser !== 'your file' ? st.pick.browser : 'Chrome')}, type <code>chrome://password-manager/settings</code> in the address bar. (Edge: <code>edge://wallet/passwords</code>.)</li><li>Click <b>Export passwords</b> → <b>Download file</b>. It may ask for your computer password.</li><li>Click <b>Open NoamBrowser Passwords</b> below → <b>Import from CSV</b> → pick that file.</li><li>Delete the CSV file afterwards. Anyone who opens it can read your passwords.</li></ol>`;
    view.innerHTML = `${done.length ? `<div class="card"><h2>✅ Done!</h2><ul class="res">${done.map((d) => `<li>${d}</li>`).join('')}</ul>${(r.errors || []).length ? `<p class="err">${esc(r.errors.join(' '))}</p>` : ''}</div>` : ''}
      <div class="card"><h2>🔑 Your passwords</h2><p class="sub">Browsers lock passwords so no other program can take them, which is good. So this part takes one minute by hand:</p>${how}
      <div class="warn">🔒 In NoamBrowser your passwords are encrypted on this computer, and with a NoamAccount they sync encrypted. Nobody, not even the developer, can read them.</div>
      <div class="acts"><button class="btn" id="pw">Open NoamBrowser Passwords</button><button class="btn" id="back">Back</button><button class="btn primary" id="next">Next</button></div></div>`;
    $('#pw').onclick = () => open('noam://passwords/');
    $('#back').onclick = () => go(st.prev ? 1 : 0); $('#next').onclick = () => go(3);
  }

  // ---------------------------------------------------------- 4. extensions
  function extStep() {
    const list = (st.prev && st.prev.extensions) || [];
    const row = (x, i) => `<div class="ext"><div class="t"><b>${esc(x.name)}</b><span>${x.note ? esc(x.note) : x.id ? 'Works in NoamBrowser. Add it with one click.' : 'Look for the Chrome version (Firefox add-ons don’t run in NoamBrowser, but most have a Chrome version that does).'}</span></div>
      ${x.note ? '<span class="ok">✓ Built in</span>' : x.id ? `<button class="btn" data-add="${i}">Add</button>` : `<button class="btn" data-find="${i}">Find it</button>`}</div>`;
    view.innerHTML = `<div class="card"><h2>🧩 Your extensions</h2><p class="sub">${list.length ? 'Lots of them aren’t needed: NoamBrowser already does what they did.' : 'No extensions found. You can add any extension from the Chrome Web Store later.'}</p>
      ${list.map(row).join('')}
      <div class="acts"><button class="btn" id="store">Open the Chrome Web Store</button><button class="btn" id="back">Back</button><button class="btn primary" id="next">Next</button></div><p class="err" id="err"></p></div>`;
    $$('[data-add]').forEach((b) => (b.onclick = async () => {
      b.disabled = true; b.textContent = 'Adding…';
      const r = await noam.invoke('ext:install-id', { id: list[+b.dataset.add].id }).catch((e) => ({ error: clean(e) }));
      if (r.added) b.outerHTML = '<span class="ok">✓ Added</span>'; else if (r.cancelled) { b.disabled = false; b.textContent = 'Add'; } else { b.disabled = false; b.textContent = 'Add'; $('#err').textContent = r.error || ''; }
    }));
    $$('[data-find]').forEach((b) => (b.onclick = () => open(list[+b.dataset.find].store)));
    $('#store').onclick = () => open('https://chromewebstore.google.com/');
    $('#back').onclick = () => go(2); $('#next').onclick = () => go(4);
  }

  // ---------------------------------------------------------- 5. make it yours
  async function yoursStep() {
    let s = await noam.invoke('settings:get');
    const sw = (k, on) => `<button class="switch" role="switch" data-k="${k}" aria-checked="${!!on}"></button>`;
    view.innerHTML = `<div class="card"><h2>🎨 Make it yours</h2>
      <div class="row2"><div><b>Make NoamBrowser your default browser</b><span>Links from email, chat and other apps open here.</span></div><button class="btn primary" id="def">Make default</button></div>
      <div class="row2"><div><b>Simple look</b><span>Hide the extra buttons and the side bar so it looks and feels like Chrome or Firefox. You can turn it off any time in Settings.</span></div>${sw('simpleLook', s.simpleLook)}</div>
      <div class="row2"><div><b>Show the bookmarks bar</b><span>Ctrl+Shift+B</span></div>${sw('showBookmarksBar', s.showBookmarksBar)}</div>
      <div class="row2"><div><b>Reopen my tabs when I start NoamBrowser</b><span>Like “Continue where you left off”.</span></div>${sw('restoreTabs', s.restoreTabs)}</div>
      <div class="acts"><button class="btn" id="back">Back</button><button class="btn primary" id="next">Next</button></div></div>`;
    noam.invoke('default-browser:status').then((d) => { if (d && d.isDefault) { $('#def').textContent = '✓ It’s your default'; $('#def').disabled = true; } }).catch(() => {});
    $('#def').onclick = async () => { await noam.invoke('default-browser:set').catch(() => null); $('#def').textContent = 'Finish in the window that opened'; };
    $$('[data-k]').forEach((b) => (b.onclick = async () => { const k = b.dataset.k; s = await noam.invoke('settings:set', { [k]: !s[k] }); b.setAttribute('aria-checked', String(!!s[k])); }));
    $('#back').onclick = () => go(st.pick ? 3 : 0); $('#next').onclick = () => go(5);
  }

  // ---------------------------------------------------------- 6. where's everything
  function mapStep() {
    const mac = /Mac/.test(navigator.platform); const C = mac ? '⌘' : 'Ctrl';
    const k = (s) => s.split(' / ').map((x) => x.split('+').map((p) => `<kbd>${p === 'Ctrl' ? C : p}</kbd>`).join('+')).join(' or ');
    const rows = [
      ['New tab / new private window', 'Same', k('Ctrl+T') + ' · ' + k('Ctrl+Shift+N / Ctrl+Shift+P')],
      ['Reopen a closed tab', 'Same', k('Ctrl+Shift+T')],
      ['Bookmark this page', 'Star in the address bar', k('Ctrl+D')],
      ['Bookmarks manager', 'Menu → Bookmarks', k('Ctrl+Shift+O')],
      ['History', 'Menu → History', k('Ctrl+H / Ctrl+Shift+H')],
      ['Downloads', 'Menu → Downloads', k('Ctrl+J / Ctrl+Shift+Y')],
      ['Clear browsing data', 'Settings → Privacy', k('Ctrl+Shift+Delete')],
      ['Find on page', 'Same', k('Ctrl+F')],
      ['Search your tabs', 'Tab search', k('Ctrl+Shift+A')],
      ['Developer tools', 'Same', k('F12 / Ctrl+Shift+I / Ctrl+Shift+J')],
      ['Passwords', 'Menu → Passwords (noam://passwords)', ''],
      ['Extensions', 'Puzzle button → or Menu → Extensions', ''],
      ['Settings', 'Menu → Settings (noam://settings)', k('Ctrl+,')],
      ['Ad blocker (uBlock etc.)', 'Built in: the shield in the address bar', ''],
      ['Reader view', 'Book button in the address bar', ''],
      ['Firefox Containers', 'Built in: Containers in Settings', ''],
      ['Sync between computers', 'NoamAccount (Menu → Account)', ''],
      ['chrome://… or about:… pages', 'They’re noam://… here, e.g. noam://settings, noam://history', ''],
    ];
    view.innerHTML = `<div class="card"><h2>🗺️ Where’s everything?</h2><p class="sub">The shortcuts you already know from Chrome and Firefox work here too.</p>
      <table class="map"><thead><tr><th>In Chrome / Firefox</th><th>In NoamBrowser</th><th>Shortcut</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table>
      <div class="warn">💡 You can open this page again any time from the menu: <b>Switch from Chrome or Firefox…</b></div>
      <div class="acts"><button class="btn" id="back">Back</button><button class="btn primary" id="done">Start browsing 🚀</button></div></div>`;
    $('#back').onclick = () => go(4);
    $('#done').onclick = () => noam.invoke('tab:navigate', 'noam://newtab/');
  }

  steps(); pickStep();
})();
