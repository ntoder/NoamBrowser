// Downloads ad/tracker filter lists and compiles them into a single
// pre-serialized blocking engine that ships inside NoamBrowser.
// Run: node scripts/build-engine.js
const fs = require('fs');
const path = require('path');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const { LISTS } = require('../src/lists');

const OUT_DIR = path.join(__dirname, '..', 'vendor', 'lists');

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const texts = [];
  for (const l of LISTS) {
    const cache = path.join(OUT_DIR, l.id + '.txt');
    let txt;
    try {
      const res = await fetch(l.url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      txt = await res.text();
      fs.writeFileSync(cache, txt);
      console.log('fetched', l.id, (txt.length / 1024).toFixed(0) + 'KB');
    } catch (e) {
      if (!fs.existsSync(cache)) throw new Error('cannot fetch ' + l.url + ': ' + e.message);
      txt = fs.readFileSync(cache, 'utf8');
      console.log('cached', l.id);
    }
    texts.push(txt);
  }
  const t0 = Date.now();
  const engine = ElectronBlocker.parse(texts.join('\n'), {
    enableCompression: true,
    loadCosmeticFilters: true,
    loadNetworkFilters: true,
    enableHtmlFiltering: false,
    enableMutationObserver: true,
    guessRequestTypeFromUrl: true,
  });
  const buf = engine.serialize();
  fs.writeFileSync(path.join(OUT_DIR, 'engine.bin'), buf);
  fs.writeFileSync(path.join(OUT_DIR, 'engine.json'), JSON.stringify({ built: new Date().toISOString(), lists: LISTS.map((l) => l.id) }));
  console.log('engine.bin', (buf.length / 1024 / 1024).toFixed(2) + 'MB', 'in', Date.now() - t0, 'ms');
}
main().catch((e) => { console.error(e); process.exit(1); });
