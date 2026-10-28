// Code Buddy — the part that runs inside the web page (injected by ui/devlab/buddy.js).
// Shows a friendly "what is this?" bubble, lets you pick a thing and change it, and keeps an undo list.
// Loaded into the browser window as a function, then injected into tabs as `(${NOAM_BUDDY_PAGE})()`.
window.NOAM_BUDDY_PAGE = () => {
  if (window.__noamBuddy) return;
  const host = document.createElement('div');
  host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483646';
  const root = host.attachShadow({ mode: 'closed' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    .hl{position:fixed;border:3px solid #ff9f1c;border-radius:6px;background:rgba(255,159,28,.12);transition:all .08s;pointer-events:none;box-shadow:0 0 0 4px rgba(255,159,28,.18)}
    .hl.sel{border-color:#7c68fa;background:rgba(124,104,250,.12);box-shadow:0 0 0 4px rgba(124,104,250,.2)}
    .bub{position:fixed;max-width:300px;background:#fffdf5;color:#2b2140;border:2px solid #ffcf70;border-radius:16px;padding:10px 13px;font:600 14px/1.4 system-ui,"Segoe UI",sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.22);pointer-events:none}
    .bub .t{font-size:16px;font-weight:800;display:flex;gap:7px;align-items:center}
    .bub .e{font-size:22px}
    .bub .d{margin-top:3px;font-weight:550}
    .bub .c{display:inline-block;margin-top:6px;font:700 12px ui-monospace,Consolas,monospace;background:#2b2140;color:#ffd84d;border-radius:7px;padding:2px 7px}
    .bub .k{display:block;margin-top:6px;font-size:12px;color:#8a6420;font-weight:700}
    @keyframes pop{from{transform:scale(.85);opacity:0}}
    .bub{animation:pop .12s ease-out}
  `);
  root.adoptedStyleSheets = [sheet];
  const hl = document.createElement('div'); hl.className = 'hl'; hl.hidden = true;
  const selBox = document.createElement('div'); selBox.className = 'hl sel'; selBox.hidden = true;
  const bub = document.createElement('div'); bub.className = 'bub'; bub.hidden = true;
  root.append(hl, selBox, bub);
  (document.body || document.documentElement).appendChild(host);

  const hostName = (u) => { try { const x = new URL(u, location.href); return x.host === location.host ? 'another page on this website' : x.hostname.replace(/^www\./, ''); } catch { return 'somewhere'; } };
  function explain(el) {
    const tag = el.tagName.toLowerCase(); const type = (el.getAttribute('type') || '').toLowerCase();
    const text = (el.innerText || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    const link = el.closest('a[href]');
    if (link && tag !== 'img') {
      const href = link.getAttribute('href') || '';
      const where = href.startsWith('#') ? 'jumps to another part of this page' : href.startsWith('mailto:') ? 'starts writing an email' : href.startsWith('tel:') ? 'calls a phone number' : `takes you to ${hostName(href)}`;
      return ['🔗', 'A link', `Clicking it ${where}.`, '<a href="…">'];
    }
    if (tag === 'button' || el.getAttribute('role') === 'button' || (tag === 'input' && ['submit', 'button', 'reset'].includes(type)))
      return ['🔘', 'A button', el.closest('form') && (type === 'submit' || tag === 'button') ? 'Clicking it sends the form you filled in.' : `Clicking it makes something happen on this page${text ? ` — it says “${text}”` : ''}.`, '<button>'];
    if (tag === 'input' && type === 'checkbox') return ['☑️', 'A tick box', 'You can tick it on and off.', '<input type="checkbox">'];
    if (tag === 'input' && type === 'radio') return ['🔘', 'A choice', 'Pick one option from a group.', '<input type="radio">'];
    if (tag === 'input' && type === 'range') return ['🎚️', 'A slider', 'Drag it to choose a number.', '<input type="range">'];
    if (tag === 'input' && type === 'password') return ['🔑', 'A password box', 'What you type here is hidden with dots.', '<input type="password">'];
    if (tag === 'input' || tag === 'textarea') return ['⌨️', 'A box to type in', el.placeholder ? `It says “${el.placeholder}” until you type.` : 'Click it and type something.', tag === 'textarea' ? '<textarea>' : '<input>'];
    if (tag === 'select') return ['📋', 'A list to choose from', 'Click it to see all the options.', '<select>'];
    if (tag === 'img') return ['🖼️', 'A picture', el.alt ? `It shows: “${el.alt.slice(0, 80)}”` : 'It has no description — people who can’t see it won’t know what it is!', '<img>'];
    if (tag === 'video') return ['🎬', 'A video', 'It plays moving pictures.', '<video>'];
    if (tag === 'audio') return ['🎵', 'Sound', 'It plays music or sounds.', '<audio>'];
    if (tag === 'svg' || el.closest('svg')) return ['✏️', 'A drawing', 'Made from shapes and lines, so it stays sharp when it’s big.', '<svg>'];
    if (tag === 'canvas') return ['🎨', 'A drawing board', 'JavaScript draws on it — games often use this.', '<canvas>'];
    if (tag === 'iframe') return ['🪟', 'A page inside this page', 'A whole other web page shown in a window.', '<iframe>'];
    if (/^h[1-6]$/.test(tag)) return ['📰', `A heading (level ${tag[1]})`, tag === 'h1' ? 'The biggest, most important title on the page.' : `A title for a part of the page. h1 is the biggest, h6 the smallest.`, `<${tag}>`];
    if (tag === 'p') return ['📝', 'A paragraph', 'A block of text, like in a book.', '<p>'];
    if (tag === 'li') return ['•', 'One item in a list', text ? `It says “${text}”.` : '', '<li>'];
    if (tag === 'ul' || tag === 'ol') return ['📃', tag === 'ol' ? 'A numbered list' : 'A list', 'It holds list items, one after another.', `<${tag}>`];
    if (tag === 'nav') return ['🧭', 'The menu', 'Links to the main parts of the website.', '<nav>'];
    if (tag === 'header') return ['🔝', 'The top part', 'Usually has the logo and the menu.', '<header>'];
    if (tag === 'footer') return ['🔚', 'The bottom part', 'Usually has contact details and small print.', '<footer>'];
    if (tag === 'form') return ['📮', 'A form', 'Boxes you fill in and send.', '<form>'];
    if (tag === 'table' || el.closest('table')) return ['🗂️', 'A table', 'Information in rows and columns.', '<table>'];
    if (tag === 'label') return ['🏷️', 'A label', 'The name of a box you type in.', '<label>'];
    if (['strong', 'b'].includes(tag)) return ['💪', 'Bold text', 'Makes words stand out.', `<${tag}>`];
    if (['em', 'i'].includes(tag)) return ['↗️', 'Slanted text', 'Italic — used for emphasis.', `<${tag}>`];
    if (tag === 'span') return ['✨', 'A bit of text', text ? `“${text}”` : 'A small piece of text that can be styled differently.', '<span>'];
    if (['section', 'article', 'main', 'aside'].includes(tag)) return ['🧱', { section: 'A section', article: 'An article', main: 'The main part', aside: 'A side part' }[tag], 'A big area that groups related things.', `<${tag}>`];
    if (tag === 'body') return ['📄', 'The whole page', 'Everything you see lives inside the body.', '<body>'];
    return ['📦', 'A box', 'It holds other things inside it so they can be moved and styled together.', `<${tag}>`];
  }
  const describe = (el) => {
    const [e, t, d, c] = explain(el);
    const r = el.getBoundingClientRect();
    return { e, t, d, c, tag: el.tagName.toLowerCase(), w: Math.round(r.width), h: Math.round(r.height), id: el.id || '', cls: typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3) : [] };
  };
  const place = (box, el) => { const r = el.getBoundingClientRect(); Object.assign(box.style, { left: r.left - 3 + 'px', top: r.top - 3 + 'px', width: r.width + 6 + 'px', height: r.height + 6 + 'px' }); box.hidden = false; };
  function bubble(el, x, y) {
    const d = describe(el);
    bub.innerHTML = `<div class="t"><span class="e"></span><span class="n"></span></div><div class="d"></div><span class="c"></span>${mode === 'pick' ? '<span class="k">👆 Click to pick it</span>' : ''}`;
    bub.querySelector('.e').textContent = d.e; bub.querySelector('.n').textContent = d.t; bub.querySelector('.d').textContent = d.d; bub.querySelector('.c').textContent = 'Code name: ' + d.c;
    bub.hidden = false;
    const bw = 300, bh = bub.offsetHeight || 90;
    bub.style.left = Math.min(innerWidth - bw - 10, x + 16) + 'px';
    bub.style.top = (y + 20 + bh > innerHeight ? y - bh - 14 : y + 20) + 'px';
  }

  let mode = 'off', hover = null, sel = null, pickedTick = 0, hoverT = null;
  const events = [];
  const undo = [];
  const onMove = (e) => {
    if (mode === 'off' || mode === 'idle') return;
    const el = e.composedPath ? e.composedPath()[0] : e.target;
    if (!(el instanceof Element) || el === host) return;
    hover = el;
    if (mode === 'teach') {
      hl.hidden = true; bub.hidden = true; clearTimeout(hoverT);
      hoverT = setTimeout(() => { if (hover === el) { place(hl, el); bubble(el, e.clientX, e.clientY); } }, 450);
    } else { place(hl, el); bubble(el, e.clientX, e.clientY); }
  };
  const onClick = (e) => {
    if (mode !== 'pick') return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    const el = e.composedPath ? e.composedPath()[0] : e.target;
    if (!(el instanceof Element)) return;
    select(el); mode = 'idle'; hl.hidden = true; bub.hidden = true;
  };
  const block = (e) => { if (mode === 'pick') { e.preventDefault(); e.stopPropagation(); } };
  addEventListener('mousemove', onMove, true);
  addEventListener('click', onClick, true);
  addEventListener('mousedown', block, true); addEventListener('mouseup', block, true);
  addEventListener('scroll', () => { if (sel) place(selBox, sel); if (mode !== 'pick') { hl.hidden = true; bub.hidden = true; } }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && mode === 'pick') { mode = 'idle'; hl.hidden = true; bub.hidden = true; } }, true);
  function select(el) { sel = el; pickedTick++; place(selBox, el); events.push(['pick', el.tagName.toLowerCase()]); }

  const selector = (el) => el.id ? '#' + el.id : el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : '');
  const pretty = (html) => {
    let out = '', depth = 0;
    html.replace(/>\s+</g, '><').split(/(<[^>]+>)/).filter((x) => x.trim()).forEach((part) => {
      if (/^<\//.test(part)) depth = Math.max(0, depth - 1);
      out += '  '.repeat(depth) + part.trim() + '\n';
      if (/^<[a-z][^>]*[^/]>$/i.test(part) && !/^<(img|br|hr|input|meta|link|source|wbr|area|col|embed|track)\b/i.test(part)) depth++;
    });
    return out.trim();
  };

  window.__noamBuddy = {
    mode(m) { mode = m; if (m === 'off' || m === 'idle') { hl.hidden = true; bub.hidden = true; } return mode; },
    state() { return { mode, tick: pickedTick, sel: sel && document.contains(sel) ? describe(sel) : null, events: events.splice(0) }; },
    selectAt(x, y) { const el = document.elementFromPoint(x, y); if (el) select(el); return !!el; },
    parent() { if (sel && sel.parentElement && sel.parentElement !== document.documentElement) select(sel.parentElement); return !!sel; },
    details() {
      if (!sel) return null;
      const cs = getComputedStyle(sel);
      const kids = sel.children.length; const onlyText = kids === 0 || [...sel.childNodes].every((n) => n.nodeType === 3 || ['B', 'I', 'EM', 'STRONG', 'SPAN', 'BR'].includes(n.nodeName));
      let code = sel.outerHTML.replace(/ !important/g, ''); if (code.length > 2400) code = code.slice(0, 2400) + '…';
      return { ...describe(sel), text: onlyText ? sel.innerText : null, color: cs.color, bg: cs.backgroundColor, size: parseFloat(cs.fontSize), radius: cs.borderRadius, code: pretty(code), selector: selector(sel), canUndo: undo.length > 0 };
    },
    change(kind, value) {
      if (!sel) return null;
      const el = sel; const before = { text: el.innerText, style: el.getAttribute('style') };
      const sty = el.style; let css = '';
      const s = selector(el);
      switch (kind) {
        case 'text': el.innerText = value; css = null; break;
        case 'color': sty.setProperty('color', value, 'important'); css = `${s} { color: ${value}; }`; break;
        case 'bg': sty.setProperty('background-color', value, 'important'); css = `${s} { background-color: ${value}; }`; break;
        case 'bigger': case 'smaller': { const px = Math.round(parseFloat(getComputedStyle(el).fontSize) * (kind === 'bigger' ? 1.25 : 0.8)); sty.setProperty('font-size', px + 'px', 'important'); css = `${s} { font-size: ${px}px; }`; break; }
        case 'round': sty.setProperty('border-radius', value + 'px', 'important'); css = `${s} { border-radius: ${value}px; }`; break;
        case 'border': sty.setProperty('border', '4px solid ' + value, 'important'); css = `${s} { border: 4px solid ${value}; }`; break;
        case 'font': sty.setProperty('font-family', value, 'important'); css = `${s} { font-family: ${value}; }`; break;
        case 'center': sty.setProperty('text-align', 'center', 'important'); css = `${s} { text-align: center; }`; break;
        case 'hide': sty.setProperty('visibility', 'hidden', 'important'); css = `${s} { visibility: hidden; }`; break;
        case 'spin': sty.setProperty('transition', 'transform 1s', 'important'); sty.setProperty('transform', 'rotate(360deg)', 'important'); css = `${s} { transform: rotate(360deg); }`; break;
        case 'tilt': sty.setProperty('transform', 'rotate(-6deg)', 'important'); css = `${s} { transform: rotate(-6deg); }`; break;
        case 'shadow': sty.setProperty('box-shadow', '0 10px 30px rgba(0,0,0,.35)', 'important'); css = `${s} { box-shadow: 0 10px 30px rgba(0,0,0,.35); }`; break;
        case 'rainbow': sty.setProperty('background-image', 'linear-gradient(90deg,#ff5f6d,#ffc371,#47e891,#3e8deb,#a66cff)', 'important'); sty.setProperty('color', '#fff', 'important'); css = `${s} { background-image: linear-gradient(90deg, red, orange, green, blue, purple); color: white; }`; break;
      }
      undo.push([el, before, kind]);
      events.push(['change', kind]);
      requestAnimationFrame(() => place(selBox, el));
      return css === null ? { html: `<${el.tagName.toLowerCase()}>${String(value).slice(0, 60)}</${el.tagName.toLowerCase()}>` } : { css };
    },
    undo() {
      const u = undo.pop(); if (!u) return false;
      const [el, before, kind] = u;
      if (kind === 'text') el.innerText = before.text;
      else if (before.style === null) el.removeAttribute('style'); else el.setAttribute('style', before.style);
      if (sel) place(selBox, sel);
      return true;
    },
    clear() { sel = null; selBox.hidden = true; },
    remove() { mode = 'off'; host.remove(); delete window.__noamBuddy; },
  };
};
