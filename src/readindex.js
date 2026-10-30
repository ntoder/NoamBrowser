// NoamBrowser — "Search what you've read". Keeps the words of pages you visit (normal tabs only, never
// private tabs, password pages, email or banking) in a small file on this computer, so you can find a
// page again by something it said. Powers tab search (Ctrl+Shift+A) along with open tabs and history.
'use strict';
const { app, webContents } = require('electron');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const MAX_PAGES = 3000, MAX_TEXT = 6000;
const SKIP = /(^|\.)(mail\.google\.com|outlook\.(live|office)\.com|mail\.yahoo\.com|web\.whatsapp\.com|messenger\.com|accounts\.google\.com|login\.|signin\.|auth\.|paypal\.com|bank|leumi|hapoalim|discount|mizrahi|isracard|max\.co\.il|cal-online|chase\.com|wellsfargo|citi\.com|gov\.il)/i;
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[֑-ׇ̀-ͯ]/g, '');

module.exports = function setupReadIndex({ settings, userData, uiHandle, pageHandle, privatePartition, session, isForgotten, getHistory }) {
  const FILE = path.join(userData, 'read-index.json.gz');
  let pages = new Map();
  try { for (const p of JSON.parse(zlib.gunzipSync(fs.readFileSync(FILE)).toString())) pages.set(p.u, p); } catch {}
  let dirty = false;
  const flush = () => { if (!dirty) return; dirty = false; try { fs.writeFileSync(FILE + '.tmp', zlib.gzipSync(JSON.stringify([...pages.values()]))); fs.renameSync(FILE + '.tmp', FILE); } catch (e) { console.error('read index save', e); } };
  setInterval(flush, 20000).unref();
  app.on('before-quit', flush);
  const cfg = () => ({ enabled: true, ...(settings.get('readIndex') || {}) });
  const priv = session.fromPartition(privatePartition);

  const EXTRACT = `(() => {
    if (document.querySelector('input[type=password]')) return null;
    const root = document.querySelector('article, main, [role=main]') || document.body; if (!root) return null;
    return { title: document.title, text: (root.innerText || '').replace(/\\s+/g, ' ').slice(0, ${MAX_TEXT}) };
  })()`;
  const grab = async (wc) => { try { return await wc.executeJavaScriptInIsolatedWorld(1999, [{ code: EXTRACT }]); } catch { return null; } };
  const okUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? !SKIP.test(x.hostname) && !(isForgotten && isForgotten(x.hostname)) : false; } catch { return false; } };

  async function index(wc) {
    if (!cfg().enabled || wc.isDestroyed() || wc.session === priv) return;
    const url = wc.getURL().split('#')[0]; if (!okUrl(url)) return;
    const r = await grab(wc); if (!r || !r.text || r.text.length < 80) return;
    pages.delete(url); pages.set(url, { u: url, t: r.title || url, x: r.text, at: Date.now() });
    while (pages.size > MAX_PAGES) pages.delete(pages.keys().next().value);
    dirty = true;
  }
  app.on('web-contents-created', (_e, wc) => {
    if (wc.getType() !== 'webview') return;
    let timer = null;
    wc.on('did-finish-load', () => { clearTimeout(timer); timer = setTimeout(() => index(wc), 2500); });
    wc.on('destroyed', () => clearTimeout(timer));
  });

  // ---------------------------------------------------------------- search
  function snippet(text, words) {
    const n = norm(text); let at = -1;
    for (const w of words) { const i = n.indexOf(w); if (i >= 0 && (at < 0 || i < at)) at = i; }
    if (at < 0) return text.slice(0, 140);
    const s = Math.max(0, at - 60);
    return (s ? '…' : '') + text.slice(s, s + 170).trim() + (s + 170 < text.length ? '…' : '');
  }
  const score = (title, url, text, words) => {
    const T = norm(title), U = norm(url), X = norm(text); let sc = 0;
    for (const w of words) { const inT = T.includes(w), inU = U.includes(w), inX = X.includes(w); if (!inT && !inU && !inX) return 0; sc += (inT ? 6 : 0) + (inU ? 3 : 0) + (inX ? 1 : 0); }
    return sc;
  };
  const tabText = new Map(); // wcId -> { url, text }
  async function liveText(id) {
    const wc = webContents.fromId(id); if (!wc || wc.isDestroyed()) return '';
    const url = wc.getURL(); const c = tabText.get(id); if (c && c.url === url) return c.text;
    const r = await grab(wc); const text = (r && r.text) || ''; tabText.set(id, { url, text }); return text;
  }
  uiHandle('find:query', async (_e, { q, tabs = [] }) => {
    const words = norm(q).split(/\s+/).filter(Boolean); if (!words.length) return { tabs: [], read: [] };
    // open tabs (awake ones are read live; sleeping ones use what we saved)
    const outTabs = [];
    await Promise.all(tabs.map(async (t) => {
      const text = t.wcId && !t.asleep ? await liveText(t.wcId) : ((pages.get((t.url || '').split('#')[0]) || {}).x || '');
      const s = score(t.title, t.url, text, words); if (s) outTabs.push({ id: t.id, score: s, snippet: norm(t.title + ' ' + t.url).includes(words[0]) ? '' : snippet(text, words) });
    }));
    outTabs.sort((a, b) => b.score - a.score);
    const open = new Set(tabs.map((t) => (t.url || '').split('#')[0]));
    const read = [];
    if (cfg().enabled) for (const p of pages.values()) { if (open.has(p.u)) continue; const s = score(p.t, p.u, p.x, words); if (s) read.push({ url: p.u, title: p.t, at: p.at, score: s + Math.max(0, 3 - (Date.now() - p.at) / 864e5 / 10), snippet: snippet(p.x, words) }); }
    read.sort((a, b) => b.score - a.score);
    const shown = new Set([...open, ...read.slice(0, 12).map((r) => r.u || r.url)]);
    const hist = [];
    for (const h of (getHistory ? getHistory() : []).slice(0, 25000)) { if (shown.has(h.url)) continue; const s = score(h.title, h.url, '', words); if (s) { hist.push({ url: h.url, title: h.title, favicon: h.favicon, at: h.t, score: s + Math.min(3, (h.visits || 1) / 5) }); if (hist.length > 200) break; } }
    hist.sort((a, b) => b.score - a.score || b.at - a.at);
    return { tabs: outTabs, read: read.slice(0, 12), history: hist.slice(0, 10) };
  });
  const stats = () => ({ enabled: cfg().enabled, count: pages.size });
  pageHandle('readindex:stats', stats);
  pageHandle('readindex:set', (_e, on) => { settings.set('readIndex', { ...cfg(), enabled: !!on }); return stats(); });
  pageHandle('readindex:clear', () => { pages.clear(); dirty = true; flush(); return stats(); });
  return { forgetHost: (host) => { for (const [u] of pages) { try { if (new URL(u).hostname.endsWith(host)) pages.delete(u); } catch {} } dirty = true; }, stats };
};
