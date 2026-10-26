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
if (cfg.dark) {
  try {
    const key = webFrame.insertCSS(`
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
    'sync:cloud-folders', 'zmanim:alerts-info', 'zmanim:alerts-test', 'screentime:get', 'screentime:set-limit', 'screentime:clear', 'screentime:csv',
  ]);
  const listeners = new Map();
  ipcRenderer.on('noam:page-event', (_e, name, data) => { for (const fn of listeners.get(name) || []) try { fn(data); } catch {} });
  contextBridge.exposeInMainWorld('noam', {
    invoke: (ch, ...args) => allowed.has(ch) ? ipcRenderer.invoke('noam:page:' + ch, ...args) : Promise.reject(new Error('blocked')),
    on: (name, fn) => { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); },
  });
}
