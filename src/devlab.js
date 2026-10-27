// Dev Lab bridge: talks to a tab through the Chrome DevTools Protocol and
// streams what the page does (network, console, picks) to the Dev Lab drawer.
const { webContents } = require('electron');

// Only these protocol commands can be sent from the drawer.
const ALLOWED = new Set([
  'DOM.getDocument', 'DOM.resolveNode', 'DOM.describeNode', 'DOM.pushNodesByBackendIdsToFrontend', 'DOM.requestNode', 'DOM.getBoxModel', 'DOM.getNodeForLocation',
  'Overlay.setInspectMode', 'Overlay.highlightNode', 'Overlay.hideHighlight', 'Overlay.setShowGridOverlays', 'Overlay.setShowFlexOverlays',
  'Overlay.setShowFPSCounter', 'Overlay.setShowPaintRects', 'Overlay.setShowLayoutShiftRegions', 'Overlay.setShowScrollBottleneckRects',
  'Runtime.evaluate', 'Runtime.callFunctionOn', 'Runtime.getProperties', 'Runtime.releaseObject', 'Runtime.releaseObjectGroup',
  'Network.getResponseBody', 'Network.setCacheDisabled', 'Network.emulateNetworkConditions', 'Network.clearBrowserCache',
  'Emulation.setDeviceMetricsOverride', 'Emulation.clearDeviceMetricsOverride', 'Emulation.setTouchEmulationEnabled', 'Emulation.setEmitTouchEventsForMouse',
  'Emulation.setUserAgentOverride', 'Emulation.setEmulatedMedia', 'Emulation.setEmulatedVisionDeficiency', 'Emulation.setCPUThrottlingRate',
  'Animation.enable', 'Animation.setPlaybackRate', 'Animation.getPlaybackRate', 'Performance.getMetrics',
  'Debugger.pause', 'Debugger.resume', 'Debugger.getScriptSource', 'Page.reload', 'Page.getLayoutMetrics', 'Page.getFrameTree',
  'CSS.createStyleSheet', 'CSS.setStyleSheetText',
]);

module.exports = function setupDevLab({ uiHandle, hostWindowOf }) {
  const sessions = new Map(); // wcId -> { host, scripts }

  function send(wcId, method, params) {
    const s = sessions.get(wcId); if (!s || s.host.isDestroyed()) return;
    s.host.send('devlab:event', { wcId, method, params });
  }

  async function attach(wcId, host) {
    const wc = webContents.fromId(wcId); if (!wc || wc.isDestroyed()) throw new Error('This tab is gone.');
    if (sessions.has(wcId)) { sessions.get(wcId).host = host; return { ok: true, already: true }; }
    const dbg = wc.debugger;
    if (!dbg.isAttached()) dbg.attach('1.3');
    const s = { host, scripts: new Map() };
    sessions.set(wcId, s);
    dbg.on('message', (_e, method, params) => {
      if (method === 'Debugger.scriptParsed') { if (params.url && /^https?:/.test(params.url)) s.scripts.set(params.scriptId, { id: params.scriptId, url: params.url, length: params.length || 0 }); return; }
      if (method.startsWith('Network.') || method === 'Runtime.consoleAPICalled' || method === 'Runtime.exceptionThrown' || method === 'Log.entryAdded'
        || method === 'Overlay.inspectNodeRequested' || method === 'Page.frameNavigated' || method === 'Page.loadEventFired' || method === 'Debugger.paused' || method === 'Debugger.resumed') {
        if (method === 'Page.frameNavigated' && !params.frame.parentId) s.scripts.clear();
        // trim big payloads before they cross into the drawer
        if (method === 'Network.requestWillBeSent') params = { requestId: params.requestId, loaderId: params.loaderId, type: params.type, timestamp: params.timestamp, request: { url: params.request.url, method: params.request.method, headers: params.request.headers } };
        else if (method === 'Network.responseReceived') params = { requestId: params.requestId, type: params.type, timestamp: params.timestamp, response: { url: params.response.url, status: params.response.status, statusText: params.response.statusText, mimeType: params.response.mimeType, headers: params.response.headers, remoteIPAddress: params.response.remoteIPAddress, protocol: params.response.protocol, fromDiskCache: params.response.fromDiskCache } };
        else if (method === 'Network.dataReceived' || method === 'Network.requestWillBeSentExtraInfo' || method === 'Network.responseReceivedExtraInfo') return;
        send(wcId, method, params);
      }
    });
    dbg.on('detach', () => { sessions.delete(wcId); try { if (!host.isDestroyed()) host.send('devlab:event', { wcId, method: 'detached', params: {} }); } catch {} });
    wc.once('destroyed', () => sessions.delete(wcId));
    for (const d of ['Network.enable', 'Runtime.enable', 'Log.enable', 'Page.enable', 'DOM.enable', 'CSS.enable', 'Overlay.enable', 'Debugger.enable']) {
      try { await dbg.sendCommand(d, d === 'Network.enable' ? { maxTotalBufferSize: 20e6, maxResourceBufferSize: 5e6 } : {}); } catch {}
    }
    try { await dbg.sendCommand('Debugger.setSkipAllPauses', { skip: true }); } catch {}
    return { ok: true };
  }

  function detach(wcId) {
    const wc = webContents.fromId(wcId);
    sessions.delete(wcId);
    if (wc && !wc.isDestroyed() && wc.debugger.isAttached()) {
      const dbg = wc.debugger;
      Promise.allSettled([
        dbg.sendCommand('Overlay.setInspectMode', { mode: 'none', highlightConfig: {} }), dbg.sendCommand('Overlay.hideHighlight'),
        dbg.sendCommand('Emulation.clearDeviceMetricsOverride'), dbg.sendCommand('Emulation.setEmulatedVisionDeficiency', { type: 'none' }),
        dbg.sendCommand('Emulation.setEmulatedMedia', { features: [] }), dbg.sendCommand('Emulation.setCPUThrottlingRate', { rate: 1 }),
      ]).finally(() => { try { dbg.detach(); } catch {} });
    }
    return true;
  }

  uiHandle('devlab:attach', (e, wcId) => attach(wcId, e.sender));
  uiHandle('devlab:detach', (_e, wcId) => detach(wcId));
  uiHandle('devlab:cmd', async (_e, { wcId, method, params }) => {
    if (!ALLOWED.has(method)) throw new Error('Not allowed: ' + method);
    const wc = webContents.fromId(wcId); if (!wc || !wc.debugger.isAttached()) throw new Error('Dev Lab isn’t connected to this tab.');
    if (method === 'Debugger.pause') await wc.debugger.sendCommand('Debugger.setSkipAllPauses', { skip: false }).catch(() => {});
    const r = await wc.debugger.sendCommand(method, params || {});
    if (method === 'Debugger.resume') await wc.debugger.sendCommand('Debugger.setSkipAllPauses', { skip: true }).catch(() => {});
    return r;
  });
  uiHandle('devlab:scripts', (_e, wcId) => [...(sessions.get(wcId)?.scripts.values() || [])]);
  uiHandle('devlab:cookies', async (_e, { wcId, action, cookie }) => {
    const wc = webContents.fromId(wcId); if (!wc) return [];
    const url = wc.getURL(); if (!/^https?:/.test(url)) return [];
    const ses = wc.session;
    if (action === 'remove' && cookie) await ses.cookies.remove((cookie.secure ? 'https://' : 'http://') + cookie.domain.replace(/^\./, '') + cookie.path, cookie.name).catch(() => {});
    if (action === 'clear') for (const c of await ses.cookies.get({ url })) await ses.cookies.remove(url, c.name).catch(() => {});
    return (await ses.cookies.get({ url })).map((c) => ({ name: c.name, value: c.value.slice(0, 300), domain: c.domain, path: c.path, secure: c.secure, httpOnly: c.httpOnly, session: c.session, expirationDate: c.expirationDate, sameSite: c.sameSite }));
  });
  uiHandle('devlab:pro', (_e, wcId) => { const wc = webContents.fromId(wcId); if (wc) wc.isDevToolsOpened() ? wc.closeDevTools() : wc.openDevTools({ mode: 'bottom' }); return true; });
  uiHandle('devlab:capture', async (_e, wcId) => { const wc = webContents.fromId(wcId); if (!wc) throw new Error('This tab is gone.'); const img = await wc.capturePage(); return { dataUrl: img.toDataURL(), width: img.getSize().width, height: img.getSize().height }; });
  return { sessions, attach, detach };
};
