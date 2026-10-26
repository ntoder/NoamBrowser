// Screenshot editor: arrows, boxes, pen, highlighter, text, blur, crop.
(async () => {
  await noamReady;
  const id = new URLSearchParams(location.search).get('id');
  const shot = id ? await noam.invoke('screenshot:get', id).catch(() => null) : null;
  if (!shot) { $('#stage').innerHTML = '<div class="empty-shot"><b>This screenshot is gone</b><br>Screenshots are kept until you close the browser. Take a new one with Ctrl+Shift+X.</div>'; $$('.bar button').forEach((b) => (b.disabled = true)); return; }
  document.title = 'Screenshot — ' + (shot.title || 'page');
  $('#meta').textContent = shot.title || shot.url;
  $('#meta').title = shot.url;

  const COLORS = ['#E5484D', '#EE7A2E', '#F5C518', '#3FAE5A', '#3E8DEB', '#7C68FA', '#111111', '#FFFFFF'];
  let color = COLORS[0], tool = 'arrow';
  $('#colors').innerHTML = COLORS.map((c, i) => `<button class="sw${i ? '' : ' on'}" data-c="${c}" style="background:${c}" title="${c}"></button>`).join('');
  $$('.sw').forEach((b) => (b.onclick = () => { color = b.dataset.c; $$('.sw').forEach((x) => x.classList.toggle('on', x === b)); }));
  const setTool = (t) => { commitText(); tool = t; $$('.tool[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === t)); cv.style.cursor = t === 'text' ? 'text' : 'crosshair'; };
  $$('.tool[data-t]').forEach((b) => (b.onclick = () => setTool(b.dataset.t)));

  const load = (src) => new Promise((r, j) => { const im = new Image(); im.onload = () => r(im); im.onerror = j; im.src = src; });
  let base;
  if (shot.tiles) { // full-page shots arrive as pieces: stitch them
    base = document.createElement('canvas'); base.width = shot.width; base.height = shot.height;
    const bctx = base.getContext('2d');
    for (const t of shot.tiles) bctx.drawImage(await load(t.dataUrl), 0, t.y);
    base.naturalWidth = base.width; base.naturalHeight = base.height;
  } else base = await load(shot.dataUrl);
  const cv = $('#cv'), ctx = cv.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  // state: a list of operations replayed over the base image, plus an optional crop
  let ops = [], redo = [], crop = null, draft = null;
  const W = () => (crop ? crop.w : base.naturalWidth), H = () => (crop ? crop.h : base.naturalHeight);
  function size() { cv.width = W(); cv.height = H(); cv.style.width = W() / dpr + 'px'; cv.style.height = H() / dpr + 'px'; }

  function drawArrow(c, o) {
    const lw = Math.max(3, 4 * dpr); const head = lw * 4.2;
    const ang = Math.atan2(o.y2 - o.y1, o.x2 - o.x1);
    c.strokeStyle = c.fillStyle = o.color; c.lineWidth = lw; c.lineCap = 'round';
    c.beginPath(); c.moveTo(o.x1, o.y1); c.lineTo(o.x2 - Math.cos(ang) * head * .7, o.y2 - Math.sin(ang) * head * .7); c.stroke();
    c.beginPath(); c.moveTo(o.x2, o.y2);
    c.lineTo(o.x2 - head * Math.cos(ang - .45), o.y2 - head * Math.sin(ang - .45));
    c.lineTo(o.x2 - head * Math.cos(ang + .45), o.y2 - head * Math.sin(ang + .45)); c.closePath(); c.fill();
  }
  function rectOf(o) { return { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) }; }
  function drawOp(c, o) {
    c.save();
    if (o.t === 'arrow') drawArrow(c, o);
    else if (o.t === 'box') { const r = rectOf(o); c.strokeStyle = o.color; c.lineWidth = Math.max(3, 3 * dpr); c.lineJoin = 'round'; c.beginPath(); c.roundRect(r.x, r.y, r.w, r.h, 6 * dpr); c.stroke(); }
    else if (o.t === 'pen' || o.t === 'mark') {
      c.strokeStyle = o.color; c.lineCap = c.lineJoin = 'round';
      if (o.t === 'mark') { c.globalAlpha = .38; c.lineWidth = 18 * dpr; c.globalCompositeOperation = 'multiply'; } else c.lineWidth = Math.max(3, 3.5 * dpr);
      c.beginPath(); o.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
    } else if (o.t === 'text') {
      c.font = `800 ${o.size}px Manrope, system-ui, sans-serif`; c.textBaseline = 'top';
      c.lineWidth = o.size / 5; c.strokeStyle = o.color === '#FFFFFF' || o.color === '#F5C518' ? 'rgba(0,0,0,.75)' : 'rgba(255,255,255,.9)'; c.lineJoin = 'round';
      o.text.split('\n').forEach((line, i) => { c.strokeText(line, o.x, o.y + i * o.size * 1.2); c.fillStyle = o.color; c.fillText(line, o.x, o.y + i * o.size * 1.2); });
    } else if (o.t === 'blur') {
      const r = rectOf(o); if (r.w < 2 || r.h < 2) { c.restore(); return; }
      // pixelate: draw the region tiny, then scale it back up without smoothing
      const cell = Math.max(8, Math.round(Math.min(r.w, r.h) / 10));
      const tw = Math.max(1, Math.round(r.w / cell)), th = Math.max(1, Math.round(r.h / cell));
      const tmp = document.createElement('canvas'); tmp.width = tw; tmp.height = th;
      const m = c.getTransform(); tmp.getContext('2d').drawImage(c.canvas, r.x + m.e, r.y + m.f, r.w, r.h, 0, 0, tw, th);
      c.imageSmoothingEnabled = false; c.drawImage(tmp, 0, 0, tw, th, r.x, r.y, r.w, r.h);
    } else if (o.t === 'cropdraft') {
      const r = rectOf(o);
      c.fillStyle = 'rgba(0,0,0,.5)'; c.beginPath(); c.rect(0, 0, c.canvas.width, c.canvas.height); c.rect(r.x, r.y, r.w, r.h); c.fill('evenodd');
      c.strokeStyle = '#fff'; c.setLineDash([8 * dpr, 6 * dpr]); c.lineWidth = 2 * dpr; c.strokeRect(r.x, r.y, r.w, r.h);
    }
    c.restore();
  }
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(base, crop ? crop.x : 0, crop ? crop.y : 0, W(), H(), 0, 0, W(), H());
    ctx.translate(crop ? -crop.x : 0, crop ? -crop.y : 0);
    for (const o of ops) if (o.t !== 'crop') drawOp(ctx, o);
    if (draft) drawOp(ctx, draft);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    $('#undo').disabled = !ops.length; $('#redo').disabled = !redo.length;
  }
  function recomputeCrop() { crop = null; for (const o of ops) if (o.t === 'crop') crop = o.rect; size(); render(); }
  size(); render();

  // pointer -> image coordinates (in un-cropped image space)
  const pt = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (cv.width / r.width) + (crop ? crop.x : 0), (e.clientY - r.top) * (cv.height / r.height) + (crop ? crop.y : 0)]; };
  cv.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const [x, y] = pt(e);
    if (tool === 'text') { e.preventDefault(); startText(x, y); return; }
    commitText();
    cv.setPointerCapture(e.pointerId);
    draft = tool === 'pen' || tool === 'mark' ? { t: tool, color: tool === 'mark' && color === '#111111' ? '#F5C518' : color, pts: [[x, y]] } : { t: tool === 'crop' ? 'cropdraft' : tool, color, x1: x, y1: y, x2: x, y2: y };
  });
  cv.addEventListener('pointermove', (e) => {
    if (!draft) return; const [x, y] = pt(e);
    if (draft.pts) draft.pts.push([x, y]); else { draft.x2 = x; draft.y2 = y; if (e.shiftKey && draft.t === 'box') { const d = Math.max(Math.abs(x - draft.x1), Math.abs(y - draft.y1)); draft.x2 = draft.x1 + Math.sign(x - draft.x1) * d; draft.y2 = draft.y1 + Math.sign(y - draft.y1) * d; } }
    render();
  });
  cv.addEventListener('pointerup', () => {
    if (!draft) return; const d = draft; draft = null;
    const tiny = d.pts ? d.pts.length < 2 : Math.hypot(d.x2 - d.x1, d.y2 - d.y1) < 6;
    if (!tiny) {
      if (d.t === 'cropdraft') { const r = rectOf(d); ops.push({ t: 'crop', rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) } }); redo = []; recomputeCrop(); setTool('arrow'); return; }
      ops.push(d); redo = [];
    }
    render();
  });

  // text
  const txt = $('#txt'); let textAt = null;
  function startText(x, y) {
    commitText();
    textAt = { x, y };
    const sx = cv.getBoundingClientRect().width / cv.width;
    txt.style.left = (x - (crop ? crop.x : 0)) * sx + 'px'; txt.style.top = (y - (crop ? crop.y : 0)) * sx + 'px';
    txt.style.color = color; txt.style.fontSize = 22 + 'px';
    txt.textContent = ''; txt.style.display = 'block'; setTimeout(() => txt.focus(), 0);
  }
  function commitText() {
    if (!textAt) return;
    const t = txt.innerText.replace(/\n+$/, '');
    if (t.trim()) { ops.push({ t: 'text', text: t, x: textAt.x, y: textAt.y, color, size: Math.round(22 * dpr) }); redo = []; }
    textAt = null; txt.style.display = 'none'; render();
  }
  txt.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { textAt = null; txt.style.display = 'none'; } if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); } });
  txt.addEventListener('blur', () => setTimeout(commitText, 0));

  const undo = () => { commitText(); if (!ops.length) return; const o = ops.pop(); redo.push(o); o.t === 'crop' ? recomputeCrop() : render(); };
  const redoFn = () => { if (!redo.length) return; const o = redo.pop(); ops.push(o); o.t === 'crop' ? recomputeCrop() : render(); };
  $('#undo').onclick = undo; $('#redo').onclick = redoFn;
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redoFn() : undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redoFn(); }
    else if (mod && e.key.toLowerCase() === 'c' && !window.getSelection().toString()) { e.preventDefault(); copy(); }
    else if (!mod && !e.altKey) { const m = { a: 'arrow', b: 'box', p: 'pen', h: 'mark', t: 'text', x: 'blur', c: 'crop' }[e.key.toLowerCase()]; if (m) setTool(m); }
  });

  const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); };
  const out = () => { commitText(); render(); return cv.toDataURL('image/png'); };
  async function copy() { await noam.invoke('screenshot:copy', out()); toast('Copied to clipboard'); }
  $('#copy').onclick = copy;
  $('#save').onclick = async () => { const p = await noam.invoke('screenshot:save', { dataUrl: out(), title: shot.title }); if (p) toast('Saved to ' + p); };
})();
