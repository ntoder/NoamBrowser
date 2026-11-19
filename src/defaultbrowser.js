// NoamBrowser — making NoamBrowser your default browser, so links from WhatsApp, email and other apps open here.
// Windows only lists browsers that register themselves (StartMenuInternet + RegisteredApplications), then lets
// you pick one in Settings → Default apps. macOS asks you itself. Linux uses xdg-settings.
'use strict';
const { app, shell } = require('electron');
const { execFile } = require('child_process');

module.exports = function setupDefaultBrowser({ settings, uiHandle, pageHandle }) {
  const run = (cmd, args) => new Promise((res) => { try { execFile(cmd, args, { windowsHide: true, timeout: 8000 }, (e, out) => res(e ? null : String(out))); } catch { res(null); } });
  const NAME = 'NoamBrowser', PROG = 'NoamBrowserHTML';
  // the portable .exe runs from a temporary folder; the file you double-clicked is in PORTABLE_EXECUTABLE_FILE
  const exe = () => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;

  async function registerWindows() {
    if (process.platform !== 'win32' || !app.isPackaged) return false;
    const e = exe(), cmd = `"${e}" "%1"`, icon = `"${e}",0`;
    const C = 'HKCU\\Software\\Classes\\' + PROG, S = 'HKCU\\Software\\Clients\\StartMenuInternet\\' + NAME, CAP = S + '\\Capabilities';
    const add = (key, name, value) => run('reg', ['add', key, ...(name == null ? ['/ve'] : ['/v', name]), '/t', 'REG_SZ', '/d', value, '/f']);
    const steps = [
      [C, null, 'NoamBrowser web page'], [C, 'URL Protocol', ''], [C + '\\DefaultIcon', null, icon], [C + '\\shell\\open\\command', null, cmd],
      [C + '\\Application', 'ApplicationName', NAME], [C + '\\Application', 'ApplicationIcon', icon], [C + '\\Application', 'ApplicationDescription', 'Private, fast and fun'],
      [S, null, NAME], [S + '\\DefaultIcon', null, icon], [S + '\\shell\\open\\command', null, `"${e}"`],
      [CAP, 'ApplicationName', NAME], [CAP, 'ApplicationDescription', 'NoamBrowser: private, fast and fun'], [CAP, 'ApplicationIcon', icon],
      [CAP + '\\StartMenu', 'StartMenuInternet', NAME],
      [CAP + '\\URLAssociations', 'http', PROG], [CAP + '\\URLAssociations', 'https', PROG],
      ...['.htm', '.html', '.shtml', '.xht', '.xhtml', '.svg', '.pdf'].map((x) => [CAP + '\\FileAssociations', x, PROG]),
      ['HKCU\\Software\\RegisteredApplications', NAME, 'Software\\Clients\\StartMenuInternet\\' + NAME + '\\Capabilities'],
    ];
    for (const [k, n, v] of steps) await add(k, n, v);
    return true;
  }
  async function isDefault() {
    if (!app.isPackaged && !process.env.NOAM_TEST) return false;
    if (process.platform === 'win32') { const o = await run('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice', '/v', 'ProgId']); return !!o && o.includes(PROG); }
    if (process.platform === 'linux') { const o = await run('xdg-settings', ['get', 'default-web-browser']); return !!o && /noambrowser/i.test(o); }
    try { return app.isDefaultProtocolClient('https'); } catch { return false; }
  }
  async function makeDefault() {
    if (process.platform === 'win32') {
      await registerWindows();
      // Windows doesn't let apps switch it themselves: this opens NoamBrowser's own page in Default apps
      await shell.openExternal('ms-settings:defaultapps?registeredAppUser=' + NAME).catch(() => shell.openExternal('ms-settings:defaultapps'));
      return { ok: true, how: 'windows' };
    }
    if (process.platform === 'darwin') { app.setAsDefaultProtocolClient('http'); app.setAsDefaultProtocolClient('https'); return { ok: true, how: 'mac' }; }
    const r = await run('xdg-settings', ['set', 'default-web-browser', 'noambrowser.desktop']);
    if (r === null) { app.setAsDefaultProtocolClient('http'); app.setAsDefaultProtocolClient('https'); }
    return { ok: true, how: 'linux', isDefault: await isDefault() };
  }
  // keep the Windows registration up to date (the app may have moved), so NoamBrowser is always in the list
  if (process.platform === 'win32' && app.isPackaged) setTimeout(() => registerWindows().catch(() => {}), 15000);

  // a gentle question from the 3rd start, not again for 2 weeks after "Not now", never after "Don't ask again"
  const s0 = settings.get('defaultBrowser') || {}; settings.set('defaultBrowser', { ...s0, launches: (s0.launches || 0) + 1 });
  uiHandle('default-browser:status', async () => {
    const d = settings.get('defaultBrowser') || {}; const def = await isDefault();
    const ask = !def && !d.never && (d.launches || 0) >= 3 && Date.now() - (d.later || 0) > 14 * 86400e3 && (app.isPackaged || !!process.env.NOAM_TEST_DEFAULT);
    return { isDefault: def, ask, platform: process.platform };
  });
  uiHandle('default-browser:answer', (_e, a) => { const d = settings.get('defaultBrowser') || {}; if (a === 'never') d.never = true; if (a === 'later') d.later = Date.now(); settings.set('defaultBrowser', d); return true; });
  uiHandle('default-browser:set', () => makeDefault());
  pageHandle('default-browser:set', () => makeDefault());
  pageHandle('default-browser:status', async () => ({ isDefault: await isDefault(), platform: process.platform }));
  return { isDefault, makeDefault };
};
