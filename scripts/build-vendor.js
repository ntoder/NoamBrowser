// Builds the browser-side bundles NoamBrowser ships (they're generated, so they aren't kept in git):
//   src/ui/vendor/trystero.js   — peer-to-peer connections for NoamChat
//   src/ui/vendor/ai-worker.js  — the on-device AI helper (Transformers.js)
//   src/ui/vendor/ort/*         — the AI runtime (ONNX Runtime WebAssembly)
// Runs automatically after `npm install`; run it again with `npm run vendor`.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'src', 'ui', 'vendor');
fs.mkdirSync(path.join(out, 'ort'), { recursive: true });
const esbuild = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild');
if (!fs.existsSync(esbuild)) { console.log('build-vendor: esbuild not installed (production install?), skipping'); process.exit(0); }
const bundle = (entry, file) => execFileSync(esbuild, [path.join(root, 'build', 'bundles', entry), '--bundle', '--format=iife', '--platform=browser', '--minify', '--target=chrome130', '--outfile=' + path.join(out, file), '--log-level=warning'], { stdio: 'inherit', shell: process.platform === 'win32' });
bundle('trystero-entry.mjs', 'trystero.js');
bundle('ai-worker-entry.mjs', 'ai-worker.js');
for (const f of ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']) fs.copyFileSync(path.join(root, 'node_modules', 'onnxruntime-web', 'dist', f), path.join(out, 'ort', f));
console.log('build-vendor: done');
