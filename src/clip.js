// Clipboard helpers that work with both the old (sync, writeImage) and the
// new (async, W3C-style) Electron clipboard APIs.
const electron = require('electron');
const { clipboard } = electron;

async function writeImagePng(buf) {
  if (typeof clipboard.writeImage === 'function') return clipboard.writeImage(electron.nativeImage.createFromBuffer(buf));
  await clipboard.write([new electron.ClipboardItem({ 'image/png': new Blob([buf], { type: 'image/png' }) })]);
}
async function readImagePngSize() {
  if (typeof clipboard.readImage === 'function') return clipboard.readImage().getSize();
  const items = await clipboard.read();
  for (const it of items) if (it.types.includes('image/png')) { const b = Buffer.from(await (await it.getType('image/png')).arrayBuffer()); return electron.nativeImage.createFromBuffer(b).getSize(); }
  return null;
}
const readText = async () => clipboard.readText();
const writeText = async (t) => clipboard.writeText(t);
module.exports = { writeImagePng, readImagePngSize, readText, writeText };
