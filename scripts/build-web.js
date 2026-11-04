// Copies NoamChat and Music from NoamBrowser into the noamtoder.com website (ntoder/gamehub/noam/), so the
// web version runs the very same code as the app. Usage: node scripts/build-web.js ../gamehub
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const site = path.resolve(process.argv[2] || path.join(root, '..', 'gamehub'));
const out = path.join(site, 'noam');
fs.mkdirSync(out, { recursive: true });
const copy = (from, to) => fs.copyFileSync(path.join(root, from), path.join(out, to));
copy('src/ui/chat-engine.js', 'chat-engine.js');
copy('src/ui/chat-ui.js', 'chat-ui.js');
copy('src/ui/ambient.js', 'ambient.js');
copy('src/ui/vendor/trystero.js', 'trystero.js');
copy('node_modules/qrcode-generator/dist/qrcode.js', 'qrcode.js');
// only the NoamChat (.nc-…) and music (.amb-…) styles from the app's stylesheet
const css = fs.readFileSync(path.join(root, 'src/ui/features2.css'), 'utf8');
const rules = []; let depth = 0, cur = '';
for (const ch of css.replace(/\/\*[\s\S]*?\*\//g, '')) { cur += ch; if (ch === '{') depth++; if (ch === '}') { depth--; if (depth === 0) { rules.push(cur.trim()); cur = ''; } } }
const keep = rules.filter((r) => { const sel = r.slice(0, r.indexOf('{')); return /\.(nc|amb)[-\s.:{,[]|\.(nc|amb)$/.test(sel) && !/\.rail-btn/.test(sel); });
fs.writeFileSync(path.join(out, 'app.css'), '/* generated from NoamBrowser src/ui/features2.css by scripts/build-web.js */\n' + keep.join('\n') + '\n');
console.log('web build →', out, keep.length, 'style rules');
