// NoamBrowser — folders on your computer. Chrome shows a list of files when you open a folder; Electron shows a
// blank page, so NoamBrowser opens folders in its own page (noam://folder/) with icons, sizes and dates.
'use strict';
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL, fileURLToPath } = require('url');

module.exports = function setupFolders({ pageHandle }) {
  const isDir = (u) => { try { return /^file:/i.test(u) && fs.statSync(fileURLToPath(u)).isDirectory(); } catch { return false; } };
  const folderPage = (u) => 'noam://folder/?u=' + encodeURIComponent(u);

  pageHandle('files:list', async (_e, u) => {
    let dir;
    try { dir = fileURLToPath(String(u)); } catch { return { error: 'That isn’t a folder address.' }; }
    let names;
    try { names = await fs.promises.readdir(dir, { withFileTypes: true }); }
    catch (e) { return { path: dir, error: e.code === 'EACCES' || e.code === 'EPERM' ? 'NoamBrowser isn’t allowed to open this folder.' : e.code === 'ENOENT' ? 'This folder doesn’t exist any more.' : e.message }; }
    const items = [];
    for (const d of names.slice(0, 5000)) {
      const full = path.join(dir, d.name);
      let st = null; try { st = await fs.promises.stat(full); } catch {}
      items.push({ name: d.name, dir: st ? st.isDirectory() : d.isDirectory(), size: st && st.isFile() ? st.size : null, mtime: st ? st.mtimeMs : 0, url: pathToFileURL(full).href, hidden: d.name.startsWith('.') });
    }
    const parent = path.dirname(dir);
    return { path: dir, url: pathToFileURL(dir).href, parent: parent !== dir ? pathToFileURL(parent).href : null, sep: path.sep, items, more: names.length > 5000 };
  });
  // a page can't open file:// addresses itself, so the folder page asks for it
  pageHandle('files:open', (e, u) => { if (typeof u === 'string' && /^file:/i.test(u)) e.sender.loadURL(isDir(u) ? folderPage(u) : u); return true; });

  // any tab that lands on a folder (a typed address, a link, a file opened from your computer) shows the folder page
  app.on('web-contents-created', (_e, wc) => {
    if (wc.getType() !== 'webview') return;
    const check = (u) => { if (isDir(u)) setImmediate(() => { if (!wc.isDestroyed()) wc.loadURL(folderPage(u)); }); };
    wc.on('did-navigate', (_ev, u) => check(u));
    wc.on('did-finish-load', () => check(wc.getURL()));
    wc.on('did-fail-load', (_ev, _code, _desc, u, main) => { if (main) check(u); });
  });
  return { isDir, folderPage };
};
