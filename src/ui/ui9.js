// NoamBrowser 3.2 — the screen-sharing picker and the "make NoamBrowser your default browser" question.
'use strict';
(() => {
  // ---------------------------------------------------------------- screen sharing picker
  nb.on('screenshare:pick', (d) => {
    const wrap = document.createElement('div'); wrap.className = 'ask ss-ask';
    const screens = d.sources.filter((s) => s.screen), wins = d.sources.filter((s) => !s.screen);
    let tab = screens.length ? 'screen' : 'window', sel = null;
    const site = (() => { try { return new URL(d.site).hostname.replace(/^www\./, ''); } catch { return d.site || 'This site'; } })();
    wrap.innerHTML = `<div class="ask-box ss-box" role="dialog" aria-label="Share your screen">
      <h3>🖥️ ${esc(site)} wants to see your screen</h3><p class="ss-sub">Pick what to share. Only what you choose is shared, and you can stop any time.</p>
      <div class="ss-tabs"><button data-t="screen">Entire screen${screens.length > 1 ? 's' : ''}</button><button data-t="window">Window (${wins.length})</button></div>
      <div class="ss-grid"></div>
      ${d.audio ? '<label class="ss-audio"><input type="checkbox" id="ss-snd"> 🔊 Also share my computer’s sound</label>' : ''}
      <div class="ask-acts"><button class="btn ghost" data-a="no">Cancel</button><button class="btn primary" data-a="ok" disabled>Share</button></div></div>`;
    document.body.appendChild(wrap);
    const grid = wrap.querySelector('.ss-grid'), ok = wrap.querySelector('[data-a=ok]');
    const paint = () => {
      wrap.querySelectorAll('.ss-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
      const list = tab === 'screen' ? screens : wins;
      grid.innerHTML = list.length ? list.map((s) => `<button class="ss-item${sel === s.id ? ' on' : ''}" data-id="${esc(s.id)}" title="${esc(s.name)}"><span class="ss-thumb">${s.thumb ? `<img src="${esc(s.thumb)}" alt="">` : '<i>🖥️</i>'}</span><span class="ss-name">${s.icon ? `<img src="${esc(s.icon)}" alt="">` : ''}${esc(s.name)}</span></button>`).join('') : '<p class="ss-none">Nothing to show here.</p>';
      grid.querySelectorAll('.ss-item').forEach((b) => { b.onclick = () => { sel = b.dataset.id; ok.disabled = false; paint(); }; b.ondblclick = () => { sel = b.dataset.id; finish(true); }; });
    };
    let answered = false;
    const finish = (yes) => { if (answered) return; answered = true; nb.invoke('screenshare:answer', { id: d.id, source: yes ? sel : null, audio: yes && !!(wrap.querySelector('#ss-snd') || {}).checked }); wrap.remove(); removeEventListener('keydown', key, true); if (yes) toast('🖥️ Sharing your screen. Stop it from the site’s own button.'); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); finish(false); } if (e.key === 'Enter' && sel) { e.stopPropagation(); finish(true); } };
    addEventListener('keydown', key, true);
    wrap.querySelectorAll('.ss-tabs button').forEach((b) => (b.onclick = () => { tab = b.dataset.t; paint(); }));
    wrap.querySelector('[data-a=no]').onclick = () => finish(false);
    ok.onclick = () => finish(true);
    wrap.onclick = (e) => { if (e.target === wrap) finish(false); };
    if (screens.length === 1 && tab === 'screen') sel = screens[0].id, ok.disabled = false;
    paint();
  });

  // ---------------------------------------------------------------- a page's prompt() box
  nb.on('page:prompt', (d) => {
    const wrap = document.createElement('div'); wrap.className = 'ask';
    const site = (() => { try { return new URL(d.site).hostname.replace(/^www\./, ''); } catch { return 'This page'; } })();
    wrap.innerHTML = `<div class="ask-box"><small class="pp-site"></small><h3 class="pp-msg"></h3><input spellcheck="false"><div class="ask-acts"><button class="btn ghost" data-a="no">Cancel</button><button class="btn primary" data-a="ok">OK</button></div></div>`;
    wrap.querySelector('.pp-site').textContent = site + ' asks:'; wrap.querySelector('.pp-msg').textContent = d.message || ' ';
    const inp = wrap.querySelector('input'); inp.value = d.value || '';
    document.body.appendChild(wrap); inp.focus(); inp.select();
    const done = (v) => { wrap.remove(); nb.invoke('page:prompt-answer', { id: d.id, value: v }); };
    wrap.querySelector('[data-a=ok]').onclick = () => done(inp.value);
    wrap.querySelector('[data-a=no]').onclick = () => done(null);
    inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') done(inp.value); if (e.key === 'Escape') done(null); };
  });

  // ---------------------------------------------------------------- "make NoamBrowser your default browser?"
  async function askDefault() {
    const st = await nb.invoke('default-browser:status').catch(() => null);
    if (!st || !st.ask) return;
    const bar = document.createElement('div'); bar.className = 'infobar def-bar';
    bar.innerHTML = `<span class="pb-icon">⭐</span><span class="pb-text"><b>Make NoamBrowser your default browser?</b> Links from WhatsApp, email and other apps will open here.</span><button class="btn primary" data-a="yes">Make default</button><button class="btn ghost" data-a="later">Not now</button><button class="btn ghost" data-a="never" title="Don’t ask again">✕</button>`;
    $('#content').appendChild(bar);
    bar.querySelector('[data-a=yes]').onclick = async () => {
      const r = await nb.invoke('default-browser:set').catch(() => null); bar.remove();
      if (r && r.how === 'windows') toast('In the window that opened, click NoamBrowser → Set default', 9000);
      else if (r && r.how === 'mac') toast('Click “Use NoamBrowser” in the box macOS shows', 9000);
      else toast('⭐ NoamBrowser is now your default browser');
    };
    bar.querySelector('[data-a=later]').onclick = () => { nb.invoke('default-browser:answer', 'later'); bar.remove(); };
    bar.querySelector('[data-a=never]').onclick = () => { nb.invoke('default-browser:answer', 'never'); bar.remove(); toast('OK, I won’t ask again. You can do it any time in Settings → General.'); };
  }
  const _init = hooks.init; hooks.init = async (i) => { if (_init) await _init(i); setTimeout(askDefault, 6000); };
})();
