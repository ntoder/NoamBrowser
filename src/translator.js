// Page translation controller (main process). Text is pulled out of the page,
// translated by the on-device engine in a hidden window, and put back block by
// block so the page stays usable while it works.
const { BrowserWindow, ipcMain, webContents, app } = require('electron');
const path = require('path');
const crypto = require('crypto');

const COLLECT = `(() => {
  if (window.__noamTr) { window.__noamTr.restore(); }
  const BLOCK = new Set(['P','LI','H1','H2','H3','H4','H5','H6','TD','TH','DD','DT','BLOCKQUOTE','FIGCAPTION','CAPTION','SUMMARY','LABEL','BUTTON','LEGEND','OPTION','A','SPAN','DIV','SECTION','ARTICLE','HEADER','FOOTER','MAIN','ASIDE','NAV','PRE','STRONG','EM','B','I','SMALL','TIME']);
  const SKIP = new Set(['SCRIPT','STYLE','NOSCRIPT','CODE','KBD','SAMP','TEXTAREA','INPUT','SELECT','SVG','MATH','CANVAS','IFRAME','VIDEO','AUDIO','TEMPLATE']);
  const isBlockish = (el) => { const d = getComputedStyle(el).display; return d && d !== 'inline' && d !== 'contents'; };
  const nodes = [];
  const visit = (el) => {
    if (SKIP.has(el.tagName) || el.isContentEditable || el.closest('[translate="no"], .notranslate')) return;
    const kids = [...el.children];
    const hasBlockKid = kids.some((k) => !SKIP.has(k.tagName) && isBlockish(k) && k.textContent.trim());
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!hasBlockKid && el.textContent.trim().length > 1 && /\\p{L}/u.test(el.textContent)) {
      if (el.innerHTML.length < 6000) { nodes.push(el); return; }
    }
    if (hasBlockKid && ownText) {
      for (const n of [...el.childNodes]) if (n.nodeType === 3 && n.textContent.trim().length > 1) { const s = document.createElement('font'); s.setAttribute('data-noam-tr', ''); n.replaceWith(s); s.appendChild(n); nodes.push(s); }
    }
    for (const k of kids) visit(k);
  };
  if (document.body) visit(document.body);
  const orig = nodes.map((n) => n.innerHTML);
  const titleOrig = document.title;
  window.__noamTr = {
    nodes, orig, titleOrig,
    apply(start, list) { list.forEach((h, i) => { const n = nodes[start + i]; if (n && h != null) n.innerHTML = h; }); },
    title(t) { if (t) document.title = t; },
    restore() { nodes.forEach((n, i) => { n.innerHTML = orig[i]; }); document.title = titleOrig; delete window.__noamTr; }
  };
  return { blocks: orig, title: titleOrig };
})()`;

class Translator {
  constructor() {
    this.win = null; this.ready = null; this.pending = new Map(); this.jobs = new Map();
    ipcMain.on('translate:res', (_e, msg) => { const p = this.pending.get(msg.id); if (!p) return; this.pending.delete(msg.id); msg.ok ? p.resolve(msg.result) : p.reject(new Error(msg.error)); });
    ipcMain.on('translate:log', (_e, m) => console.log('[translate]', m));
  }

  host() {
    if (this.win && !this.win.isDestroyed()) return this.ready;
    this.win = new BrowserWindow({
      show: false, width: 400, height: 300,
      webPreferences: { preload: path.join(__dirname, 'translate', 'host-preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false, partition: 'noam-translate' },
    });
    this.ready = new Promise((resolve) => ipcMain.once('translate:ready', () => resolve()));
    const file = path.join(__dirname, 'translate', 'host.html').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
    this.win.loadFile(file);
    this.win.on('closed', () => { this.win = null; for (const p of this.pending.values()) p.reject(new Error('translator stopped')); this.pending.clear(); });
    return this.ready;
  }

  async call(op, args, timeout = 240000) {
    await this.host();
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error('Translation timed out — the language model may still be downloading. Try again in a minute.')); }, timeout);
      this.pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } });
      this.win.webContents.send('translate:req', { id, op, ...args });
    });
  }

  languages() { return this.call('languages', {}, 30000); }
  selftest() { return this.call('selftest', {}, 60000); }

  async translatePage(wcId, from, to, onProgress = () => {}) {
    const wc = webContents.fromId(wcId);
    if (!wc) throw new Error('Tab is gone.');
    if (from === to) throw new Error('The page is already in that language.');
    const job = Symbol('job'); this.jobs.set(wcId, job);
    const { blocks, title } = await wc.executeJavaScript(COLLECT, true);
    if (!blocks.length) throw new Error('No text found on this page.');
    onProgress({ done: 0, total: blocks.length });
    if (title) { try { const [t] = await this.call('translate', { from, to, texts: [title] }); await wc.executeJavaScript(`window.__noamTr && window.__noamTr.title(${JSON.stringify(t)})`); } catch (e) { if (/No model/.test(e.message)) throw friendly(e, from, to); } }
    const BATCH = 24;
    // translate what's on screen first: blocks come in document order, which is close enough
    for (let i = 0; i < blocks.length; i += BATCH) {
      if (this.jobs.get(wcId) !== job || wc.isDestroyed()) return { cancelled: true };
      const slice = blocks.slice(i, i + BATCH);
      let out;
      try { out = await this.call('translate', { from, to, texts: slice }); } catch (e) { throw friendly(e, from, to); }
      if (wc.isDestroyed()) return { cancelled: true };
      await wc.executeJavaScript(`window.__noamTr && window.__noamTr.apply(${i}, ${JSON.stringify(out)})`);
      onProgress({ done: Math.min(blocks.length, i + BATCH), total: blocks.length });
    }
    this.jobs.delete(wcId);
    return { ok: true, blocks: blocks.length };
  }

  async restore(wcId) {
    this.jobs.delete(wcId);
    const wc = webContents.fromId(wcId);
    if (wc && !wc.isDestroyed()) await wc.executeJavaScript('window.__noamTr && window.__noamTr.restore()', true).catch(() => {});
  }

  async detect(wcId) {
    const wc = webContents.fromId(wcId);
    if (!wc) return null;
    return wc.executeJavaScript(`(() => { const l = (document.documentElement.lang || document.querySelector('meta[http-equiv="content-language" i]')?.content || '').toLowerCase().split(/[-_]/)[0]; return { lang: l, chars: (document.body && document.body.innerText || '').slice(0, 2000) }; })()`).catch(() => null);
  }
}

function friendly(e, from, to) {
  const m = e.message || String(e);
  if (/No model available/.test(m)) return new Error(`There’s no on-device model for ${name(from)} → ${name(to)} yet.`);
  if (/fetch|network|Failed to fetch|NetworkError/i.test(m)) return new Error('Couldn’t download the language model. Check your connection (or the VPN) and try again.');
  return new Error(m);
}
function name(code) { try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code; } catch { return code; } }

// Guess the language of a text sample by script, for pages that don't declare it.
function guessLang(sample) {
  if (!sample) return '';
  const s = sample.replace(/[\s\d\p{P}\p{S}]/gu, '');
  if (!s) return '';
  const share = (re) => ((s.match(re) || []).length / s.length);
  if (share(/\p{Script=Hebrew}/gu) > 0.3) return 'he';
  if (share(/\p{Script=Arabic}/gu) > 0.3) return 'ar';
  if (share(/\p{Script=Cyrillic}/gu) > 0.3) return /[іїєґ]/i.test(s) ? 'uk' : /[ъ]/.test(s) && /[щ]/.test(s) && !/[ыэё]/.test(s) ? 'bg' : 'ru';
  if (share(/\p{Script=Greek}/gu) > 0.3) return 'el';
  if (share(/[぀-ヿ]/gu) > 0.1) return 'ja';
  if (share(/\p{Script=Han}/gu) > 0.3) return 'zh';
  if (share(/\p{Script=Hangul}/gu) > 0.3) return 'ko';
  return '';
}

module.exports = { Translator, guessLang };
