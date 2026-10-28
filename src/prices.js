// Price tracker: remembers the price of a product page and checks it in the background.
// Tells you when it drops (or reaches the price you want). Works on most shops via the
// product data they publish for search engines (schema.org), with a few fallbacks.
const { webContents, Notification } = require('electron');
const crypto = require('crypto');
const { Store } = require('./store');
const loadAndRun = require('./hiddenload');

// Runs in the page. Finds { price, currency, title, image } — or { price: null } if it can't.
const DETECT = (selector) => `(() => {
  const num = (v) => { if (v == null) return null; let s = String(v).replace(/[\\s\\u00a0\\u202f]/g, ''); const m = s.match(/\\d[\\d.,']*/); if (!m) return null; s = m[0].replace(/'/g, '');
    if (/,\\d{1,2}$/.test(s) && !/\\.\\d{1,2}$/.test(s)) s = s.replace(/\\./g, '').replace(',', '.'); else s = s.replace(/,/g, ''); const n = parseFloat(s); return isFinite(n) && n > 0 ? n : null; };
  const SYM = { '₪': 'ILS', '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR' };
  const curOf = (s) => { s = String(s || ''); for (const [k, v] of Object.entries(SYM)) if (s.includes(k)) return v; const m = s.match(/\\b(ILS|NIS|USD|EUR|GBP|CAD|AUD|JPY|CHF)\\b/i); return m ? m[1].toUpperCase().replace('NIS', 'ILS') : ''; };
  const meta = (sel) => { const m = document.querySelector(sel); return m && (m.getAttribute('content') || m.textContent); };
  const out = { title: (meta('meta[property="og:title"]') || document.title || '').trim().slice(0, 200), image: meta('meta[property="og:image"]') || '', url: location.href };
  const sel = ${JSON.stringify(selector || '')};
  if (sel) { const el = document.querySelector(sel); if (el) { const p = num(el.getAttribute('content') || el.textContent); if (p) return { ...out, price: p, currency: curOf(el.textContent) || curOf(document.body.innerText.slice(0, 20000)), selector: sel, how: 'selector' }; } }
  // 1) schema.org product data
  const walk = (o, acc) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach((x) => walk(x, acc));
    const t = [].concat(o['@type'] || []).join(' ');
    if (/Product|Offer/i.test(t) || o.offers) acc.push(o); for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, acc); };
  const found = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => { try { walk(JSON.parse(s.textContent), found); } catch {} });
  for (const o of found) {
    const offers = [].concat(o.offers || (/(Offer)/i.test([].concat(o['@type'] || []).join(' ')) ? o : []));
    for (const of of offers) { const p = num(of.price ?? of.lowPrice ?? (of.priceSpecification && of.priceSpecification.price)); if (p) return { ...out, title: (o.name || out.title).toString().slice(0, 200), image: (() => { const im = [].concat(o.image || [])[0]; return typeof im === 'string' ? im : (im && im.url) || out.image; })(), price: p, currency: (of.priceCurrency || curOf(of.price) || '').toUpperCase(), how: 'schema' }; }
  }
  // 2) meta tags
  const mp = num(meta('meta[property="product:price:amount"]') || meta('meta[property="og:price:amount"]') || meta('[itemprop="price"]'));
  if (mp) return { ...out, price: mp, currency: (meta('meta[property="product:price:currency"]') || meta('meta[property="og:price:currency"]') || meta('[itemprop="priceCurrency"]') || '').toUpperCase(), how: 'meta' };
  // 3) common price elements
  const SELS = ['#priceblock_ourprice', '#priceblock_dealprice', '.a-price .a-offscreen', '[data-testid*="price" i]', '[data-price]', '.product-price', '.price-current', '.current-price', '.woocommerce-Price-amount', '.price ins', '.price', '[class*="price" i]'];
  for (const s of SELS) { for (const el of document.querySelectorAll(s)) { const txt = el.getAttribute('data-price') || el.textContent; const p = num(txt); if (p && txt.length < 40 && el.getBoundingClientRect().height > 0) return { ...out, price: p, currency: curOf(txt) || curOf(document.body.innerText.slice(0, 20000)), selector: s, how: 'element' }; } }
  return { ...out, price: null };
})()`;

module.exports = function setupPrices({ userData, uiHandle, pageHandle, broadcast, broadcastPages, getSession, windows }) {
  const store = new Store(userData, 'prices', { items: [], every: 6 });
  const items = () => store.get('items');
  const fmt = (p, c) => { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: c || 'USD', maximumFractionDigits: 2 }).format(p); } catch { return (c ? c + ' ' : '') + p; } };
  const changed = () => { store.save(); broadcastPages('prices', 'changed'); broadcast('prices:changed'); };

  function record(it, r) {
    it.lastCheck = Date.now(); it.error = '';
    if (!r || !r.price) { it.error = 'Couldn’t find the price on the page this time.'; return; }
    const prev = it.price;
    it.price = r.price; if (r.currency) it.currency = r.currency; if (r.title && !it.title) it.title = r.title;
    const last = it.history[it.history.length - 1];
    if (!last || last.price !== r.price || Date.now() - last.t > 86400000) it.history.push({ t: Date.now(), price: r.price });
    if (it.history.length > 400) it.history.splice(0, it.history.length - 400);
    if (prev && r.price < prev - 0.001) {
      const pct = Math.round((1 - r.price / prev) * 100);
      const hit = it.target && r.price <= it.target;
      notify(hit ? '🎯 Your target price!' : '💸 Price drop!', `${it.title.slice(0, 80)} is now ${fmt(r.price, it.currency)} (was ${fmt(prev, it.currency)}, −${pct}%).`, it.url);
    } else if (it.target && r.price <= it.target && !(prev <= it.target)) notify('🎯 Your target price!', `${it.title.slice(0, 80)} is ${fmt(r.price, it.currency)}.`, it.url);
  }
  function notify(title, body, url) {
    try {
      if (!Notification.isSupported()) return;
      const n = new Notification({ title, body }); n.on('click', () => { const w = [...windows].find((x) => !x.isDestroyed()); if (w) { w.show(); w.focus(); w.webContents.send('tab:open', { url }); } }); n.show();
    } catch {}
  }
  async function check(it) {
    try { record(it, await loadAndRun(getSession, it.url, DETECT(it.selector), { wait: 3500 })); }
    catch (e) { it.lastCheck = Date.now(); it.error = String(e.message || e); }
    changed();
  }
  setInterval(() => { const ev = (store.get('every') || 6) * 3600000; for (const it of items()) if (!it.paused && Date.now() - (it.lastCheck || 0) > ev) check(it); }, 15 * 60000);

  uiHandle('prices:detect', async (_e, wcId) => { const wc = webContents.fromId(wcId); if (!wc || !/^https?:/.test(wc.getURL())) return null; const r = await wc.executeJavaScript(DETECT(''), true).catch(() => null); return r && r.price ? { ...r, tracked: items().some((x) => x.url === wc.getURL()) } : null; });
  uiHandle('prices:track', async (_e, { wcId, on }) => {
    const wc = webContents.fromId(wcId); if (!wc) throw new Error('Tab is gone.');
    const url = wc.getURL();
    if (!on) { store.set('items', items().filter((x) => x.url !== url)); changed(); return null; }
    const r = await wc.executeJavaScript(DETECT(''), true);
    if (!r || !r.price) throw new Error('Couldn’t find a price on this page.');
    const it = { id: crypto.randomUUID(), url, title: r.title || wc.getTitle(), image: r.image || '', currency: r.currency || '', price: r.price, first: r.price, selector: r.selector || '', history: [{ t: Date.now(), price: r.price }], added: Date.now(), lastCheck: Date.now(), target: 0 };
    store.set('items', [...items().filter((x) => x.url !== url), it]); changed();
    return { ...it, label: fmt(it.price, it.currency) };
  });
  pageHandle('prices:list', () => ({ items: items(), every: store.get('every') || 6 }));
  pageHandle('prices:update', (_e, { id, target, paused }) => { const it = items().find((x) => x.id === id); if (it) { if (target !== undefined) it.target = Math.max(0, +target || 0); if (paused !== undefined) it.paused = !!paused; changed(); } return items(); });
  pageHandle('prices:remove', (_e, id) => { store.set('items', items().filter((x) => x.id !== id)); changed(); return items(); });
  pageHandle('prices:check', async (_e, id) => { const list = id ? items().filter((x) => x.id === id) : items(); for (const it of list) await check(it); return items(); });
  pageHandle('prices:every', (_e, h) => { store.set('every', Math.max(1, Math.min(48, +h || 6))); return store.get('every'); });
  if (process.env.NOAM_TEST) require('electron').app.on('noam-test-price', (fn) => fn({ items, check, record, changed }));
  return { check, DETECT };
};
