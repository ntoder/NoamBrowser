// Runs inside extension background service workers. Chrome keeps an extension's right-click menu items
// between restarts, so extensions only create them in runtime.onInstalled; here they'd vanish after a
// restart. We call those listeners once at startup (reason "chrome_update", which extensions treat as
// "the browser was updated": set things up again, no welcome tabs).
'use strict';
const { contextBridge } = require('electron');
try {
  if (process.type === 'service-worker' && contextBridge.executeInMainWorld) {
    contextBridge.executeInMainWorld({
      func: () => {
        const ev = globalThis.chrome && chrome.runtime && chrome.runtime.onInstalled;
        if (!ev || ev.__noam) return;
        const add = ev.addListener.bind(ev); ev.__noam = true;
        ev.addListener = (fn) => { add(fn); setTimeout(() => { try { fn({ reason: 'chrome_update', previousVersion: chrome.runtime.getManifest().version }); } catch (e) { console.error(e); } }, 30); };
      },
    });
  }
} catch (e) { console.error('noam sw preload', e); }
