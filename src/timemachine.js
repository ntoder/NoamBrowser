// Page time machine: save a copy of a page (its words, look and a thumbnail), view it later,
// compare two copies to see what changed, and optionally watch a page for changes.
const { webContents, Notification, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Store } = require('./store');
const loadAndRun = require('./hiddenload');

// Runs in the page: a script-free copy of the HTML (so it can't do anything when you look at it later) plus its text.
const COLLECT = `(() => {
  const doc = document.documentElement.cloneNode(true);
  doc.querySelectorAll('script, noscript, iframe, object, embed, link[rel=preload], link[rel=modulepreload], meta[http-equiv]').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((n) => { for (const a of [...n.attributes]) if (/^on/i.test(a.name) || (/^(href|src|action|formaction)$/i.test(a.name) && /^\\s*javascript:/i.test(a.value))) n.removeAttribute(a.name); });
  // keep what you typed into the page and form state
  { const live = document.querySelectorAll('input, textarea'), copy = doc.querySelectorAll('input, textarea'); live.forEach((n, i) => { const c = copy[i]; if (c && n.type !== 'password' && n.type !== 'hidden') c.setAttribute('value', n.value); else if (c) c.removeAttribute('value'); }); }
  let head = doc.querySelector('head'); if (!head) { head = document.createElement('head'); doc.prepend(head); }
  const base = document.createElement('base'); base.href = location.href; head.prepend(base);
  // inline same-origin stylesheets we can read, so the copy keeps its look even if the site changes its CSS
  let css = '';
  for (const sh of document.styleSheets) { try { css += [...sh.cssRules].map((r) => r.cssText).join('\\n') + '\\n'; } catch {} }
  if (css.length < 1500000) { doc.querySelectorAll('link[rel~=stylesheet]').forEach((n) => n.remove()); doc.querySelectorAll('style').forEach((n) => n.remove()); const st = document.createElement('style'); st.textContent = css; head.appendChild(st); }
  const icon = (document.querySelector('link[rel~=icon]') || {}).href || '';
  return { html: '<!doctype html>' + doc.outerHTML, text: (document.body ? document.body.innerText : '').slice(0, 400000), title: document.title, url: location.href, icon };
})()`;

module.exports = function setupTimeMachine({ userData, uiHandle, pageHandle, broadcast, broadcastPages, getSession, windows }) {
  const dir = path.join(userData, 'snapshots'); fs.mkdirSync(dir, { recursive: true });
  const store = new Store(userData, 'timemachine', { snaps: [], watches: [] });
  const file = (id, ext) => path.join(dir, id + '.' + ext);
  const pub = (s) => ({ ...s });

  function save(data, thumb, auto = false) {
    const id = crypto.randomBytes(8).toString('hex');
    fs.writeFileSync(file(id, 'html'), data.html);
    fs.writeFileSync(file(id, 'txt'), data.text || '');
    if (thumb && !thumb.isEmpty()) fs.writeFileSync(file(id, 'png'), thumb.resize({ width: 480 }).toPNG()); // PNG: pages without a background are see-through, which JPEG turns black
    let site = ''; try { site = new URL(data.url).hostname.replace(/^www\./, ''); } catch {}
    const prev = store.get('snaps').filter((x) => x.url === data.url).sort((a, b) => b.t - a.t)[0];
    const changed = prev ? diffCount(fs.readFileSync(file(prev.id, 'txt'), 'utf8'), data.text || '') : null;
    const meta = { id, url: data.url, title: data.title || data.url, site, icon: data.icon || '', t: Date.now(), size: Buffer.byteLength(data.html), words: (data.text || '').split(/\s+/).filter(Boolean).length, auto, changed, thumb: !!(thumb && !thumb.isEmpty()) };
    const list = store.get('snaps'); list.push(meta);
    // keep it tidy: at most 600 copies, oldest automatic ones go first
    while (list.length > 600) { const i = list.findIndex((x) => x.auto); const [old] = list.splice(i >= 0 ? i : 0, 1); for (const e of ['html', 'txt', 'png', 'jpg']) try { fs.unlinkSync(file(old.id, e)); } catch {} }
    store.save();
    broadcastPages('timemachine', 'changed');
    return meta;
  }
  function diffCount(a, b) {
    const A = new Set(a.split('\n').map((l) => l.trim()).filter(Boolean)), Bs = b.split('\n').map((l) => l.trim()).filter(Boolean), Bset = new Set(Bs);
    let added = 0, removed = 0; for (const l of Bset) if (!A.has(l)) added++; for (const l of A) if (!Bset.has(l)) removed++;
    return { added, removed };
  }

  uiHandle('tm:snap', async (_e, wcId) => {
    const wc = webContents.fromId(wcId); if (!wc || wc.isDestroyed()) throw new Error('Tab is gone.');
    if (!/^https?:/.test(wc.getURL())) throw new Error('Only web pages can be saved.');
    const data = await wc.executeJavaScript(COLLECT, true);
    const thumb = await wc.capturePage().catch(() => null);
    const meta = save(data, thumb);
    return { ...meta, count: store.get('snaps').filter((x) => x.url === meta.url).length };
  });
  uiHandle('tm:count', (_e, url) => store.get('snaps').filter((x) => x.url === url).length);
  pageHandle('tm:list', () => ({ snaps: store.get('snaps').map(pub).sort((a, b) => b.t - a.t), watches: store.get('watches') }));
  pageHandle('tm:text', (_e, id) => { try { return fs.readFileSync(file(String(id).replace(/\W/g, ''), 'txt'), 'utf8'); } catch { return ''; } });
  pageHandle('tm:thumb', (_e, id) => { try { return 'data:image/png;base64,' + fs.readFileSync(file(String(id).replace(/\W/g, ''), 'png')).toString('base64'); } catch { return ''; } });
  pageHandle('tm:delete', (_e, ids) => {
    const set = new Set([].concat(ids)); store.set('snaps', store.get('snaps').filter((x) => !set.has(x.id)));
    for (const id of set) for (const e of ['html', 'txt', 'png', 'jpg']) try { fs.unlinkSync(file(String(id).replace(/\W/g, ''), e)); } catch {}
    return true;
  });
  // served to the viewer iframe with scripts switched off
  const html = (id) => { try { return fs.readFileSync(file(String(id).replace(/\W/g, ''), 'html')); } catch { return null; } };

  // ---------------- watch a page for changes
  async function checkWatch(w) {
    try {
      const data = await loadAndRun(getSession, w.url, COLLECT, { wait: 3000 });
      const last = store.get('snaps').filter((x) => x.url === data.url || x.url === w.url).sort((a, b) => b.t - a.t)[0];
      const lastText = last ? fs.readFileSync(file(last.id, 'txt'), 'utf8') : null;
      w.lastCheck = Date.now(); w.error = '';
      if (lastText === null || lastText.trim() !== (data.text || '').trim()) {
        const d = lastText === null ? null : diffCount(lastText, data.text || '');
        if (!d || d.added + d.removed > 0) {
          const meta = save(data, null, true);
          if (d && (d.added + d.removed) >= (w.minLines || 1)) {
            w.lastChange = Date.now();
            if (Notification.isSupported()) { const n = new Notification({ title: '🕰️ A page you watch changed', body: `${meta.title} — ${d.added} new line${d.added === 1 ? '' : 's'}, ${d.removed} gone.` }); n.on('click', () => { const win = [...windows][0]; if (win) { win.show(); win.webContents.send('tab:open', { url: 'noam://timemachine/?url=' + encodeURIComponent(w.url) }); } }); n.show(); }
          }
        }
      }
    } catch (e) { w.lastCheck = Date.now(); w.error = String(e.message || e); }
    store.save(); broadcastPages('timemachine', 'changed');
  }
  setInterval(() => { for (const w of store.get('watches')) if (Date.now() - (w.lastCheck || 0) > (w.hours || 12) * 3600000) checkWatch(w); }, 10 * 60000);
  pageHandle('tm:watch', (_e, { url, hours, on }) => {
    let list = store.get('watches').filter((w) => w.url !== url);
    if (on) list.push({ url, hours: Math.max(1, +hours || 12), lastCheck: Date.now(), added: Date.now() });
    store.set('watches', list); return list;
  });
  pageHandle('tm:check', async (_e, url) => { const w = store.get('watches').find((x) => x.url === url) || { url }; await checkWatch(w); return true; });
  uiHandle('tm:watch', (_e, { url, on }) => { let list = store.get('watches').filter((w) => w.url !== url); if (on) list.push({ url, hours: 12, lastCheck: Date.now(), added: Date.now() }); store.set('watches', list); return list.some((w) => w.url === url); });
  uiHandle('tm:watching', (_e, url) => store.get('watches').some((w) => w.url === url));
  return { html, checkWatch };
};
