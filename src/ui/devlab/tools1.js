// Dev Lab tools: Explore (inspector), Console, Network.
'use strict';
(() => {
  const E = esc;
  const HC = {
    showInfo: true, showStyles: true, showAccessibilityInfo: true, showExtensionLines: false,
    contentColor: { r: 111, g: 168, b: 220, a: 0.55 }, paddingColor: { r: 147, g: 196, b: 125, a: 0.55 },
    borderColor: { r: 255, g: 229, b: 153, a: 0.66 }, marginColor: { r: 246, g: 178, b: 107, a: 0.55 },
    gridHighlightConfig: { rowGapColor: { r: 204, g: 98, b: 186, a: 0.3 }, columnGapColor: { r: 204, g: 98, b: 186, a: 0.3 }, rowLineColor: { r: 127, g: 50, b: 184, a: 0.8 }, columnLineColor: { r: 127, g: 50, b: 184, a: 0.8 }, showGridExtensionLines: true },
    flexContainerHighlightConfig: { containerBorder: { color: { r: 124, g: 104, b: 250, a: 0.9 }, pattern: 'dashed' }, itemSeparator: { color: { r: 124, g: 104, b: 250, a: 0.6 }, pattern: 'dotted' } },
  };

  // ================================================================ EXPLORE
  const TAGS = {
    html: 'The whole page. Everything lives inside it.', body: 'The part of the page you can see.', head: 'Hidden info about the page (title, styles, scripts).',
    div: 'A box. Websites use boxes to group things together.', span: 'A little piece of text that can get its own style.', p: 'A paragraph of text.',
    a: 'A link — clicking it takes you somewhere.', img: 'A picture.', button: 'A button you can click.', input: 'A box where you can type or choose something.',
    textarea: 'A big box for typing lots of text.', select: 'A drop-down list.', option: 'One choice in a drop-down list.', label: 'The name written next to a box you fill in.',
    form: 'A form — boxes you fill in and send.', h1: 'The biggest heading — usually the title.', h2: 'A big heading.', h3: 'A medium heading.', h4: 'A small heading.', h5: 'A tiny heading.', h6: 'The smallest heading.',
    ul: 'A list with bullet points.', ol: 'A numbered list.', li: 'One item in a list.', nav: 'The menu with links to other pages.', header: 'The top part of a page or section.',
    footer: 'The bottom part, often with small print and links.', main: 'The main content of the page.', section: 'A section of the page.', article: 'A story or post that makes sense on its own.',
    aside: 'Something on the side, like a box of extra info.', video: 'A video player.', audio: 'A sound player.', iframe: 'A whole other web page, shown inside this one.',
    svg: 'A drawing made of shapes and lines (it stays sharp at any size).', path: 'One shape inside an SVG drawing.', canvas: 'A drawing board that JavaScript paints on — games often use it.',
    table: 'A table with rows and columns.', tr: 'A row in a table.', td: 'One cell in a table.', th: 'A heading cell in a table.', strong: 'Important text (shown bold).', b: 'Bold text.', em: 'Text said with emphasis (italic).', i: 'Italic text — or often an icon.',
    code: 'A bit of computer code.', pre: 'Text that keeps its spaces exactly, like code.', blockquote: 'A quote from someone.', br: 'A line break — starts a new line.', hr: 'A line across the page.',
    figure: 'A picture or chart with its caption.', figcaption: 'The caption under a picture.', picture: 'A picture that picks the best size for your screen.', source: 'One version of a picture or video.',
    script: 'JavaScript code — instructions that make the page do things.', style: 'CSS — rules for how things look.', link: 'Connects the page to another file, like a style sheet.', meta: 'Hidden info about the page.',
    dialog: 'A pop-up box.', details: 'Something you can click to open and close.', summary: 'The clickable title of an open/close box.', time: 'A date or time.', mark: 'Highlighted text.', small: 'Small print.', sup: 'Small raised text, like the 2 in x².', sub: 'Small lowered text.',
  };
  const PROPS = {
    color: 'the colour of the text', 'background-color': 'the colour behind it', 'font-family': 'the style of the letters (the font)', 'font-size': 'how big the letters are',
    'font-weight': 'how thick (bold) the letters are', display: 'how it sits on the page', position: 'how it’s placed', width: 'how wide it is', height: 'how tall it is',
    margin: 'empty space outside the box', padding: 'space inside the box, around what’s in it', border: 'the line around the box', 'border-radius': 'how round the corners are',
    opacity: 'how see-through it is (1 = solid, 0 = invisible)', 'z-index': 'which things sit on top of which', 'text-align': 'left, centre or right',
  };
  const DISPLAY = { block: 'takes a whole line to itself', inline: 'sits inside a line of text', 'inline-block': 'sits in a line, but can have a size', flex: 'Flexbox — lines its children up in a row or column', grid: 'Grid — arranges its children in rows and columns, like a table', none: 'hidden!', contents: 'acts like it isn’t there — only its children show' };

  const INFO_FN = function () {
    const el = this; const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    const path = []; let p = el; for (let i = 0; p && p.nodeType === 1 && i < 8; i++, p = p.parentElement) path.unshift(p.tagName.toLowerCase() + (p.id ? '#' + p.id : '') + (p.classList.length ? '.' + [...p.classList].slice(0, 2).join('.') : ''));
    const onlyText = el.children.length === 0 && el.textContent.trim().length > 0 && !/^(script|style|input|textarea|select)$/i.test(el.tagName);
    const pick = ['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'display', 'position', 'width', 'height', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'border-top-width', 'border-top-style', 'border-top-color', 'border-radius', 'opacity', 'text-align', 'flex-direction', 'justify-content', 'align-items', 'grid-template-columns', 'gap', 'z-index'];
    const styles = {}; for (const k of pick) styles[k] = cs.getPropertyValue(k);
    let html = el.outerHTML; if (html.length > 4000) html = html.slice(0, 4000) + '\n<!-- …and more -->';
    return { tag: el.tagName.toLowerCase(), id: el.id, classes: [...el.classList], text: (el.innerText || el.textContent || '').trim().slice(0, 300), onlyText,
      attrs: [...el.attributes].filter((a) => a.name !== 'style' && a.name !== 'class' && a.name !== 'id').slice(0, 20).map((a) => [a.name, a.value.slice(0, 200)]),
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }, styles, children: el.children.length, path, html,
      src: el.currentSrc || el.src || '', href: el.href || '', alt: el.getAttribute('alt'), natural: el.naturalWidth ? [el.naturalWidth, el.naturalHeight] : null, inlineStyle: el.getAttribute('style') || '' };
  };
  const FUN_CSS = `@keyframes noam-spin{to{transform:rotate(360deg)}}@keyframes noam-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-25px)}}@keyframes noam-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}@keyframes noam-rainbow{to{filter:hue-rotate(360deg)}}@keyframes noam-glow{50%{box-shadow:0 0 30px 10px #ffd84d}}`;
  const ensureFun = () => DL.eval(`(() => { if (document.getElementById('noam-devlab-fun')) return; const s = document.createElement('style'); s.id = 'noam-devlab-fun'; s.textContent = ${JSON.stringify(FUN_CSS)}; (document.head || document.documentElement).appendChild(s); })()`).catch(() => {});
  const rgbToHex = (c) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/.exec(c || ''); if (!m) return '#000000'; return '#' + [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, '0')).join(''); };
  const hlHTML = (s) => E(s).replace(/(&lt;\/?)([a-zA-Z0-9-]+)/g, '$1<span class="t">$2</span>').replace(/([a-zA-Z-:]+)=(&quot;[^&]*?&quot;)/g, '<span class="a">$1</span>=<span class="v">$2</span>').replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="c">$1</span>');

  const X = { sel: null, info: null, picking: false, editHtml: false, typing: false, measuring: false };
  async function pick() {
    if (!DL.wcId) return;
    X.picking = true; render();
    try { await DL.cmd('Overlay.setInspectMode', { mode: 'searchForNode', highlightConfig: HC }); DL.tab && DL.tab.wv.focus(); }
    catch (e) { X.picking = false; toast('Couldn’t start picking: ' + e.message); render(); }
  }
  async function stopPick() { X.picking = false; try { await DL.cmd('Overlay.setInspectMode', { mode: 'none', highlightConfig: HC }); } catch {} }
  async function select(objectId) {
    if (X.sel && X.sel !== objectId) DL.cmd('Runtime.releaseObject', { objectId: X.sel }).catch(() => {});
    X.sel = objectId; X.editHtml = false;
    try { X.info = await DL.callOn(objectId, INFO_FN); } catch (e) { X.info = null; toast('That element is gone: ' + e.message); }
    DL.cmd('Overlay.highlightNode', { highlightConfig: HC, objectId }).catch(() => {});
    DL.mission('pick');
    render();
  }
  const REL = {
    parent: function () { return this.parentElement; }, child: function () { return this.firstElementChild; },
    prev: function () { return this.previousElementSibling; }, next: function () { return this.nextElementSibling; },
    up: function (n) { let e = this; for (let i = 0; i < n && e; i++) e = e.parentElement; return e; },
  };
  async function selectRelative(kind, arg) {
    if (!X.sel) return;
    const r = await DL.callOn(X.sel, REL[kind], arg === undefined ? [] : [arg], false).catch(() => null);
    if (r && r.objectId) select(r.objectId); else toast('There’s nothing there.');
  }
  async function act(fn, args, mission) { if (!X.sel) return; try { await DL.callOn(X.sel, fn, args); if (mission) DL.mission(mission); await select(X.sel); } catch (e) { toast(e.message); } }

  const MEASURE = `(() => {
    if (window.__noamMeasure) { window.__noamMeasure(); return false; }
    const root = document.createElement('div'); root.style.cssText = 'position:fixed;inset:0;z-index:2147483646;cursor:crosshair;font:700 12px system-ui,sans-serif';
    const top = document.createElement('canvas'), left = document.createElement('canvas'), box = document.createElement('div'), tip = document.createElement('div');
    top.style.cssText = 'position:absolute;left:0;top:0;height:22px;width:100%;'; left.style.cssText = 'position:absolute;left:0;top:0;width:22px;height:100%;';
    box.style.cssText = 'position:absolute;border:2px dashed #7c68fa;background:rgba(124,104,250,.12);display:none;pointer-events:none';
    tip.style.cssText = 'position:absolute;background:#1d1836;color:#fff;padding:4px 8px;border-radius:8px;pointer-events:none;white-space:nowrap';
    tip.textContent = 'Drag to measure · Esc to stop';  tip.style.left = '30px'; tip.style.top = '30px';
    root.append(top, left, box, tip); document.documentElement.appendChild(root);
    const draw = () => { const d = devicePixelRatio; for (const [c, horiz] of [[top, true], [left, false]]) { const L = horiz ? innerWidth : innerHeight; c.width = (horiz ? L : 22) * d; c.height = (horiz ? 22 : L) * d; const g = c.getContext('2d'); g.scale(d, d); g.fillStyle = 'rgba(255,255,255,.92)'; g.fillRect(0, 0, horiz ? L : 22, horiz ? 22 : L); g.fillStyle = '#1d1836'; g.font = '9px system-ui'; for (let i = 0; i < L; i += 10) { const len = i % 100 === 0 ? 14 : i % 50 === 0 ? 9 : 5; if (horiz) { g.fillRect(i, 22 - len, 1, len); if (i % 100 === 0 && i) g.fillText(i, i + 2, 9); } else { g.fillRect(22 - len, i, len, 1); if (i % 100 === 0 && i) { g.save(); g.translate(9, i + 2); g.rotate(Math.PI / 2); g.fillText(i, 0, 0); g.restore(); } } } } };
    draw(); addEventListener('resize', draw);
    let s = null;
    root.addEventListener('pointerdown', (e) => { s = [e.clientX, e.clientY]; box.style.display = 'block'; root.setPointerCapture(e.pointerId); });
    root.addEventListener('pointermove', (e) => { if (!s) { tip.style.left = e.clientX + 14 + 'px'; tip.style.top = e.clientY + 14 + 'px'; tip.textContent = Math.round(e.clientX) + ', ' + Math.round(e.clientY) + ' px'; return; } const x = Math.min(s[0], e.clientX), y = Math.min(s[1], e.clientY), w = Math.abs(e.clientX - s[0]), h = Math.abs(e.clientY - s[1]); Object.assign(box.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' }); tip.style.left = e.clientX + 14 + 'px'; tip.style.top = e.clientY + 14 + 'px'; tip.textContent = Math.round(w) + ' × ' + Math.round(h) + ' px'; });
    root.addEventListener('pointerup', () => { s = null; });
    const stop = () => { root.remove(); removeEventListener('keydown', key, true); removeEventListener('resize', draw); window.__noamMeasure = null; };
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); stop(); } };
    addEventListener('keydown', key, true); window.__noamMeasure = stop; return true;
  })()`;

  function render() {
    if (DL.tool !== 'explore') return;
    const el = DL.body; const i = X.info;
    const tools = `<div class="dl-toolbar">
      <button class="dl-btn ${X.picking ? 'primary pulse' : 'primary'}" id="ex-pick">${X.picking ? '👆 Now click something on the page… (Esc to stop)' : '👆 Pick something on the page'}</button>
      <button class="dl-btn ${X.typing ? 'on' : ''}" id="ex-type" title="Type straight onto the page">✏️ ${X.typing ? 'Stop typing on the page' : 'Type on the page'}</button>
      <button class="dl-btn ${X.measuring ? 'on' : ''}" id="ex-measure" title="Rulers and a measuring box">📏 ${X.measuring ? 'Stop measuring' : 'Measure'}</button>
      <button class="dl-btn ghost" id="ex-boxes" title="Draw an outline around every box on the page">🔲 Show all boxes</button>
    </div>`;
    if (!i) {
      el.innerHTML = tools + `<div class="dl-empty big">👆 Click <b>Pick something on the page</b>, then click anything on the page — a picture, a title, a button.<br>You’ll see what it’s made of, and you can change it!${DL.kid ? '<br><small>Shortcut: Ctrl+Shift+C</small>' : ''}</div>`;
      wireTools(); return;
    }
    const st = i.styles;
    const px = (v) => parseFloat(v) || 0;
    const m = ['top', 'right', 'bottom', 'left'].map((k) => px(st['margin-' + k])), pd = ['top', 'right', 'bottom', 'left'].map((k) => px(st['padding-' + k]));
    const kidTag = TAGS[i.tag] || (i.tag.includes('-') ? 'A custom part this website made up itself.' : 'An HTML element.');
    const disp = DISPLAY[st.display];
    el.innerHTML = tools + `<div class="ex-grid">
      <div class="ex-main">
        <div class="ex-crumbs">${i.path.map((p, k) => `<span class="${k === i.path.length - 1 ? 'on' : ''}">${E(p)}</span>`).join('<b>›</b>')}</div>
        <div class="ex-title"><span class="ex-tag">&lt;${E(i.tag)}&gt;</span>${i.id ? `<span class="ex-id">#${E(i.id)}</span>` : ''}${i.classes.slice(0, 4).map((c) => `<span class="ex-cls">.${E(c)}</span>`).join('')}<span class="ex-size">${i.rect.w} × ${i.rect.h} px</span></div>
        ${DL.kid ? `<p class="dl-explain">💡 <b>${E(i.tag)}</b> — ${E(kidTag)}${disp ? ` It’s a <b>${E(st.display)}</b>, which means it ${E(disp)}.` : ''}</p>` : ''}
        <div class="dl-row wrap">
          <button class="dl-btn small" id="ex-parent" title="Select the box this is inside">⬆️ Outer box</button>
          <button class="dl-btn small" id="ex-child" ${i.children ? '' : 'disabled'} title="Select the first thing inside">⬇️ Inside (${i.children})</button>
          <button class="dl-btn small" id="ex-prev" title="Previous neighbour">⬅️</button><button class="dl-btn small" id="ex-next" title="Next neighbour">➡️</button>
          <button class="dl-btn small" id="ex-scroll">🎯 Show me</button>
        </div>
        ${i.onlyText ? `<label class="ex-field"><span>✏️ Change the words</span><input id="ex-text" value="${E(i.text)}"></label>` : i.text ? `<div class="ex-textprev">“${E(i.text.slice(0, 140))}${i.text.length > 140 ? '…' : ''}”</div>` : ''}
        ${i.tag === 'img' ? `<div class="ex-img"><img src="${E(i.src)}" alt=""><span>${i.natural ? `Real size ${i.natural[0]} × ${i.natural[1]} px` : ''}${i.alt === null ? ' · <b class="bad">No alt text</b> (people who can’t see won’t know what this is)' : i.alt ? ` · Alt text: “${E(i.alt)}”` : ''}</span></div>` : ''}
        ${i.href ? `<div class="ex-link">🔗 Goes to <a href="#" id="ex-href">${E(i.href.slice(0, 120))}</a></div>` : ''}
        <div class="ex-edit">
          <label>🎨 Text colour <input type="color" id="ex-color" value="${rgbToHex(st.color)}"></label>
          <label>🖌️ Background <input type="color" id="ex-bg" value="${rgbToHex(st['background-color'])}"></label>
          <label>🔠 Size <input type="range" id="ex-fs" min="6" max="120" value="${Math.round(px(st['font-size']))}"><output>${Math.round(px(st['font-size']))}px</output></label>
          <label>⬜ Round corners <input type="range" id="ex-br" min="0" max="80" value="${Math.round(px(st['border-radius']))}"></label>
          <label>👻 See-through <input type="range" id="ex-op" min="0" max="100" value="${Math.round((+st.opacity) * 100)}"></label>
        </div>
        <div class="dl-row wrap fun">
          <button class="dl-btn small" data-fun="noam-spin 2s linear infinite">🌀 Spin</button><button class="dl-btn small" data-fun="noam-bounce .8s ease-in-out infinite">🏀 Bounce</button>
          <button class="dl-btn small" data-fun="noam-shake .4s ease-in-out infinite">🫨 Shake</button><button class="dl-btn small" data-fun="noam-rainbow 2s linear infinite">🌈 Rainbow</button>
          <button class="dl-btn small" data-fun="noam-glow 1.2s ease-in-out infinite">✨ Glow</button><button class="dl-btn small" data-fun="">⏹️ Stop</button>
          <button class="dl-btn small" id="ex-hide">🙈 Hide it</button><button class="dl-btn small danger" id="ex-del">🗑️ Delete it</button>
        </div>
      </div>
      <div class="ex-side">
        <div class="ex-box" title="The box model: margin (orange) › border (yellow) › padding (green) › content (blue)">
          <div class="bxm m"><i>margin</i><span class="t">${m[0]}</span><span class="r">${m[1]}</span><span class="b">${m[2]}</span><span class="l">${m[3]}</span>
            <div class="bxm bd"><i>border</i><div class="bxm pd"><i>padding</i><span class="t">${pd[0]}</span><span class="r">${pd[1]}</span><span class="b">${pd[2]}</span><span class="l">${pd[3]}</span>
              <div class="bxm ct">${i.rect.w} × ${i.rect.h}</div></div></div></div>
          ${DL.kid ? '<p class="dl-explain small">Every element is a box: the <b style="color:#4a8ad1">content</b>, then <b style="color:#5c9d47">padding</b> around it, a <b style="color:#b8962b">border</b>, and <b style="color:#d9822b">margin</b> pushing other things away.</p>' : ''}
        </div>
        <table class="ex-props">${['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'display', 'position', 'border-radius', 'opacity', 'text-align'].concat(st.display.includes('flex') ? ['flex-direction', 'justify-content', 'align-items', 'gap'] : st.display.includes('grid') ? ['grid-template-columns', 'gap'] : []).map((k) => `<tr><td title="${E(PROPS[k] || '')}">${E(k)}${DL.kid && PROPS[k] ? `<small>${E(PROPS[k])}</small>` : ''}</td><td>${/color/.test(k) ? `<i class="sw" style="background:${E(st[k])}"></i>` : ''}${E(String(st[k]).slice(0, 80))}</td></tr>`).join('')}</table>
        <div class="ex-html-head"><b>HTML</b><span><button class="dl-link" id="ex-copyhtml">Copy</button> · <button class="dl-link" id="ex-edithtml">${X.editHtml ? 'Cancel' : 'Edit'}</button></span></div>
        ${X.editHtml ? `<textarea id="ex-htmlbox" spellcheck="false">${E(i.html)}</textarea><button class="dl-btn primary small" id="ex-applyhtml">Apply HTML</button>` : `<pre class="ex-html">${hlHTML(i.html)}</pre>`}
      </div></div>`;
    wireTools();
    const $$$ = (q) => el.querySelector(q);
    $$$('#ex-parent').onclick = () => selectRelative('parent');
    $$$('#ex-child').onclick = () => selectRelative('child');
    $$$('#ex-prev').onclick = () => selectRelative('prev');
    $$$('#ex-next').onclick = () => selectRelative('next');
    $$$('#ex-scroll').onclick = () => act(function () { this.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    el.querySelectorAll('.ex-crumbs span').forEach((s, k, all) => (s.onclick = () => { const up = all.length - 1 - k; if (up > 0) selectRelative('up', up); }));
    const txt = $$$('#ex-text'); if (txt) { txt.onkeydown = (e) => e.stopPropagation(); txt.oninput = () => DL.callOn(X.sel, function (t) { this.textContent = t; }, [txt.value]).then(() => DL.mission('text')); }
    const style = (prop, val, mission) => DL.callOn(X.sel, function (p, v) { this.style.setProperty(p, v, 'important'); }, [prop, val]).then(() => mission && DL.mission(mission)).catch((e) => toast(e.message));
    $$$('#ex-color').oninput = (e) => style('color', e.target.value, 'color');
    $$$('#ex-bg').oninput = (e) => style('background-color', e.target.value, 'color');
    $$$('#ex-fs').oninput = (e) => { e.target.nextElementSibling.textContent = e.target.value + 'px'; style('font-size', e.target.value + 'px'); };
    $$$('#ex-br').oninput = (e) => style('border-radius', e.target.value + 'px');
    $$$('#ex-op').oninput = (e) => style('opacity', String(e.target.value / 100));
    el.querySelectorAll('[data-fun]').forEach((b) => (b.onclick = async () => { await ensureFun(); style('animation', b.dataset.fun || 'none'); }));
    $$$('#ex-hide').onclick = () => act(function () { this.style.setProperty('visibility', this.style.visibility === 'hidden' ? 'visible' : 'hidden', 'important'); });
    $$$('#ex-del').onclick = async () => { const parent = await DL.callOn(X.sel, function () { const p = this.parentElement; this.remove(); return p; }, [], false).catch(() => null); toast('Deleted! Reload the page to bring it back.'); if (parent && parent.objectId) select(parent.objectId); else { X.info = null; render(); } };
    const href = $$$('#ex-href'); if (href) href.onclick = (e) => { e.preventDefault(); DL.tab.navigate(i.href); };
    $$$('#ex-copyhtml').onclick = () => DL.copy(i.html);
    $$$('#ex-edithtml').onclick = () => { X.editHtml = !X.editHtml; render(); };
    const ap = $$$('#ex-applyhtml');
    if (ap) {
      const ta = $$$('#ex-htmlbox'); ta.onkeydown = (e) => e.stopPropagation();
      ap.onclick = async () => {
        const r = await DL.callOn(X.sel, function (h) { const t = document.createElement('template'); t.innerHTML = h; const first = t.content.firstElementChild; this.replaceWith(t.content); return first || document.body; }, [ta.value], false).catch((e) => { toast(e.message); return null; });
        if (r && r.objectId) { DL.mission('text'); select(r.objectId); }
      };
    }
  }
  function wireTools() {
    const el = DL.body;
    el.querySelector('#ex-pick').onclick = () => (X.picking ? (stopPick(), render()) : pick());
    el.querySelector('#ex-type').onclick = async () => { X.typing = !X.typing; await DL.eval(`document.designMode = ${X.typing ? "'on'" : "'off'"}`).catch((e) => toast(e.message)); if (X.typing) { toast('Click anywhere on the page and type! ✏️'); DL.mission('text'); DL.tab.wv.focus(); } render(); };
    el.querySelector('#ex-measure').onclick = async () => { const on = await DL.eval(MEASURE).catch((e) => { toast(e.message); return false; }); X.measuring = !!on; if (on) DL.tab.wv.focus(); render(); };
    el.querySelector('#ex-boxes').onclick = () => DL.eval(`(() => { const id = 'noam-devlab-boxes'; const old = document.getElementById(id); if (old) { old.remove(); return false; } const s = document.createElement('style'); s.id = id; s.textContent = '*{outline:1px solid rgba(255,0,80,.45)!important;outline-offset:-1px}*:hover{outline:2px solid #7c68fa!important;background-color:rgba(124,104,250,.06)!important}'; document.documentElement.appendChild(s); return true; })()`).then((on) => toast(on ? 'Every box on the page now has an outline 🔲' : 'Outlines off')).catch((e) => toast(e.message));
  }
  async function selectAt(x, y) {
    try { const r = await DL.cmd('DOM.getNodeForLocation', { x: Math.round(x), y: Math.round(y), includeUserAgentShadowDOM: false, ignorePointerEventsNone: true }); await DL.cmd('DOM.getDocument', { depth: 0 }).catch(() => {}); const o = await DL.cmd('DOM.resolveNode', { backendNodeId: r.backendNodeId, objectGroup: 'devlab' }); select(o.object.objectId); }
    catch (e) { toast('Couldn’t find that: ' + e.message); }
  }
  DL.handlers.explore = {
    render, pick, selectAt,
    leave() { if (X.picking) stopPick(); DL.cmd('Overlay.hideHighlight').catch(() => {}); },
    detach() { X.sel = null; X.info = null; X.picking = false; X.typing = false; X.measuring = false; },
    event(method, params, _l, isCur) {
      if (!isCur) return;
      if (method === 'Overlay.inspectNodeRequested') {
        stopPick();
        DL.cmd('DOM.resolveNode', { backendNodeId: params.backendNodeId, objectGroup: 'devlab' }).then((r) => select(r.object.objectId)).catch((e) => toast(e.message));
      }
      if (method === 'Page.frameNavigated' && !params.frame.parentId) { X.sel = null; X.info = null; X.typing = false; X.measuring = false; if (DL.tool === 'explore') render(); }
    },
  };
  // Esc while picking
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && X.picking) { stopPick(); render(); } });

  // ================================================================ CONSOLE
  const C = { filter: 'all', hist: [], hi: -1, draft: '' };
  const EXPLAIN = [
    [/(\S+) is not defined/, (m) => `The code tried to use something called “${m[1]}”, but nothing has that name. Maybe it’s spelled differently, or it was never created (like <code>let ${m[1]} = …</code>).`],
    [/Cannot read propert(?:y|ies) of (undefined|null)(?: \(reading '([^']+)'\))?/, (m) => `The code tried to look inside something that is empty (<b>${m[1]}</b>)${m[2] ? ` to find “${m[2]}”` : ''}. It’s like opening a box that isn’t there.`],
    [/Cannot set propert(?:y|ies) of (undefined|null)/, (m) => `The code tried to put something into an empty thing (<b>${m[1]}</b>).`],
    [/(\S+) is not a function/, (m) => `The code tried to <i>run</i> “${m[1]}” like a function (with <code>()</code>), but it isn’t one.`],
    [/Unexpected token|Unexpected end of input|missing \) after|Invalid or unexpected token|SyntaxError/, () => 'A grammar mistake in the code — maybe a missing <code>)</code>, <code>}</code> or quote mark.'],
    [/Assignment to constant variable/, () => 'Something made with <code>const</code> can’t be changed. Use <code>let</code> if it needs to change.'],
    [/Maximum call stack size exceeded/, () => 'A function kept calling itself forever, until the computer ran out of room.'],
    [/ERR_BLOCKED_BY_CLIENT/, () => '🛡️ NoamBrowser’s Shields blocked this — it was probably an ad or a tracker. That’s a good thing!'],
    [/status of 404|404 \(Not Found\)/, () => 'The page asked for a file that doesn’t exist. <b>404</b> means “not found”.'],
    [/status of 403/, () => 'The server said “you’re not allowed to see this” (<b>403 Forbidden</b>).'],
    [/status of 5\d\d/, () => 'The website’s server had a problem (errors starting with <b>5</b> are the server’s fault, not yours).'],
    [/CORS|Access-Control-Allow-Origin/, () => 'Another website refused to share its data with this page. This safety rule is called <b>CORS</b>.'],
    [/Mixed Content/, () => 'A safe (https) page tried to load something unsafe (http), so the browser stopped it.'],
    [/Content Security Policy|Refused to (?:load|execute|apply)/, () => 'The website’s own safety rules (its <b>Content Security Policy</b>) stopped this.'],
    [/Uncaught \(in promise\)/, () => 'Something the code was waiting for (a “promise”) failed, and nobody caught the error.'],
    [/deprecated/i, () => 'This still works, but it’s old — browsers might stop supporting it one day.'],
    [/Failed to fetch|NetworkError|net::ERR_/, () => 'The page tried to download something, but the connection failed.'],
  ];
  const explainErr = (t) => { for (const [re, f] of EXPLAIN) { const m = re.exec(t); if (m) return f(m); } return null; };
  const fmtArg = (a) => {
    if (!a) return '';
    if (a.type === 'string') return a.value;
    if (a.type === 'undefined') return 'undefined';
    if ('value' in a && a.type !== 'object') return String(a.value);
    if (a.unserializableValue) return a.unserializableValue;
    if (a.preview && a.preview.properties) {
      const isArr = a.subtype === 'array';
      const inner = a.preview.properties.map((p) => (isArr ? '' : p.name + ': ') + (p.type === 'string' ? JSON.stringify(p.value) : p.value)).join(', ');
      return (isArr ? '' : (a.className && a.className !== 'Object' ? a.className + ' ' : '')) + (isArr ? '[' : '{') + inner + (a.preview.overflow ? ', …' : '') + (isArr ? ']' : '}');
    }
    return a.description || a.className || a.type;
  };
  function addMsg(l, msg) {
    l.console.push(msg);
    if (l.console.length > 1500) l.console.splice(0, l.console.length - 1500);
    if (msg.level === 'error') l.errors++;
  }
  function renderConsole() {
    if (DL.tool !== 'console') return;
    const el = DL.body; const l = DL.log();
    const shown = l.console.filter((m) => C.filter === 'all' || (C.filter === 'error' ? m.level === 'error' : C.filter === 'warn' ? m.level === 'warn' : m.level !== 'error' && m.level !== 'warn'));
    const counts = { error: l.console.filter((m) => m.level === 'error').length, warn: l.console.filter((m) => m.level === 'warn').length };
    const keep = el.querySelector('#co-in'); const draft = keep ? keep.value : C.draft;
    el.innerHTML = `<div class="dl-toolbar">
        <div class="dl-seg">${[['all', 'All'], ['error', `❌ Errors ${counts.error}`], ['warn', `⚠️ Warnings ${counts.warn}`], ['log', '💬 Messages']].map(([k, n]) => `<button data-f="${k}" class="${C.filter === k ? 'on' : ''}">${n}</button>`).join('')}</div>
        <button class="dl-btn ghost small" id="co-clear">🧹 Clear</button>
        <span class="grow"></span>
        <span class="co-snips">${DL.kid ? '<span class="muted">Try:</span>' : ''}${SNIPS.map(([n], k) => `<button class="dl-chip" data-s="${k}">${E(n)}</button>`).join('')}</span>
      </div>
      <div class="co-list" id="co-list">${shown.length ? shown.slice(-400).map((m, k) => {
        const ex = m.level === 'error' || m.level === 'warn' ? explainErr(m.text) : null;
        return `<div class="co-msg ${m.level}${m.kind === 'in' ? ' in' : ''}${m.kind === 'out' ? ' out' : ''}"><span class="ic">${m.kind === 'in' ? '›' : m.kind === 'out' ? '‹' : m.level === 'error' ? '❌' : m.level === 'warn' ? '⚠️' : m.level === 'info' ? 'ℹ️' : '💬'}</span><div class="tx">${m.objectId ? `<button class="co-obj" data-oid="${E(m.objectId)}">▶ ${E(m.text)}</button>` : `<span>${E(m.text)}</span>`}${ex && DL.kid ? `<div class="co-ex">💡 ${ex}</div>` : ''}<div class="co-kids"></div></div>${m.src ? `<span class="src" title="${E(m.src)}">${E(m.src.split('/').pop().slice(0, 40))}</span>` : ''}</div>`;
      }).join('') : `<div class="dl-empty">${DL.kid ? 'The console is where a page writes messages — and where <b>you</b> can talk to the page in JavaScript. Type below and press Enter, or try one of the buttons above. ✨' : 'No messages.'}</div>`}</div>
      <div class="co-input"><span>›</span><textarea id="co-in" rows="1" spellcheck="false" placeholder="${DL.kid ? 'Type JavaScript here — try:  document.title  or  2 + 2  — then press Enter' : 'Evaluate JavaScript'}"></textarea><button class="dl-btn primary small" id="co-run">Run ▶</button></div>`;
    const list = el.querySelector('#co-list'); list.scrollTop = list.scrollHeight;
    const inp = el.querySelector('#co-in'); inp.value = draft;
    el.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { C.filter = b.dataset.f; renderConsole(); }));
    el.querySelector('#co-clear').onclick = () => { l.console = []; l.errors = 0; DL.cmd('Runtime.releaseObjectGroup', { objectGroup: 'console' }).catch(() => {}); renderConsole(); DL.renderTabs(); };
    el.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => run(SNIPS[+b.dataset.s][1])));
    el.querySelector('#co-run').onclick = () => run(inp.value);
    inp.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); run(inp.value); }
      else if (e.key === 'ArrowUp' && !inp.value.includes('\n') && C.hist.length) { e.preventDefault(); C.hi = Math.min(C.hist.length - 1, C.hi + 1); inp.value = C.hist[C.hist.length - 1 - C.hi]; }
      else if (e.key === 'ArrowDown' && C.hi >= 0) { e.preventDefault(); C.hi--; inp.value = C.hi < 0 ? '' : C.hist[C.hist.length - 1 - C.hi]; }
    };
    inp.oninput = () => { inp.style.height = 'auto'; inp.style.height = Math.min(140, inp.scrollHeight) + 'px'; C.draft = inp.value; };
    el.querySelectorAll('.co-obj').forEach((b) => (b.onclick = () => expand(b)));
    setTimeout(() => inp.focus(), 0);
  }
  async function expand(btn) {
    const kids = btn.parentElement.querySelector('.co-kids');
    if (kids.innerHTML) { kids.innerHTML = ''; btn.textContent = btn.textContent.replace('▼', '▶'); return; }
    btn.textContent = btn.textContent.replace('▶', '▼');
    try {
      const r = await DL.cmd('Runtime.getProperties', { objectId: btn.dataset.oid, ownProperties: true, generatePreview: true });
      kids.innerHTML = r.result.filter((p) => p.enumerable || p.name === 'length').slice(0, 200).map((p) => {
        const v = p.value || {};
        return `<div class="co-prop"><span class="k">${E(p.name)}</span>: ${v.objectId ? `<button class="co-obj" data-oid="${E(v.objectId)}">▶ ${E(fmtArg(v))}</button><div class="co-kids"></div>` : `<span class="v ${E(v.type)}">${E(v.type === 'string' ? JSON.stringify(v.value) : fmtArg(v))}</span>`}</div>`;
      }).join('') || '<div class="co-prop muted">(empty)</div>';
      kids.querySelectorAll('.co-obj').forEach((b) => (b.onclick = () => expand(b)));
    } catch (e) { kids.textContent = e.message; }
  }
  const SNIPS = [
    ['👋 Say hello', "console.log('Hello! This page is called: ' + document.title)"],
    ['🔢 Count links', "document.querySelectorAll('a').length + ' links on this page'"],
    ['🖼️ Count pictures', "document.images.length + ' pictures on this page'"],
    ['🙃 Upside down', "document.documentElement.style.transform = document.documentElement.style.transform ? '' : 'rotate(180deg)'; 'Flipped!'"],
    ['🌈 Rainbow', "(() => { const s = document.createElement('style'); s.textContent = '@keyframes nr{to{filter:hue-rotate(360deg)}} html{animation:nr 3s linear infinite}'; document.head.append(s); return 'Rainbow mode on! Reload to stop.'; })()"],
    ['🤡 Comic Sans', "(() => { const s = document.createElement('style'); s.textContent = '*{font-family:\"Comic Sans MS\",\"Comic Neue\",cursive!important}'; document.head.append(s); return 'Everything is Comic Sans now 😄'; })()"],
    ['🎈 Floating pictures', "(() => { [...document.images].forEach((im, i) => im.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-30px)' }], { duration: 900 + i * 50, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' })); return document.images.length + ' pictures are floating'; })()"],
    ['🧮 Do maths', '12 * 34 + 56'],
  ];
  async function run(code) {
    code = String(code || '').trim(); if (!code || !DL.wcId) return;
    const l = DL.log();
    C.hist.push(code); C.hi = -1; C.draft = '';
    addMsg(l, { kind: 'in', level: 'log', text: code });
    try {
      const r = await DL.cmd('Runtime.evaluate', { expression: code, replMode: true, includeCommandLineAPI: true, awaitPromise: true, generatePreview: true, userGesture: true, objectGroup: 'console' });
      if (r.exceptionDetails) addMsg(l, { kind: 'out', level: 'error', text: (r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text });
      else addMsg(l, { kind: 'out', level: 'log', text: r.result.type === 'string' ? JSON.stringify(r.result.value) : fmtArg(r.result), objectId: r.result.objectId && r.result.type === 'object' && r.result.subtype !== 'null' ? r.result.objectId : null });
      DL.mission('console');
    } catch (e) { addMsg(l, { kind: 'out', level: 'error', text: e.message }); }
    const inp = DL.body.querySelector('#co-in'); if (inp) inp.value = '';
    renderConsole(); DL.renderTabs();
  }
  DL.handlers.console = {
    render: renderConsole,
    event(method, p, l, isCur) {
      if (method === 'Runtime.consoleAPICalled') {
        const level = p.type === 'error' || p.type === 'assert' ? 'error' : p.type === 'warning' ? 'warn' : p.type === 'info' ? 'info' : 'log';
        if (p.type === 'clear') { l.console = []; l.errors = 0; }
        else { const f = p.stackTrace && p.stackTrace.callFrames[0]; addMsg(l, { level, text: p.args.map(fmtArg).join(' ').slice(0, 5000), src: f ? f.url + ':' + (f.lineNumber + 1) : '', objectId: p.args.length === 1 && p.args[0].objectId && p.args[0].type === 'object' ? p.args[0].objectId : null }); }
      } else if (method === 'Runtime.exceptionThrown') {
        const d = p.exceptionDetails; addMsg(l, { level: 'error', text: ((d.exception && d.exception.description) || d.text || 'Error').slice(0, 5000), src: d.url ? d.url + ':' + (d.lineNumber + 1) : '' });
      } else if (method === 'Log.entryAdded') {
        const e = p.entry; if (e.source === 'violation' || e.source === 'intervention' && e.level === 'verbose') return;
        addMsg(l, { level: e.level === 'error' ? 'error' : e.level === 'warning' ? 'warn' : 'info', text: (e.text + (e.url && !e.text.includes(e.url) ? ' ' + e.url : '')).slice(0, 3000), src: e.url || '' });
      } else if (method === 'Page.frameNavigated' && !p.frame.parentId) { addMsg(l, { level: 'info', text: '— Went to ' + p.frame.url + ' —' }); l.errors = 0; }
      else return;
      if (isCur && DL.tool === 'console') { clearTimeout(C.t); C.t = setTimeout(renderConsole, 120); }
    },
  };

  // ================================================================ NETWORK
  const N = { filter: 'all', q: '', sel: null };
  const TYPES = { Document: ['📄', 'page'], Script: ['📜', 'script'], Stylesheet: ['🎨', 'style'], Image: ['🖼️', 'image'], Font: ['🔤', 'font'], XHR: ['📡', 'data'], Fetch: ['📡', 'data'], Media: ['🎬', 'media'], WebSocket: ['🔌', 'data'], Manifest: ['📋', 'other'], Other: ['📦', 'other'], Ping: ['📍', 'other'], Preflight: ['✈️', 'other'] };
  const STATUS = (s) => !s ? '' : s < 300 ? '✅ OK' : s < 400 ? (s === 304 ? '♻️ Already had it' : '↪️ Moved') : s === 404 ? '❓ Not found' : s === 403 ? '⛔ Not allowed' : s < 500 ? '⚠️ Problem' : '💥 Server error';
  const STATUS_KID = { 200: '200 means “OK — here you go!”', 204: '204 means “OK, but there was nothing to send.”', 301: '301 means “this moved to a new address forever.”', 302: '302 means “look over there for now.”', 304: '304 means “you already have this saved, use your copy.” (Faster!)', 400: '400 means the request didn’t make sense to the server.', 401: '401 means “you need to sign in first.”', 403: '403 means “you’re not allowed to see this.”', 404: '404 means “not found” — the file isn’t there.', 429: '429 means “slow down, too many requests!”', 500: '500 means the server broke while answering.', 503: '503 means the server is too busy or down.' };
  const host = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
  function renderNet() {
    if (DL.tool !== 'network') return;
    const el = DL.body; const l = DL.log();
    const all = l.order.map((id) => l.requests.get(id)).filter(Boolean);
    const cat = (r) => r.blocked ? 'blocked' : (TYPES[r.type] || TYPES.Other)[1];
    const shown = all.filter((r) => (N.filter === 'all' || cat(r) === N.filter) && (!N.q || r.url.toLowerCase().includes(N.q.toLowerCase())));
    const bytes = all.reduce((a, r) => a + (r.size || 0), 0);
    const blocked = all.filter((r) => r.blocked).length;
    const hosts = {}; for (const r of all) { const h = host(r.url); if (h) hosts[h] = (hosts[h] || 0) + 1; }
    const t0 = l.firstTs || (all[0] && all[0].start) || 0; const tEnd = Math.max(t0 + 0.001, ...all.map((r) => r.end || r.start || t0));
    const span = tEnd - t0;
    const keepQ = el.querySelector('#nw-q') && document.activeElement === el.querySelector('#nw-q');
    el.innerHTML = `<div class="dl-toolbar">
      <div class="dl-seg">${[['all', 'All'], ['page', '📄 Pages'], ['script', '📜 Scripts'], ['style', '🎨 Styles'], ['image', '🖼️ Pictures'], ['data', '📡 Data'], ['font', '🔤 Fonts'], ['media', '🎬 Media'], ['blocked', `🛡️ Blocked ${blocked}`]].map(([k, n]) => `<button data-f="${k}" class="${N.filter === k ? 'on' : ''}">${n}</button>`).join('')}</div>
      <input class="dl-input" id="nw-q" placeholder="🔎 Filter" value="${E(N.q)}">
      <span class="grow"></span>
      <select class="dl-input" id="nw-speed" title="Pretend the internet is slow"><option value="">🚀 Normal internet</option><option value="fast3g">🚗 Phone internet (4 Mbps)</option><option value="slow3g">🐢 Slow internet (400 kbps)</option><option value="offline">✈️ Offline</option></select>
      <button class="dl-btn small" id="nw-reload">🔄 Reload page</button><button class="dl-btn ghost small" id="nw-clear">🧹</button>
    </div>
    <div class="nw-sum">📦 <b>${all.length}</b> files · <b>${DL.fmtBytes(bytes)}</b> · from <b>${Object.keys(hosts).length}</b> websites${blocked ? ` · 🛡️ <b>${blocked}</b> ads &amp; trackers blocked` : ''}${l.loadTime ? ` · ⏱️ loaded in <b>${DL.fmtMs(l.loadTime)}</b>` : ''}
      ${DL.kid ? '<span class="dl-explain inline">💡 A web page isn’t one file — it’s lots of little files (pictures, styles, scripts) downloaded from many places.</span>' : ''}</div>
    <div class="nw-split${N.sel ? ' has-sel' : ''}">
      <div class="nw-table"><div class="nw-row head"><span></span><span>Name</span><span>Website</span><span>Status</span><span>Size</span><span>Time</span><span class="wf">Timeline</span></div>
        ${shown.length ? shown.slice(-600).map((r) => { const [ic] = TYPES[r.type] || TYPES.Other; const st = r.blocked ? '🛡️ Blocked' : r.failed ? '💥 Failed' : STATUS(r.status) || '⏳';
          const a = span ? ((r.start - t0) / span) * 100 : 0, w = span ? Math.max(0.6, (((r.end || tEnd) - r.start) / span) * 100) : 1;
          return `<div class="nw-row${N.sel === r.id ? ' sel' : ''}${r.blocked ? ' blocked' : r.failed || r.status >= 400 ? ' bad' : ''}" data-id="${E(r.id)}"><span>${ic}</span><span class="nm" title="${E(r.url)}">${E(r.name)}</span><span class="hs">${E(host(r.url))}</span><span>${E(st)}${r.status && !r.blocked ? ` <small>${r.status}</small>` : ''}</span><span>${r.cached ? '<small>saved</small>' : DL.fmtBytes(r.size)}</span><span>${r.end ? DL.fmtMs((r.end - r.start) * 1000) : '…'}</span><span class="wf"><i style="left:${a}%;width:${Math.min(100 - a, w)}%"></i></span></div>`; }).join('')
        : `<div class="dl-empty">${all.length ? 'Nothing matches.' : 'No files yet. <button class="dl-link" id="nw-reload2">Reload the page</button> to watch it download everything.'}</div>`}
      </div>
      ${N.sel ? `<div class="nw-detail" id="nw-detail"></div>` : ''}
    </div>
    <div class="nw-hosts">${Object.entries(hosts).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([h, n]) => `<span class="dl-chip${h === host(DL.tab && DL.tab.url) ? ' own' : ''}" data-h="${E(h)}">${E(h)} <b>${n}</b></span>`).join('')}</div>`;
    const q = el.querySelector('#nw-q'); q.oninput = () => { N.q = q.value; renderNet(); }; q.onkeydown = (e) => e.stopPropagation(); if (keepQ) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    el.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { N.filter = b.dataset.f; renderNet(); }));
    el.querySelectorAll('[data-h]').forEach((b) => (b.onclick = () => { N.q = b.dataset.h; renderNet(); }));
    const reload = () => { l.requests.clear(); l.order = []; l.firstTs = 0; l.loadTime = 0; N.sel = null; DL.tab.wv.reloadIgnoringCache(); renderNet(); };
    el.querySelector('#nw-reload').onclick = reload; const r2 = el.querySelector('#nw-reload2'); if (r2) r2.onclick = reload;
    el.querySelector('#nw-clear').onclick = () => { l.requests.clear(); l.order = []; l.firstTs = 0; N.sel = null; renderNet(); DL.renderTabs(); };
    const sp = el.querySelector('#nw-speed'); sp.value = N.speed || '';
    sp.onchange = () => {
      N.speed = sp.value;
      const c = { '': { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, fast3g: { offline: false, latency: 150, downloadThroughput: 500000, uploadThroughput: 200000 }, slow3g: { offline: false, latency: 400, downloadThroughput: 50000, uploadThroughput: 20000 }, offline: { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 } }[sp.value];
      DL.cmd('Network.emulateNetworkConditions', c).then(() => toast(sp.value ? 'Pretending: ' + sp.options[sp.selectedIndex].text + ' — reload to feel it' : 'Normal internet again')).catch((e) => toast(e.message));
    };
    el.querySelectorAll('.nw-row[data-id]').forEach((row) => (row.onclick = () => { N.sel = N.sel === row.dataset.id ? null : row.dataset.id; renderNet(); }));
    if (N.sel) detail(l.requests.get(N.sel));
    if (all.length >= 5) DL.mission('network');
  }
  async function detail(r) {
    const box = DL.body.querySelector('#nw-detail'); if (!box || !r) return;
    const hdrs = (h) => Object.entries(h || {}).slice(0, 60).map(([k, v]) => `<tr><td>${E(k)}</td><td>${E(String(v).slice(0, 400))}</td></tr>`).join('');
    box.innerHTML = `<div class="nw-dh"><b>${E(r.name)}</b><button class="icon-btn small" id="nw-x"><svg><use href="#i-close"/></svg></button></div>
      <div class="nw-url">${E(r.method || 'GET')} ${E(r.url)}</div>
      ${r.blocked ? DL.explain('🛡️ NoamBrowser blocked this before it could load. It was on a list of ads or trackers.') : ''}
      ${r.status && DL.kid ? DL.explain(STATUS_KID[r.status] || `Status ${r.status}: ${E(r.statusText || '')}`) : ''}
      <div class="nw-meta">${r.mime ? `<span>Type: <b>${E(r.mime)}</b></span>` : ''}${r.size ? `<span>Size: <b>${DL.fmtBytes(r.size)}</b></span>` : ''}${r.ip ? `<span>Server: <b>${E(r.ip)}</b></span>` : ''}${r.protocol ? `<span>Protocol: <b>${E(r.protocol)}</b></span>` : ''}</div>
      <div class="nw-prev" id="nw-prev"></div>
      <details><summary>Response headers</summary><table class="nw-h">${hdrs(r.resHeaders)}</table></details>
      <details><summary>Request headers</summary><table class="nw-h">${hdrs(r.reqHeaders)}</table></details>
      <div class="dl-row"><button class="dl-btn small" id="nw-open">Open in new tab</button><button class="dl-btn small" id="nw-copy">Copy address</button></div>`;
    box.querySelector('#nw-x').onclick = () => { N.sel = null; renderNet(); };
    box.querySelector('#nw-open').onclick = () => newTab({ url: r.url });
    box.querySelector('#nw-copy').onclick = () => DL.copy(r.url);
    if (!r.end || r.blocked || r.failed) return;
    try {
      const b = await DL.cmd('Network.getResponseBody', { requestId: r.id });
      const prev = box.querySelector('#nw-prev'); if (!prev) return;
      if (/^image\//.test(r.mime)) prev.innerHTML = `<img src="data:${E(r.mime)};base64,${b.base64Encoded ? b.body : btoa(unescape(encodeURIComponent(b.body)))}" alt="">`;
      else if (/json/.test(r.mime)) { let t = b.base64Encoded ? atob(b.body) : b.body; try { t = JSON.stringify(JSON.parse(t), null, 2); } catch {} prev.innerHTML = `<pre>${E(t.slice(0, 20000))}</pre>`; }
      else if (!b.base64Encoded) prev.innerHTML = `<pre>${E(b.body.slice(0, 20000))}${b.body.length > 20000 ? '\n…' : ''}</pre>`;
      else prev.innerHTML = `<span class="muted">${DL.fmtBytes(b.body.length * 0.75)} of ${E(r.mime || 'data')}</span>`;
    } catch { const prev = box.querySelector('#nw-prev'); if (prev) prev.innerHTML = '<span class="muted">No preview available.</span>'; }
  }
  DL.handlers.network = {
    render: renderNet,
    event(method, p, l, isCur) {
      const R = l.requests; let r;
      if (method === 'Network.requestWillBeSent') {
        if (!l.firstTs) l.firstTs = p.timestamp;
        let name; try { const u = new URL(p.request.url); name = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || u.hostname) + (u.search.length > 1 && u.search.length < 30 ? u.search : ''); } catch { name = p.request.url.slice(0, 60); }
        if (/^data:/.test(p.request.url)) return;
        r = R.get(p.requestId);
        if (!r) { r = { id: p.requestId }; R.set(p.requestId, r); l.order.push(p.requestId); if (l.order.length > 3000) R.delete(l.order.shift()); }
        Object.assign(r, { url: p.request.url, name: name.slice(0, 90), method: p.request.method, type: p.type || 'Other', start: p.timestamp, reqHeaders: p.request.headers, loaderId: p.loaderId });
      } else if (method === 'Network.responseReceived') {
        r = R.get(p.requestId); if (!r) return;
        Object.assign(r, { status: p.response.status, statusText: p.response.statusText, mime: p.response.mimeType, resHeaders: p.response.headers, ip: p.response.remoteIPAddress, protocol: p.response.protocol, cached: p.response.fromDiskCache, type: p.type || r.type });
      } else if (method === 'Network.loadingFinished') {
        r = R.get(p.requestId); if (!r) return; r.end = p.timestamp; r.size = p.encodedDataLength;
      } else if (method === 'Network.loadingFailed') {
        r = R.get(p.requestId); if (!r) return; r.end = p.timestamp; r.failed = true; r.error = p.errorText; r.blocked = /BLOCKED_BY_CLIENT/.test(p.errorText || '') || p.blockedReason === 'inspector' || p.blockedReason === 'other';
      } else if (method === 'Page.loadEventFired') { l.loadTime = l.firstTs ? (p.timestamp - l.firstTs) * 1000 : 0; }
      else if (method === 'Page.frameNavigated' && !p.frame.parentId) {
        // new page: forget the old page's files (like a fresh Network panel)
        const keep = l.order.filter((id) => { const x = R.get(id); return x && x.loaderId === p.frame.loaderId; });
        for (const id of l.order) if (!keep.includes(id)) R.delete(id);
        l.order = keep; const first = keep.length && R.get(keep[0]); l.firstTs = first ? first.start : 0; l.loadTime = 0;
      }
      else return;
      if (isCur && DL.tool === 'network') { clearTimeout(N.t); N.t = setTimeout(renderNet, 250); }
    },
  };
})();
