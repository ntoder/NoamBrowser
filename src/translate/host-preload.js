const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('host', {
  onRequest: (fn) => ipcRenderer.on('translate:req', (_e, msg) => fn(msg)),
  respond: (id, payload) => ipcRenderer.send('translate:res', { id, ...payload }),
  ready: () => ipcRenderer.send('translate:ready'),
  log: (m) => ipcRenderer.send('translate:log', String(m)),
});
