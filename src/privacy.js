// NoamBrowser Shields: ad + tracker blocking, cosmetic filtering, HTTPS
// upgrades, tracking-parameter stripping, third-party cookie blocking,
// referrer trimming and Global Privacy Control. One request pipeline per
// session (Electron allows only one webRequest listener per event).
const { ipcMain, webContents, net } = require('electron');
const fs = require('fs');
const path = require('path');
const { ElectronBlocker, fromElectronDetails } = require('@ghostery/adblocker-electron');
const COSMETIC_PRELOAD = require.resolve('@ghostery/adblocker-electron-preload');
const { parse } = require('tldts-experimental');
const { LISTS } = require('./lists');

const TRACKING_PARAMS = new Set([
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'mc_eid', 'mc_cid', 'igshid', 'igsh', 'yclid',
  '_hsenc', '_hsmi', '__hssc', '__hstc', '__hsfp', 'hsCtaTracking', 'mkt_tok', 'oly_anon_id', 'oly_enc_id', 'vero_id', 'vero_conv',
  'wickedid', 'twclid', 'ttclid', 'srsltid', 'rb_clickid', 's_cid', 'ml_subscriber', 'ml_subscriber_hash', 'epik', 'li_fat_id',
  'trk_contact', 'trk_msg', 'trk_module', 'trk_sid', 'gs_lcrp', 'sca_esv', 'ved', 'ei', 'uact', '_ga', '_gl', 'pk_campaign', 'pk_kwd',
]);
const TRACKING_PREFIXES = ['utm_', 'pk_', 'mtm_', 'stm_'];
// Google search uses ved/ei internally for its own pages; only strip those off-Google.
const GOOGLE_ONLY = new Set(['ved', 'ei', 'uact', 'gs_lcrp', 'sca_esv']);
// Google refuses sign-in from embedded-Chromium browsers. On its login hosts we
// present as Firefox (headers + client hints), which Google accepts.
const FIREFOX_UA = process.platform === 'darwin'
  ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0'
  : process.platform === 'linux' ? 'Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0'
  : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0';
const GOOGLE_AUTH_HOSTS = new Set(['accounts.google.com', 'accounts.youtube.com', 'myaccount.google.com', 'gds.google.com', 'ogs.google.com']);
function isGoogleAuthHost(h) { return GOOGLE_AUTH_HOSTS.has(h) || /^accounts\.google\.[a-z.]+$/.test(h); }
const AVG_BLOCKED_BYTES = 23 * 1024; // rough average of a blocked ad/tracker resource

function siteOf(urlOrHost) {
  try {
    const p = parse(urlOrHost);
    return p.domain || p.hostname || '';
  } catch { return ''; }
}
function hostOf(url) { try { return new URL(url).hostname; } catch { return ''; } }
function isLocalHost(h) {
  return !h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.lan') || h.endsWith('.internal') || h.endsWith('.home.arpa') ||
    /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.startsWith('[') || !h.includes('.');
}

function stripTracking(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (!u.search) return null;
  const isGoogle = /(^|\.)google\.[a-z.]+$/.test(u.hostname);
  let changed = false;
  for (const key of [...u.searchParams.keys()]) {
    const k = key.toLowerCase();
    if ((TRACKING_PARAMS.has(k) && !(isGoogle && GOOGLE_ONLY.has(k))) || TRACKING_PREFIXES.some((p) => k.startsWith(p))) {
      u.searchParams.delete(key); changed = true;
    }
  }
  return changed ? u.toString() : null;
}

class Shields {
  constructor({ settings, stats, userData, appPath, onBlocked }) {
    this.settings = settings;
    this.stats = stats;
    this.onBlocked = onBlocked; // (wcId, info) => void
    this.userData = userData;
    this.appPath = appPath;
    this.blocker = null;
    this.tabs = new Map(); // wcId -> { url, host, site, blocked, upgraded, cookiesBlocked, paramsStripped, list: [] }
    this.httpExceptions = new Set();
    this.upgradeHits = new Map();
    this.sessions = new Set();
  }

  async init() {
    const userEngine = path.join(this.userData, 'filters', 'engine.bin');
    const bundled = path.join(this.appPath, 'vendor', 'lists', 'engine.bin');
    for (const f of [userEngine, bundled]) {
      try {
        if (fs.existsSync(f)) { this.blocker = ElectronBlocker.deserialize(new Uint8Array(fs.readFileSync(f))); this.engineFile = f; break; }
      } catch (e) { console.error('engine load failed', f, e.message); }
    }
    if (!this.blocker) this.blocker = ElectronBlocker.empty();
    this.registerCosmeticIPC();
  }

  engineInfo() {
    let built = null;
    try { built = fs.statSync(this.engineFile).mtime.toISOString(); } catch {}
    return { built, lists: LISTS.map((l) => ({ id: l.id, name: l.name })), source: this.engineFile && this.engineFile.startsWith(this.userData) ? 'updated' : 'bundled' };
  }

  // Download fresh filter lists from GitHub and rebuild the engine locally.
  async updateLists(progress = () => {}) {
    const texts = [];
    for (let i = 0; i < LISTS.length; i++) {
      progress({ step: i + 1, total: LISTS.length, name: LISTS[i].name });
      const res = await net.fetch(LISTS[i].url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`${LISTS[i].name}: HTTP ${res.status}`);
      texts.push(await res.text());
    }
    const engine = ElectronBlocker.parse(texts.join('\n'), { enableCompression: true, loadCosmeticFilters: true, loadNetworkFilters: true, enableMutationObserver: true, guessRequestTypeFromUrl: true });
    const dir = path.join(this.userData, 'filters');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'engine.bin'), engine.serialize());
    this.blocker = engine;
    this.engineFile = path.join(dir, 'engine.bin');
    return this.engineInfo();
  }

  registerCosmeticIPC() {
    ipcMain.handle('@ghostery/adblocker/inject-cosmetic-filters', (event, url, msg) => {
      if (!this.settings.get('shields').ads || !/^https?:/.test(url || '')) return;
      const top = this.topUrlFor(event.sender);
      if (top && !this.shieldsUpFor(hostOf(top))) return;
      return this.blocker.onInjectCosmeticFilters(event, url, msg);
    });
    ipcMain.handle('@ghostery/adblocker/is-mutation-observer-enabled', () => true);
  }

  topUrlFor(wc) {
    try { return wc.getURL(); } catch { return ''; }
  }

  shieldsUpFor(host) {
    if (!host) return true;
    const site = siteOf(host);
    const off = this.settings.get('siteShieldsOff') || {};
    return !off[site];
  }

  tab(wcId) {
    let t = this.tabs.get(wcId);
    if (!t) { t = { url: '', host: '', site: '', blocked: 0, upgraded: 0, cookiesBlocked: 0, paramsStripped: 0, list: [] }; this.tabs.set(wcId, t); }
    return t;
  }
  resetTab(wcId, url) {
    const t = this.tab(wcId);
    Object.assign(t, { url, host: hostOf(url), site: siteOf(url), blocked: 0, upgraded: 0, cookiesBlocked: 0, paramsStripped: 0, list: [] });
    this.onBlocked(wcId, this.tabSummary(wcId));
  }
  tabSummary(wcId) {
    const t = this.tab(wcId);
    const byHost = {};
    for (const u of t.list) { const h = hostOf(u); byHost[h] = (byHost[h] || 0) + 1; }
    return {
      host: t.host, site: t.site, blocked: t.blocked, upgraded: t.upgraded, cookiesBlocked: t.cookiesBlocked, paramsStripped: t.paramsStripped,
      shieldsUp: this.shieldsUpFor(t.host),
      topBlocked: Object.entries(byHost).sort((a, b) => b[1] - a[1]).slice(0, 12),
    };
  }

  countBlocked(wcId, url) {
    const t = this.tab(wcId);
    t.blocked++;
    if (t.list.length < 500) t.list.push(url);
    const s = this.stats.get();
    s.totalBlocked++;
    s.bytesSaved += AVG_BLOCKED_BYTES;
    const day = new Date().toISOString().slice(0, 10);
    s.days[day] = (s.days[day] || 0) + 1;
    const keys = Object.keys(s.days); if (keys.length > 60) delete s.days[keys.sort()[0]];
    this.stats.save();
    this.scheduleNotify(wcId);
  }

  scheduleNotify(wcId) {
    this.pending = this.pending || new Set();
    this.pending.add(wcId);
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      for (const id of this.pending) this.onBlocked(id, this.tabSummary(id));
      this.pending.clear();
    }, 250);
  }

  firstPartySite(details) {
    if (details.resourceType === 'mainFrame') return siteOf(details.url);
    const t = details.webContentsId && this.tabs.get(details.webContentsId);
    if (t && t.site) return t.site;
    if (details.webContentsId) {
      const wc = webContents.fromId(details.webContentsId);
      if (wc) return siteOf(wc.getURL());
    }
    return null;
  }

  attach(ses, { framePreload }) {
    if (this.sessions.has(ses)) return;
    this.sessions.add(ses);
    ses.registerPreloadScript({ type: 'frame', filePath: COSMETIC_PRELOAD });
    if (framePreload) ses.registerPreloadScript({ type: 'frame', filePath: framePreload });

    ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, cb) => {
      try { cb(this.onBeforeRequest(details) || {}); } catch (e) { console.error(e); cb({}); }
    });
    ses.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, (details, cb) => {
      try { cb(this.onBeforeSendHeaders(details)); } catch (e) { console.error(e); cb({ requestHeaders: details.requestHeaders }); }
    });
    ses.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (details, cb) => {
      try { cb(this.onHeadersReceived(details) || {}); } catch (e) { console.error(e); cb({}); }
    });
  }

  onBeforeRequest(details) {
    const { url, resourceType, webContentsId } = details;
    if (!/^https?:|^wss?:/.test(url)) return;
    const sh = this.settings.get('shields');
    const isMain = resourceType === 'mainFrame';
    const isFrame = isMain || resourceType === 'subFrame';
    const host = hostOf(url);

    // Focus mode can stop a tab from opening a distracting site (it then shows its own reminder page).
    if (isFrame && webContentsId && this.navGuard) { const g = this.navGuard(details); if (g) return g; }
    if (isMain && webContentsId) {
      const t = this.tab(webContentsId);
      if (t.url !== url && siteOf(url) !== t.site) this.resetTab(webContentsId, url);
      else { t.url = url; t.host = host; t.site = siteOf(url); }
    }
    const topSite = this.firstPartySite(details);
    const topHost = isMain ? host : (this.tabs.get(webContentsId)?.host || topSite);
    const up = this.shieldsUpFor(topHost);

    // HTTPS-only: upgrade top-level and frame navigations.
    if (up && sh.httpsOnly && isFrame && url.startsWith('http://') && !isLocalHost(host) && !this.httpExceptions.has(host)) {
      const key = host; const now = Date.now();
      const hits = (this.upgradeHits.get(key) || []).filter((x) => now - x < 6000);
      hits.push(now); this.upgradeHits.set(key, hits);
      if (hits.length > 3) { this.httpExceptions.add(host); } // site keeps bouncing back to http
      else {
        if (webContentsId) this.tab(webContentsId).upgraded++;
        return { redirectURL: 'https://' + url.slice(7) };
      }
    }

    // Strip tracking parameters from navigations.
    if (up && sh.stripParams && isFrame) {
      const clean = stripTracking(url);
      if (clean) { if (webContentsId) this.tab(webContentsId).paramsStripped++; return { redirectURL: clean }; }
    }

    if (isMain || !up || !sh.ads) return;
    const request = fromElectronDetails(details);
    if (request.type === 'other') request.guessTypeOfRequest();
    const { redirect, match } = this.blocker.match(request);
    if (redirect) { if (webContentsId) this.countBlocked(webContentsId, url); return { redirectURL: redirect.dataUrl }; }
    if (match) { if (webContentsId) this.countBlocked(webContentsId, url); return { cancel: true }; }
  }

  isThirdParty(details) {
    const top = this.firstPartySite(details);
    if (!top) return false;
    const s = siteOf(details.url);
    return !!s && s !== top;
  }

  onBeforeSendHeaders(details) {
    const h = details.requestHeaders;
    const sh = this.settings.get('shields');
    if (sh.gpc) { h['Sec-GPC'] = '1'; h['DNT'] = '1'; }
    const topHost = this.tabs.get(details.webContentsId)?.host;
    if (isGoogleAuthHost(hostOf(details.url)) || (details.resourceType !== 'mainFrame' && isGoogleAuthHost(topHost || ''))) {
      for (const k of Object.keys(h)) if (/^sec-ch-ua/i.test(k) || k.toLowerCase() === 'user-agent') delete h[k];
      h['User-Agent'] = FIREFOX_UA;
    } else if (this.chromeUA) {
      for (const k of Object.keys(h)) if (k.toLowerCase() === 'user-agent' && /Firefox\//.test(h[k])) { delete h[k]; h['User-Agent'] = this.chromeUA; }
    }
    if (details.resourceType === 'mainFrame') return { requestHeaders: h };
    if (!this.shieldsUpFor(topHost)) return { requestHeaders: h };
    if (this.isThirdParty(details)) {
      if (sh.blockThirdPartyCookies && (h.Cookie || h.cookie)) {
        delete h.Cookie; delete h.cookie;
        const t = this.tabs.get(details.webContentsId); if (t) t.cookiesBlocked++;
      }
      // Trim cross-site referrers to just the origin.
      const ref = h.Referer || h.referer;
      if (ref) { try { const r = new URL(ref); h.Referer = r.origin + '/'; delete h.referer; } catch { delete h.Referer; } }
    }
    return { requestHeaders: h };
  }

  onHeadersReceived(details) {
    const sh = this.settings.get('shields');
    let headers = details.responseHeaders;
    let changed = false;
    const topHost = details.resourceType === 'mainFrame' ? hostOf(details.url) : this.tabs.get(details.webContentsId)?.host;
    const up = this.shieldsUpFor(topHost);
    if (up && sh.blockThirdPartyCookies && details.resourceType !== 'mainFrame' && this.isThirdParty(details)) {
      for (const k of Object.keys(headers || {})) if (k.toLowerCase() === 'set-cookie') { delete headers[k]; changed = true; }
    }
    if (up && sh.ads && (details.resourceType === 'mainFrame' || details.resourceType === 'subFrame')) {
      const csp = this.blocker.getCSPDirectives(fromElectronDetails(details));
      if (csp) {
        const policies = csp.split(';').map((c) => c.trim());
        for (const [name, values] of Object.entries(headers || {})) {
          if (name.toLowerCase() === 'content-security-policy') { policies.push(...values); delete headers[name]; }
        }
        headers['content-security-policy'] = [policies.join(';')];
        changed = true;
      }
    }
    return changed ? { responseHeaders: headers } : {};
  }

  // Called by main when an upgraded navigation fails to load over HTTPS.
  httpsFailed(url, wcId) {
    const host = hostOf(url);
    if (!host) return null;
    this.httpExceptions.add(host);
    if (wcId) { const t = this.tab(wcId); t.upgraded = Math.max(0, t.upgraded - 1); }
    return 'http://' + url.replace(/^https:\/\//, '');
  }
}

module.exports = { Shields, siteOf, hostOf, stripTracking, isGoogleAuthHost, FIREFOX_UA };
