// NoamBrowser 2.6 — share (clean link + QR code), "forget me when I close this site", dead-page rescue.
'use strict';
const { app, session, webContents } = require('electron');
const { stripTracking, hostOf } = require('./privacy');

module.exports = function setupExtras26({ settings, uiHandle, pageHandle, privatePartition, mainSession, containerSessions, readIndex, hostWindowOf }) {
  // ---------------------------------------------------------------- share
  let qrgen = null; try { const q = require('qrcode-generator'); qrgen = q.default || q; } catch {}
  uiHandle('share:info', (_e, url) => {
    url = String(url || '');
    const clean = stripTracking(url) || url;
    let removed = 0; try { removed = [...new URL(url).searchParams.keys()].length - [...new URL(clean).searchParams.keys()].length; } catch {}
    let qr = null;
    if (qrgen && clean.length < 1800) { try { const c = qrgen(0, 'M'); c.addData(clean); c.make(); qr = 'data:image/svg+xml;base64,' + Buffer.from(c.createSvgTag({ cellSize: 6, margin: 3, scalable: true })).toString('base64'); } catch {} }
    return { clean, removed, qr };
  });

  // ---------------------------------------------------------------- forget-me sites
  const F = () => ({ sites: [], ...(settings.get('forget') || {}) });
  const siteOf = (h) => { const p = String(h || '').replace(/^www\./, '').split('.'); return p.length > 2 && !/^(co|com|org|net|ac|gov)$/.test(p[p.length - 2]) ? p.slice(-2).join('.') : p.length > 2 ? p.slice(-3).join('.') : p.join('.'); };
  const isForgot = (h) => { const s = siteOf(h); return F().sites.includes(s); };
  uiHandle('forget:get', (_e, host) => ({ on: isForgot(host), site: siteOf(host) }));
  uiHandle('forget:set', (_e, { host, on }) => { const s = siteOf(host); const set = new Set(F().sites); if (on) set.add(s); else set.delete(s); settings.set('forget', { ...F(), sites: [...set] }); return { on: !!on, site: s }; });
  async function wipe(site) {
    const sessions = [mainSession(), ...containerSessions()];
    for (const ses of sessions) {
      try { for (const c of await ses.cookies.get({})) { const d = c.domain.replace(/^\./, ''); if (d === site || d.endsWith('.' + site)) await ses.cookies.remove((c.secure ? 'https://' : 'http://') + d + c.path, c.name).catch(() => {}); } } catch {}
      for (const o of [site, 'www.' + site]) for (const p of ['https://', 'http://']) { try { await ses.clearStorageData({ origin: p + o, storages: ['localstorage', 'indexdb', 'serviceworkers', 'cachestorage', 'websql', 'filesystem', 'shadercache'] }); } catch {} }
    }
    if (readIndex) readIndex.forgetHost(site);
  }
  uiHandle('forget:closed', async (_e, host) => { if (!isForgot(host)) return false; await wipe(siteOf(host)); return true; });
  pageHandle('forget:list', () => F().sites);
  pageHandle('forget:remove', (_e, s) => { settings.set('forget', { ...F(), sites: F().sites.filter((x) => x !== s) }); return F().sites; });
  app.on('before-quit', () => { for (const s of F().sites) wipe(s); });

  // ---------------------------------------------------------------- dead-page rescue
  app.on('web-contents-created', (_e, wc) => {
    if (wc.getType() !== 'webview') return;
    wc.on('did-navigate', (_ev, url, code) => {
      if (![404, 410].includes(code) || !/^https?:/.test(url)) return;
      const win = hostWindowOf(wc); if (win) win.webContents.send('dead:page', { wcId: wc.id, url, code });
    });
  });
  return { isForgot, siteOf };
};
