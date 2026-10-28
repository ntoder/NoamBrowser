// Loads a page in an invisible window, runs a script on it, and closes it.
// Used by the price tracker and the time machine's "watch this page". One page at a time.
const { BrowserWindow } = require('electron');

let queue = Promise.resolve();
module.exports = function loadAndRun(getSession, url, code, { timeout = 35000, wait = 2500 } = {}) {
  const job = () => new Promise((resolve, reject) => {
    let win;
    try {
      win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { session: getSession(), sandbox: true, contextIsolation: true, backgroundThrottling: false, offscreen: false } });
    } catch (e) { return reject(e); }
    win.webContents.setAudioMuted(true);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    let done = false;
    const finish = (err, val) => { if (done) return; done = true; clearTimeout(t); try { win.destroy(); } catch {} err ? reject(err) : resolve(val); };
    const t = setTimeout(() => finish(new Error('The page took too long to load.')), timeout);
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      try { finish(null, await win.webContents.executeJavaScript(code, true)); } catch (e) { finish(e); }
    }, wait));
    win.webContents.on('did-fail-load', (_e, codeN, desc, _u, isMain) => { if (isMain && codeN !== -3) finish(new Error(desc || 'Couldn’t load the page.')); });
    win.loadURL(url).catch(() => {});
  });
  const p = queue.then(job, job);
  queue = p.catch(() => {});
  return p;
};
