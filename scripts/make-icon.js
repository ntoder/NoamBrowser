// Renders the SVG logo into PNG sizes and a multi-resolution Windows .ico.
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

(async () => {
  const pngToIco = (await import('png-to-ico')).default;
  const assets = path.join(__dirname, '..', 'src', 'assets');
  const build = path.join(__dirname, '..', 'build');
  fs.mkdirSync(build, { recursive: true });
  const svg = fs.readFileSync(path.join(assets, 'logo.svg'));
  const render = (size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const files = sizes.map((s) => { const f = path.join(build, `icon-${s}.png`); fs.writeFileSync(f, render(s)); return f; });
  fs.writeFileSync(path.join(build, 'icon.png'), render(1024));
  fs.writeFileSync(path.join(assets, 'icon.png'), render(256));
  const ico = await pngToIco(files);
  fs.writeFileSync(path.join(build, 'icon.ico'), ico);
  fs.writeFileSync(path.join(assets, 'icon.ico'), ico);
  console.log('icons written', ico.length, 'bytes ico');
})().catch((e) => { console.error(e); process.exit(1); });
