// NoamBrowser — NoamChat storage and notifications (main process). Chats, friends and groups live in a
// file on this computer; your private keys are encrypted with the operating system's secure storage.
// Messages themselves travel peer-to-peer (see ui/chat-engine.js) and never pass through a server.
'use strict';
const { app, BrowserWindow, Notification, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

module.exports = function setupChat({ userData, uiHandle, iconPath, broadcast }) {
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
  // the browser window saves its whole copy; if another computer's changes were merged in since it loaded, its
  // copy is out of date, so it reloads instead of overwriting them
  uiHandle('chat:save', (_e, d) => { if (!d || typeof d !== 'object') return false; if (data && (d.rev || 0) < (data.rev || 0)) return false; data = d; clearTimeout(timer); timer = setTimeout(write, 800); if (api.onSave) api.onSave(); return true; });
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
  // ---------------------------------------------------------------- syncing through your NoamBrowser account
  const RANK = { pending: 0, sent: 1, delivered: 2, read: 3 };
  function snapshot() {
    const D = load(); if (!D.identity || !D.identity.priv) return null;
    const friends = {}; for (const [id, f] of Object.entries(D.friends || {})) { const { online, room, ...rest } = f; friends[id] = rest; }
    const chats = {}; for (const [k, c] of Object.entries(D.chats || {})) chats[k] = { msgs: (c.msgs || []).slice(-300).map((m) => (m.img ? { ...m, img: undefined, imgOmitted: true } : m)) };
    return { identity: D.identity, friends, groups: D.groups || {}, requests: D.requests || [], chats };
  }
  function merge(r) {
    const D = load(); if (!r || !r.identity || !r.identity.priv) return false;
    let changed = false;
    if (!D.identity) { Object.assign(D, { identity: r.identity, friends: {}, groups: {}, chats: {}, requests: [] }); changed = true; }
    else if (D.identity.signPub !== r.identity.signPub) {
      // two different NoamChat identities: everyone ends up with the older one
      if ((r.identity.created || 0) >= (D.identity.created || 0)) return false;
      D.oldIdentity = { identity: D.identity, friends: D.friends, groups: D.groups, at: Date.now() };
      Object.assign(D, { identity: r.identity, friends: {}, groups: {}, chats: {}, requests: [] }); changed = true;
    }
    if ((r.identity.profileAt || 0) > (D.identity.profileAt || 0)) { D.identity.name = r.identity.name; D.identity.emoji = r.identity.emoji; D.identity.profileAt = r.identity.profileAt; changed = true; }
    D.friends = D.friends || {}; D.groups = D.groups || {}; D.chats = D.chats || {}; D.requests = D.requests || [];
    for (const [id, f] of Object.entries(r.friends || {})) {
      const l = D.friends[id];
      if (!l) { D.friends[id] = { ...f }; changed = true; }
      else if (l.status === 'pending' && f.status === 'friend') { l.status = 'friend'; l.reqDelivered = true; changed = true; }
      else if (f.status === 'blocked' && l.status !== 'blocked' && (f.blockedAt || 0) > (l.added || 0)) { l.status = 'blocked'; changed = true; }
    }
    for (const [gid, g] of Object.entries(r.groups || {})) { const l = D.groups[gid]; if (!l) { D.groups[gid] = g; changed = true; } else for (const [mid, m] of Object.entries(g.members || {})) if (!l.members[mid]) { l.members[mid] = m; changed = true; } }
    for (const [k, rc] of Object.entries(r.chats || {})) {
      const c = D.chats[k] = D.chats[k] || { msgs: [], unread: 0 }; const byId = new Map(c.msgs.map((m) => [m.id, m])); let n = 0;
      for (const m of rc.msgs || []) { const x = byId.get(m.id); if (!x) { c.msgs.push(m); n++; } else if ((RANK[m.status] || 0) > (RANK[x.status] || 0)) { x.status = m.status; n++; } }
      if (n) { c.msgs.sort((a, b) => a.t - b.t); if (c.msgs.length > 1500) c.msgs.splice(0, c.msgs.length - 1500); changed = true; }
    }
    for (const q of r.requests || []) if (!D.requests.some((x) => x.id === q.id) && !D.friends[q.id]) { D.requests.push(q); changed = true; }
    if (changed) { D.rev = (D.rev || 0) + 1; write(); if (broadcast) broadcast('chat:reload', {}); }
    return changed;
  }

  uiHandle('chat:focused', (e) => { const win = BrowserWindow.fromWebContents(e.sender); return !!(win && win.isFocused()); });
  const api = { snapshot, merge, onSave: null };
  return api;
};
