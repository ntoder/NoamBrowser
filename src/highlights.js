// NoamBrowser — highlighter. Highlight text on any page (right-click → Highlight, or Ctrl+Shift+H); the
// highlights come back when you return, live on this computer only, and are all listed on noam://highlights.
'use strict';
const { ipcMain, session, clipboard, webContents } = require('electron');
const crypto = require('crypto');

const COLORS = { yellow: '🟡 Yellow', green: '🟢 Green', pink: '🩷 Pink', blue: '🔵 Blue' };
const base = (u) => String(u || '').split('#')[0];
// a link that scrolls straight to the text (Chrome's "copy link to highlight" / text fragments)
function fragmentLink(url, text) {
  const enc = (s) => encodeURIComponent(s).replace(/-/g, '%2D').replace(/,/g, '%2C');
  const t = String(text || '').replace(/\s+/g, ' ').trim(); if (!t) return base(url);
  const words = t.split(' ');
  const frag = t.length <= 80 || words.length < 10 ? enc(t) : enc(words.slice(0, 5).join(' ')) + ',' + enc(words.slice(-5).join(' '));
  return base(url) + '#:~:text=' + frag;
}

module.exports = function setupHighlights({ Store, userData, pageHandle, broadcastPages, privatePartition, menuExtras }) {
  const store = new Store(userData, 'highlights', { items: [] });
  const priv = () => session.fromPartition(privatePartition);
  const okSender = (e) => e.sender.getType() === 'webview' && e.sender.session !== priv() && /^https?:/.test(e.sender.getURL());
  const changed = () => broadcastPages('highlights', {});
  ipcMain.handle('noam:hl-get', (e) => okSender(e) ? store.get('items').filter((h) => h.url === base(e.sender.getURL())) : []);
  ipcMain.handle('noam:hl-save', (e, h) => {
    if (!okSender(e) || !h || typeof h.quote !== 'string' || !h.quote.trim()) return null;
    const item = { id: crypto.randomUUID(), url: base(e.sender.getURL()), title: e.sender.getTitle(), quote: h.quote.slice(0, 2000), prefix: String(h.prefix || '').slice(-40), suffix: String(h.suffix || '').slice(0, 40), color: COLORS[h.color] ? h.color : 'yellow', t: Date.now() };
    store.get('items').unshift(item); store.save(); changed(); return item;
  });
  ipcMain.handle('noam:hl-update', (e, { id, color, note }) => { if (!okSender(e)) return false; const h = store.get('items').find((x) => x.id === id); if (!h) return false; if (COLORS[color]) h.color = color; if (typeof note === 'string') h.note = note.slice(0, 1000); store.save(); changed(); return true; });
  ipcMain.handle('noam:hl-remove', (e, id) => { if (!okSender(e)) return false; store.set('items', store.get('items').filter((x) => x.id !== id)); changed(); return true; });
  ipcMain.handle('noam:hl-link', (e, text) => { if (!okSender(e)) return false; clipboard.writeText(fragmentLink(e.sender.getURL(), text)); return true; });
  pageHandle('hl:list', () => store.get('items'));
  pageHandle('hl:remove', (_e, id) => { store.set('items', store.get('items').filter((x) => x.id !== id)); changed(); return store.get('items'); });
  pageHandle('hl:clear-page', (_e, url) => { store.set('items', store.get('items').filter((x) => x.url !== url)); changed(); return store.get('items'); });
  pageHandle('hl:link', (_e, { url, quote }) => fragmentLink(url, quote));
  // right-click menu on selected text
  menuExtras.push((wc, p) => {
    if (wc.getType() !== 'webview' || wc.session === priv() || !p.selectionText || !p.selectionText.trim() || p.isEditable || !/^https?:/.test(wc.getURL())) return [];
    return [
      { label: '🖍️ Highlight', submenu: Object.entries(COLORS).map(([c, label]) => ({ label, click: () => wc.send('noam:hl-do', c) })) },
      { label: '🔗 Copy link to highlight', click: () => clipboard.writeText(fragmentLink(wc.getURL(), p.selectionText)) },
    ];
  });
  return { fragmentLink };
};
module.exports.fragmentLink = fragmentLink;
