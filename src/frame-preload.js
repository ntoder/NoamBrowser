// Runs in every frame of every web page before page scripts.
// 1) Fingerprinting protection ("farbling"): canvas/WebGL readbacks get
//    tiny per-site noise, hardware details are generalised. Values are
//    stable within a site for a browsing session but differ between sites,
//    so trackers can't link you across the web.
// 2) On internal noam:// pages only, exposes a small `window.noam` API.
const { ipcRenderer, contextBridge, webFrame } = require('electron');

let cfg = { fp: false, internal: false, seed: 0 };
try { cfg = ipcRenderer.sendSync('noam:frame-config', location.href) || cfg; } catch {}

function protect(seed) {
  try {
    let s = seed >>> 0;
    const rand = () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const noiseMask = []; for (let i = 0; i < 64; i++) noiseMask.push(rand() < 0.5 ? 1 : 0);
    const nativeToString = Function.prototype.toString;
    const fakes = new WeakMap();
    const disguise = (fake, orig) => { fakes.set(fake, orig); return fake; };
    Function.prototype.toString = disguise(function toString() { return nativeToString.call(fakes.get(this) || this); }, nativeToString);

    const farble = (data, w) => {
      // Flip the lowest bit of a sparse, site-specific set of pixels.
      for (let i = 0, n = 0; i < data.length; i += 4 * 53, n++) {
        if (noiseMask[n & 63]) { const c = (n % 3); data[i + c] = data[i + c] ^ 1; }
      }
    };
    const C2D = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
    const gid = C2D && C2D.getImageData;
    if (C2D) {
      C2D.getImageData = disguise(function getImageData(...a) {
        const img = gid.apply(this, a);
        if (img.width * img.height <= 4000000) farble(img.data, img.width);
        return img;
      }, gid);
    }
    const noisyCopy = (canvas) => {
      const w = canvas.width, h = canvas.height;
      if (!w || !h || w * h > 4000000) return null;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.drawImage(canvas, 0, 0);
      const img = gid.call(ctx, 0, 0, w, h); farble(img.data, w); ctx.putImageData(img, 0, 0);
      return c;
    };
    const HC = HTMLCanvasElement.prototype;
    const origToDataURL = HC.toDataURL, origToBlob = HC.toBlob;
    const inCopy = new WeakSet();
    HC.toDataURL = disguise(function toDataURL(...a) {
      if (inCopy.has(this)) return origToDataURL.apply(this, a);
      try { const c = noisyCopy(this); if (c) { inCopy.add(c); return origToDataURL.apply(c, a); } } catch {}
      return origToDataURL.apply(this, a);
    }, origToDataURL);
    HC.toBlob = disguise(function toBlob(...a) {
      if (inCopy.has(this)) return origToBlob.apply(this, a);
      try { const c = noisyCopy(this); if (c) { inCopy.add(c); return origToBlob.apply(c, a); } } catch {}
      return origToBlob.apply(this, a);
    }, origToBlob);

    for (const P of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!P) continue;
      const gp = P.prototype.getParameter;
      P.prototype.getParameter = disguise(function getParameter(p) {
        if (p === 37445) return 'Google Inc.';
        if (p === 37446) return 'ANGLE (Generic, Generic Renderer, OpenGL)';
        return gp.call(this, p);
      }, gp);
    }

    const N = Navigator.prototype;
    const define = (obj, prop, value) => {
      const d = Object.getOwnPropertyDescriptor(obj, prop);
      if (!d || !d.get) return;
      Object.defineProperty(obj, prop, { ...d, get: disguise(function () { return value; }, d.get) });
    };
    define(N, 'hardwareConcurrency', 4);
    define(N, 'deviceMemory', 8);
    if (N.getBattery) N.getBattery = disguise(function getBattery() { return Promise.reject(new DOMException('Not allowed', 'NotAllowedError')); }, N.getBattery);

    // Audio fingerprinting: tiny noise on analyser/buffer reads.
    const AB = window.AudioBuffer && AudioBuffer.prototype;
    if (AB) {
      const gcd = AB.getChannelData; const touched = new WeakSet();
      AB.getChannelData = disguise(function getChannelData(ch) {
        const d = gcd.call(this, ch);
        if (!touched.has(d) && d.length < 500000) { touched.add(d); for (let i = 0; i < d.length; i += 97) d[i] += (noiseMask[i & 63] - 0.5) * 1e-7; }
        return d;
      }, gcd);
    }
  } catch (e) { /* never break the page */ }
}

function firefoxIdentity(ua) {
  try {
    const N = Navigator.prototype;
    const set = (prop, value) => { const d = Object.getOwnPropertyDescriptor(N, prop); if (d) Object.defineProperty(N, prop, { ...d, get: function () { return value; } }); };
    set('userAgent', ua);
    set('appVersion', ua.replace(/^Mozilla\//, '').replace(/ Gecko\/.*$/, ''));
    set('vendor', '');
    set('productSub', '20100101');
    set('platform', /Windows/.test(ua) ? 'Win32' : /Mac/.test(ua) ? 'MacIntel' : 'Linux x86_64');
    if ('userAgentData' in N) { const d = Object.getOwnPropertyDescriptor(N, 'userAgentData'); Object.defineProperty(N, 'userAgentData', { ...d, get: function () { return undefined; } }); }
    try { delete window.chrome; } catch {}
    Object.defineProperty(window, 'chrome', { get: () => undefined, configurable: true });
  } catch {}
}
// YouTube ad shield — runs inside YouTube pages (main world) before YouTube's
// own scripts. Three layers, so if YouTube changes one thing the others still work:
//   1. Strip ad data out of the video player's instructions before the player
//      reads them (pre-roll, mid-roll, ad slots, anti-adblock popups).
//   2. Hide ad boxes in the feed, search results and watch page.
//   3. Fallback: if an ad still starts, mute it, skip to its end, and click Skip.
// This function is serialised and injected, so it must be self-contained.
function youtubeShield() {
  if (window.__noamYT) return;
  window.__noamYT = true;

  const AD_KEYS = ['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams', 'adBreakParams', 'adParams', 'adInferredBlockingStatus'];
  const POPUP_KEYS = ['enforcementMessageViewModel'];
  const AD_RENDERERS = new Set(['adSlotRenderer', 'promotedSparklesWebRenderer', 'displayAdRenderer', 'promotedVideoRenderer', 'searchPyvRenderer',
    'bannerPromoRenderer', 'statementBannerRenderer', 'brandVideoShelfRenderer', 'brandVideoSingletonRenderer', 'inFeedAdLayoutRenderer',
    'adBreakServiceRenderer', 'companionAdRenderer', 'actionCompanionAdRenderer', 'merchandiseShelfRenderer', 'movingThumbnailRenderer_ad']);
  const report = () => { try { window.postMessage({ __noamYT: 'blocked' }, '*'); } catch {} };

  // ---- 1. prune ad data ----------------------------------------------------
  function prune(o, depth) {
    if (!o || typeof o !== 'object' || depth > 14) return false;
    let hit = false;
    if (Array.isArray(o)) {
      for (let i = o.length - 1; i >= 0; i--) {
        const it = o[i];
        if (it && typeof it === 'object' && !Array.isArray(it)) {
          const k = Object.keys(it);
          if (k.length === 1 && AD_RENDERERS.has(k[0])) { o.splice(i, 1); hit = true; continue; }
          if (k.length === 1 && it.richItemRenderer && it.richItemRenderer.content && Object.keys(it.richItemRenderer.content).some((x) => AD_RENDERERS.has(x))) { o.splice(i, 1); hit = true; continue; }
        }
        if (prune(it, depth + 1)) hit = true;
      }
      return hit;
    }
    for (const k of AD_KEYS) if (k in o) { delete o[k]; hit = true; }
    for (const k of POPUP_KEYS) if (k in o) { delete o[k]; hit = true; }
    if (o.playerResponse && typeof o.playerResponse === 'object') if (prune(o.playerResponse, depth + 1)) hit = true;
    for (const k in o) {
      const v = o[k];
      if (v && typeof v === 'object' && (depth < 6 || Array.isArray(v) || /contents|items|results|renderer|response|overlay/i.test(k))) if (prune(v, depth + 1)) hit = true;
    }
    return hit;
  }
  const clean = (o) => { try { if (prune(o, 0)) report(); } catch {} return o; };

  const origParse = JSON.parse;
  const parseHook = function parse(text, reviver) {
    const r = origParse.call(this, text, reviver);
    if (r && typeof r === 'object' && typeof text === 'string' && text.length > 200 && /"(adPlacements|adSlots|playerAds|adSlotRenderer|enforcementMessageViewModel|promotedSparklesWebRenderer|inFeedAdLayoutRenderer)"/.test(text)) clean(r);
    return r;
  };
  try { Object.defineProperty(parseHook, 'toString', { value: () => 'function parse() { [native code] }' }); } catch {}
  JSON.parse = parseHook;

  const origJson = Response.prototype.json;
  Response.prototype.json = function json() { return origJson.call(this).then((r) => clean(r)); };

  for (const name of ['ytInitialPlayerResponse', 'ytInitialData', 'ytInitialReelWatchSequenceResponse']) {
    let val = window[name];
    if (val) clean(val);
    try {
      Object.defineProperty(window, name, { configurable: true, get() { return val; }, set(v) { val = clean(v); } });
    } catch {}
  }

  // ---- 2. hide ad boxes ------------------------------------------------------
  const css = `
    ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-promoted-sparkles-web-renderer, ytd-promoted-video-renderer,
    ytd-display-ad-renderer, ytd-banner-promo-renderer, ytd-statement-banner-renderer, ytd-companion-slot-renderer,
    ytd-action-companion-ad-renderer, ytd-player-legacy-desktop-watch-ads-renderer, ytd-search-pyv-renderer,
    ytd-merch-shelf-renderer, ytd-brand-video-singleton-renderer, ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"],
    #player-ads, #masthead-ad, #panels > ytd-ads-engagement-panel-content-renderer, .ytd-mealbar-promo-renderer, ytd-mealbar-promo-renderer,
    .ytp-ad-overlay-container, .ytp-ad-overlay-slot, .ytp-ad-image-overlay, .ytp-featured-product, .ytp-suggested-action-badge,
    ytd-rich-item-renderer:has(> #content > ytd-ad-slot-renderer), ytd-rich-section-renderer:has(ytd-statement-banner-renderer),
    ytm-promoted-sparkles-web-renderer, ytm-companion-ad-renderer, ad-slot-renderer, ytm-ad-slot-renderer,
    tp-yt-paper-dialog:has(ytd-enforcement-message-view-model), ytd-enforcement-message-view-model { display: none !important; }
    .html5-video-player.ad-showing video { opacity: 0 !important; }
  `;
  const addCss = () => {
    if (document.getElementById('noam-yt-css')) return;
    const st = document.createElement('style'); st.id = 'noam-yt-css'; st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  };
  if (document.documentElement) addCss(); else document.addEventListener('readystatechange', addCss, { once: true });
  document.addEventListener('DOMContentLoaded', addCss);

  // ---- 3. fallback skipper ---------------------------------------------------
  let lastSkip = 0; let inAd = false; let wasMuted = false;
  const SKIP = '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, button.ytp-ad-skip-button-container, .ytp-ad-skip-button-slot button';
  function tick() {
    const player = document.querySelector('.html5-video-player');
    if (player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'))) {
      const v = player.querySelector('video');
      if (v && !inAd) { inAd = true; wasMuted = v.muted; }
      if (v) {
        v.muted = true;
        if (isFinite(v.duration) && v.duration > 0 && v.currentTime < v.duration - 0.1) { try { v.currentTime = v.duration; } catch {} }
        try { v.playbackRate = 16; } catch {}
      }
      const btn = document.querySelector(SKIP);
      if (btn) btn.click();
      if (Date.now() - lastSkip > 3000) { lastSkip = Date.now(); report(); }
    } else if (player && inAd) {
      inAd = false;
      const v = player.querySelector('video');
      if (v) { if (v.playbackRate > 2) v.playbackRate = 1; v.muted = wasMuted; }
    }
    // anti-adblock popup: close it and keep the video playing
    const dlg = document.querySelector('ytd-enforcement-message-view-model');
    if (dlg) {
      dlg.closest('tp-yt-paper-dialog')?.remove();
      document.querySelector('tp-yt-iron-overlay-backdrop')?.remove();
      const v = document.querySelector('.html5-video-player video');
      if (v && v.paused) v.play().catch(() => {});
    }
  }
  setInterval(tick, 250);
  const mo = new MutationObserver(() => tick());
  const startObs = () => { const p = document.querySelector('#movie_player, .html5-video-player'); if (p) mo.observe(p, { attributes: true, attributeFilter: ['class'] }); else setTimeout(startObs, 500); };
  startObs();
}

if (cfg.youtube) {
  try {
    if (contextBridge.executeInMainWorld) contextBridge.executeInMainWorld({ func: youtubeShield, args: [] });
    else webFrame.executeJavaScript(`(${youtubeShield.toString()})()`);
  } catch {}
  window.addEventListener('message', (e) => {
    if (e.source === window && e.data && e.data.__noamYT === 'blocked') { try { ipcRenderer.send('noam:yt-blocked'); } catch {} }
  });
}

if (cfg.googleAuth) {
  try {
    if (contextBridge.executeInMainWorld) contextBridge.executeInMainWorld({ func: firefoxIdentity, args: [cfg.firefoxUA] });
    else webFrame.executeJavaScript(`(${firefoxIdentity.toString()})(${JSON.stringify(cfg.firefoxUA)})`);
  } catch {}
}

if (cfg.fp) {
  try {
    if (contextBridge.executeInMainWorld) contextBridge.executeInMainWorld({ func: protect, args: [cfg.seed] });
    else webFrame.executeJavaScript(`(${protect.toString()})(${cfg.seed})`);
  } catch {}
}


// ---------------------------------------------------------------- dark mode
// Forced dark mode for sites that don't have one. Skipped automatically when
// the page is already dark.
let darkKey = null;
if (cfg.dark) {
  try {
    const key = darkKey = webFrame.insertCSS(`
      html { filter: invert(.92) hue-rotate(180deg) !important; background: #fff !important; }
      img, video, picture, canvas, iframe, embed, object, svg image, [style*="background-image"], [data-noam-keep] { filter: invert(1) hue-rotate(180deg) !important; }
      img[src*=".svg"], [role="img"] svg { filter: none !important; }
    `, { cssOrigin: 'user' });
    const lum = (c) => { const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(c || ''); if (!m || m[4] === '0') return null; const [r, g, b] = [m[1], m[2], m[3]].map((x) => +x / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const check = () => {
      const l = lum(getComputedStyle(document.body || document.documentElement).backgroundColor) ?? lum(getComputedStyle(document.documentElement).backgroundColor);
      if (l !== null && l < 0.35) webFrame.removeInsertedCSS(key);
    };
    document.addEventListener('DOMContentLoaded', () => setTimeout(check, 50), { once: true });
  } catch {}
}

// ---------------------------------------------------------------- instant links
// Hovering a link to another page of the same site for a moment starts loading it, so the click feels instant.
if (cfg.prefetch && window.top === window) {
  const done = new Set(); let timer = null;
  const ok = (a) => {
    if (!a || !a.href || a.hasAttribute('download') || a.target === '_blank') return false;
    let u; try { u = new URL(a.href, location.href); } catch { return false; }
    if (u.origin !== location.origin || !/^https?:$/.test(u.protocol)) return false;
    if (u.pathname === location.pathname && u.search === location.search) return false; // just a #jump
    if (/log-?out|sign-?out|logoff|delete|remove|unsubscribe|cart\/add|add-to-cart/i.test(u.pathname + u.search)) return false;
    return !done.has(u.href) && done.size < 40;
  };
  const go = (a) => { const u = new URL(a.href, location.href).href; done.add(u); const l = document.createElement('link'); l.rel = 'prefetch'; l.href = u; l.as = 'document'; (document.head || document.documentElement).appendChild(l); };
  addEventListener('mouseover', (e) => { const a = e.target && e.target.closest && e.target.closest('a[href]'); clearTimeout(timer); if (ok(a) && !(navigator.connection && navigator.connection.saveData)) timer = setTimeout(() => go(a), 65); }, { passive: true, capture: true });
  addEventListener('mouseout', () => clearTimeout(timer), { passive: true, capture: true });
  addEventListener('touchstart', (e) => { const a = e.target && e.target.closest && e.target.closest('a[href]'); if (ok(a)) go(a); }, { passive: true, capture: true });
}

// ---------------------------------------------------------------- QR codes (WhatsApp / Telegram / Discord logins…)
// Phones need a crisp black-on-white QR code. When one is on screen, tell the browser so the
// night tint pauses, and drop forced dark mode on this page (it would flip the colours).
if (/^https?:/.test(location.href) && window.top === window) {
  const QR_SEL = 'canvas[aria-label*="QR" i], [aria-label*="QR" i] canvas, [aria-label*="scan" i] canvas, [data-ref] canvas, img[alt*="QR" i], svg[aria-label*="QR" i], [class*="qr" i] canvas, [class*="qr" i] svg, [class*="qrcode" i] img, [class*="qr-code" i] img, [data-testid*="qr" i] canvas, [data-testid*="qr" i] svg';
  let shown = false, t = null;
  const visibleQR = () => { for (const el of document.querySelectorAll(QR_SEL)) { const r = el.getBoundingClientRect(); if (r.width >= 90 && r.height >= 90 && Math.abs(r.width - r.height) < r.width * 0.25 && r.bottom > 0 && r.top < innerHeight) return el; } return null; };
  const check = () => {
    t = null; const el = visibleQR(); const on = !!el;
    if (on && darkKey) { try { webFrame.removeInsertedCSS(darkKey); } catch {} darkKey = null; }
    if (on !== shown) { shown = on; try { ipcRenderer.send('noam:qr', on); } catch {} }
  };
  const soon = () => { if (!t) t = setTimeout(check, 400); };
  const start = () => { new MutationObserver(soon).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'aria-label', 'data-ref', 'hidden'] }); addEventListener('resize', soon); addEventListener('scroll', soon, { passive: true }); check(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
  addEventListener('pagehide', () => { if (shown) try { ipcRenderer.send('noam:qr', false); } catch {} });
}

// ---------------------------------------------------------------- passwords
if (cfg.pw && /^https:|^http:\/\/(localhost|127\.)/.test(location.href)) {
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const pwFields = (root = document) => [...root.querySelectorAll('input[type="password"]')].filter((el) => !el.disabled && !el.readOnly);
  const userFieldFor = (pw) => {
    const scope = pw.form || document;
    const cands = [...scope.querySelectorAll('input')].filter((el) => /^(text|email|tel|)$/i.test(el.type) && !el.disabled && el.type !== 'hidden' && visible(el));
    const before = cands.filter((el) => el.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING);
    const pick = before.reverse().find((el) => /user|login|email|mail|name|account|id|phone/i.test(el.name + el.id + el.autocomplete + el.placeholder)) || before[0];
    return pick || null;
  };
  let lastSent = '';
  const capture = (root) => {
    const pws = pwFields(root).filter((p) => p.value);
    if (!pws.length) {
      // a "username first" step: remember the identifier for the next page
      const u = [...(root.querySelectorAll ? root.querySelectorAll('input[type="email"], input[autocomplete="username"], input[name*="user" i], input[name*="email" i], input[id*="email" i]') : [])].find((el) => el.value && visible(el));
      if (u) ipcRenderer.send('noam:pw-username', u.value.slice(0, 200));
      return;
    }
    // sign-up / change-password forms have 2–3 password fields: keep the last new one
    const pw = pws.length >= 2 && pws[pws.length - 1].value === pws[pws.length - 2].value ? pws[pws.length - 1] : pws[0];
    const u = userFieldFor(pw);
    const payload = JSON.stringify([u ? u.value : '', pw.value]);
    if (payload === lastSent) return;
    lastSent = payload;
    ipcRenderer.send('noam:pw-captured', { username: (u ? u.value : '').slice(0, 200), password: pw.value });
  };
  document.addEventListener('submit', (e) => capture(e.target), true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') capture(e.target.form || document); }, true);
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('button, input[type="submit"], input[type="button"], [role="button"], a');
    if (b && /log ?in|sign ?in|submit|continue|next|enter|כניסה|התחבר|המשך/i.test((b.textContent || b.value || b.getAttribute('aria-label') || '') + (b.type || ''))) setTimeout(() => capture(b.form || document), 0);
  }, true);

  const setVal = (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    el.focus(); setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    el.style.backgroundColor = 'rgba(106,85,245,.12)';
  };
  const fill = (cred, force) => {
    if (!cred) return false;
    const pw = pwFields().find(visible);
    if (pw && (force || !pw.value)) {
      const u = userFieldFor(pw);
      if (u && cred.username && (force || !u.value)) setVal(u, cred.username);
      setVal(pw, cred.password); pw.blur();
      return true;
    }
    if (!pw && cred.username) {
      const u = [...document.querySelectorAll('input[type="email"], input[autocomplete="username"], input[name*="user" i], input[name*="email" i]')].find((el) => visible(el) && (force || !el.value));
      if (u) { setVal(u, cred.username); return true; }
    }
    return false;
  };
  if (window.top === window) {
    let tries = 0; let filled = false;
    const attempt = async () => {
      if (filled || tries++ > 12) return;
      if (!pwFields().some(visible) && !document.querySelector('input[autocomplete="username"]')) return;
      try { const cred = await ipcRenderer.invoke('noam:pw-fill'); if (cred && fill(cred, false)) filled = true; } catch {}
    };
    document.addEventListener('DOMContentLoaded', () => { attempt(); const mo = new MutationObserver(() => { clearTimeout(mo.t); mo.t = setTimeout(attempt, 400); }); mo.observe(document.documentElement, { childList: true, subtree: true }); setTimeout(() => mo.disconnect(), 20000); });
    ipcRenderer.on('noam:pw-fill-now', (_e, cred) => fill(cred, true));
  }
}


// ---------------------------------------------------------------- mouse gestures
// Hold the right mouse button and draw: ← back, → forward, ↑ new tab,
// ↓→ close tab, ↓← reopen closed tab, ↑↓ reload. A short right-click still
// opens the normal menu.
if (cfg.gestures) {
  let pts = null, dirs = '', last = null, canvas = null, ctx2d = null, label = null, suppress = false;
  const NAMES = { L: 'Back', R: 'Forward', U: 'New tab', DR: 'Close tab', DL: 'Reopen closed tab', UD: 'Reload', D: 'Scroll down', LR: 'Reload' };
  const ensureCanvas = () => {
    if (canvas || !cfg.gestureTrail) return;
    canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none';
    canvas.width = innerWidth * devicePixelRatio; canvas.height = innerHeight * devicePixelRatio;
    label = document.createElement('div');
    label.style.cssText = 'position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);z-index:2147483647;pointer-events:none;font:700 15px system-ui,sans-serif;color:#fff;background:rgba(106,85,245,.92);padding:8px 14px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.3);display:none';
    (document.body || document.documentElement).append(canvas, label);
    ctx2d = canvas.getContext('2d'); ctx2d.scale(devicePixelRatio, devicePixelRatio);
    ctx2d.lineWidth = 4; ctx2d.lineCap = 'round'; ctx2d.lineJoin = 'round'; ctx2d.strokeStyle = 'rgba(106,85,245,.85)';
  };
  const cleanup = () => { if (canvas) { canvas.remove(); label.remove(); } canvas = null; ctx2d = null; label = null; pts = null; };
  addEventListener('mousedown', (e) => { if (e.button === 2) { pts = [[e.clientX, e.clientY]]; last = [e.clientX, e.clientY]; dirs = ''; } }, true);
  addEventListener('mousemove', (e) => {
    if (!pts || !(e.buttons & 2)) return;
    const [lx, ly] = last; const dx = e.clientX - lx, dy = e.clientY - ly;
    if (Math.abs(dx) < 28 && Math.abs(dy) < 28) { if (ctx2d) { ctx2d.lineTo(e.clientX, e.clientY); ctx2d.stroke(); } return; }
    const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U');
    if (dirs[dirs.length - 1] !== d && dirs.length < 3) dirs += d;
    last = [e.clientX, e.clientY];
    if (!canvas && dirs) { ensureCanvas(); if (ctx2d) { ctx2d.beginPath(); ctx2d.moveTo(pts[0][0], pts[0][1]); } }
    if (ctx2d) { ctx2d.lineTo(e.clientX, e.clientY); ctx2d.stroke(); }
    if (label) { label.textContent = NAMES[dirs] || '…'; label.style.display = 'block'; }
  }, true);
  addEventListener('mouseup', (e) => {
    if (e.button !== 2 || !pts) return;
    const g = NAMES[dirs] ? dirs : '';
    suppress = !!dirs;
    cleanup();
    try { ipcRenderer.send('noam:gesture-end', g); } catch {}
    setTimeout(() => { suppress = false; }, 400);
  }, true);
  addEventListener('contextmenu', (e) => { if (suppress) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  addEventListener('blur', cleanup);
}

// ---------------------------------------------------------------- double-click dictionary
if (cfg.dict) {
  let host = null, root = null;
  const close = () => { if (host) { host.remove(); host = null; } };
  addEventListener('dblclick', async (e) => {
    const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const sel = getSelection(); const text = (sel && sel.toString() || '').trim();
    if (!text || text.length > 40 || text.split(/\s+/).length > 4 || !/\p{L}/u.test(text)) return;
    const r = sel.getRangeAt(0).getBoundingClientRect();
    close();
    host = document.createElement('div'); host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;left:0;top:0';
    root = host.attachShadow({ mode: 'closed' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`.b{position:fixed;min-width:180px;max-width:320px;background:#fff;color:#1d1836;border-radius:14px;box-shadow:0 12px 34px rgba(0,0,0,.25),0 0 0 1px rgba(0,0,0,.06);padding:10px 12px;font:500 14px/1.4 system-ui,"Segoe UI",sans-serif;animation:p .12s ease-out}
      @keyframes p{from{opacity:0;transform:translateY(4px)}} .w{color:#6b6488;font-size:12px;font-weight:700;display:flex;gap:6px;align-items:center}
      .t{font-size:18px;font-weight:800;margin-top:3px} .t[dir=rtl]{text-align:right} .e{color:#c23040;font-size:12.5px} .x{margin-left:auto;cursor:pointer;border:0;background:none;color:#9c93b9;font-size:14px}
      .s{cursor:pointer;border:0;background:#f2f0f8;border-radius:8px;padding:2px 7px;font-size:13px} @media (prefers-color-scheme:dark){.b{background:#221c3d;color:#ece8f7}.s{background:#2c2550}}`);
    root.adoptedStyleSheets = [sheet];
    const b = document.createElement('div'); b.className = 'b';
    b.style.left = Math.max(8, Math.min(innerWidth - 330, r.left)) + 'px';
    b.style.top = (r.bottom + 120 > innerHeight ? r.top - 90 : r.bottom + 8) + 'px';
    b.innerHTML = '<div class="w"><span class="o"></span><button class="x" title="Close">✕</button></div><div class="t">…</div>';
    b.querySelector('.o').textContent = '📖 ' + text;
    b.querySelector('.x').onclick = close;
    root.appendChild(b); (document.body || document.documentElement).appendChild(host);
    let res; try { res = await ipcRenderer.invoke('noam:dict', { text }); } catch (err) { res = { error: String(err.message || err) }; }
    if (!host || !root.contains(b)) return;
    const tEl = b.querySelector('.t');
    if (res.error) { if (res.error === 'off' || res.error === 'empty') return close(); tEl.className = 'e'; tEl.textContent = res.error; return; }
    tEl.textContent = res.translation; if (res.to === 'he' || res.to === 'ar') tEl.dir = 'rtl';
    if (cfg.dictSpeak && window.speechSynthesis) {
      const sp = document.createElement('button'); sp.className = 's'; sp.textContent = '🔊'; sp.title = 'Say it';
      sp.onclick = () => { const u = new SpeechSynthesisUtterance(text); u.lang = res.from === 'he' ? 'he-IL' : res.from === 'en' ? 'en-US' : res.from; speechSynthesis.cancel(); speechSynthesis.speak(u); };
      b.querySelector('.w').insertBefore(sp, b.querySelector('.x'));
    }
  }, true);
  addEventListener('mousedown', (e) => { if (host && !e.composedPath().includes(host)) close(); }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); }, true);
  addEventListener('scroll', close, true);
}

// ---------------------------------------------------------------- highlighter
// Right-click → Highlight (or Ctrl+Shift+H). Highlights are saved on this computer and come back next visit.
if (cfg.hl) {
  const COL = { yellow: 'rgba(255,214,0,.45)', green: 'rgba(80,220,120,.42)', pink: 'rgba(255,110,180,.40)', blue: 'rgba(90,170,255,.42)' };
  const textNodes = (root) => { const out = []; const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement && /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA)$/.test(n.parentElement.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) }); let n; while ((n = w.nextNode())) out.push(n); return out; };
  function wrap(range, h) {
    const nodes = textNodes(range.commonAncestorContainer.nodeType === 3 ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer).filter((n) => range.intersectsNode(n));
    const parts = nodes.map((n) => [n, n === range.startContainer ? range.startOffset : 0, n === range.endContainer ? range.endOffset : n.nodeValue.length]);
    for (let [node, s, e] of parts) {
      if (s >= e || !node.nodeValue.slice(s, e).trim()) continue;
      if (e < node.nodeValue.length) node.splitText(e);
      if (s > 0) node = node.splitText(s);
      const m = document.createElement('mark'); m.className = 'noam-hl'; m.dataset.hl = h.id;
      m.style.cssText = `background:${COL[h.color] || COL.yellow} !important;color:inherit !important;border-radius:3px;padding:0 1px;box-decoration-break:clone;-webkit-box-decoration-break:clone;cursor:pointer`;
      node.parentNode.insertBefore(m, node); m.appendChild(node);
    }
  }
  // find saved text again: whole-page text with a map back to the text nodes
  function locate(h) {
    if (!document.body) return null;
    const nodes = textNodes(document.body); let all = ''; const starts = [];
    for (const n of nodes) { starts.push(all.length); all += n.nodeValue; }
    let at = all.indexOf((h.prefix || '') + h.quote); if (at >= 0) at += (h.prefix || '').length; else at = all.indexOf(h.quote);
    if (at < 0) return null;
    const pos = (i) => { let k = 0; while (k + 1 < starts.length && starts[k + 1] <= i) k++; return [nodes[k], i - starts[k]]; };
    const r = document.createRange(); const [a, ao] = pos(at); const [b, bo] = pos(at + h.quote.length - 1);
    r.setStart(a, ao); r.setEnd(b, bo + 1); return r;
  }
  const applied = new Set();
  async function restore() {
    let list = []; try { list = await ipcRenderer.invoke('noam:hl-get'); } catch {}
    for (const h of list) { if (applied.has(h.id)) continue; try { const r = locate(h); if (r) { wrap(r, h); applied.add(h.id); } } catch {} }
  }
  addEventListener('DOMContentLoaded', () => { setTimeout(restore, 800); setTimeout(restore, 3500); });
  async function highlight(color) {
    const sel = getSelection(); if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0); const quote = sel.toString(); if (!quote.trim()) return;
    const pre = document.createRange(); pre.setStart(document.body, 0); pre.setEnd(range.startContainer, range.startOffset);
    const post = document.createRange(); post.setStart(range.endContainer, range.endOffset); post.setEndAfter(document.body.lastChild || document.body);
    const h = await ipcRenderer.invoke('noam:hl-save', { quote, prefix: pre.toString().slice(-40), suffix: post.toString().slice(0, 40), color });
    if (!h) return; wrap(range, h); applied.add(h.id); sel.removeAllRanges();
  }
  ipcRenderer.on('noam:hl-do', (_e, color) => highlight(color));
  addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'h') { const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName))) return; e.preventDefault(); highlight('yellow'); } }, true);
  // click a highlight: change colour, copy a link to it, or remove it
  let bub = null; const closeBub = () => { if (bub) { bub.remove(); bub = null; } };
  addEventListener('click', (e) => {
    const m = e.target && e.target.closest && e.target.closest('mark.noam-hl'); if (!m || !getSelection().isCollapsed) return;
    e.preventDefault(); e.stopPropagation(); closeBub();
    const id = m.dataset.hl, marks = () => document.querySelectorAll(`mark.noam-hl[data-hl="${CSS.escape(id)}"]`);
    const r = m.getBoundingClientRect();
    bub = document.createElement('div'); bub.style.cssText = 'all:initial;position:fixed;z-index:2147483647;left:0;top:0';
    const root = bub.attachShadow({ mode: 'closed' }); const sheet = new CSSStyleSheet();
    sheet.replaceSync(`.b{position:fixed;display:flex;gap:4px;align-items:center;background:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.25),0 0 0 1px rgba(0,0,0,.06);padding:6px;font:600 13px system-ui,"Segoe UI",sans-serif;color:#1d1836}
      button{border:0;cursor:pointer;border-radius:8px;height:28px;min-width:28px;background:none;font:inherit;color:inherit;padding:0 6px} button:hover{background:#f0eef7} .c{width:20px;height:20px;min-width:0;border-radius:50%;padding:0;box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)} i{width:1px;height:20px;background:#e3e0ee;margin:0 2px}
      @media (prefers-color-scheme:dark){.b{background:#221c3d;color:#ece8f7} button:hover{background:#2c2550} i{background:#3a3260}}`);
    root.adoptedStyleSheets = [sheet];
    const b = document.createElement('div'); b.className = 'b';
    b.style.left = Math.max(8, Math.min(innerWidth - 270, r.left)) + 'px'; b.style.top = (r.top > 60 ? r.top - 44 : r.bottom + 6) + 'px';
    b.innerHTML = Object.keys(COL).map((c) => `<button class="c" data-c="${c}" title="${c}" style="background:${COL[c]}"></button>`).join('') + '<i></i><button data-a="link" title="Copy a link that jumps to this">🔗 Link</button><button data-a="del" title="Remove highlight">🗑️</button>';
    root.appendChild(b); document.documentElement.appendChild(bub);
    b.onclick = async (ev) => {
      const btn = ev.target.closest('button'); if (!btn) return;
      if (btn.dataset.c) { await ipcRenderer.invoke('noam:hl-update', { id, color: btn.dataset.c }); marks().forEach((x) => (x.style.background = COL[btn.dataset.c])); }
      if (btn.dataset.a === 'link') await ipcRenderer.invoke('noam:hl-link', [...marks()].map((x) => x.textContent).join(''));
      if (btn.dataset.a === 'del') { await ipcRenderer.invoke('noam:hl-remove', id); marks().forEach((x) => x.replaceWith(...x.childNodes)); applied.delete(id); }
      closeBub();
    };
  }, true);
  addEventListener('mousedown', (e) => { if (bub && !e.composedPath().includes(bub)) closeBub(); }, true);
  addEventListener('scroll', closeBub, true);
}

// ---------------------------------------------------------------- video speed keys
// [ slower, ] faster, \ back to normal — on any site with a <video> (or playing audio).
if (cfg.media && cfg.media.speedKeys) {
  const STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
  let badge = null, hideT = null;
  const pick = () => {
    const vids = [...document.querySelectorAll('video, audio')].filter((v) => v.readyState > 0 && (v.tagName === 'VIDEO' || !v.paused));
    vids.sort((a, b) => (!b.paused - !a.paused) || ((b.tagName === 'VIDEO') - (a.tagName === 'VIDEO')) || (b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight));
    return vids[0];
  };
  const show = (v, rate) => {
    if (!cfg.media.speedOverlay) return;
    if (!badge) { badge = document.createElement('div'); badge.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;font:800 18px system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.72);padding:6px 12px;border-radius:10px;transition:opacity .25s'; (document.body || document.documentElement).appendChild(badge); }
    const r = v.getBoundingClientRect();
    badge.style.left = Math.max(8, r.left + 12) + 'px'; badge.style.top = Math.max(8, r.top + 12) + 'px';
    badge.textContent = (Math.round(rate * 100) / 100) + '×'; badge.style.opacity = '1';
    clearTimeout(hideT); hideT = setTimeout(() => { if (badge) badge.style.opacity = '0'; }, 900);
  };
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!['[', ']', '\\'].includes(e.key)) return;
    const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    const v = pick(); if (!v) return;
    e.preventDefault(); e.stopPropagation();
    const cur = v.playbackRate;
    let next = 1;
    if (e.key === ']') next = STEPS.find((s) => s > cur + 0.01) || 4;
    else if (e.key === '[') next = [...STEPS].reverse().find((s) => s < cur - 0.01) || 0.25;
    v.playbackRate = next; show(v, next);
  }, true);
}

if (cfg.internal && location.protocol === 'noam:' && window.top === window) {
  const allowed = new Set([
    'settings:get', 'settings:set', 'stats:get', 'history:list', 'history:delete', 'history:clear', 'bookmarks:list', 'bookmarks:remove',
    'bookmarks:add', 'bookmarks:update', 'downloads:list', 'downloads:open', 'downloads:show', 'downloads:cancel', 'downloads:pause', 'downloads:resume', 'downloads:clear', 'topsites:get',
    'data:clear', 'filters:info', 'filters:update', 'vpn:status', 'vpn:toggle', 'vpn:new-identity', 'shields:sites', 'shields:site-set', 'app:info',
    'search:engines', 'appearance:wallpaper', 'permissions:list', 'permissions:reset', 'tab:navigate', 'default-browser:set',
    'reader:get', 'passwords:list', 'passwords:reveal', 'passwords:remove', 'passwords:update', 'passwords:export', 'passwords:import',
    'passwords:never-remove', 'passwords:clear-clipboard-later', 'import:detect', 'import:run', 'import:passwords-help',
    'sync:status', 'sync:enable', 'sync:disable', 'sync:now', 'sync:choose-folder', 'update:status', 'update:check', 'update:install',
    'translate:languages', 'sitedark:list', 'sitedark:set', 'topsites:hide', 'topsites:unhide', 'topsites:reset',
    'widgets:geocode', 'widgets:weather', 'widgets:jewish', 'todos:list', 'todos:save', 'reading:list', 'reading:remove', 'reading:read',
    'notes:all', 'sessions:list', 'sessions:delete', 'sessions:open', 'screenshot:get', 'screenshot:copy', 'screenshot:save', 'passwords:check',
    'sync:cloud-folders', 'zmanim:alerts-info', 'zmanim:alerts-test', 'perf:state', 'perf:action', 'containers:clear', 'tm:list', 'tm:text', 'tm:thumb', 'tm:delete', 'tm:watch', 'tm:check', 'prices:list', 'prices:update', 'prices:remove', 'prices:check', 'prices:every', 'focus:state', 'focus:start', 'focus:pause', 'focus:resume', 'focus:stop', 'focus:break', 'focus:skip-break', 'focus:add-time', 'focus:rate', 'focus:stats', 'focus:delete', 'focus:resisted', 'focus:let-through', 'focus:block-info', 'screentime:get', 'screentime:set-limit', 'screentime:clear', 'screentime:csv',
    'ext:list', 'ext:toggle', 'ext:remove', 'ext:options', 'ext:folder', 'ext:reload', 'ext:install-id', 'ext:describe', 'readindex:stats', 'readindex:set', 'readindex:clear', 'forget:list', 'forget:remove', 'hl:list', 'hl:remove', 'hl:clear-page', 'hl:link',
  ]);
  const listeners = new Map();
  ipcRenderer.on('noam:page-event', (_e, name, data) => { for (const fn of listeners.get(name) || []) try { fn(data); } catch {} });
  contextBridge.exposeInMainWorld('noam', {
    invoke: (ch, ...args) => allowed.has(ch) ? ipcRenderer.invoke('noam:page:' + ch, ...args) : Promise.reject(new Error('blocked')),
    on: (name, fn) => { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); },
  });
}

// ---------------------------------------------------------------- JSON viewer
// Data files (JSON) are shown as a tidy, foldable tree instead of one long line.
if (window.top === window && /^https?:|^file:/.test(location.protocol)) {
  document.addEventListener('DOMContentLoaded', () => {
    if (!/json/i.test(document.contentType || '')) return;
    const pre = document.body && document.body.querySelector('pre');
    const raw = pre ? pre.textContent : (document.body && document.body.textContent) || '';
    if (raw.length > 30e6) return;
    let data; try { data = JSON.parse(raw); } catch { return; }
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    const css = `:root{color-scheme:${dark ? 'dark' : 'light'}}body{margin:0;font:13px/1.55 ui-monospace,Consolas,Menlo,monospace;background:${dark ? '#16122a' : '#fbfaff'};color:${dark ? '#ece8f7' : '#1d1836'}}
      .bar{position:sticky;top:0;display:flex;gap:6px;align-items:center;padding:8px 14px;background:${dark ? '#221c3d' : '#fff'};border-bottom:1px solid ${dark ? '#332b58' : '#e6e3f2'};font-family:system-ui,sans-serif;font-size:13px;z-index:2}
      .bar b{margin-right:8px}.bar button{border:0;border-radius:8px;padding:6px 12px;font-weight:700;background:${dark ? '#2c2550' : '#f0eefa'};color:inherit;cursor:pointer}.bar button.on{background:#6a55f5;color:#fff}
      .bar input{margin-left:auto;border:1px solid ${dark ? '#3a3266' : '#ddd8f0'};border-radius:8px;padding:6px 10px;background:transparent;color:inherit;width:220px}
      .tip{font-family:system-ui,sans-serif;color:${dark ? '#9c93b9' : '#6b6488'};padding:6px 14px 0;font-size:12px}
      #tree{padding:8px 14px 40px}.row{white-space:pre-wrap;word-break:break-word}.k{color:${dark ? '#ce93d8' : '#8e24aa'}}.s{color:${dark ? '#a5d6a7' : '#2e7d32'}}.n{color:${dark ? '#90caf9' : '#1565c0'}}.b{color:${dark ? '#ffb74d' : '#e65100'}}.z{color:#999}
      .tg{cursor:pointer;user-select:none;display:inline-block;width:14px;color:#999}.tg:hover{color:#6a55f5}.kids{padding-left:20px;border-left:1px dotted ${dark ? '#3a3266' : '#e0dcf0'};margin-left:5px}.closed>.kids{display:none}.cnt{color:#999;font-size:11px;margin-left:6px}
      .hit{background:#ffd84d66;border-radius:3px}pre.raw{margin:0;padding:14px;white-space:pre-wrap;word-break:break-all}a{color:inherit}`;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    let q = '';
    const val = (v) => {
      if (v === null) return '<span class="z">null</span>';
      if (typeof v === 'string') { const t = esc(JSON.stringify(v)); return /^https?:\/\//.test(v) ? `<span class="s">"<a href="${esc(v)}">${esc(v)}</a>"</span>` : `<span class="s">${t}</span>`; }
      if (typeof v === 'number') return `<span class="n">${v}</span>`;
      if (typeof v === 'boolean') return `<span class="b">${v}</span>`;
      return '';
    };
    const node = (k, v, depth, last) => {
      const key = k === null ? '' : `<span class="k">${esc(typeof k === 'number' ? k : JSON.stringify(k))}</span>: `;
      const comma = last ? '' : ',';
      if (v && typeof v === 'object') {
        const arr = Array.isArray(v); const ents = arr ? v.map((x, i) => [i, x]) : Object.entries(v);
        if (!ents.length) return `<div class="row">${key}${arr ? '[]' : '{}'}${comma}</div>`;
        const kids = ents.slice(0, 5000).map(([kk, vv], i) => node(arr ? i : kk, vv, depth + 1, i === Math.min(ents.length, 5000) - 1)).join('');
        return `<div class="row${depth > 2 ? ' closed' : ''}"><span class="tg">▾</span>${key}${arr ? '[' : '{'}<span class="cnt">${ents.length} ${arr ? 'items' : 'keys'}</span><div class="kids">${kids}${ents.length > 5000 ? '<div class="z">… ' + (ents.length - 5000) + ' more</div>' : ''}</div>${arr ? ']' : '}'}${comma}</div>`;
      }
      return `<div class="row">${key}${val(v)}${comma}</div>`;
    };
    document.head.innerHTML = `<meta charset="utf-8"><title>${esc(location.pathname.split('/').pop() || location.host)} (JSON)</title><style>${css}</style>`;
    document.body.innerHTML = `<div class="bar"><b>{ } JSON</b><button data-m="tree" class="on">Tree</button><button data-m="raw">Raw</button><button data-m="copy">Copy</button><button data-m="expand">Open all</button><button data-m="collapse">Close all</button><input placeholder="🔎 Find" spellcheck="false"></div>
      <div class="tip">💡 JSON is how websites send data to each other. Click ▾ to fold parts away.</div><div id="tree">${node(null, data, 0, true)}</div><pre class="raw" hidden>${esc(JSON.stringify(data, null, 2))}</pre>`;
    const tree = document.getElementById('tree'), rawEl = document.querySelector('pre.raw');
    tree.addEventListener('click', (e) => { if (e.target.classList.contains('tg')) { const r = e.target.parentElement; r.classList.toggle('closed'); e.target.textContent = r.classList.contains('closed') ? '▸' : '▾'; } });
    tree.querySelectorAll('.row.closed > .tg').forEach((t) => (t.textContent = '▸'));
    document.querySelectorAll('.bar button').forEach((b) => b.addEventListener('click', () => {
      const m = b.dataset.m;
      if (m === 'tree' || m === 'raw') { tree.hidden = m === 'raw'; rawEl.hidden = m === 'tree'; document.querySelectorAll('[data-m=tree],[data-m=raw]').forEach((x) => x.classList.toggle('on', x === b)); }
      if (m === 'copy') { navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => { b.textContent = 'Copied ✓'; setTimeout(() => (b.textContent = 'Copy'), 1500); }); }
      if (m === 'expand' || m === 'collapse') tree.querySelectorAll('.row').forEach((r) => { if (!r.querySelector(':scope > .kids')) return; r.classList.toggle('closed', m === 'collapse'); const t = r.querySelector(':scope > .tg'); if (t) t.textContent = m === 'collapse' ? '▸' : '▾'; });
    }));
    const find = document.querySelector('.bar input');
    find.addEventListener('input', () => {
      q = find.value.trim().toLowerCase();
      tree.querySelectorAll('.hit').forEach((h) => h.classList.remove('hit'));
      if (!q) return;
      let first = null;
      for (const sp of tree.querySelectorAll('.k, .s, .n, .b')) if (sp.textContent.toLowerCase().includes(q)) { sp.classList.add('hit'); first = first || sp; for (let p = sp.parentElement; p && p !== tree; p = p.parentElement) if (p.classList.contains('closed')) { p.classList.remove('closed'); const t = p.querySelector(':scope > .tg'); if (t) t.textContent = '▾'; } }
      if (first) first.scrollIntoView({ block: 'center' });
    });
  }, { once: true });
}
