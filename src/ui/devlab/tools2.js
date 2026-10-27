// Dev Lab tools: Remix, Colours & Fonts, Devices, Everyone, Cookies & Memory, Speed, Scripts.
'use strict';
(() => {
  const E = esc;
  const siteKey = () => { try { return new URL(DL.tab.url).hostname; } catch { return ''; } };
  const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

  // ================================================================ REMIX (live CSS)
  const RECIPES = [
    ['🌙 Dark mode', 'html { filter: invert(1) hue-rotate(180deg); background: #fff; }\nimg, video, picture, canvas, svg image { filter: invert(1) hue-rotate(180deg); }'],
    ['🔲 Show all boxes', '* { outline: 1px solid rgba(255, 0, 80, .5) !important; }'],
    ['🔠 Giant text', 'body { font-size: 130% !important; }\np, li, span, a { line-height: 1.7 !important; }'],
    ['🤡 Comic Sans', '* { font-family: "Comic Sans MS", "Comic Neue", cursive !important; }'],
    ['📰 Old newspaper', 'html { filter: sepia(.8) contrast(1.05); }\nbody { font-family: Georgia, serif !important; }'],
    ['🌈 Rainbow links', 'a { background: linear-gradient(90deg, #f43, #fa0, #3c5, #29f, #a5f); -webkit-background-clip: text; color: transparent !important; font-weight: bold; }'],
    ['⭕ Round pictures', 'img { border-radius: 50% !important; box-shadow: 0 6px 20px rgba(0,0,0,.3); }'],
    ['✨ Glowing buttons', 'button, [role="button"], input[type="submit"] { box-shadow: 0 0 12px 3px #7c68fa !important; border-radius: 12px !important; }'],
    ['🙃 Mirror', 'html { transform: scaleX(-1); }'],
    ['🚫 No pictures', 'img, picture, video, [style*="background-image"] { visibility: hidden !important; }'],
    ['🎯 Focus mode', 'aside, nav, footer, [class*="sidebar"], [class*="banner"], [id*="sidebar"] { display: none !important; }\nmain, article { max-width: 760px !important; margin: auto !important; }'],
    ['🐢 Slow everything', '* { transition-duration: 3s !important; animation-duration: 10s !important; }'],
  ];
  const RM = { sheetId: null, frameId: null, loadedFor: null, timer: null };
  async function sheet() {
    if (RM.sheetId) return RM.sheetId;
    const tree = await DL.cmd('Page.getFrameTree'); RM.frameId = tree.frameTree.frame.id;
    const r = await DL.cmd('CSS.createStyleSheet', { frameId: RM.frameId }); RM.sheetId = r.styleSheetId; return RM.sheetId;
  }
  async function applyCSS(text) {
    try { await DL.cmd('CSS.setStyleSheetText', { styleSheetId: await sheet(), text }); setRmStatus(text.trim() ? '✅ Applied' : ''); if (text.trim()) DL.mission('remix'); }
    catch (e) { RM.sheetId = null; try { await DL.cmd('CSS.setStyleSheetText', { styleSheetId: await sheet(), text }); setRmStatus('✅ Applied'); } catch (e2) { setRmStatus('⚠️ ' + e2.message, true); } }
  }
  const setRmStatus = (t, bad) => { const s = DL.body.querySelector('#rm-st'); if (s) { s.textContent = t; s.classList.toggle('bad', !!bad); } };
  const hlCSS = (s) => E(s).replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="c">$1</span>').replace(/([^{}\n]+)(\{)/g, '<span class="s">$1</span>$2').replace(/([a-z-]+)(\s*:)(?![^{]*\{)/g, '<span class="p">$1</span>$2').replace(/(#[0-9a-fA-F]{3,8}\b|\d+(?:\.\d+)?(?:px|%|em|rem|s|deg|vh|vw)?)/g, '<span class="n">$1</span>').replace(/(!important)/g, '<span class="i">$1</span>');
  function renderRemix() {
    const el = DL.body; const key = siteKey(); const saved = store.get('dl-remix:' + key, { css: '', auto: false });
    el.innerHTML = `<div class="dl-toolbar"><span class="muted">${DL.kid ? '🎨 Write CSS to restyle <b>' + E(key || 'this page') + '</b>. It changes as you type!' : 'Live style sheet for ' + E(key)}</span><span class="grow"></span>
        <label class="dl-check"><input type="checkbox" id="rm-auto" ${saved.auto ? 'checked' : ''}> Use every time I visit this site</label>
        <button class="dl-btn small" id="rm-off">⏸️ Turn off</button><button class="dl-btn ghost small" id="rm-clear">🧹 Clear</button></div>
      <div class="rm-grid"><div class="rm-ed"><pre class="rm-hl" aria-hidden="true"></pre><textarea id="rm-css" spellcheck="false" placeholder="/* Try this: */\nbody {\n  background: hotpink;\n}\n\nh1 {\n  color: blue;\n  font-size: 60px;\n}"></textarea><div class="rm-st" id="rm-st"></div></div>
      <div class="rm-side"><b>Magic recipes</b>${DL.kid ? '<small>Click to add one — then look at the CSS and change the numbers!</small>' : ''}<div class="rm-recipes">${RECIPES.map(([n], k) => `<button class="dl-chip" data-r="${k}">${E(n)}</button>`).join('')}</div>
      ${DL.kid ? `<div class="dl-explain small">💡 CSS works like this:<pre>what-to-change {\n  property: value;\n}</pre><code>h1</code> = all big headings, <code>p</code> = paragraphs, <code>img</code> = pictures, <code>*</code> = everything.</div>` : ''}</div></div>`;
    const ta = el.querySelector('#rm-css'), hl = el.querySelector('.rm-hl');
    ta.value = saved.css;
    const sync = () => { hl.innerHTML = hlCSS(ta.value) + '\n'; hl.scrollTop = ta.scrollTop; };
    sync();
    ta.onscroll = () => (hl.scrollTop = ta.scrollTop);
    ta.oninput = () => { sync(); store.set('dl-remix:' + key, { ...store.get('dl-remix:' + key, {}), css: ta.value }); clearTimeout(RM.timer); RM.timer = setTimeout(() => applyCSS(ta.value), 250); };
    ta.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('  ', s, ta.selectionEnd, 'end'); ta.oninput(); } };
    el.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { const [n, css] = RECIPES[+b.dataset.r]; ta.value = (ta.value.trim() ? ta.value.trimEnd() + '\n\n' : '') + `/* ${n.replace(/^\S+ /, '')} */\n${css}\n`; ta.oninput(); }));
    el.querySelector('#rm-auto').onchange = (e) => store.set('dl-remix:' + key, { css: ta.value, auto: e.target.checked });
    el.querySelector('#rm-off').onclick = () => applyCSS('');
    el.querySelector('#rm-clear').onclick = () => { ta.value = ''; ta.oninput(); };
    if (RM.loadedFor !== DL.wcId + key && saved.css) { RM.loadedFor = DL.wcId + key; applyCSS(saved.css); }
    setTimeout(() => ta.focus(), 0);
  }
  DL.handlers.remix = {
    render: renderRemix,
    detach() { RM.sheetId = null; RM.loadedFor = null; },
    event(method, p, _l, isCur) { if (isCur && method === 'Page.frameNavigated' && !p.frame.parentId) { RM.sheetId = null; RM.loadedFor = null; } },
  };
  // re-apply "every visit" remixes even when the drawer is closed
  const _rmLoaded = hooks.loaded;
  hooks.loaded = async (t) => {
    await _rmLoaded(t);
    let key; try { key = new URL(t.url).hostname; } catch { return; }
    const saved = store.get('dl-remix:' + key, null);
    if (saved && saved.auto && saved.css && t.wv) t.wv.insertCSS(saved.css).catch(() => {});
  };

  // ================================================================ COLOURS & FONTS
  const NAMED = { black: '000000', white: 'ffffff', red: 'ff0000', lime: '00ff00', blue: '0000ff', yellow: 'ffff00', cyan: '00ffff', magenta: 'ff00ff', silver: 'c0c0c0', gray: '808080', maroon: '800000', olive: '808000', green: '008000', purple: '800080', teal: '008080', navy: '000080', orange: 'ffa500', pink: 'ffc0cb', hotpink: 'ff69b4', gold: 'ffd700', tomato: 'ff6347', coral: 'ff7f50', salmon: 'fa8072', crimson: 'dc143c', brown: 'a52a2a', chocolate: 'd2691e', tan: 'd2b48c', beige: 'f5f5dc', ivory: 'fffff0', khaki: 'f0e68c', lavender: 'e6e6fa', violet: 'ee82ee', orchid: 'da70d6', plum: 'dda0dd', indigo: '4b0082', slateblue: '6a5acd', royalblue: '4169e1', dodgerblue: '1e90ff', skyblue: '87ceeb', steelblue: '4682b4', turquoise: '40e0d0', aquamarine: '7fffd4', seagreen: '2e8b57', forestgreen: '228b22', limegreen: '32cd32', chartreuse: '7fff00', olivedrab: '6b8e23', darkgreen: '006400', mintcream: 'f5fffa', honeydew: 'f0fff0', sienna: 'a0522d', peru: 'cd853f', goldenrod: 'daa520', firebrick: 'b22222', darkred: '8b0000', deeppink: 'ff1493', mediumpurple: '9370db', darkviolet: '9400d3', slategray: '708090', lightgray: 'd3d3d3', darkgray: 'a9a9a9', dimgray: '696969', whitesmoke: 'f5f5f5', aliceblue: 'f0f8ff', midnightblue: '191970', darkslategray: '2f4f4f', rebeccapurple: '663399' };
  const hex2 = (n) => n.toString(16).padStart(2, '0');
  const toHex = (r, g, b) => '#' + hex2(r) + hex2(g) + hex2(b);
  const toHsl = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`; };
  const nearest = (r, g, b) => { let best = null, bd = 1e9; for (const [n, h] of Object.entries(NAMED)) { const R = parseInt(h.slice(0, 2), 16), G = parseInt(h.slice(2, 4), 16), B = parseInt(h.slice(4), 16); const d = (R - r) ** 2 * 0.3 + (G - g) ** 2 * 0.59 + (B - b) ** 2 * 0.11; if (d < bd) { bd = d; best = n; } } return best; };
  const lum = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const contrast = (a, b) => { const L1 = lum(...a), L2 = lum(...b); return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); };
  const parseHex = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((x) => x + x).join(''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
  const CF = { picked: store.get('dl-colors', []), palette: null, fonts: null, fg: '#1d1836', bg: '#ffffff' };
  async function eyedropper() {
    const t = DL.tab; if (!t) return;
    let shot; try { shot = await nb.invoke('devlab:capture', t.wcId); } catch (e) { toast(e.message); return; }
    const img = new Image(); await new Promise((r) => { img.onload = r; img.src = shot.dataUrl; });
    const wr = t.wv.getBoundingClientRect();
    const ov = document.createElement('div'); ov.className = 'dl-eye';
    Object.assign(ov.style, { left: wr.left + 'px', top: wr.top + 'px', width: wr.width + 'px', height: wr.height + 'px' });
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; cv.style.width = '100%'; cv.style.height = '100%';
    const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const loupe = document.createElement('canvas'); loupe.className = 'dl-loupe'; loupe.width = loupe.height = 132;
    const lab = document.createElement('div'); lab.className = 'dl-eye-lab';
    const tip = document.createElement('div'); tip.className = 'dl-eye-tip'; tip.textContent = '🎯 Click to pick a colour · Esc to cancel';
    ov.append(cv, loupe, lab, tip); document.body.appendChild(ov);
    const sx = img.width / wr.width, sy = img.height / wr.height;
    const at = (e) => { const r = cv.getBoundingClientRect(); const x = Math.floor((e.clientX - r.left) * sx), y = Math.floor((e.clientY - r.top) * sy); const d = g.getImageData(x, y, 1, 1).data; return { x, y, rgb: [d[0], d[1], d[2]], cx: e.clientX - r.left, cy: e.clientY - r.top }; };
    const lg = loupe.getContext('2d'); lg.imageSmoothingEnabled = false;
    ov.onmousemove = (e) => {
      const p = at(e);
      lg.clearRect(0, 0, 132, 132); lg.drawImage(cv, p.x - 5, p.y - 5, 11, 11, 0, 0, 132, 132);
      lg.strokeStyle = '#fff'; lg.lineWidth = 2; lg.strokeRect(60, 60, 12, 12); lg.strokeStyle = '#000'; lg.lineWidth = 1; lg.strokeRect(59, 59, 14, 14);
      const L = Math.min(p.cx + 20, wr.width - 150), T = Math.min(p.cy + 20, wr.height - 175);
      Object.assign(loupe.style, { left: L + 'px', top: T + 'px' }); Object.assign(lab.style, { left: L + 'px', top: T + 138 + 'px' });
      lab.innerHTML = `<i style="background:${toHex(...p.rgb)}"></i>${toHex(...p.rgb)}`;
    };
    const done = (val) => { ov.remove(); removeEventListener('keydown', key, true); if (val) { CF.picked = [val, ...CF.picked.filter((c) => c !== val)].slice(0, 16); store.set('dl-colors', CF.picked); CF.fg = val; DL.mission('eyedrop'); DL.copy(val); } DL.render(); };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); } };
    addEventListener('keydown', key, true);
    ov.onclick = (e) => done(toHex(...at(e).rgb));
  }
  const PALETTE_FN = `(() => {
    const count = new Map(); const fonts = new Map(); const add = (c, w) => { if (!c || c === 'transparent' || /rgba\\(\\d+, \\d+, \\d+, 0\\)/.test(c)) return; count.set(c, (count.get(c) || 0) + w); };
    const els = [...document.querySelectorAll('body *')].slice(0, 2500);
    for (const el of els) { const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue; const cs = getComputedStyle(el); const area = Math.min(1e5, r.width * r.height);
      add(cs.backgroundColor, area / 100); if (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) { add(cs.color, 20); const f = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(); const k = f + '|' + cs.fontWeight; const e = fonts.get(f) || { name: f, all: cs.fontFamily, uses: 0, sizes: new Set(), weights: new Set() }; e.uses++; e.sizes.add(Math.round(parseFloat(cs.fontSize))); e.weights.add(cs.fontWeight); fonts.set(f, e); }
      if (parseFloat(cs.borderTopWidth) > 0) add(cs.borderTopColor, 2); }
    add(getComputedStyle(document.body).backgroundColor, 5000);
    const loaded = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, ''));
    return { colors: [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([c, n]) => c),
      fonts: [...fonts.values()].sort((a, b) => b.uses - a.uses).slice(0, 10).map((f) => ({ name: f.name, all: f.all, uses: f.uses, sizes: [...f.sizes].sort((a, b) => a - b).slice(0, 8), weights: [...f.weights].slice(0, 5), web: loaded.includes(f.name) })) };
  })()`;
  const rgbStrToArr = (c) => { const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(c); return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0]; };
  function colorCard(hex) {
    const [r, g, b] = parseHex(hex);
    return `<div class="cf-card"><div class="cf-big" style="background:${hex}"></div><div class="cf-vals">
      <button class="cf-v" data-c="${hex}">${hex}</button><button class="cf-v" data-c="rgb(${r}, ${g}, ${b})">rgb(${r}, ${g}, ${b})</button><button class="cf-v" data-c="${toHsl(r, g, b)}">${toHsl(r, g, b)}</button>
      <span class="muted">${DL.kid ? `Looks like <b>${nearest(r, g, b)}</b>` : 'Nearest name: ' + nearest(r, g, b)}</span></div></div>`;
  }
  async function renderColors() {
    const el = DL.body;
    const ratio = contrast(parseHex(CF.fg), parseHex(CF.bg));
    const grade = ratio >= 7 ? ['🌟 Super easy to read', 'AAA'] : ratio >= 4.5 ? ['✅ Easy to read', 'AA'] : ratio >= 3 ? ['😐 OK for big text only', 'AA large'] : ['❌ Hard to read', 'Fail'];
    el.innerHTML = `<div class="cf-grid">
      <div class="cf-col"><h4>🎯 Eyedropper</h4>${DL.kid ? '<p class="dl-explain small">💡 Pick any colour you can see on the page — the code for it is copied so you can use it in your own website.</p>' : ''}
        <button class="dl-btn primary" id="cf-eye">🎯 Pick a colour from the page</button>
        ${CF.picked[0] ? colorCard(CF.picked[0]) : ''}
        ${CF.picked.length > 1 ? `<div class="cf-hist">${CF.picked.slice(1).map((c) => `<button class="cf-sw" style="background:${c}" data-pick="${c}" title="${c}"></button>`).join('')}</div>` : ''}
      </div>
      <div class="cf-col"><h4>🌈 This page’s colours</h4><div id="cf-pal" class="cf-pal">${CF.palette ? CF.palette.map((c) => { const h = toHex(...rgbStrToArr(c)); return `<button class="cf-sw big" style="background:${E(c)}" data-pick="${h}" title="${h}"><span>${h}</span></button>`; }).join('') : '<span class="muted">Looking…</span>'}</div>
        <h4 style="margin-top:14px">👀 Can you read it? (contrast)</h4>
        <div class="cf-contrast"><label>Text <input type="color" id="cf-fg" value="${CF.fg}"></label><label>Background <input type="color" id="cf-bg" value="${CF.bg}"></label>
          <div class="cf-sample" style="color:${CF.fg};background:${CF.bg}">Aa Hello!</div><div><b>${ratio.toFixed(2)} : 1</b><br>${grade[0]} <small>(${grade[1]})</small></div></div>
        ${DL.kid ? '<p class="dl-explain small">💡 Text needs to stand out from its background. 4.5 : 1 or more is easy to read for almost everyone.</p>' : ''}
      </div>
      <div class="cf-col"><h4>🔤 Fonts on this page</h4><div id="cf-fonts">${CF.fonts ? CF.fonts.map((f) => `<div class="cf-font"><div class="cf-fs" style="font-family:${E(f.all)}">The quick brown fox 🦊</div><b>${E(f.name)}</b>${f.web ? ' <span class="dl-chip tiny">downloaded</span>' : ''}<small>${f.uses} places · sizes ${f.sizes.join(', ')} px · weight ${f.weights.join(', ')}</small></div>`).join('') || '<span class="muted">No text found.</span>' : '<span class="muted">Looking…</span>'}</div>
        ${DL.kid ? '<p class="dl-explain small">💡 “Downloaded” fonts come from the website. The others were already on your computer.</p>' : ''}</div>
    </div>`;
    el.querySelector('#cf-eye').onclick = eyedropper;
    el.querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => DL.copy(b.dataset.c)));
    el.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => { CF.picked = [b.dataset.pick, ...CF.picked.filter((c) => c !== b.dataset.pick)].slice(0, 16); store.set('dl-colors', CF.picked); CF.fg = b.dataset.pick; renderColors(); }));
    el.querySelector('#cf-fg').oninput = (e) => { CF.fg = e.target.value; clearTimeout(CF.t); CF.t = setTimeout(renderColors, 60); };
    el.querySelector('#cf-bg').oninput = (e) => { CF.bg = e.target.value; clearTimeout(CF.t); CF.t = setTimeout(renderColors, 60); };
    if (!CF.palette || CF.for !== DL.wcId + (DL.tab && DL.tab.url)) {
      CF.for = DL.wcId + (DL.tab && DL.tab.url);
      try { const r = await DL.eval(PALETTE_FN); CF.palette = r.colors; CF.fonts = r.fonts; if (r.colors[0]) CF.bg = toHex(...rgbStrToArr(r.colors[0])); } catch (e) { CF.palette = []; CF.fonts = []; }
      if (DL.tool === 'colors') renderColors();
    }
  }
  DL.handlers.colors = { render: renderColors, event(m, p, _l, isCur) { if (isCur && m === 'Page.frameNavigated' && !p.frame.parentId) CF.palette = null; } };

  // ================================================================ DEVICES
  const DEVICES = [
    ['📱', 'iPhone 15', 393, 852, 3, true, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'],
    ['📱', 'Small phone', 375, 667, 2, true, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'],
    ['🤖', 'Android phone', 412, 915, 2.6, true, 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Mobile Safari/537.36'],
    ['📟', 'iPad', 820, 1180, 2, true, 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'],
    ['💻', 'Laptop', 1366, 768, 1, false, ''],
    ['🖥️', 'Big screen', 1920, 1080, 1, false, ''],
    ['📺', 'TV', 3840, 2160, 1, false, ''],
  ];
  const VISION = [['none', '👀 Normal'], ['protanopia', '🔴 Can’t see red'], ['deuteranopia', '🟢 Can’t see green'], ['tritanopia', '🔵 Can’t see blue'], ['achromatopsia', '⚫ No colours at all'], ['blurredVision', '😵‍💫 Blurry eyes'], ['reducedContrast', '🌫️ Low contrast']];
  const D = { dev: null, rotate: false, vision: 'none', scheme: '', motion: false, print: false, touch: false };
  async function applyDevice() {
    const t = DL.tab; if (!t) return;
    if (!D.dev) { await DL.cmd('Emulation.clearDeviceMetricsOverride').catch(() => {}); await DL.cmd('Emulation.setUserAgentOverride', { userAgent: '' }).catch(() => {}); await DL.cmd('Emulation.setTouchEmulationEnabled', { enabled: false }).catch(() => {}); t.wv.classList.remove('dl-device'); return; }
    let [, , w, h, dpr, mobile, ua] = D.dev; if (D.rotate) [w, h] = [h, w];
    const r = t.wv.getBoundingClientRect();
    // fit the width; the height becomes whatever fits, so the page scrolls like on the real device
    const scale = Math.min(1, (r.width - 24) / w);
    const vh = Math.max(200, Math.min(h, Math.floor((r.height - 8) / scale)));
    await DL.cmd('Emulation.setDeviceMetricsOverride', { width: w, height: vh, deviceScaleFactor: dpr, mobile, scale: +scale.toFixed(3), screenWidth: w, screenHeight: h, screenOrientation: { type: w > h ? 'landscapePrimary' : 'portraitPrimary', angle: w > h ? 90 : 0 } });
    if (ua) await DL.cmd('Emulation.setUserAgentOverride', { userAgent: ua, platform: /Android/.test(ua) ? 'Android' : 'iPhone' }).catch(() => {});
    await DL.cmd('Emulation.setTouchEmulationEnabled', { enabled: mobile || D.touch, maxTouchPoints: 5 }).catch(() => {});
    t.wv.classList.add('dl-device');
    DL.mission('device');
  }
  const applyMedia = () => DL.cmd('Emulation.setEmulatedMedia', { media: D.print ? 'print' : '', features: [{ name: 'prefers-color-scheme', value: D.scheme }, { name: 'prefers-reduced-motion', value: D.motion ? 'reduce' : '' }] }).catch((e) => toast(e.message));
  function renderDevices() {
    const el = DL.body;
    el.innerHTML = `<div class="dv-grid"><div><h4>📐 Pretend to be…</h4>${DL.kid ? '<p class="dl-explain small">💡 Websites change their layout to fit the screen. This is called <b>responsive design</b>. See how this page looks on other devices!</p>' : ''}
        <div class="dv-devs">${DEVICES.map((d, k) => `<button class="dv-dev${D.dev === d ? ' on' : ''}" data-d="${k}"><span>${d[0]}</span><b>${E(d[1])}</b><small>${d[2]} × ${d[3]}</small></button>`).join('')}<button class="dv-dev${!D.dev ? ' on' : ''}" data-d="-1"><span>↩️</span><b>Normal</b><small>this window</small></button></div>
        <div class="dl-row"><button class="dl-btn small" id="dv-rot" ${D.dev ? '' : 'disabled'}>🔄 Turn sideways</button>
          <label class="dl-check">Custom <input class="dl-input tiny" id="dv-w" placeholder="width" inputmode="numeric"> × <input class="dl-input tiny" id="dv-h" placeholder="height" inputmode="numeric"></label><button class="dl-btn small" id="dv-go">Go</button></div></div>
      <div><h4>👓 See it like…</h4>${DL.kid ? '<p class="dl-explain small">💡 About 1 in 12 boys can’t tell some colours apart. Good websites still make sense for them!</p>' : ''}
        <div class="dv-vis">${VISION.map(([k, n]) => `<button class="dl-chip${D.vision === k ? ' on' : ''}" data-v="${k}">${n}</button>`).join('')}</div>
        <h4 style="margin-top:14px">🎛️ Pretend the computer wants…</h4>
        <div class="dv-vis"><button class="dl-chip${D.scheme === 'dark' ? ' on' : ''}" data-s="dark">🌙 Dark mode</button><button class="dl-chip${D.scheme === 'light' ? ' on' : ''}" data-s="light">☀️ Light mode</button>
          <button class="dl-chip${D.motion ? ' on' : ''}" id="dv-mo">🧘 Less movement</button><button class="dl-chip${D.print ? ' on' : ''}" id="dv-pr">🖨️ Printing</button><button class="dl-chip${D.touch ? ' on' : ''}" id="dv-touch">👆 Touch screen</button></div></div></div>`;
    el.querySelectorAll('[data-d]').forEach((b) => (b.onclick = async () => { D.dev = +b.dataset.d < 0 ? null : DEVICES[+b.dataset.d]; D.rotate = false; await applyDevice().catch((e) => toast(e.message)); renderDevices(); }));
    el.querySelector('#dv-rot').onclick = async () => { D.rotate = !D.rotate; await applyDevice(); renderDevices(); };
    el.querySelectorAll('.dl-input').forEach((i) => (i.onkeydown = (e) => e.stopPropagation()));
    el.querySelector('#dv-go').onclick = async () => { const w = +el.querySelector('#dv-w').value, h = +el.querySelector('#dv-h').value; if (w >= 100 && h >= 100) { D.dev = ['📐', 'Custom', Math.min(w, 8000), Math.min(h, 8000), 1, w < 800, '']; D.rotate = false; await applyDevice(); renderDevices(); } else toast('Type a width and height of at least 100'); };
    el.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => { D.vision = b.dataset.v; DL.cmd('Emulation.setEmulatedVisionDeficiency', { type: D.vision }).then(renderDevices).catch((e) => toast(e.message)); }));
    el.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { D.scheme = D.scheme === b.dataset.s ? '' : b.dataset.s; applyMedia(); renderDevices(); }));
    el.querySelector('#dv-mo').onclick = () => { D.motion = !D.motion; applyMedia(); renderDevices(); };
    el.querySelector('#dv-pr').onclick = () => { D.print = !D.print; applyMedia(); renderDevices(); };
    el.querySelector('#dv-touch').onclick = () => { D.touch = !D.touch; DL.cmd('Emulation.setTouchEmulationEnabled', { enabled: D.touch, maxTouchPoints: 5 }).catch(() => {}); renderDevices(); };
  }
  DL.handlers.devices = {
    render: renderDevices,
    detach() { if (DL.tab && DL.tab.wv) DL.tab.wv.classList.remove('dl-device'); Object.assign(D, { dev: null, rotate: false, vision: 'none', scheme: '', motion: false, print: false, touch: false }); },
  };

  // ================================================================ EVERYONE (accessibility)
  const A11Y_FN = `(() => {
    const issues = []; window.__noamA11y = [];
    const add = (el, kind, sev, msg) => { if (issues.length > 300) return; window.__noamA11y.push(el); issues.push({ i: window.__noamA11y.length - 1, kind, sev, msg, what: el ? (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')) : 'page', text: el ? (el.innerText || el.getAttribute('aria-label') || el.getAttribute('src') || '').trim().slice(0, 60) : '' }); };
    const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && el.getAttribute('aria-hidden') !== 'true'; };
    const name = (el) => (el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.innerText) || el.innerText || el.getAttribute('title') || el.value || [...el.querySelectorAll('img[alt]')].map((i) => i.alt).join(' ') || el.querySelector('svg title')?.textContent || '').trim();
    if (!document.documentElement.lang) add(null, 'lang', 2, 'The page doesn’t say what language it’s in');
    if (!document.title.trim()) add(null, 'title', 2, 'The page has no title');
    for (const img of document.images) if (visible(img) && img.width > 24 && img.height > 24 && !img.hasAttribute('alt') && img.getAttribute('role') !== 'presentation') add(img, 'alt', 3, 'Picture with no description (alt text)');
    for (const a of document.querySelectorAll('a[href]')) if (visible(a) && !name(a)) add(a, 'link', 3, 'Link with no words — a screen reader can’t say where it goes');
    for (const b of document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]')) if (visible(b) && !name(b)) add(b, 'button', 3, 'Button with no name');
    for (const inp of document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea')) {
      if (!visible(inp)) continue; const has = inp.getAttribute('aria-label') || inp.getAttribute('aria-labelledby') || (inp.id && document.querySelector('label[for="' + CSS.escape(inp.id) + '"]')) || inp.closest('label') || inp.getAttribute('title');
      if (!has) add(inp, 'label', inp.placeholder ? 1 : 2, inp.placeholder ? 'Box only has a hint (placeholder), not a real label' : 'Box with no label — what should you type here?');
    }
    const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible);
    if (!hs.some((h) => h.tagName === 'H1')) add(null, 'h1', 1, 'No main heading (h1)');
    let last = 0; for (const h of hs) { const lv = +h.tagName[1]; if (last && lv > last + 1) add(h, 'heading', 1, 'Heading skips a level (h' + last + ' → h' + lv + ')'); last = lv; }
    const L = (c) => { const m = /(\\d+(?:\\.\\d+)?),\\s*(\\d+(?:\\.\\d+)?),\\s*(\\d+(?:\\.\\d+)?)(?:,\\s*([\\d.]+))?/.exec(c); if (!m) return null; return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]]; };
    const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const bgOf = (el) => { for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage !== 'none') return null; const c = L(cs.backgroundColor); if (c && c[3] > 0.9) return c; } return [255, 255, 255, 1]; };
    let checked = 0;
    for (const el of document.querySelectorAll('body *')) {
      if (checked > 600) break; if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)) continue;
      if (!visible(el)) continue; checked++;
      const cs = getComputedStyle(el); const fg = L(cs.color); const bg = bgOf(el); if (!fg || !bg || fg[3] < 0.5) continue;
      const a = lum(fg), b = lum(bg); const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const big = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.6 && +cs.fontWeight >= 700);
      if (ratio < (big ? 3 : 4.5)) add(el, 'contrast', ratio < 2.5 ? 3 : 2, 'Hard-to-read text (contrast ' + ratio.toFixed(1) + ' : 1, needs ' + (big ? 3 : 4.5) + ')');
    }
    for (const el of document.querySelectorAll('a[href], button')) { if (!visible(el)) continue; const r = el.getBoundingClientRect(); if (r.width < 20 && r.height < 20) add(el, 'small', 1, 'Tiny button or link (' + Math.round(r.width) + '×' + Math.round(r.height) + ' px) — hard to tap'); }
    for (const v of document.querySelectorAll('video[autoplay]:not([muted])')) add(v, 'autoplay', 2, 'Video that plays sound by itself');
    return { issues, checked, imgs: document.images.length, links: document.querySelectorAll('a[href]').length };
  })()`;
  const A11Y_KID = {
    alt: 'People who can’t see use a <b>screen reader</b> that reads the page out loud. Without alt text it just says “image”. Fix: <code>&lt;img alt="a cat sleeping"&gt;</code>',
    link: 'A screen reader can’t tell where this link goes. Give it words or an <code>aria-label</code>.',
    button: 'A screen reader would just say “button”. Add text or <code>aria-label="Search"</code>.',
    label: 'Every box you type in needs a <code>&lt;label&gt;</code> so everyone knows what to write.',
    contrast: 'The text colour is too close to the background colour. Some people (and everyone in bright sunlight) can’t read it.',
    lang: 'Add <code>&lt;html lang="en"&gt;</code> so screen readers use the right accent.', title: 'The title shows on the tab and is the first thing a screen reader says.',
    h1: 'Headings are like chapters. An <code>h1</code> tells everyone what the page is about.', heading: 'Headings should go in order (h1, h2, h3…) like chapters and sub-chapters.',
    small: 'Small things are hard to click — especially on a phone or for shaky hands. Aim for 24 px or more.', autoplay: 'Sound that starts by itself is confusing, especially with a screen reader.',
  };
  const AX = { res: null };
  function renderAccess() {
    const el = DL.body; const r = AX.res;
    if (!r) { el.innerHTML = `<div class="dl-empty big">♿ Can <b>everyone</b> use this page — even people who can’t see well, can’t use a mouse, or are colour-blind?<br><button class="dl-btn primary" id="ax-run">🩺 Do a checkup</button></div>`; el.querySelector('#ax-run').onclick = runAccess; return; }
    const pts = r.issues.reduce((a, i) => a + i.sev, 0);
    const score = Math.max(0, Math.round(100 - Math.min(100, pts * 2.5)));
    const stars = score >= 90 ? 5 : score >= 75 ? 4 : score >= 55 ? 3 : score >= 35 ? 2 : 1;
    const groups = {}; for (const i of r.issues) (groups[i.kind] = groups[i.kind] || []).push(i);
    el.innerHTML = `<div class="ax-top"><div class="ax-score"><b>${score}</b><span>${'⭐'.repeat(stars)}${'☆'.repeat(5 - stars)}</span></div>
      <div>${score >= 90 ? '🎉 Great! This page works well for almost everyone.' : score >= 60 ? '👍 Not bad, but some people will have trouble.' : '😟 Lots of people would find this page hard to use.'}<br><small class="muted">Checked ${r.checked} bits of text, ${r.imgs} pictures and ${r.links} links. Found ${r.issues.length} things to fix.</small></div>
      <span class="grow"></span><button class="dl-btn small" id="ax-run">🔄 Check again</button><button class="dl-btn small" data-goto="devices">👓 Try colour-blind eyes</button></div>
      <div class="ax-list">${Object.entries(groups).sort((a, b) => b[1][0].sev - a[1][0].sev).map(([k, list]) => `<details ${list[0].sev >= 3 ? 'open' : ''}><summary><span class="sev s${list[0].sev}">${list[0].sev >= 3 ? 'Important' : list[0].sev === 2 ? 'Should fix' : 'Nice to fix'}</span> ${E(list[0].msg.replace(/ \\(.*\\)$/, '').replace(/\(contrast.*\)/, ''))} <b>× ${list.length}</b></summary>
        ${DL.kid && A11Y_KID[k] ? `<p class="dl-explain small">💡 ${A11Y_KID[k]}</p>` : ''}
        ${list.slice(0, 40).map((i) => `<div class="ax-item">${i.i >= 0 && i.what !== 'page' ? `<button class="dl-link" data-i="${i.i}">🎯 Show me</button>` : ''}<code>${E(i.what)}</code> <span class="muted">${E(i.text)}</span> <small>${E(i.msg.match(/\(.*\)$/) ? i.msg.match(/\(.*\)$/)[0] : '')}</small></div>`).join('')}</details>`).join('') || '<div class="dl-empty">No problems found! 🏆</div>'}</div>`;
    el.querySelector('#ax-run').onclick = runAccess;
    el.querySelectorAll('[data-goto]').forEach((b) => (b.onclick = () => DL.show(b.dataset.goto)));
    el.querySelectorAll('[data-i]').forEach((b) => (b.onclick = async () => {
      const o = await DL.eval(`(() => { const e = window.__noamA11y && window.__noamA11y[${+b.dataset.i}]; if (e) e.scrollIntoView({ behavior: 'smooth', block: 'center' }); return e; })()`, { byValue: false }).catch(() => null);
      if (o && o.objectId) setTimeout(() => DL.cmd('Overlay.highlightNode', { objectId: o.objectId, highlightConfig: { showInfo: true, contentColor: { r: 255, g: 80, b: 80, a: 0.35 }, borderColor: { r: 255, g: 0, b: 0, a: 0.9 } } }).catch(() => {}), 350);
    }));
  }
  async function runAccess() {
    DL.body.innerHTML = '<div class="dl-empty big">🩺 Checking…</div>';
    try { AX.res = await DL.eval(A11Y_FN); DL.mission('access'); } catch (e) { AX.res = { issues: [], checked: 0, imgs: 0, links: 0 }; toast(e.message); }
    renderAccess();
  }
  DL.handlers.access = { render: renderAccess, leave() { DL.cmd('Overlay.hideHighlight').catch(() => {}); }, event(m, p, _l, isCur) { if (isCur && m === 'Page.frameNavigated' && !p.frame.parentId) AX.res = null; } };

  // ================================================================ COOKIES & MEMORY (storage)
  const ST_FN = `(async () => { const ls = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls.push([k, String(localStorage.getItem(k)).slice(0, 500), (localStorage.getItem(k) || '').length]); } } catch {}
    const ss = []; try { for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); ss.push([k, String(sessionStorage.getItem(k)).slice(0, 500), (sessionStorage.getItem(k) || '').length]); } } catch {}
    let idb = []; try { idb = (await indexedDB.databases()).map((d) => d.name); } catch {}
    let caches_ = []; try { caches_ = await caches.keys(); } catch {}
    let est = null; try { est = await navigator.storage.estimate(); } catch {}
    return { ls, ss, idb, caches: caches_, usage: est && est.usage || 0, origin: location.origin }; })()`;
  const when = (c) => { if (c.session || !c.expirationDate) return 'until you close the browser'; const d = c.expirationDate * 1000 - Date.now(); if (d < 0) return 'expired'; const days = d / 864e5; return days < 1 ? 'for ' + Math.round(d / 36e5) + ' hours' : days < 60 ? 'for ' + Math.round(days) + ' days' : days < 730 ? 'for ' + Math.round(days / 30) + ' months' : 'for ' + Math.round(days / 365) + ' years'; };
  const SG = { data: null, cookies: null };
  async function loadStorage() {
    try { [SG.cookies, SG.data] = await Promise.all([nb.invoke('devlab:cookies', { wcId: DL.wcId }), DL.eval(ST_FN)]); } catch (e) { SG.cookies = SG.cookies || []; SG.data = SG.data || { ls: [], ss: [], idb: [], caches: [], usage: 0, origin: '' }; }
    if (SG.cookies.length) DL.mission('cookies');
    if (DL.tool === 'storage') renderStorage();
  }
  function renderStorage() {
    const el = DL.body; const d = SG.data, c = SG.cookies;
    if (!d) { el.innerHTML = '<div class="dl-empty">Looking…</div>'; loadStorage(); return; }
    const kv = (rows, kind) => rows.length ? `<table class="sg-t"><tr><th>Name</th><th>What’s saved</th><th>Size</th><th></th></tr>${rows.map(([k, v, n]) => `<tr><td><b>${E(k)}</b></td><td class="v">${E(v)}</td><td>${DL.fmtBytes(n)}</td><td><button class="dl-link" data-del="${kind}" data-k="${E(k)}">Delete</button></td></tr>`).join('')}</table>` : '<p class="muted">Nothing saved here.</p>';
    el.innerHTML = `<div class="dl-toolbar"><b>${E(d.origin)}</b>${d.usage ? `<span class="muted">uses ${DL.fmtBytes(d.usage)} on your computer</span>` : ''}<span class="grow"></span><button class="dl-btn small" id="sg-re">🔄 Refresh</button><button class="dl-btn small danger" id="sg-all">🧹 Forget everything this site saved</button></div>
      ${DL.kid ? '<p class="dl-explain">💡 Websites can save little notes on your computer to remember you — like that you’re signed in, or what’s in your shopping cart. <b>Cookies</b> are sent back to the website every time you visit. <b>Local storage</b> stays on your computer for the page’s code to read.</p>' : ''}
      <div class="sg-grid"><section><h4>🍪 Cookies <span class="dl-chip tiny">${c.length}</span></h4>${c.length ? `<table class="sg-t"><tr><th>Name</th><th>Value</th><th>Kept</th><th></th></tr>${c.map((x, k) => `<tr><td><b>${E(x.name)}</b><br><small class="muted">${E(x.domain)}</small></td><td class="v">${E(x.value)}</td><td><small>${E(when(x))}${x.secure ? '<br>🔒 secure only' : ''}${x.httpOnly ? '<br>🙈 hidden from scripts' : ''}</small></td><td><button class="dl-link" data-ck="${k}">Delete</button></td></tr>`).join('')}</table>` : '<p class="muted">No cookies. 🎉</p>'}</section>
        <section><h4>🗄️ Local storage <span class="dl-chip tiny">${d.ls.length}</span></h4>${kv(d.ls, 'local')}
          <h4>⏳ Session storage <span class="dl-chip tiny">${d.ss.length}</span></h4>${DL.kid ? '<small class="muted">Forgotten when you close this tab.</small>' : ''}${kv(d.ss, 'session')}
          <h4>🗃️ Databases &amp; caches</h4><p>${d.idb.length ? 'IndexedDB: ' + d.idb.map((n) => `<code>${E(n)}</code>`).join(' ') : '<span class="muted">No databases.</span>'}<br>${d.caches.length ? 'Caches: ' + d.caches.map((n) => `<code>${E(n)}</code>`).join(' ') : ''}</p></section></div>`;
    el.querySelector('#sg-re').onclick = () => { SG.data = null; renderStorage(); };
    el.querySelectorAll('[data-ck]').forEach((b) => (b.onclick = async () => { SG.cookies = await nb.invoke('devlab:cookies', { wcId: DL.wcId, action: 'remove', cookie: c[+b.dataset.ck] }); renderStorage(); }));
    el.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { await DL.eval(`${b.dataset.del}Storage.removeItem(${JSON.stringify(b.dataset.k)})`).catch(() => {}); SG.data = null; renderStorage(); }));
    el.querySelector('#sg-all').onclick = async () => {
      if (!confirm('Forget everything ' + d.origin + ' saved? You may be signed out of this site.')) return;
      await nb.invoke('devlab:cookies', { wcId: DL.wcId, action: 'clear' });
      await DL.eval(`(async () => { try { localStorage.clear(); sessionStorage.clear(); } catch {} try { for (const d of await indexedDB.databases()) indexedDB.deleteDatabase(d.name); } catch {} try { for (const k of await caches.keys()) await caches.delete(k); } catch {} })()`).catch(() => {});
      SG.data = null; toast('Forgot everything this site saved 🧹'); renderStorage();
    };
  }
  DL.handlers.storage = { render: renderStorage, event(m, p, _l, isCur) { if (isCur && m === 'Page.frameNavigated' && !p.frame.parentId) SG.data = null; }, detach() { SG.data = null; } };

  // ================================================================ SPEED
  const PERF_FN = `(async () => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const res = performance.getEntriesByType('resource');
    const fcp = (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || 0;
    const lcp = await new Promise((r) => { let v = 0; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) v = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {} setTimeout(() => r(v), 120); });
    const cls = await new Promise((r) => { let v = 0; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) v += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch {} setTimeout(() => r(v), 120); });
    const by = {}; let total = nav.transferSize || 0; for (const e of res) { const k = e.initiatorType === 'img' || /\\.(png|jpe?g|gif|webp|avif|svg)/i.test(e.name) ? 'images' : e.initiatorType === 'script' ? 'scripts' : e.initiatorType === 'css' || e.initiatorType === 'link' ? 'styles' : e.initiatorType === 'xmlhttprequest' || e.initiatorType === 'fetch' ? 'data' : 'other'; by[k] = (by[k] || 0) + (e.transferSize || 0); total += e.transferSize || 0; }
    const big = res.filter((e) => e.transferSize > 0).sort((a, b) => b.transferSize - a.transferSize).slice(0, 6).map((e) => [e.name, e.transferSize, Math.round(e.duration)]);
    return { load: nav.loadEventEnd ? nav.loadEventEnd : performance.now(), dcl: nav.domContentLoadedEventEnd || 0, ttfb: nav.responseStart || 0, fcp, lcp, cls, requests: res.length + 1, total, by, big, dom: document.getElementsByTagName('*').length, heap: performance.memory ? performance.memory.usedJSHeapSize : 0 };
  })()`;
  const SP = { r: null, fps: false, paint: false, shifts: false, cpu: 1, anim: 1 };
  const gradeOf = (v, good, ok, bad) => v <= good ? 'A' : v <= ok ? 'B' : v <= bad ? 'C' : v <= bad * 1.6 ? 'D' : 'F';
  const GRADE_EMO = { A: '🏆', B: '😀', C: '🙂', D: '😕', F: '🐌' };
  function renderSpeed() {
    const el = DL.body; const r = SP.r;
    const toggles = `<div class="sp-toggles"><b>🔬 Watch it work</b>
      <button class="dl-chip${SP.fps ? ' on' : ''}" id="sp-fps">🎞️ Frames per second</button><button class="dl-chip${SP.paint ? ' on' : ''}" id="sp-paint">🟩 Show repainting</button><button class="dl-chip${SP.shifts ? ' on' : ''}" id="sp-shift">💥 Show jumping things</button>
      <label class="dl-check">🐢 Slow computer <select class="dl-input" id="sp-cpu">${[[1, 'Normal'], [4, '4× slower'], [6, '6× slower'], [20, '20× slower']].map(([v, n]) => `<option value="${v}" ${SP.cpu === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="dl-check">🎬 Slow motion <select class="dl-input" id="sp-anim">${[[1, 'Normal speed'], [0.5, '½ speed'], [0.25, '¼ speed'], [0.1, '1/10 speed'], [0, 'Frozen ❄️']].map(([v, n]) => `<option value="${v}" ${SP.anim === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>`;
    if (!r) { el.innerHTML = `<div class="dl-empty big">⚡ How fast is this page?<br><button class="dl-btn primary" id="sp-run">📝 Get a speed report card</button></div>` + toggles; wire(); return; }
    const rows = [
      ['⏱️ First thing on screen', DL.fmtMs(r.fcp), gradeOf(r.fcp, 1800, 3000, 4500), 'How long until you saw anything.'],
      ['🖼️ Main content showed up', DL.fmtMs(r.lcp || r.fcp), gradeOf(r.lcp || r.fcp, 2500, 4000, 6000), 'How long until the biggest thing (like the main picture) appeared.'],
      ['✅ Completely loaded', DL.fmtMs(r.load), gradeOf(r.load, 3000, 6000, 10000), 'How long until every file was finished.'],
      ['💥 Things jumping around', r.cls.toFixed(2), gradeOf(r.cls, 0.1, 0.25, 0.4), 'Do things move while you’re trying to read or click? Lower is better.'],
      ['📦 Page weight', DL.fmtBytes(r.total), gradeOf(r.total / 1e6, 1.5, 3, 6), 'How much had to be downloaded. Big pages are slow on phones.'],
      ['🧩 Number of files', String(r.requests), gradeOf(r.requests, 60, 120, 200), 'Every file is another trip to a server.'],
      ['🌳 Page size (elements)', String(r.dom), gradeOf(r.dom, 1500, 3000, 6000), 'How many HTML elements the browser has to keep track of.'],
    ];
    const pts = { A: 4, B: 3, C: 2, D: 1, F: 0 }; const avg = rows.reduce((a, x) => a + pts[x[2]], 0) / rows.length;
    const overall = avg >= 3.5 ? 'A' : avg >= 2.7 ? 'B' : avg >= 1.9 ? 'C' : avg >= 1.1 ? 'D' : 'F';
    const byTotal = Object.values(r.by).reduce((a, b) => a + b, 0) || 1;
    el.innerHTML = `<div class="sp-top"><div class="sp-grade g${overall}"><b>${overall}</b><span>${GRADE_EMO[overall]}</span></div><div><b>Speed report card</b><br><small class="muted">${DL.kid ? 'A is the best, F needs work. Tip: reload the page first for a fair test.' : 'Lab measurements for this load.'}</small></div><span class="grow"></span><button class="dl-btn small" id="sp-run">🔄 Test again</button><button class="dl-btn small" id="sp-reload">🔄 Reload &amp; test</button></div>
      <div class="sp-grid"><table class="sp-t">${rows.map(([n, v, g, kid]) => `<tr><td>${n}${DL.kid ? `<small>${kid}</small>` : ''}</td><td><b>${E(v)}</b></td><td><span class="sp-g g${g}">${g}</span></td></tr>`).join('')}${r.heap ? `<tr><td>🧠 Memory used by scripts</td><td><b>${DL.fmtBytes(r.heap)}</b></td><td></td></tr>` : ''}</table>
      <div><b>What it downloaded</b><div class="sp-bar">${Object.entries(r.by).filter(([, v]) => v).map(([k, v], i) => `<i style="flex:${v / byTotal};background:${['#7c68fa', '#3e8deb', '#14a89b', '#ee7a2e', '#e055a3'][i % 5]}" title="${k} ${DL.fmtBytes(v)}"></i>`).join('')}</div>
        <div class="sp-leg">${Object.entries(r.by).filter(([, v]) => v).map(([k, v], i) => `<span><i style="background:${['#7c68fa', '#3e8deb', '#14a89b', '#ee7a2e', '#e055a3'][i % 5]}"></i>${({ images: '🖼️ Pictures', scripts: '📜 Scripts', styles: '🎨 Styles', data: '📡 Data', other: '📦 Other' })[k]} ${DL.fmtBytes(v)}</span>`).join('')}</div>
        <b style="display:block;margin-top:10px">Biggest files</b>${r.big.map(([u, s, ms]) => `<div class="sp-big"><span title="${E(u)}">${E(u.split('/').pop().split('?')[0].slice(0, 46) || u)}</span><b>${DL.fmtBytes(s)}</b><small>${ms} ms</small></div>`).join('') || '<span class="muted">—</span>'}</div></div>` + toggles;
    wire();
  }
  function wire() {
    const el = DL.body;
    el.querySelector('#sp-run').onclick = runSpeed;
    const rl = el.querySelector('#sp-reload'); if (rl) rl.onclick = () => { SP.r = null; SP.wantAfterLoad = true; DL.tab.wv.reloadIgnoringCache(); el.innerHTML = '<div class="dl-empty big">⏳ Loading the page…</div>'; };
    const tog = (k, method, id) => (el.querySelector(id).onclick = () => { SP[k] = !SP[k]; DL.cmd(method, { show: SP[k] }).catch((e) => toast(e.message)); renderSpeed(); });
    tog('fps', 'Overlay.setShowFPSCounter', '#sp-fps'); tog('paint', 'Overlay.setShowPaintRects', '#sp-paint'); tog('shifts', 'Overlay.setShowLayoutShiftRegions', '#sp-shift');
    el.querySelector('#sp-cpu').onchange = (e) => { SP.cpu = +e.target.value; DL.cmd('Emulation.setCPUThrottlingRate', { rate: SP.cpu }).then(() => toast(SP.cpu > 1 ? `Pretending to be a ${SP.cpu}× slower computer 🐢` : 'Normal speed')).catch((x) => toast(x.message)); };
    el.querySelector('#sp-anim').onchange = async (e) => { SP.anim = +e.target.value; await DL.cmd('Animation.enable').catch(() => {}); DL.cmd('Animation.setPlaybackRate', { playbackRate: SP.anim }).then(() => toast(SP.anim === 1 ? 'Animations at normal speed' : SP.anim === 0 ? 'All animations frozen ❄️' : 'Slow motion 🎬')).catch((x) => toast(x.message)); };
  }
  async function runSpeed() { DL.body.innerHTML = '<div class="dl-empty big">⏱️ Measuring…</div>'; try { SP.r = await DL.eval(PERF_FN); DL.mission('speed'); } catch (e) { toast(e.message); } renderSpeed(); }
  DL.handlers.speed = {
    render: renderSpeed,
    event(m, p, _l, isCur) { if (isCur && m === 'Page.loadEventFired' && SP.wantAfterLoad) { SP.wantAfterLoad = false; setTimeout(() => DL.tool === 'speed' && runSpeed(), 800); } if (isCur && m === 'Page.frameNavigated' && !p.frame.parentId && !SP.wantAfterLoad) SP.r = null; },
    detach() { Object.assign(SP, { r: null, fps: false, paint: false, shifts: false, cpu: 1, anim: 1 }); },
  };

  // ================================================================ SCRIPTS (debugger lite)
  function pretty(src) {
    if (src.length > 400000) src = src.slice(0, 400000);
    const lines = src.split('\n'); const avg = src.length / Math.max(1, lines.length);
    if (avg < 200) return src; // already readable
    let out = '', ind = 0, i = 0, q = null, inLine = false, inBlock = false, re = false;
    const nl = () => { out += '\n' + '  '.repeat(Math.max(0, ind)); };
    while (i < src.length) {
      const c = src[i], n = src[i + 1];
      if (inLine) { out += c; if (c === '\n') inLine = false; i++; continue; }
      if (inBlock) { out += c; if (c === '*' && n === '/') { out += '/'; i += 2; inBlock = false; continue; } i++; continue; }
      if (q) { out += c; if (c === '\\') { out += n || ''; i += 2; continue; } if (c === q) q = null; i++; continue; }
      if (c === '/' && n === '/') { inLine = true; out += c; i++; continue; }
      if (c === '/' && n === '*') { inBlock = true; out += c; i++; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
      if (c === '{') { ind++; out += ' {'; nl(); i++; continue; }
      if (c === '}') { ind--; nl(); out += '}'; if (n !== ';' && n !== ',' && n !== ')') nl(); i++; continue; }
      if (c === ';') { out += ';'; if (!/^\s*\)/.test(src.slice(i + 1, i + 3))) nl(); i++; continue; }
      if (c === '\n') { i++; continue; }
      out += c; i++;
    }
    return out.replace(/\n\s*\n/g, '\n');
  }
  const TOK = /(\/\/[^\n]*)|(&quot;(?:(?!&quot;).)*?&quot;|&#39;(?:(?!&#39;).)*?&#39;|`[^`]*`)|\b(function|return|if|else|for|while|do|const|let|var|new|class|extends|import|export|from|async|await|try|catch|finally|throw|switch|case|break|continue|typeof|instanceof|in|of|this|null|undefined|true|false|default|delete|void|yield|super)\b|\b(\d+(?:\.\d+)?)\b/g;
  const hlJS = (s) => E(s).replace(TOK, (m, c, str, k, n) => `<span class="${c ? 'c' : str ? 's' : k ? 'k' : 'n'}">${m}</span>`);
  const SC = { list: [], sel: null, src: '', q: '', paused: false };
  async function renderScripts() {
    const el = DL.body;
    SC.list = await nb.invoke('devlab:scripts', DL.wcId).catch(() => []);
    const groups = {}; for (const s of SC.list) { let h = ''; try { h = new URL(s.url).hostname; } catch { h = 'inline'; } (groups[h] = groups[h] || []).push(s); }
    const lines = SC.src ? SC.src.split('\n') : [];
    const hits = SC.q ? lines.reduce((a, l, k) => (l.toLowerCase().includes(SC.q.toLowerCase()) ? a.concat(k) : a), []) : [];
    el.innerHTML = `<div class="dl-toolbar">${DL.kid ? '<span class="muted">📜 Scripts are the JavaScript instructions that make this page work.</span>' : ''}<span class="grow"></span>
        <button class="dl-btn small ${SC.paused ? 'primary' : ''}" id="sc-pause">${SC.paused ? '▶️ Unfreeze the page' : '⏸️ Freeze the page'}</button></div>
      ${SC.paused ? DL.explain('The page is frozen ❄️ — none of its JavaScript can run. Try clicking buttons on it: nothing happens! Click Unfreeze to continue.') : ''}
      <div class="sc-grid"><div class="sc-list">${Object.keys(groups).length ? Object.entries(groups).map(([h, l]) => `<div class="sc-h">${E(h)} <small>${l.length}</small></div>${l.map((s) => `<button class="sc-item${SC.sel === s.id ? ' on' : ''}" data-id="${E(s.id)}" title="${E(s.url)}">${E(s.url.split('/').pop().split('?')[0] || s.url)}<small>${DL.fmtBytes(s.length)}</small></button>`).join('')}`).join('') : '<div class="dl-empty">No scripts yet — reload the page.</div>'}</div>
      <div class="sc-view">${SC.sel ? `<div class="sc-bar"><input class="dl-input" id="sc-q" placeholder="🔎 Search in this script" value="${E(SC.q)}"><span class="muted">${SC.q ? hits.length + ' found' : lines.length + ' lines'}</span><button class="dl-btn small" id="sc-copy">Copy</button></div><pre class="sc-code">${lines.slice(0, 6000).map((l, k) => `<span class="ln${hits.includes(k) ? ' hit' : ''}" data-l="${k}"><b>${k + 1}</b>${hlJS(l)}</span>`).join('\n')}${lines.length > 6000 ? '\n… (first 6000 lines)' : ''}</pre>` : `<div class="dl-empty">👈 Pick a script to read it.${DL.kid ? '<br><small>Long scripts are usually squashed onto one line to download faster (“minified”). Dev Lab un-squashes them so you can read them.</small>' : ''}</div>`}</div></div>`;
    el.querySelectorAll('.sc-item').forEach((b) => (b.onclick = async () => {
      SC.sel = b.dataset.id; SC.q = '';
      try { const r = await DL.cmd('Debugger.getScriptSource', { scriptId: SC.sel }); SC.src = pretty(r.scriptSource || ''); DL.mission('script'); } catch (e) { SC.src = '// ' + e.message; }
      renderScripts();
    }));
    const q = el.querySelector('#sc-q');
    if (q) { q.onkeydown = (e) => e.stopPropagation(); q.oninput = () => { SC.q = q.value; clearTimeout(SC.t); SC.t = setTimeout(async () => { await renderScripts(); const nq = DL.body.querySelector('#sc-q'); nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); const h = DL.body.querySelector('.ln.hit'); if (h) h.scrollIntoView({ block: 'center' }); }, 250); }; }
    const cp = el.querySelector('#sc-copy'); if (cp) cp.onclick = () => DL.copy(SC.src);
    el.querySelector('#sc-pause').onclick = async () => { try { if (SC.paused) { await DL.cmd('Debugger.resume'); SC.paused = false; } else { await DL.cmd('Debugger.pause'); SC.paused = true; toast('Freezing… the page stops the next time its code runs ❄️'); } } catch (e) { toast(e.message); } renderScripts(); };
  }
  DL.handlers.scripts = {
    render: renderScripts,
    event(m, p, _l, isCur) {
      if (!isCur) return;
      if (m === 'Debugger.paused') { SC.paused = true; if (DL.tool === 'scripts') renderScripts(); }
      if (m === 'Debugger.resumed') { SC.paused = false; if (DL.tool === 'scripts') renderScripts(); }
      if (m === 'Page.frameNavigated' && !p.frame.parentId) { SC.sel = null; SC.src = ''; }
    },
    detach() { if (SC.paused) DL.cmd('Debugger.resume').catch(() => {}); SC.paused = false; SC.sel = null; SC.src = ''; },
  };
})();
