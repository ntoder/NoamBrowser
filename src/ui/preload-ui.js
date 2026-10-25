const { contextBridge, ipcRenderer } = require('electron');

const INVOKE = new Set([
  'ui:paths', 'ui:suggest', 'ui:resolve-input', 'history:add', 'history:meta', 'session:save', 'bookmarks:toggle', 'bookmarks:list',
  'shields:tab', 'shields:toggle-site', 'shields:forget-site', 'vpn:toggle', 'vpn:status', 'vpn:new-identity', 'vpn:set', 'settings:get',
  'settings:set', 'stats:get', 'downloads:list', 'downloads:action', 'private:clear', 'window:new', 'window:control', 'window:set-fullscreen',
  'page:zoom', 'page:save', 'page:menu', 'page:screenshot', 'shell:show', 'webview:prepare',
  'ui:popup-menu', 'password:answer', 'passwords:for-tab', 'passwords:fill', 'reader:check', 'reader:open', 'translate:detect', 'translate:page',
  'translate:restore', 'translate:languages', 'update:status', 'update:install', 'dark:toggle', 'dark:get', 'history:remove-url',
]);
const EVENTS = new Set([
  'init', 'tab:open', 'shortcut', 'shields:update', 'vpn:status', 'settings:changed', 'bookmarks:changed', 'downloads:update',
  'permission:ask', 'stats:update', 'window:state', 'zoom:changed', 'password:offer', 'translate:progress', 'update:status',
]);

contextBridge.exposeInMainWorld('nb', {
  invoke: (ch, ...a) => (INVOKE.has(ch) ? ipcRenderer.invoke(ch, ...a) : Promise.reject(new Error('unknown channel ' + ch))),
  on: (ch, fn) => { if (EVENTS.has(ch)) ipcRenderer.on(ch, (_e, ...a) => fn(...a)); },
  answerPermission: (id, allow, remember) => ipcRenderer.send('permission:answer', { id, allow, remember }),
  platform: process.platform,
});
