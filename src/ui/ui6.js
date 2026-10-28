// NoamBrowser 2.4 — time machine (save a copy of a page) and price tracker buttons.
'use strict';
(() => {
  const pb = $('#price-btn');
  const clean = (e) => String(e && e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  async function detectPrice(t) {
    pb.hidden = true;
    if (!t || !t.wcId || t.private || !/^https?:/.test(t.url)) return;
    const r = await nb.invoke('prices:detect', t.wcId).catch(() => null);
    if (t !== state.active) return;
    if (r && r.price) {
      pb.hidden = false; pb.classList.toggle('on', !!r.tracked);
      let label = r.price; try { label = new Intl.NumberFormat(undefined, { style: 'currency', currency: r.currency || 'USD' }).format(r.price); } catch {}
      pb.title = r.tracked ? `Tracking this price (${label}) — click to stop` : `Track this price (${label}) — get told when it drops`;
    }
  }
  pb.onclick = async () => {
    const t = state.active; if (!t) return;
    const on = !pb.classList.contains('on');
    try {
      const r = await nb.invoke('prices:track', { wcId: t.wcId, on });
      pb.classList.toggle('on', on);
      toast(on ? `🏷️ Tracking ${r.label}. You’ll get a notification if it drops.` : 'Stopped tracking this price');
      detectPrice(t);
    } catch (e) { toast(clean(e)); }
  };
  const _loaded = hooks.loaded;
  hooks.loaded = async (t) => { await _loaded(t); if (t === state.active) setTimeout(() => detectPrice(t), 1200); };
  const _act = hooks.activated;
  hooks.activated = (t) => { _act(t); detectPrice(t); };

  async function snapshot() {
    const t = state.active; if (!t || !t.wcId) return;
    try { const r = await nb.invoke('tm:snap', t.wcId); toast(`🕰️ Saved a copy of this page${r.count > 1 ? ` (${r.count} copies so far)` : ''}. See them in the Time machine.`, 3500); }
    catch (e) { toast(clean(e)); }
  }
  async function watch() {
    const t = state.active; if (!t || !/^https?:/.test(t.url)) return toast('Open a web page first');
    const on = !(await nb.invoke('tm:watching', t.url));
    if (on) await nb.invoke('tm:snap', t.wcId).catch(() => {});
    await nb.invoke('tm:watch', { url: t.url, on });
    toast(on ? '👀 Watching this page — you’ll be told when it changes (checked every 12 hours)' : 'Stopped watching this page');
  }
  const _shortcut = hooks.shortcut;
  hooks.shortcut = (key, mods) => {
    if (_shortcut && _shortcut(key, mods)) return true;
    if (key === 'snapshot') { snapshot(); return true; }
    return false;
  };
  const _commands = commands;
  commands = function () {
    return [..._commands(),
      CMD('tm-save', 'Save a copy of this page (Time machine) 🕰️', '', snapshot, 'cmd'),
      CMD('tm-watch', 'Watch this page for changes', '', watch, 'cmd'),
      CMD('tm-open', 'Time machine — saved copies of pages', '', () => newTab({ url: 'noam://timemachine/' }), 'cmd'),
      CMD('price-track', 'Track the price on this page 🏷️', '', () => (pb.hidden ? toast('No price found on this page') : pb.click()), 'cmd'),
      CMD('price-open', 'Price tracker', '', () => newTab({ url: 'noam://prices/' }), 'cmd'),
    ];
  };
})();
