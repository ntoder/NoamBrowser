// Dev Lab — 3D view: pulls the page apart into layers so you can see how boxes sit inside boxes.
// (Firefox used to have this; it was removed in 2016. Chrome never had it.)
'use strict';
(() => {
  DL.TOOLS.push(['3d', '🧊', '3D view', '3D View']);
  DL.MISSIONS.push(['3d', 'Spin a page around in 🧊 3D view']);
  if (DL.CARD_TEXT) DL.CARD_TEXT['3d'] = 'Pull the page apart into layers and spin it around';
  const E = dlEsc;
  const S = { on: false, gap: 22, labels: true, color: 'depth' };

  // Runs inside the page. Builds the 3D scene in a closed shadow root so the page's own CSS can't touch it.
  const SCENE = (opts) => `(() => {
    const o = ${JSON.stringify(opts)};
    const old = document.getElementById('__noam3d'); if (old) old.remove();
    if (!o.on) { document.documentElement.style.removeProperty('overflow'); return { off: true }; }
    const host = document.createElement('div'); host.id = '__noam3d';
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;all:initial;position:fixed;inset:0;z-index:2147483647';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = '<style>' +
      ':host{all:initial}.wrap{position:fixed;inset:0;background:radial-gradient(circle at 50% 40%,#2a2350,#0c0a1a);perspective:1600px;overflow:hidden;cursor:grab;font:12px system-ui,sans-serif}' +
      '.wrap.drag{cursor:grabbing}.stage{position:absolute;left:0;top:0;transform-style:preserve-3d;transform-origin:50% 50%}' +
      '.p{position:absolute;box-sizing:border-box;transform-style:preserve-3d;border:1px solid;border-radius:2px;transition:background .15s}' +
      '.p:hover{background:rgba(255,255,255,.35)!important;outline:2px solid #fff}' +
      '.tip{position:fixed;pointer-events:none;background:#111;color:#fff;padding:6px 9px;border-radius:8px;font-weight:600;max-width:320px;box-shadow:0 6px 20px rgba(0,0,0,.4);display:none}' +
      '.tip b{color:#ffd84d}.hint{position:fixed;left:50%;top:14px;transform:translateX(-50%);color:#fff;background:rgba(0,0,0,.55);padding:7px 14px;border-radius:999px;font-weight:600;pointer-events:none}' +
      '.lab{position:absolute;left:2px;top:1px;font:600 10px system-ui;color:#fff;text-shadow:0 1px 2px #000;white-space:nowrap;pointer-events:none}' +
      '</style><div class="wrap"><div class="stage"></div><div class="tip"></div><div class="hint">🖱️ Drag to spin · scroll to zoom · Esc to go back</div></div>';
    const wrap = root.querySelector('.wrap'), stage = root.querySelector('.stage'), tip = root.querySelector('.tip');
    const W = innerWidth, H = innerHeight;
    stage.style.width = W + 'px'; stage.style.height = H + 'px';
    const NAMES = ${JSON.stringify({ div: 'a box', p: 'a paragraph', a: 'a link', img: 'a picture', button: 'a button', h1: 'the biggest heading', h2: 'a big heading', h3: 'a heading', ul: 'a list', ol: 'a numbered list', li: 'a list item', nav: 'the menu', header: 'the top part', footer: 'the bottom part', main: 'the main part', section: 'a section', article: 'an article', span: 'a bit of text', input: 'a box to type in', form: 'a form', table: 'a table', video: 'a video', svg: 'a drawing', iframe: 'a page inside the page', label: 'a label', aside: 'a side part' })};
    let count = 0, maxDepth = 0;
    const planes = [];
    const walk = (el, depth) => {
      if (count > 1800 || el.id === '__noam3d') return;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      if (r.width > 1 && r.height > 1 && r.bottom > -H && r.top < H * 2 && r.right > 0 && r.left < W) { planes.push([el, r, depth]); count++; maxDepth = Math.max(maxDepth, depth); }
      for (const c of el.children) walk(c, depth + 1);
    };
    walk(document.body || document.documentElement, 0);
    const kinds = { img: 30, picture: 30, svg: 30, video: 30, a: 200, button: 200, input: 200, select: 200, textarea: 200, p: 120, span: 120, h1: 0, h2: 0, h3: 0, h4: 0, li: 160, ul: 160, ol: 160 };
    for (const [el, r, depth] of planes) {
      const d = document.createElement('div'); d.className = 'p';
      const tag = el.tagName.toLowerCase();
      const hue = o.color === 'type' ? (kinds[tag] ?? 260) : (260 + depth * 37) % 360;
      d.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;transform:translateZ(' + depth * o.gap + 'px);background:hsla(' + hue + ',80%,60%,.13);border-color:hsla(' + hue + ',90%,70%,.75)';
      if (o.labels && r.width > 60 && r.height > 14 && depth > 0) { const l = document.createElement('span'); l.className = 'lab'; l.textContent = tag + (el.id ? '#' + el.id : ''); d.appendChild(l); }
      d.onmousemove = (ev) => {
        ev.stopPropagation();
        const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
        tip.innerHTML = '<b>&lt;' + tag + '&gt;</b>' + (el.id ? ' #' + el.id : '') + cls + '<br>' + (NAMES[tag] ? 'This is ' + NAMES[tag] + '. ' : '') + 'Layer ' + depth + ' · ' + Math.round(r.width) + ' × ' + Math.round(r.height) + ' px';
        tip.style.display = 'block'; tip.style.left = Math.min(ev.clientX + 14, innerWidth - 330) + 'px'; tip.style.top = (ev.clientY + 14) + 'px';
      };
      stage.appendChild(d);
    }
    wrap.onmouseleave = () => (tip.style.display = 'none');
    let rx = 35, ry = -25, zoom = 0.75, dragging = null;
    const apply = () => { stage.style.transform = 'translate(' + 0 + 'px,0) scale(' + zoom + ') rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) translateZ(' + (-maxDepth * o.gap / 2) + 'px)'; };
    stage.style.transition = 'transform .7s cubic-bezier(.2,.8,.2,1)'; stage.style.transform = 'scale(1) rotateX(0) rotateY(0)';
    requestAnimationFrame(() => requestAnimationFrame(() => { apply(); setTimeout(() => (stage.style.transition = ''), 750); }));
    wrap.onpointerdown = (e) => { dragging = [e.clientX, e.clientY, rx, ry]; wrap.classList.add('drag'); wrap.setPointerCapture(e.pointerId); };
    wrap.onpointermove = (e) => { if (!dragging) return; ry = dragging[3] + (e.clientX - dragging[0]) / 3; rx = Math.max(-85, Math.min(85, dragging[2] - (e.clientY - dragging[1]) / 3)); apply(); };
    wrap.onpointerup = () => { dragging = null; wrap.classList.remove('drag'); };
    wrap.onwheel = (e) => { e.preventDefault(); zoom = Math.max(0.2, Math.min(3, zoom * (e.deltaY < 0 ? 1.1 : 0.9))); apply(); };
    const esc = (e) => { if (e.key === 'Escape') { host.remove(); removeEventListener('keydown', esc, true); } };
    addEventListener('keydown', esc, true);
    window.__noam3dView = (cmd) => { if (cmd === 'reset') { rx = 35; ry = -25; zoom = 0.75; } if (cmd === 'front') { rx = 0; ry = 0; zoom = 0.9; } if (cmd === 'side') { rx = 0; ry = -80; zoom = 0.75; } if (cmd === 'top') { rx = 80; ry = 0; zoom = 0.75; } stage.style.transition = 'transform .6s cubic-bezier(.2,.8,.2,1)'; apply(); setTimeout(() => (stage.style.transition = ''), 650); };
    document.body.appendChild(host);
    return { count, maxDepth };
  })()`;

  async function build() {
    try { const r = await DL.eval(SCENE(S)); S.info = r; if (S.on) DL.mission('3d'); } catch (e) { toast(e.message); S.on = false; }
    render3d();
  }
  function render3d() {
    const el = DL.body;
    el.innerHTML = `<div class="d3">
      <div class="d3-hero"><div class="d3-cube">🧊</div><div>
        <h3>${DL.kid ? 'See the page in 3D' : '3D View'}</h3>
        ${DL.kid ? '<p>Every web page is made of boxes inside boxes inside boxes. 3D view pulls them apart into layers, like a stack of see-through cards, so you can see how the page is built. Boxes on higher layers are inside the ones below them.</p>' : '<p>Exploded view of the DOM: each element is a plane offset by its nesting depth.</p>'}
        <div class="dl-row"><button class="dl-btn ${S.on ? '' : 'primary pulse'}" id="d3-go">${S.on ? '⏹️ Back to normal' : '🧊 Show this page in 3D'}</button>
        ${S.on ? '<button class="dl-btn small" data-v="reset">↺ Angle</button><button class="dl-btn small" data-v="front">⬜ Front</button><button class="dl-btn small" data-v="side">◧ Side</button><button class="dl-btn small" data-v="top">⬒ Top</button>' : ''}</div>
        ${S.on && S.info ? `<p class="muted">${S.info.count} boxes, ${S.info.maxDepth} layers deep. ${S.info.maxDepth > 15 ? 'That’s a <b>lot</b> of layers — big websites often nest boxes very deep.' : ''}</p>` : ''}
      </div></div>
      <div class="d3-opts">
        <label>↕️ Space between layers <input type="range" id="d3-gap" min="6" max="60" value="${S.gap}"> <b>${S.gap}px</b></label>
        <label><input type="checkbox" id="d3-lab" ${S.labels ? 'checked' : ''}> Show names on boxes</label>
        <label>🎨 Colour by <select id="d3-col"><option value="depth" ${S.color === 'depth' ? 'selected' : ''}>how deep it is</option><option value="type" ${S.color === 'type' ? 'selected' : ''}>what kind of thing it is</option></select></label>
      </div>
      ${S.color === 'type' && DL.kid ? '<div class="d3-legend"><span style="--h:30">pictures</span><span style="--h:200">links &amp; buttons</span><span style="--h:120">text</span><span style="--h:0">headings</span><span style="--h:160">lists</span><span style="--h:260">boxes</span></div>' : ''}
      ${DL.kid ? DL.explain('Tip: hover over a layer to see what it is. Press <b>Esc</b> on the page to get out of 3D.') : ''}
    </div>`;
    el.querySelector('#d3-go').onclick = () => { S.on = !S.on; build(); };
    el.querySelectorAll('[data-v]').forEach((b) => (b.onclick = () => DL.eval(`window.__noam3dView && window.__noam3dView(${JSON.stringify(b.dataset.v)})`).catch(() => {})));
    el.querySelector('#d3-gap').oninput = (e) => { S.gap = +e.target.value; e.target.nextElementSibling.textContent = S.gap + 'px'; };
    el.querySelector('#d3-gap').onchange = () => S.on && build();
    el.querySelector('#d3-lab').onchange = (e) => { S.labels = e.target.checked; if (S.on) build(); };
    el.querySelector('#d3-col').onchange = (e) => { S.color = e.target.value; S.on ? build() : render3d(); };
  }
  DL.handlers['3d'] = {
    render: render3d,
    leave() { if (S.on) { S.on = false; DL.eval(SCENE(S)).catch(() => {}); } },
    detach() { S.on = false; },
    event(m, p, _l, isCur) { if (isCur && m === 'Page.frameNavigated' && !p.frame.parentId) { S.on = false; if (DL.tool === '3d') render3d(); } },
  };
})();
