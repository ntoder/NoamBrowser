// NoamBrowser — everyday web features Electron leaves out:
//  • window.prompt() boxes ("Enter your name") — shown by NoamBrowser, the page waits for the answer
//  • "Leave site? Changes you made may not be saved" when a page has unsaved work
//  • USB, serial and HID devices for web apps (micro:bit / MakeCode, Arduino, Scratch link, keyboards…):
//    you pick the device in a NoamBrowser box; the site can only use devices you picked for it
'use strict';
const { app, ipcMain, BrowserWindow, dialog } = require('electron');

module.exports = function setupDevices({ uiHandle }) {
  const hostWin = (wc) => { try { const h = wc.hostWebContents || wc; return BrowserWindow.fromWebContents(h); } catch { return null; } };
  const originOf = (u) => { try { return new URL(u).origin; } catch { return ''; } };

  // ---------------------------------------------------------------- prompt()
  const prompts = new Map(); let n = 0;
  ipcMain.on('noam:prompt', (e, { message, value } = {}) => {
    const win = hostWin(e.sender);
    if (!win || win.isDestroyed()) { e.returnValue = null; return; }
    const id = ++n; prompts.set(id, e);
    win.webContents.send('page:prompt', { id, message: String(message || '').slice(0, 2000), value: String(value ?? '').slice(0, 2000), site: originOf(e.sender.getURL()) });
  });
  uiHandle('page:prompt-answer', (_e, { id, value }) => { const ev = prompts.get(id); if (ev) { prompts.delete(id); ev.returnValue = value == null ? null : String(value); } return true; });

  app.on('web-contents-created', (_e, wc) => {
    if (wc.getType() !== 'webview') return;
    // ---------------------------------------------------------------- "Leave site?"
    wc.on('will-prevent-unload', (ev) => {
      const win = hostWin(wc); if (!win) return;
      const site = (() => { try { return new URL(wc.getURL()).hostname.replace(/^www\./, ''); } catch { return 'This site'; } })();
      const r = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Leave', 'Stay'], defaultId: 0, cancelId: 1, noLink: true, title: 'Leave site?', message: 'Leave this site?', detail: `${site} says changes you made may not be saved.` });
      if (r === 0) ev.preventDefault(); // preventDefault here means "ignore the page's request and leave"
    });
  });

  // ---------------------------------------------------------------- USB, serial, HID
  const granted = new Set(); // "origin|kind|id" for this session
  async function pick(wc, kind, list) {
    const win = hostWin(wc); const site = (() => { try { return new URL(wc.getURL()).hostname; } catch { return 'This site'; } })();
    const word = { serial: 'serial port', usb: 'USB device', hid: 'device' }[kind];
    if (!list.length) { if (win) dialog.showMessageBox(win, { type: 'info', message: `No ${word}s found`, detail: `${site} wants to connect to a ${word}, but nothing is plugged in. Plug it in and try again.` }); return null; }
    const shown = list.slice(0, 12);
    const r = await dialog.showMessageBox(win, { type: 'question', title: 'Connect a device', message: `${site} wants to connect to a ${word}`, detail: 'Pick the one to connect. The site can only use what you pick.', buttons: [...shown.map((d) => d.name || 'Unknown device'), 'Cancel'], cancelId: shown.length, noLink: true });
    return r.response < shown.length ? shown[r.response].id : null;
  }
  function attach(ses) {
    if (!ses || ses.__noamDevices) return; ses.__noamDevices = true;
    ses.on('select-serial-port', (event, ports, wc, callback) => {
      event.preventDefault();
      pick(wc, 'serial', ports.map((p) => ({ id: p.portId, name: p.displayName || p.portName || p.portId }))).then((id) => { if (id) granted.add(originOf(wc.getURL()) + '|serial|' + id); callback(id || ''); });
    });
    ses.on('select-usb-device', (event, details, callback) => {
      event.preventDefault(); const wc = details.frame && require('electron').webContents.fromFrame(details.frame);
      pick(wc || { getURL: () => details.frame && details.frame.url }, 'usb', details.deviceList.map((d) => ({ id: d.deviceId, name: d.productName || d.manufacturerName || 'USB device' }))).then((id) => { if (id) granted.add(originOf(details.frame && details.frame.url) + '|usb|' + id); callback(id || undefined); });
    });
    ses.on('select-hid-device', (event, details, callback) => {
      event.preventDefault(); const wc = details.frame && require('electron').webContents.fromFrame(details.frame);
      pick(wc || { getURL: () => details.frame && details.frame.url }, 'hid', details.deviceList.map((d) => ({ id: d.deviceId, name: d.name || 'Device' }))).then((id) => { if (id) granted.add(originOf(details.frame && details.frame.url) + '|hid|' + id); callback(id || undefined); });
    });
    ses.setDevicePermissionHandler((d) => {
      const id = d.device && (d.device.deviceId || d.device.portId);
      return ['serial', 'usb', 'hid'].includes(d.deviceType) && !!id && granted.has(originOf(d.origin) + '|' + d.deviceType + '|' + id);
    });
  }
  return { attach };
};
