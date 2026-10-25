(async () => {
  await noamReady;
  const id = new URLSearchParams(location.search).get('id');
  const a = id ? await noam.invoke('reader:get', id) : null;
  const art = $('#art');
  if (!a) {
    art.innerHTML = '<div class="empty"><b>This article is no longer available</b>Reader view keeps articles only while the browser is open. Go back and open Reader view again.</div>';
    $('#bar').hidden = true; return;
  }
  document.title = a.title || 'Reader';

  // Sanitise: Readability strips scripts, but be strict anyway.
  const doc = new DOMParser().parseFromString(a.content || '', 'text/html');
  doc.querySelectorAll('script, style, iframe, object, embed, form, input, button, textarea, select, link, meta, noscript, frame, frameset').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((el) => {
    for (const at of [...el.attributes]) {
      const n = at.name.toLowerCase();
      if (n.startsWith('on') || n === 'style' || n === 'srcdoc') el.removeAttribute(at.name);
      if ((n === 'href' || n === 'src' || n === 'xlink:href') && /^\s*(javascript|data:text|vbscript):/i.test(at.value)) el.removeAttribute(at.name);
    }
    el.removeAttribute('class'); el.removeAttribute('id');
    if (el.tagName === 'A') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
  });
  const host = (() => { try { return new URL(a.url).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  const words = (doc.body.textContent || '').trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.round(words / 230));
  art.innerHTML = `<div class="site">${esc(a.siteName || host)}</div><h1 class="title"></h1><div class="meta"></div>`;
  art.querySelector('.title').textContent = a.title || '';
  art.querySelector('.meta').textContent = [a.byline, `${minutes} min read`].filter(Boolean).join(' · ');
  const body = document.createElement('div');
  body.append(...doc.body.childNodes);
  art.appendChild(body);
  if (a.dir === 'rtl' || /[֐-׿؀-ۿ]/.test((a.title || '') + (doc.body.textContent || '').slice(0, 400))) art.setAttribute('dir', 'rtl');
  if (a.lang) art.setAttribute('lang', a.lang);

  // preferences (per viewer, in localStorage)
  const load = () => { try { return JSON.parse(localStorage.getItem('reader') || '{}'); } catch { return {}; } };
  const saveP = (p) => { try { localStorage.setItem('reader', JSON.stringify(p)); } catch {} };
  const p = Object.assign({ size: 20, theme: 'auto', sans: false, width: 680 }, load());
  const apply = () => {
    document.documentElement.style.setProperty('--r-size', p.size + 'px');
    document.documentElement.style.setProperty('--r-width', p.width + 'px');
    document.body.className = (p.theme !== 'auto' ? p.theme : '') + (p.sans ? ' sans' : '');
    $('#font').textContent = p.sans ? 'Sans' : 'Serif';
    $$('.sw').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === p.theme)));
    saveP(p);
  };
  $('#smaller').onclick = () => { p.size = Math.max(14, p.size - 2); apply(); };
  $('#bigger').onclick = () => { p.size = Math.min(34, p.size + 2); apply(); };
  $('#font').onclick = () => { p.sans = !p.sans; apply(); };
  $('#narrow').onclick = () => { p.width = p.width === 680 ? 860 : p.width === 860 ? 560 : 680; apply(); };
  $$('.sw').forEach((b) => (b.onclick = () => { p.theme = b.dataset.t; apply(); }));
  $('#original').onclick = () => { if (history.length > 1) history.back(); else location.href = a.url; };
  apply();

  // read aloud
  const synth = window.speechSynthesis;
  const listen = $('#listen');
  let speaking = false;
  if (!synth) listen.hidden = true;
  listen.onclick = () => {
    if (speaking) { synth.cancel(); speaking = false; listen.textContent = 'Listen'; return; }
    const text = (a.title ? a.title + '. ' : '') + body.innerText;
    const chunks = text.match(/[^.!?\n]{1,220}[.!?\n]?/g) || [text];
    const voices = synth.getVoices();
    const lang = art.getAttribute('lang') || (art.getAttribute('dir') === 'rtl' ? 'he' : 'en');
    const voice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith(lang));
    speaking = true; listen.textContent = 'Stop';
    chunks.forEach((c, i) => {
      const u = new SpeechSynthesisUtterance(c.trim());
      if (voice) u.voice = voice;
      if (i === chunks.length - 1) u.onend = () => { speaking = false; listen.textContent = 'Listen'; };
      synth.speak(u);
    });
  };
  addEventListener('beforeunload', () => synth && synth.cancel());
})();
