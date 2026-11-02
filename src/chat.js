// NoamBrowser — NoamChat storage and notifications (main process). Chats, friends and groups live in a
// file on this computer; your private keys are encrypted with the operating system's secure storage.
// Messages themselves travel peer-to-peer (see ui/chat-engine.js) and never pass through a server.
'use strict';
const { app, BrowserWindow, Notification, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

module.exports = function setupChat({ userData, uiHandle, iconPath }) {
  const FILE = path.join(userData, 'noamchat.json');
  let data = null, timer = null;
  const canEnc = () => { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } };
  function load() {
    if (data) return data;
    try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { data = {}; }
    if (data.identity && data.identity.enc) {
      try { data.identity.priv = JSON.parse(safeStorage.decryptString(Buffer.from(data.identity.enc, 'base64'))); } catch { data.identity = null; }
      if (data.identity) delete data.identity.enc;
    }
    return data;
  }
  function write() {
    timer = null; if (!data) return;
    const out = { ...data };
    if (out.identity && out.identity.priv && canEnc()) { const { priv, ...rest } = out.identity; out.identity = { ...rest, enc: safeStorage.encryptString(JSON.stringify(priv)).toString('base64') }; }
    try { fs.writeFileSync(FILE + '.tmp', JSON.stringify(out)); fs.renameSync(FILE + '.tmp', FILE); } catch (e) { console.error('chat save', e); }
  }
  app.on('before-quit', () => { if (timer) { clearTimeout(timer); write(); } });
  uiHandle('chat:load', () => load());
  uiHandle('chat:save', (_e, d) => { if (!d || typeof d !== 'object') return false; data = d; clearTimeout(timer); timer = setTimeout(write, 800); return true; });
  uiHandle('chat:wipe', () => { data = {}; try { fs.unlinkSync(FILE); } catch {} return true; });

  // QR code for your invite code
  let qrgen = null; try { const q = require('qrcode-generator'); qrgen = q.default || q; } catch {}
  uiHandle('chat:qr', (_e, text) => { if (!qrgen) return null; try { const c = qrgen(0, 'L'); c.addData(String(text).slice(0, 2000)); c.make(); return 'data:image/svg+xml;base64,' + Buffer.from(c.createSvgTag({ cellSize: 4, margin: 2, scalable: true })).toString('base64'); } catch { return null; } });

  // desktop notifications: clicking one opens that chat
  uiHandle('chat:notify', (e, { title, body, chat }) => {
    try {
      if (!Notification.isSupported()) return false;
      const win = BrowserWindow.fromWebContents(e.sender);
      const n = new Notification({ title: String(title).slice(0, 80), body: String(body).slice(0, 180), icon: iconPath && iconPath(), silent: false });
      n.on('click', () => { if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); win.webContents.send('chat:open', chat); } });
      n.show(); return true;
    } catch { return false; }
  });
  uiHandle('chat:focused', (e) => { const win = BrowserWindow.fromWebContents(e.sender); return !!(win && win.isFocused()); });
};
