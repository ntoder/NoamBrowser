// Automated smoke test, only loaded when NOAM_TEST=1 (excluded from builds).
const http = require('http');
const fs = require('fs');
const path = require('path');

const OUT = process.env.NOAM_TEST_OUT || '/tmp/noam-test';

const TEST_PAGE = `<!doctype html><html><head><title>Ad test page</title>
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-TEST"></script>
<script src="https://connect.facebook.net/en_US/fbevents.js"></script>
<script src="https://static.hotjar.com/c/hotjar-123.js?sv=6"></script>
<script src="https://cdn.segment.com/analytics.js/v1/abc/analytics.min.js"></script>
<script src="https://www.google-analytics.com/analytics.js"></script>
<script src="https://securepubads.g.doubleclick.net/tag/js/gpt.js"></script>
</head><body style="font:16px sans-serif;padding:30px">
<h1>NoamBrowser test page</h1>
<p>Normal content should stay visible.</p>
<div class="adsbygoogle" id="ad1" style="display:block;width:300px;height:250px;background:red">AD SLOT (should be hidden)</div>
<div id="carbonads" style="width:300px;height:100px;background:orange">carbon ad (should be hidden)</div>
<img src="https://ad.doubleclick.net/ddm/ad/pixel.gif" width=1 height=1>
<canvas id=c width=200 height=50></canvas>
<pre id=out></pre>
<a id=lnk href="/landing?utm_source=newsletter&fbclid=abc123&keep=1">tracked link</a>
<script>
const c=document.getElementById('c').getContext('2d');c.fillStyle='#f60';c.fillRect(0,0,200,50);c.fillStyle='#069';c.font='18px Arial';c.fillText('fingerprint',10,30);
const a=document.getElementById('c').toDataURL();
const b=document.getElementById('c').toDataURL();
document.getElementById('out').textContent=JSON.stringify({hc:navigator.hardwareConcurrency,stable:a===b,len:a.length,ua:navigator.userAgent});
window.__fp={hc:navigator.hardwareConcurrency,stable:a===b,hash:a.slice(-40),toStr:HTMLCanvasElement.prototype.toDataURL.toString()};
</script></body></html>`;

module.exports = ({ app, windows, shields, vpn, settings, webContents, features, features2 }) => {
  fs.mkdirSync(OUT, { recursive: true });
  const log = (...a) => { const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '); console.log('[TEST]', line); fs.appendFileSync(path.join(OUT, 'log.txt'), line + '\n'); };
  app.on('web-contents-created', (_e, wc) => wc.on('console-message', (ev) => { if (ev.level === 'error' || ev.level === 'warning' || ev.level === 3 || ev.level === 2) log('console', wc.getType(), ev.message, ev.sourceId || '', ev.lineNumber || ''); }));
  for (const w of windows) w.webContents.on('console-message', (ev) => log('console-ui', ev.level, ev.message, ev.lineNumber || ''));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/landing')) { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<title>landing</title><p>${req.url}</p>`); return; }
    if (req.url.startsWith('/dl')) { res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="test-file.bin"' }); res.end(Buffer.alloc(200000, 7)); return; }
    res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'fp=1' }); res.end(TEST_PAGE);
  });
  if (process.env.NOAM_TEST_TILES) {
    const srv = require('https').createServer({ key: fs.readFileSync('/tmp/claude-0/k.pem'), cert: fs.readFileSync('/tmp/claude-0/c.pem') }, (req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<title>' + req.headers.host.split(':')[0] + '</title><h1>hi</h1>'); });
    srv.listen(0, '127.0.0.1', async () => {
      const port = srv.address().port;
      const ui = [...windows][0].webContents; const js = (c) => ui.executeJavaScript(c);
      await sleep(3000);
      for (const h of ['news.example.org', 'www.youtube.com', 'accounts.google.com']) { await js(`state.active.navigate('https://${h}:${port}/')`); await sleep(1500); }
      await js(`state.active.navigate('noam://newtab/')`); await sleep(2000);
      const wc = webContents.fromId(await js('state.active.wcId'));
      const tiles = () => wc.executeJavaScript(`[...document.querySelectorAll('.site')].map(e=>e.dataset.host)`);
      log('tiles before', await tiles());
      await wc.executeJavaScript(`document.querySelector('.site .rm').click()`); await sleep(800);
      log('tiles after remove', await tiles(), await wc.executeJavaScript(`document.getElementById('undo-text').textContent`));
      const img = await [...windows][0].webContents.capturePage(); fs.writeFileSync(path.join(OUT, 'tiles-removed.png'), img.toPNG());
      await wc.executeJavaScript(`document.getElementById('undo-btn').click()`); await sleep(600);
      log('tiles after undo', await tiles());
      // omnibox shift+delete
      await js(`document.getElementById('url').focus(); document.getElementById('url').value='www.you'; document.getElementById('url').dispatchEvent(new Event('input'))`); await sleep(700);
      log('suggest', await js(`sgItems.map(x=>x.kind+':'+x.url)`));
      await js(`sgSel = sgItems.findIndex(x=>x.kind==='history'); document.getElementById('url').dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',shiftKey:true,bubbles:true}))`); await sleep(500);
      log('history has youtube', await wc.executeJavaScript(`noam.invoke('history:list',{q:'youtube'}).then(r=>r.total)`));
      app.exit(0);
    });
    return;
  }
  if (process.env.NOAM_TEST_V2) {
    const article = `<!doctype html><html lang="fr"><head><title>Un long article</title></head><body style="font:16px serif;padding:20px">
<nav>Menu Accueil Contact</nav><div class="ad">Publicité</div>
<article><h1>Les bibliothèques de Paris</h1><p class="byline">Par Marie Dupont</p>` + Array.from({length: 14}, (_, i) => `<p>Paragraphe ${i + 1}. Les bibliothèques publiques de Paris accueillent chaque année des millions de lecteurs, qui viennent emprunter des livres, consulter des journaux et profiter d'espaces calmes pour travailler et apprendre ensemble.</p>`).join('') + `</article><footer>© 2026</footer></body></html>`;
    const login = `<!doctype html><title>Login</title><body style="font:16px sans-serif;padding:30px"><h1>Sign in</h1>
<form id="f" action="/welcome" method="post"><input name="email" type="email" placeholder="Email"><br><input name="pass" type="password" placeholder="Password"><br><button type="submit">Sign in</button></form></body>`;
    const bright = `<!doctype html><title>Bright</title><body style="background:#fff;color:#111;font:20px sans-serif;padding:40px"><h1>Very bright page</h1><p>Lots of white.</p><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='60'%3E%3Crect width='120' height='60' fill='%23e33'/%3E%3C/svg%3E"></body>`;
    const srv = require('https').createServer({ key: fs.readFileSync('/tmp/claude-0/k.pem'), cert: fs.readFileSync('/tmp/claude-0/c.pem') }, (req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      if (req.url.startsWith('/article')) return res.end(article);
      if (req.url.startsWith('/login')) return res.end(login);
      if (req.url.startsWith('/welcome')) return res.end('<title>Welcome</title><h1>Welcome back</h1>');
      if (req.url.startsWith('/bright')) return res.end(bright);
      res.end('<title>Home</title><h1>Home</h1>');
    });
    srv.listen(0, '127.0.0.1', async () => {
      const port = srv.address().port; const base = `https://news.example.org:${port}`;
      const win = [...windows][0]; const ui = win.webContents;
      const js = (c) => ui.executeJavaScript(c);
      const shot = async (n) => { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(OUT, n + '.png'), img.toPNG()); log('shot', n); };
      const tabWc = async () => webContents.fromId(await js('state.active.wcId'));
      const step = async (name, fn) => { try { await fn(); } catch (e) { log('FAIL', name, e.stack || String(e)); } };
      await sleep(3500);

      await step('reader', async () => {
        await js(`state.active.navigate('${base}/article')`); await sleep(3500);
        log('reader button visible', await js(`!document.getElementById('reader-btn').hidden`));
        log('translate offered (fr)', await js(`!document.getElementById('translate-btn').hidden`), await js('state.active.lang'));
        await js(`document.getElementById('reader-btn').click()`); await sleep(2500);
        const wc = await tabWc();
        log('reader url', wc.getURL());
        log('reader content', await wc.executeJavaScript(`({title: document.querySelector('h1.title')?.textContent, paras: document.querySelectorAll('article p').length, nav: document.body.innerText.includes('Menu Accueil'), meta: document.querySelector('.meta')?.textContent})`));
        await shot('v2-01-reader');
      });

      await step('translate-offline', async () => {
        await js(`state.active.wv.goBack()`); await sleep(2500);
        await js(`document.getElementById('translate-btn').click()`); await sleep(4000);
        await shot('v2-02-translate-panel');
        await js(`document.getElementById('tp-go').click()`); await sleep(9000);
        log('translate status', await js(`document.getElementById('tp-status').textContent`));
        await js('closePanels()');
      });

      await step('translate-engine', async () => { log('translation engine selftest', await features.selftest()); });

      await step('passwords', async () => {
        await js(`state.active.navigate('${base}/login')`); await sleep(2500);
        let wc = await tabWc();
        await wc.executeJavaScript(`document.querySelector('[name=email]').value='noam@example.com'; document.querySelector('[name=pass]').value='S3cret-pass!'; document.querySelector('button').click();`, true);
        await sleep(2500);
        log('pw bar', await js(`!document.getElementById('pw-bar').hidden`), await js(`document.querySelector('#pw-bar .pb-text').textContent`));
        await shot('v2-03-password-offer');
        await js(`document.querySelector('#pw-bar [data-act=save]').click()`); await sleep(800);
        await js(`state.active.navigate('${base}/login')`); await sleep(3500);
        wc = await tabWc();
        log('autofilled', await wc.executeJavaScript(`[document.querySelector('[name=email]').value, document.querySelector('[name=pass]').value]`));
        log('key button', await js(`!document.getElementById('key-btn').hidden`));
        const vf = fs.readFileSync(path.join(app.getPath('userData'), 'passwords.vault'));
        log('vault encrypted (no plaintext)', !vf.toString('latin1').includes('S3cret-pass!'), vf.subarray(0, 4).toString());
      });

      await step('palette', async () => {
        await js(`newTab({url:'${base}/article'})`); await sleep(1500);
        await js(`newTab({url:'noam://settings/'})`); await sleep(1500);
        await js(`hooks.palette()`); await sleep(400);
        await js(`document.getElementById('pal-q').value='spl'; document.getElementById('pal-q').dispatchEvent(new Event('input'))`); await sleep(700);
        log('palette items', await js(`[...document.querySelectorAll('.pal-item .t')].slice(0,5).map(e=>e.textContent)`));
        await shot('v2-04-palette');
        await js(`document.getElementById('pal-q').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`); await sleep(300);
        log('palette closed', await js(`document.getElementById('palette').hidden`));
      });

      await step('groups+vertical', async () => {
        await js(`hooks.tabMenu && addToGroup(state.tabs[0], null)`); await sleep(500);
        await js(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`); await sleep(200);
        await js(`state.groups[0].name='Research'; addToGroup(state.tabs[2], state.groups[0]); renderGroups()`); await sleep(400);
        log('groups', await js(`state.groups.map(g=>({name:g.name, n: state.tabs.filter(t=>t.groupId===g.id).length}))`), await js(`document.querySelectorAll('.group-chip').length`));
        await shot('v2-05-groups');
        await js(`nb.invoke('settings:set',{tabs:{layout:'vertical'}})`); await sleep(1200);
        log('vertical', await js(`document.body.classList.contains('vtabs')`), await js(`document.getElementById('sb-tabs').contains(document.getElementById('tabstrip'))`));
        await shot('v2-06-vertical');
      });

      await step('split', async () => {
        await js(`activate(state.tabs[0]); hooks.splitToggle()`); await sleep(1800);
        log('split', await js(`({on: document.getElementById('views').classList.contains('split'), panes: document.querySelectorAll('webview.split-pane').length})`));
        await shot('v2-07-split');
        await js(`hooks.splitToggle()`); await sleep(500);
        log('split off', await js(`!document.getElementById('views').classList.contains('split')`));
        await js(`nb.invoke('settings:set',{tabs:{layout:'horizontal'}})`); await sleep(800);
      });

      await step('dark', async () => {
        await js(`activate(state.tabs[0]); state.active.navigate('${base}/bright')`); await sleep(2500);
        await shot('v2-08-bright-before');
        await js(`hooks.shortcut('dark',{})`); await sleep(3000);
        const wc = await tabWc();
        log('dark filter', await wc.executeJavaScript(`getComputedStyle(document.documentElement).filter`));
        await shot('v2-09-dark');
        await js(`hooks.shortcut('dark',{})`); await sleep(2500);
      });

      await step('import', async () => {
        await js(`activate(state.tabs.find(t=>t.url.startsWith('noam://settings')))`); await sleep(500);
        const wc = await tabWc();
        const det = await wc.executeJavaScript(`noam.invoke('import:detect')`);
        log('import detect', det.map((d) => d.browser + '/' + d.profile));
        if (det[0]) log('import run', await wc.executeJavaScript(`noam.invoke('import:run', {key: ${JSON.stringify(det[0].key)}, bookmarks: true, history: true})`));
        log('bookmarks now', (await wc.executeJavaScript(`noam.invoke('bookmarks:list')`)).map((b) => b.title));
      });

      await step('sync', async () => {
        const wc = await tabWc();
        const dir = '/tmp/noam-syncdir'; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
        // a second "computer" already syncing here with one extra bookmark
        const { seal } = require('./sync');
        fs.mkdirSync(path.join(dir, 'NoamBrowser Sync'));
        fs.writeFileSync(path.join(dir, 'NoamBrowser Sync', 'device-other.nbsync'), seal({ device: { id: 'other', name: 'Noam-MacBook', platform: 'darwin' }, written: Date.now(), settingsUpdated: 0, settings: {}, bookmarks: [{ id: 'x', url: 'https://from-the-mac.example/', title: 'From my Mac', added: Date.now() }], bookmarkTombstones: [] }, 'correct horse battery'));
        let r = await wc.executeJavaScript(`noam.invoke('sync:enable', {folder: '${dir}', passphrase: 'wrong passphrase', passwords: true}).then(()=> 'enabled', e => e.message)`);
        log('sync wrong pass', r);
        r = await wc.executeJavaScript(`noam.invoke('sync:enable', {folder: '${dir}', passphrase: 'correct horse battery', passwords: true})`);
        log('sync status', { state: r.state, devices: r.devices, error: r.error });
        log('sync files', fs.readdirSync(path.join(dir, 'NoamBrowser Sync')));
        const mine = fs.readdirSync(path.join(dir, 'NoamBrowser Sync')).find((f) => f !== 'device-other.nbsync');
        const raw = fs.readFileSync(path.join(dir, 'NoamBrowser Sync', mine));
        log('sync file encrypted', !raw.toString('latin1').includes('S3cret-pass!') && !raw.toString('latin1').includes('noam@example.com'));
        log('merged bookmark', (await wc.executeJavaScript(`noam.invoke('bookmarks:list')`)).some((b) => b.title === 'From my Mac'));
        await wc.executeJavaScript(`location.hash='#sync'; document.getElementById('sync').scrollIntoView()`); await sleep(800);
        await shot('v2-10-sync');
      });

      await step('updates', async () => {
        const wc = await tabWc();
        log('update status', await wc.executeJavaScript(`noam.invoke('update:status')`));
        await wc.executeJavaScript(`document.getElementById('about').scrollIntoView()`); await sleep(500);
        await shot('v2-11-about');
      });

      await step('passwords-page', async () => {
        await js(`state.active.navigate('noam://passwords/')`); await sleep(1800);
        await shot('v2-12-passwords');
      });
      log('V2 DONE');
      setTimeout(() => app.exit(0), 300);
    });
    return;
  }
  if (process.env.NOAM_TEST_YT) {
    const page = `<!doctype html><title>YT</title>
<script>var ytInitialPlayerResponse = {"videoDetails":{"title":"ok"},"adPlacements":[{"a":1}],"playerAds":[{"b":1}],"adSlots":[1]};
var ytInitialData = {"contents":{"items":[{"videoRenderer":{"id":"real"}},{"adSlotRenderer":{"x":1}},{"richItemRenderer":{"content":{"adSlotRenderer":{}}}},{"videoRenderer":{"id":"real2"}}]}};
window.r1 = {pr: Object.keys(ytInitialPlayerResponse), items: ytInitialData.contents.items.map(i=>Object.keys(i)[0])};
</script>
<div id="movie_player" class="html5-video-player ad-showing"><video id="v" muted=false></video><button class="ytp-skip-ad-button" onclick="window.skipped=(window.skipped||0)+1">Skip</button></div>
<ytd-ad-slot-renderer id="feedad" style="display:block">feed ad</ytd-ad-slot-renderer>
<script>
fetch('/player').then(r=>r.json()).then(j=>{window.r2=Object.keys(j)});
fetch('/player').then(r=>r.text()).then(t=>{window.r3=Object.keys(JSON.parse(t))});
</script>`;
    const big = JSON.stringify({ videoDetails: { title: 'x', pad: 'p'.repeat(300) }, adPlacements: [1], playerAds: [2], streamingData: { f: 1 } });
    const srv = require('https').createServer({ key: fs.readFileSync('/tmp/claude-0/k.pem'), cert: fs.readFileSync('/tmp/claude-0/c.pem') }, (req, res) => {
      if (req.url.startsWith('/player')) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(big); return; }
      res.writeHead(200, { 'content-type': 'text/html' }); res.end(page);
    });
    srv.listen(0, '127.0.0.1', async () => {
      const port = srv.address().port;
      await sleep(3500);
      const ui = [...windows][0].webContents;
      await ui.executeJavaScript(`state.active.navigate('https://www.youtube.com:${port}/watch?v=abc')`);
      await sleep(5000);
      const wcId = await ui.executeJavaScript('state.active.wcId');
      const tab = webContents.fromId(wcId);
      log('url', tab.getURL());
      log('result', await tab.executeJavaScript(`({initial: window.r1, fetchJson: window.r2, fetchText: window.r3, skipped: window.skipped||0, feedAd: getComputedStyle(document.getElementById('feedad')).display, jsonParseLooksNative: JSON.parse.toString()})`));
      log('shield count', shields.tabSummary(wcId).blocked);
      app.exit(0);
    });
    return;
  }
  if (process.env.NOAM_TEST_LOOKS) {
    (async () => {
      await sleep(3000);
      const win = [...windows][0]; const ui = win.webContents;
      const js = (c) => ui.executeJavaScript(c);
      const shot = async (n) => { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(OUT, n + '.png'), img.toPNG()); log('shot', n); };
      const looks = [
        ['look-aurora', { appearance: { preset: 'aurora', tabStyle: 'rounded', wallpaper: 'aurora' } }],
        ['look-neon-pills', { appearance: { preset: 'neon', tabStyle: 'pills', wallpaper: 'mesh' } }],
        ['look-snow-floating', { appearance: { preset: 'snow', tabStyle: 'floating', wallpaper: 'grid' } }],
        ['look-sunset-minimal', { appearance: { preset: 'sunset', tabStyle: 'minimal', wallpaper: 'ember', density: 'spacious' } }],
        ['look-glass', { appearance: { preset: 'default', tabStyle: 'floating', liquidGlass: true, wallpaper: 'lagoon', density: 'comfortable' } }],
      ];
      await js(`newTab({url:'noam://settings/#appearance'})`); await sleep(1500);
      await js(`activate(state.tabs[0])`);
      for (const [n, p] of looks) { await js(`nb.invoke('settings:set', ${JSON.stringify(p)})`); await js(`state.active.wv.reload()`); await sleep(2200); await shot(n); }
      await js(`document.getElementById('shield-btn').click()`); await sleep(900); await shot('look-glass-panel');
      await js(`closePanels(); activate(state.tabs[1])`); await sleep(1200); await shot('look-settings');
      app.exit(0);
    })();
    return;
  }
  if (process.env.NOAM_TEST_GOOGLE) {
    const srv = require('https').createServer({ key: fs.readFileSync('/tmp/claude-0/k.pem'), cert: fs.readFileSync('/tmp/claude-0/c.pem') }, (req, res) => { log('header', req.headers.host, req.url, req.headers['user-agent'], 'ch-ua', req.headers['sec-ch-ua'] || 'none'); res.writeHead(200, { 'content-type': 'text/html' }); res.end('<title>g</title><iframe src="/frame"></iframe>'); });
    srv.listen(0, '127.0.0.1', async () => {
      const port = srv.address().port;
      await sleep(3500);
      const ui = [...windows][0].webContents;
      await ui.executeJavaScript(`state.active.navigate('https://accounts.google.com:${port}/signin')`);
      await sleep(9000);
      const wcId = await ui.executeJavaScript('state.active.wcId');
      const tab = webContents.fromId(wcId);
      log('url', tab.getURL());
      log('js', await tab.executeJavaScript('({ua:navigator.userAgent,uad:typeof navigator.userAgentData,chrome:typeof window.chrome,vendor:navigator.vendor,platform:navigator.platform})'));
      await ui.executeJavaScript(`state.active.navigate('https://news.example.org:${port}/')`);
      await sleep(3000);
      log('js after leaving', await tab.executeJavaScript('({ua:navigator.userAgent,uad:typeof navigator.userAgentData,chrome:typeof window.chrome})'));
      app.exit(0);
    });
    return;
  }
  if (process.env.NOAM_TEST_DL) {
    const page = `<!doctype html><html><head><title>Space Cats</title><style>body{font-family:Georgia,serif;margin:0;background:#fdf6ec;color:#222}header{background:#3b2c85;color:#fff;padding:18px 30px;display:flex;gap:16px;align-items:center}nav a{color:#ffd84d;margin-right:12px}main{padding:20px 30px;display:grid;grid-template-columns:1fr 1fr;gap:20px}.card{background:#fff;border-radius:14px;padding:16px;box-shadow:0 4px 14px rgba(0,0,0,.1)}.faint{color:#ccc}button{background:#ee7a2e;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-size:16px}@keyframes wob{50%{transform:rotate(8deg)}}.cat{animation:wob 1s infinite}</style>
<link rel="stylesheet" href="/style.css"></head><body><header><img class="cat" src="/cat.svg" width="60" height="60"><h1>Space Cats 🚀</h1><nav><a href="/a">Home</a><a href="/b">Planets</a><a href="/c"><img src="/cat.svg" width="16" height="16"></a></nav></header>
<main><div class="card"><h2>Meet Captain Whiskers</h2><p id="intro">Captain Whiskers has flown to the moon 12 times.</p><p class="faint">This text is very hard to read.</p><button id="go">Launch!</button><input placeholder="Your name"></div>
<div class="card"><h4>Mission log</h4><ul><li>Day 1: liftoff</li><li>Day 2: found tuna</li></ul><img src="/big.svg" width="200" height="120"></div></main>
<script src="/app.js"></script><script>document.cookie='favouriteCat=whiskers; max-age=86400'; localStorage.setItem('highScore','4200'); sessionStorage.setItem('visits','1'); console.log('Space Cats loaded', {cats: 3, fuel: 'tuna'}); console.warn('Fuel is running low'); fetch('/missing.json').catch(()=>{}); setTimeout(() => { undefinedFunction(); }, 300);</script></body></html>`;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60"><circle cx="30" cy="30" r="28" fill="#ffb347"/><circle cx="20" cy="25" r="4"/><circle cx="40" cy="25" r="4"/></svg>';
    const srv = require('https').createServer({ key: fs.readFileSync('/tmp/claude-0/k.pem'), cert: fs.readFileSync('/tmp/claude-0/c.pem') }, (req, res) => {
      const u = req.url.split('?')[0];
      if (u === '/cat.svg' || u === '/big.svg') { res.writeHead(200, { 'content-type': 'image/svg+xml' }); return res.end(svg); }
      if (u === '/style.css') { res.writeHead(200, { 'content-type': 'text/css' }); return res.end('h2{letter-spacing:.5px}'); }
      if (u === '/app.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end('(function(){var score=0;function addPoint(n){score+=n;if(score>10){console.log("big score",score)}return score}window.game={addPoint:addPoint,name:"Space Cats"};for(var i=0;i<3;i++){addPoint(i)}document.getElementById("go").onclick=function(){alert("Launch!")}})();'); }
      if (u === '/data.json') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ cats: [{ name: 'Whiskers', missions: 12, crew: ['Mittens', 'Tom'] }, { name: 'Luna', missions: 4, crew: [] }], updated: '2026-10-27', ok: true, rating: 4.5, nothing: null })); }
      if (u === '/missing.json') { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{"error":"not found"}'); }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page);
    });
    srv.listen(443, '127.0.0.1', async () => {
      const win = [...windows][0]; const ui = win.webContents; const js = (c) => ui.executeJavaScript(c);
      const shot = async (n) => { await sleep(300); const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(OUT, n + '.png'), img.toPNG()); };
      const step = async (name, fn) => { try { await fn(); log('ok', name); } catch (e) { log('FAIL', name, e.stack || String(e)); } };
      const tabWc = async () => webContents.fromId(await js('state.active.wcId'));
      const body = () => js(`DL.body.innerText.replace(/\\s+/g,' ').slice(0,400)`);
      await sleep(3000);
      await js(`state.active.navigate('https://news.example.org/')`); await sleep(2500);
      await step('open', async () => { await js(`shortcut({key:'f12'})`); await sleep(1500); log('open', await js('DL.open'), await js('DL.wcId'), await js(`document.querySelector('.dl-status').innerText`)); await shot('dl-01-home'); });
      await step('reload capture', async () => { await js(`DL.tab.wv.reload()`); await sleep(3000); });
      await step('console', async () => { await js(`DL.show('console')`); await sleep(500); log('console', await body()); await shot('dl-02-console');
        await js(`(() => { const i = document.getElementById('co-in'); i.value = 'game.addPoint(5)'; document.getElementById('co-run').click(); })()`); await sleep(700);
        await js(`(() => { const i = document.getElementById('co-in'); i.value = 'window.game'; document.getElementById('co-run').click(); })()`); await sleep(700);
        await js(`document.querySelectorAll('.co-obj')[document.querySelectorAll('.co-obj').length-1].click()`); await sleep(600);
        log('console after', await js(`[...document.querySelectorAll('.co-msg')].slice(-4).map(m=>m.innerText.replace(/\\s+/g,' ')).join(' || ')`)); await shot('dl-03-console-run'); });
      await step('network', async () => { await js(`DL.show('network')`); await sleep(600); log('network', await body()); await shot('dl-04-network');
        await js(`document.querySelector('.nw-row[data-id]:nth-child(3)').click()`); await sleep(900); await shot('dl-05-network-detail'); });
      await step('explore', async () => { await js(`DL.show('explore')`); await sleep(400);
        const wcId = await js('DL.wcId'); const wc = webContents.fromId(wcId);
        const pos = await wc.executeJavaScript(`(() => { const r = document.querySelector('h2').getBoundingClientRect(); return [r.left + 20, r.top + 10]; })()`);
        await js(`DL.handlers.explore.selectAt(${pos[0]}, ${pos[1]})`); await sleep(1200);
        log('explore', await body()); await shot('dl-06-explore');
        await js(`(() => { const t = document.getElementById('ex-text'); t.value = 'Meet Captain Noam'; t.dispatchEvent(new Event('input')); const c = document.getElementById('ex-color'); c.value = '#e5484d'; c.dispatchEvent(new Event('input')); })()`); await sleep(600);
        log('page h2 now', await wc.executeJavaScript(`document.querySelector('h2').textContent + ' ' + getComputedStyle(document.querySelector('h2')).color`));
        await js(`document.querySelector('[data-fun^="noam-spin"]').click()`); await sleep(400);
        await js(`document.getElementById('ex-parent').click()`); await sleep(800); log('parent', await js(`document.querySelector('.ex-title').innerText`));
        await js(`document.getElementById('ex-measure').click()`); await sleep(500); await shot('dl-07-measure'); await js(`document.getElementById('ex-measure').click()`); await sleep(300);
        // real pick through the overlay
        await js(`document.getElementById('ex-pick').click()`); await sleep(500);
        const r = await js(`(() => { const b = DL.tab.wv.getBoundingClientRect(); return [b.left, b.top]; })()`);
        const bp = await wc.executeJavaScript(`(() => { const r = document.getElementById('go').getBoundingClientRect(); return [r.left + 10, r.top + 8]; })()`);
        wc.sendInputEvent({ type: 'mouseMove', x: bp[0], y: bp[1] }); await sleep(300);
        wc.sendInputEvent({ type: 'mouseDown', x: bp[0], y: bp[1], button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: bp[0], y: bp[1], button: 'left', clickCount: 1 }); await sleep(1200);
        log('picked', await js(`document.querySelector('.ex-title') && document.querySelector('.ex-title').innerText`), 'missions', await js('JSON.stringify(Object.keys(DL.done))'));
      });
      await step('remix', async () => { await js(`DL.show('remix')`); await sleep(400); await js(`document.querySelectorAll('[data-r]')[3].click()`); await sleep(900);
        const wc = webContents.fromId(await js('DL.wcId')); log('remix font', await wc.executeJavaScript(`getComputedStyle(document.querySelector('p')).fontFamily`)); await shot('dl-08-remix'); });
      await step('colors', async () => { await js(`DL.show('colors')`); await sleep(1500); log('colors', await body()); await shot('dl-09-colors');
        await js(`document.getElementById('cf-eye').click()`); await sleep(1200);
        const r = await js(`(() => { const c = document.querySelector('.dl-eye canvas').getBoundingClientRect(); return [c.left + 60, c.top + 20]; })()`);
        ui.sendInputEvent({ type: 'mouseMove', x: r[0], y: r[1] }); await sleep(200); await shot('dl-10-eyedropper');
        ui.sendInputEvent({ type: 'mouseDown', x: r[0], y: r[1], button: 'left', clickCount: 1 }); ui.sendInputEvent({ type: 'mouseUp', x: r[0], y: r[1], button: 'left', clickCount: 1 }); await sleep(800);
        log('picked colour', await js('JSON.stringify(DL.body.querySelector(".cf-vals") && DL.body.querySelector(".cf-vals").innerText)')); });
      await step('devices', async () => { await js(`DL.show('devices')`); await sleep(400); await js(`document.querySelector('[data-d="0"]').click()`); await sleep(1500);
        const wc = webContents.fromId(await js('DL.wcId')); log('device width', await wc.executeJavaScript('innerWidth + "x" + innerHeight + " " + navigator.userAgent.slice(13,40)'));
        await js(`document.querySelector('[data-v="deuteranopia"]').click()`); await sleep(800); await shot('dl-11-devices');
        await js(`document.querySelector('[data-v="none"]').click()`); await js(`document.querySelector('[data-d="-1"]').click()`); await sleep(800); log('device reset', await wc.executeJavaScript('innerWidth')); });
      await step('access', async () => { await js(`DL.show('access')`); await sleep(300); await js(`document.getElementById('ax-run').click()`); await sleep(1500); log('access', await body()); await shot('dl-12-access'); });
      await step('storage', async () => { await js(`DL.show('storage')`); await sleep(1500); log('storage', await body()); await shot('dl-13-storage'); });
      await step('speed', async () => { await js(`DL.show('speed')`); await sleep(300); await js(`document.getElementById('sp-run').click()`); await sleep(1500); log('speed', await body());
        await js(`document.getElementById('sp-fps').click()`); await sleep(800); await shot('dl-14-speed'); await js(`document.getElementById('sp-fps').click()`); });
      await step('scripts', async () => { await js(`DL.show('scripts')`); await sleep(800); await js(`document.querySelector('.sc-item').click()`); await sleep(1200); log('scripts', await body()); await shot('dl-15-scripts');
        await js(`document.getElementById('sc-pause').click()`); await sleep(1200); log('paused', await js(`DL.body.querySelector('#sc-pause').innerText`)); await js(`document.getElementById('sc-pause').click()`); await sleep(600); });
      await step('home', async () => { await js(`DL.show('home')`); await sleep(400); log('missions', await js(`document.querySelector('.dl-missions h3').innerText`)); await shot('dl-16-home-missions'); });
      await step('close', async () => { await js(`shortcut({key:'f12'})`); await sleep(600); log('closed', await js('DL.open'), await js(`document.getElementById('views').getBoundingClientRect().height`)); });
      await step('json viewer', async () => { await js(`state.active.navigate('https://news.example.org/data.json')`); await sleep(2000); await shot('dl-17-json'); const wc = webContents.fromId(await js('state.active.wcId')); log('json', await wc.executeJavaScript(`document.body.innerText.slice(0,200)`)); });
      await step('playground', async () => {
        await js(`newTab({url:'noam://playground/'})`); await sleep(3000);
        const wc = webContents.fromId(await js('state.active.wcId'));
        const frames = () => wc.mainFrame.framesInSubtree.filter((f) => f !== wc.mainFrame);
        log('pg frames', frames().map((f) => f.url));
        const f = frames()[0];
        log('pg preview', f && await f.executeJavaScript(`document.querySelector('h1') && document.querySelector('h1').textContent`));
        log('pg sandbox', f && await f.executeJavaScript(`(() => { try { return parent.noam ? 'LEAK: noam api visible' : 'no api'; } catch (e) { return 'blocked: ' + e.name; } })()`));
        await f.executeJavaScript(`document.getElementById('btn').click()`); await sleep(500);
        log('pg console', await wc.executeJavaScript(`document.getElementById('conlist').innerText`));
        await wc.executeJavaScript(`(() => { document.querySelector('[data-l=js]').click(); const c = document.getElementById('code'); c.value += '\\nconsole.log(scroe);'; c.dispatchEvent(new Event('input')); })()`); await sleep(1800);
        log('pg error', await wc.executeJavaScript(`document.getElementById('conlist').innerText`));
        await shot('dl-18-playground');
        await wc.executeJavaScript(`document.getElementById('new').click()`); await sleep(500); await shot('dl-19-playground-new');
        await wc.executeJavaScript(`document.querySelectorAll('[data-t]')[2].click()`); await sleep(2000); await shot('dl-20-playground-ball');
        log('pg projects', await wc.executeJavaScript(`JSON.parse(localStorage.getItem('pg-projects')).map(p=>p.name)`));
      });
      await step('context explore', async () => {
        await js(`activate(state.tabs[0])`); await sleep(500); await js(`state.active.navigate('https://news.example.org/')`); await sleep(2000);
        const wcId = await js('state.active.wcId'); const wc = webContents.fromId(wcId);
        const pos = await wc.executeJavaScript(`(() => { const r = document.querySelector('#intro').getBoundingClientRect(); return [r.left + 30, r.top + 8]; })()`);
        ui.send('devlab:explore-at', { wcId, x: pos[0], y: pos[1] }); await sleep(3000);
        log('context explore', await js(`document.querySelector('.ex-title') && document.querySelector('.ex-title').innerText`));
        await js(`document.getElementById('ex-parent').click()`); await sleep(800); log('parent now', await js(`document.querySelector('.ex-title').innerText.split('\\n')[0]`));
        await shot('dl-21-explore-context');
      });
      await step('3d view', async () => {
        await js(`state.active.navigate('https://news.example.org/')`); await sleep(2500);
        await js(`DL.show('3d')`); await sleep(1200);
        await js(`document.getElementById('d3-go').click()`); await sleep(1800);
        log('3d info', await js(`document.querySelector('.d3 .muted') && document.querySelector('.d3 .muted').textContent`));
        log('3d overlay in page', await (await tabWc()).executeJavaScript(`!!document.getElementById('__noam3d')`));
        await shot('dl-22-3d');
        await js(`document.querySelector('[data-v="side"]').click()`); await sleep(900); await shot('dl-23-3d-side');
        await js(`document.querySelector('#d3-col').value='type'; document.querySelector('#d3-col').dispatchEvent(new Event('change'))`); await sleep(1500); await shot('dl-24-3d-type');
        await js(`document.getElementById('d3-go').click()`); await sleep(800);
        log('3d removed', !(await (await tabWc()).executeJavaScript(`!!document.getElementById('__noam3d')`)));
      });
      log('DONE'); setTimeout(() => app.exit(0), 300);
    });
    return;
  }
  if (process.env.NOAM_TEST_ZL) {
    const srv = require('https').createServer({ key: fs.readFileSync('/tmp/claude-0/k.pem'), cert: fs.readFileSync('/tmp/claude-0/c.pem') }, (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ results: [{ name: 'Kiryat Sefer', admin1: 'Central', country: 'Israel', latitude: 31.933, longitude: 35.041, timezone: 'Asia/Jerusalem', elevation: 320 }, { name: 'Kiryat Gat', admin1: 'Southern', country: 'Israel', latitude: 31.61, longitude: 34.76, timezone: 'Asia/Jerusalem', elevation: 140 }] }));
    });
    srv.listen(443, '127.0.0.1', async () => {
      const win = [...windows][0]; const ui = win.webContents; const js = (c) => ui.executeJavaScript(c);
      const shot = async (n) => { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(OUT, n + '.png'), img.toPNG()); };
      await sleep(3000);
      await js(`state.active.navigate('noam://settings/#zmanim')`); await sleep(2500);
      const wc = webContents.fromId(await js('state.active.wcId')); const p = (c) => wc.executeJavaScript(c);
      log('now', await p(`document.getElementById('zl-now').textContent`), await p(`document.getElementById('zl-today').innerText.replace(/\\s+/g,' ')`));
      log('nav on', await p(`document.querySelector('#nav a.on')?.textContent`));
      await shot('zl-01');
      await p(`(() => { const s=document.getElementById('zl-preset'); s.value='Beit Shemesh'; s.dispatchEvent(new Event('change')); })()`); await sleep(800);
      log('beit shemesh', await p(`document.getElementById('zl-now').textContent`), await p(`document.getElementById('zl-today').innerText.replace(/\\s+/g,' ')`));
      await p(`document.getElementById('zl-elev-on').click()`); await sleep(800);
      log('with elevation', settings.get('widgets').elevation, await p(`document.getElementById('zl-today').innerText.replace(/\\s+/g,' ')`));
      await p(`(() => { const q=document.getElementById('zl-q'); q.value='Kiryat'; q.dispatchEvent(new Event('input')); })()`); await sleep(1500);
      log('search', await p(`document.getElementById('zl-list').innerText.replace(/\\n/g,' | ')`));
      await shot('zl-02-search');
      await p(`document.querySelector('#zl-list li[data-i]').click()`); await sleep(800);
      log('picked', JSON.stringify(settings.get('widgets').city));
      await p(`(() => { document.querySelector('.zl-manual').open=true; document.getElementById('zl-name').value='My shul'; document.getElementById('zl-lat').value='31.7166'; document.getElementById('zl-lon').value='34.993'; document.getElementById('zl-elev').value='340'; document.getElementById('zl-tz').value='Asia/Jerusalem'; document.getElementById('zl-save').click(); })()`); await sleep(800);
      log('manual', JSON.stringify(settings.get('widgets').city));
      await js(`state.active.navigate('noam://newtab/')`); await sleep(2500);
      const wc2 = webContents.fromId(await js('state.active.wcId'));
      await wc2.executeJavaScript(`document.getElementById('zm-place').click()`); await sleep(800);
      log('newtab place', await wc2.executeJavaScript(`document.getElementById('zm-place').textContent + ' | ' + document.querySelector('#zm-body .note').textContent`));
      await wc2.executeJavaScript(`(() => { const s=document.getElementById('city-preset'); s.value='Jerusalem'; s.dispatchEvent(new Event('change')); })()`); await sleep(1200);
      log('newtab after preset', JSON.stringify(settings.get('widgets').city.name));
      await shot('zl-03-newtab');
      log('DONE'); setTimeout(() => app.exit(0), 300);
    });
    return;
  }
  if (process.env.NOAM_TEST_ST) {
    const srv = require('https').createServer({ key: fs.readFileSync('/tmp/claude-0/k.pem'), cert: fs.readFileSync('/tmp/claude-0/c.pem') }, (req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<title>' + req.headers.host + '</title><h1>' + req.headers.host + '</h1>'); });
    srv.listen(443, '127.0.0.1', async () => {
      const win = [...windows][0]; const ui = win.webContents; const js = (c) => ui.executeJavaScript(c);
      await sleep(3000);
      await js(`nb.invoke('settings:set',{screenTime:{idleMinutes:100000}})`);
      win.show(); win.focus();
      log('focused', !!require('electron').BrowserWindow.getFocusedWindow(), 'idle', require('electron').powerMonitor.getSystemIdleTime());
      await js(`state.active.navigate('https://www.youtube.com/watch')`); await sleep(16000);
      await js(`newTab({url:'https://news.example.org/'})`); await sleep(11000);
      await js(`newTab({url:'https://news.example.org/', private:true})`); await sleep(11000);
      const st = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'screentime.json'), 'utf8'));
      log('live data', JSON.stringify(st.days));
      // seed a week of history for the screenshot
      const dk = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const st2 = require('./screentime');
      const seed = { YouTube: 5400, Facebook: 3600, 'Google Sheets': 1500, WhatsApp: 2400, 'Google Search': 900, 'netzach.legos.co.il': 1300, 'GitHub': 1100, Gmail: 700, ChatGPT: 800, 'ynet.co.il': 500 };
      const days = {};
      for (let i = 0; i < 9; i++) { const d = dk(new Date(Date.now() - i * 86400000)); days[d] = {}; for (const [k, v] of Object.entries(seed)) days[d][k] = Math.round(v * (0.4 + Math.random() * 1.1)); }
      app.emit('noam-test-seed-screentime', days);
      log('seeded');
      await sleep(600);
      await js(`newTab({url:'noam://screentime/'})`); await sleep(2500);
      let img = await win.webContents.capturePage(); fs.writeFileSync(path.join(OUT, 'st-today.png'), img.toPNG());
      const wc = webContents.fromId(await js('state.active.wcId'));
      await wc.executeJavaScript(`document.querySelector('[data-r="7"]').click()`); await sleep(1200);
      img = await win.webContents.capturePage(); fs.writeFileSync(path.join(OUT, 'st-week.png'), img.toPNG());
      await wc.executeJavaScript(`(() => { const sel=document.querySelector('.site select'); sel.value='30'; sel.dispatchEvent(new Event('change')); })()`); await sleep(1200);
      log('limit set', JSON.stringify(settings.get('screenTime').limits));
      log('csv head', (await wc.executeJavaScript(`noam.invoke('screentime:csv')`)).split('\n').slice(0, 3));
      log('DONE'); setTimeout(() => app.exit(0), 300);
    });
    return;
  }
  if (process.env.NOAM_TEST_ZA) {
    const { Notification } = require('electron');
    Notification.isSupported = () => true; const orig = Notification.prototype.show;
    Notification.prototype.show = function () { log('NOTIFY', this.title, '|', this.body, 'silent', this.silent); try { orig.call(this); } catch {} };
    (async () => {
      const win = [...windows][0]; const ui = win.webContents; const js = (c) => ui.executeJavaScript(c);
      await sleep(3000);
      const Z = require('./assets/zmanim.js');
      const c = { lat: 31.769, lon: 35.2163, tz: 'Asia/Jerusalem' };
      const all = []; for (const o of [0, 1]) { const z = Z.zmanim(c, new Date(Date.now() + o * 86400000)); for (const k of ['alot', 'sunrise', 'shma', 'tefila', 'chatzot', 'minchaGedola', 'minchaKetana', 'plag', 'sunset', 'tzeit']) if (z[k]) all.push([k, z[k]]); }
      const [key, t] = all.filter(([, t]) => t > Date.now() + 120000).sort((a, b) => a[1] - b[1])[0];
      const before = Math.floor((t - Date.now()) / 60000);
      log('target', key, t.toISOString(), 'before', before);
      await js(`nb.invoke('settings:set',{zmanimAlerts:{enabled:true, before:${before}, sound:false, which:{${key}:true}}})`);
      await js(`newTab({url:'noam://settings/#tools'})`); await sleep(2500);
      const wc = webContents.fromId(await js('state.active.wcId'));
      await wc.executeJavaScript(`document.getElementById('za-on').scrollIntoView({block:'start'})`); await sleep(600);
      log('note', await wc.executeJavaScript(`document.getElementById('za-note').textContent`));
      const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(OUT, 'za-settings.png'), img.toPNG());
      await wc.executeJavaScript(`document.getElementById('za-test').click()`); await sleep(500);
      await sleep(85000);
      log('DONE'); app.exit(0);
    })();
    return;
  }
  if (process.env.NOAM_TEST_BL) {
    const srv = require('https').createServer({ key: fs.readFileSync('/tmp/claude-0/k.pem'), cert: fs.readFileSync('/tmp/claude-0/c.pem') }, (req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<title>Colours</title><body style="margin:0;background:#fff;font:24px sans-serif"><div style="display:flex;gap:0"><div style="width:300px;height:300px;background:#fff"></div><div style="width:300px;height:300px;background:#0000ff"></div><div style="width:300px;height:300px;background:#00ff00"></div></div><h1 style="padding:20px">Night reading test</h1></body>');
    });
    srv.listen(443, '127.0.0.1', async () => {
      const win = [...windows][0]; const ui = win.webContents; const js = (c) => ui.executeJavaScript(c);
      const shot = async (n) => { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(OUT, n + '.png'), img.toPNG()); return img; };
      const px = (img, x, y) => { const b = img.toBitmap(); const sz = img.getSize(); const i = (y * sz.width + x) * 4; return [b[i + 2], b[i + 1], b[i]]; };
      const step = async (name, fn) => { try { await fn(); log('ok', name); } catch (e) { log('FAIL', name, e.stack || String(e)); } };
      await sleep(3500);
      await step('overlay', async () => {
        await js(`state.active.navigate('https://news.example.org/')`); await sleep(2000);
        const r = await js(`(() => { const b = state.active.wv.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top) }; })()`);
        let img = await shot('bl-01-off');
        log('off', px(img, r.x + 150, r.y + 150), px(img, r.x + 450, r.y + 150), 'toolbar', px(img, 400, 62));
        await js(`toggleBlueLight()`); await sleep(1800);
        img = await shot('bl-02-on');
        log('on', px(img, r.x + 150, r.y + 150), px(img, r.x + 450, r.y + 150), 'toolbar', px(img, 400, 62), 'btn on', await js(`document.getElementById('bl-btn').classList.contains('on')`));
        await js(`nb.invoke('settings:set',{blueLight:{tint:'red', strength:70, dim:30, fade:0}})`); await sleep(800);
        img = await shot('bl-03-red-dim');
        log('red+dim', px(img, r.x + 150, r.y + 150));
        await js(`toggleBlueLight()`); await sleep(600);
        log('after off', await js(`document.getElementById('bluelight').classList.contains('on')`), await js(`document.getElementById('bl-dim').classList.contains('on')`));
        // schedule: custom window that includes now
        const d = new Date(); const hh = (x) => String(x).padStart(2, '0');
        const from = `${hh((d.getHours() + 23) % 24)}:00`, to = `${hh((d.getHours() + 1) % 24)}:59`;
        await js(`nb.invoke('settings:set',{blueLight:{schedule:'custom', from:'${from}', to:'${to}', tint:'amber', strength:45, dim:0, enabled:false}})`); await sleep(800);
        log('scheduled on', await js(`document.getElementById('bluelight').classList.contains('on')`));
        await js(`nb.invoke('settings:set',{blueLight:{schedule:'sunset'}})`); await sleep(500);
        log('sunset schedule now', await js(`document.getElementById('bluelight').classList.contains('on')`), new Date().toTimeString().slice(0, 5));
        await js(`nb.invoke('settings:set',{blueLight:{schedule:'off', enabled:true, tint:'amber', strength:45, dim:0, fade:1.2}})`); await sleep(1500);
        await js(`newTab({url:'noam://settings/#tools'})`); await sleep(2500);
        const wc = webContents.fromId(await js('state.active.wcId'));
        await wc.executeJavaScript(`document.getElementById('tools').scrollIntoView()`); await sleep(500);
        await shot('bl-04-settings-filter-on');
        await js(`nb.invoke('settings:set',{blueLight:{enabled:false}})`); await sleep(1600);
        await shot('bl-05-settings');
      });
      log('DONE'); setTimeout(() => app.exit(0), 300);
    });
    return;
  }
  if (process.env.NOAM_TEST_V21) {
    const wav = (() => { const sr = 8000, n = sr * 20; const b = Buffer.alloc(44 + n * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40); for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 440 / sr) * 3000), 44 + i * 2); return b; })();
    const longPage = `<!doctype html><title>Long article about trains</title><body style="font:17px Georgia,serif;margin:0;padding:30px 60px;background:linear-gradient(#fdf6e3,#e3f0fd)"><h1>Trains of Israel</h1>` + Array.from({ length: 40 }, (_, i) => `<p>Section ${i + 1}: The railway between Tel Aviv and Jerusalem climbs through the hills, passing tunnels and bridges built over many years.</p>`).join('') + `<h2 id="end">The end</h2></body>`;
    const media = `<!doctype html><title>Radio test</title><body style="font:16px sans-serif;padding:30px"><h1>Now playing</h1><audio id="a" src="/tone.wav" controls loop></audio><video id="v" width="320" height="180" style="background:#000" muted></video><script>document.getElementById('a').play().catch(e=>document.title='blocked '+e.name)</script></body>`;
    const login = `<!doctype html><title>Login</title><body><form action="/welcome" method="post"><input name="email" type="email"><input name="pass" type="password"><button>Sign in</button></form></body>`;
    const sha1 = (s) => require('crypto').createHash('sha1').update(s).digest('hex').toUpperCase();
    const leakedSha = sha1('password123');
    const srv = require('https').createServer({ key: fs.readFileSync('/tmp/claude-0/k.pem'), cert: fs.readFileSync('/tmp/claude-0/c.pem') }, (req, res) => {
      const host = (req.headers.host || '').split(':')[0]; const u = new URL(req.url, 'https://' + host);
      log('mock', host, u.pathname);
      const json = (o) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (host === 'geocoding-api.open-meteo.com') return json({ results: [{ name: 'Tel Aviv', admin1: 'Tel Aviv District', country: 'Israel', latitude: 32.0809, longitude: 34.7806, timezone: 'Asia/Jerusalem' }, { name: 'Tel Mond', admin1: 'Central District', country: 'Israel', latitude: 32.25, longitude: 34.92, timezone: 'Asia/Jerusalem' }] });
      if (host === 'api.open-meteo.com') return json({ current: { temperature_2m: 24.3, apparent_temperature: 25.1, weather_code: 2, is_day: 1, wind_speed_10m: 12, relative_humidity_2m: 61 }, daily: { time: ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'], weather_code: [2, 0, 61, 3], temperature_2m_max: [27, 28, 23, 25], temperature_2m_min: [18, 19, 17, 18] } });
      if (host === 'www.hebcal.com' && u.pathname === '/shabbat') return json({ items: [{ category: 'candles', title: 'Candle lighting: 4:39pm', date: '2026-10-30T16:39:00+02:00' }, { category: 'parashat', title: 'Parashat Lech-Lecha', hebrew: 'פרשת לך־לך', date: '2026-10-31' }, { category: 'havdalah', title: 'Havdalah: 5:35pm', date: '2026-10-31T17:35:00+02:00' }] });
      if (host === 'www.hebcal.com') return json({ items: [{ category: 'roshchodesh', title: 'Rosh Chodesh Kislev', date: '2026-11-11' }, { category: 'holiday', title: 'Sigd', date: '2026-11-18' }] });
      if (host === 'api.frankfurter.app') return json({ base: u.searchParams.get('from') || 'USD', date: '2026-10-23', rates: { ILS: 3.72, EUR: 0.92, GBP: 0.79 } });
      if (host === 'api.pwnedpasswords.com') { res.writeHead(200, { 'content-type': 'text/plain' }); const pre = u.pathname.split('/').pop(); res.end((leakedSha.startsWith(pre) ? leakedSha.slice(5) + ':24611\r\n' : '') + '0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n'); return; }
      if (u.pathname === '/tone.wav') { res.writeHead(200, { 'content-type': 'audio/wav', 'content-length': wav.length }); return res.end(wav); }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      if (u.pathname === '/long') return res.end(longPage);
      if (u.pathname === '/media') return res.end(media);
      if (u.pathname === '/login') return res.end(login);
      if (u.pathname === '/big') { res.end(); return; }
      res.end('<title>Home</title><h1>Home</h1>');
    });
    // throttled download source
    const dlsrv = http.createServer((req, res) => {
      const total = 12 * 1024 * 1024; const range = /bytes=(\d+)-/.exec(req.headers.range || '');
      const start = range ? +range[1] : 0;
      res.writeHead(range ? 206 : 200, { 'content-type': 'application/zip', 'content-length': total - start, 'accept-ranges': 'bytes', 'content-disposition': 'attachment; filename="photos.zip"', ...(range ? { 'content-range': `bytes ${start}-${total - 1}/${total}` } : {}) });
      let left = total - start; const tick = () => { if (left <= 0) return res.end(); const n = Math.min(65536, left); left -= n; if (res.write(Buffer.alloc(n, 1))) setTimeout(tick, 5); else res.once('drain', tick); }; tick();
    });
    dlsrv.listen(0, '127.0.0.1');
    srv.listen(443, '127.0.0.1', async () => {
      const base = 'https://news.example.org';
      const win = [...windows][0]; const ui = win.webContents;
      const js = (c) => ui.executeJavaScript(c);
      const shot = async (n) => { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(OUT, n + '.png'), img.toPNG()); log('shot', n); };
      const tabWc = async () => webContents.fromId(await js('state.active.wcId'));
      const step = async (name, fn) => { try { await fn(); log('ok', name); } catch (e) { log('FAIL', name, e.stack || String(e)); } };
      await sleep(3500);

      await step('newtab widgets', async () => {
        await js(`state.active.navigate('noam://newtab/')`); await sleep(3000);
        const wc = await tabWc();
        log('widgets', await wc.executeJavaScript(`({clock: document.getElementById('clock-t').textContent, hd: document.getElementById('clock-hd').textContent, wx: document.getElementById('wx-body').innerText.slice(0,120), zm: document.getElementById('zm-body').innerText.slice(0,300)})`));
        await shot('v21-01-newtab');
        await wc.executeJavaScript(`document.getElementById('widgets').scrollIntoView({block:'center'})`); await sleep(500); await shot('v21-01b-widgets');
        await wc.executeJavaScript(`document.getElementById('todo-in').value='Buy challah'; document.getElementById('todo-f').requestSubmit()`); await sleep(500);
        await wc.executeJavaScript(`document.getElementById('todo-in').value='Call grandma'; document.getElementById('todo-f').requestSubmit()`); await sleep(500);
        await wc.executeJavaScript(`document.querySelector('#todo-list li:last-child input').click()`); await sleep(400);
        await wc.executeJavaScript(`document.getElementById('w-edit').click(); const q=document.getElementById('city-q'); q.value='Tel'; q.dispatchEvent(new Event('input'))`); await sleep(1500);
        await shot('v21-02-newtab-customize');
        await wc.executeJavaScript(`document.querySelector('#city-list li[data-i]').click()`); await sleep(1500);
        log('city now', await wc.executeJavaScript(`document.getElementById('city-now').textContent`), await wc.executeJavaScript(`document.getElementById('wx-place').textContent`));
        await wc.executeJavaScript(`document.getElementById('w-edit').click()`); await sleep(300);
        log('todos', await wc.executeJavaScript(`document.getElementById('todo-list').innerText`));
      });

      await step('daylight theme', async () => {
        await js(`nb.invoke('settings:set',{appearance:{preset:'daylight'}})`); await sleep(1200);
        log('tod', await js('document.documentElement.dataset.tod'), await js('document.documentElement.dataset.theme'));
        await shot('v21-03-daylight');
        await js(`nb.invoke('settings:set',{appearance:{preset:'default'}})`); await sleep(600);
      });

      await step('omnibox calc', async () => {
        for (const q of ['5*12', '10 usd in ils', '10 km in miles', '100 f to c']) {
          await js(`(() => { const u=document.getElementById('url'); u.focus(); u.value=${JSON.stringify(q)}; u.dispatchEvent(new Event('input')); })()`); await sleep(1200);
          log('calc row', q, await js(`[...document.querySelectorAll('#suggest [data-kind="calc"], #suggest .calc')].map(e=>e.innerText).join(' | ') || document.getElementById('suggest')?.innerText.slice(0,200)`));
          if (q === '10 usd in ils') await shot('v21-04-omnibox-currency');
        }
        await js(`document.getElementById('url').blur()`);
      });

      await step('notes + reading list', async () => {
        await js(`state.active.navigate('${base}/long')`); await sleep(2500);
        await js(`document.querySelector('.rail-btn[data-id="notes"]').click()`); await sleep(1200);
        await js(`(() => { const ta=document.querySelector('.rp-notes textarea'); ta.value='Remember: the Jerusalem line has 11 tunnels.'; ta.dispatchEvent(new Event('input')); })()`); await sleep(1200);
        log('note saved', await js(`document.querySelector('.rp-saved').textContent`), await js(`!document.querySelector('.rail-btn[data-id="notes"] .dot').hidden`));
        await shot('v21-05-notes');
        await js(`document.getElementById('rl-btn').click()`); await sleep(800);
        log('rl on', await js(`document.getElementById('rl-btn').classList.contains('on')`));
        await js(`state.active.navigate('${base}/')`); await sleep(1500);
        log('note hidden on other page of same site?', await js(`document.querySelector('.rp-notes textarea')?.value`));
        await js(`document.querySelector('.rail-btn[data-id="reading"]').click()`); await sleep(1000);
        log('reading list', await js(`document.querySelector('.rp-reading').innerText.slice(0,200)`));
        await shot('v21-06-reading');
        await js(`document.querySelector('.rail-btn[data-id="calc"]').click()`); await sleep(800);
        await js(`(() => { const i=document.querySelector('.calc-in'); i.value='(12+8)*3^2'; i.dispatchEvent(new Event('input')); i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'})); })()`); await sleep(600);
        log('calc panel', await js(`document.querySelector('.calc-out').textContent`), await js(`document.querySelector('.calc-hist').innerText`));
        await shot('v21-07-calc');
        await js(`document.querySelector('.rail-btn[data-id="whatsapp"]').click()`); await sleep(1500);
        log('web panel', await js(`(() => { const w=document.querySelector('#rp-body webview.on'); return w && w.getAttribute('src'); })()`));
        await js(`document.getElementById('rp-close').click()`); await sleep(300);
      });

      await step('media', async () => {
        await js(`newTab({url:'${base}/media'})`); await sleep(3500);
        const wc = await tabWc();
        log('media title', wc.getTitle(), await wc.executeJavaScript(`({paused: document.getElementById('a').paused, t: document.getElementById('a').currentTime})`));
        await js(`renderMediaBtn()`); await sleep(300);
        log('media btn', await js(`!document.getElementById('media-btn').hidden`), await js(`document.getElementById('media-btn').classList.contains('playing')`));
        await js(`document.getElementById('media-btn').click()`); await sleep(1200);
        log('media panel', await js(`document.getElementById('media-list').innerText`));
        await js(`(() => { const r=document.querySelector('#media-list [data-a=boost]'); r.value='250'; r.dispatchEvent(new Event('input')); const s=document.querySelector('#media-list [data-a=rate]'); s.value='1.5'; s.dispatchEvent(new Event('change')); })()`); await sleep(800);
        log('boost/rate', await wc.executeJavaScript(`({boost: window.__noamBoost, rate: document.getElementById('a').playbackRate})`));
        await shot('v21-08-media');
        await js(`document.querySelector('#media-list [data-a=play]').click()`); await sleep(800);
        log('after pause', await wc.executeJavaScript(`document.getElementById('a').paused`));
        await js('closePanels()');
        // speed keys
        wc.focus(); await sleep(200);
        await wc.executeJavaScript(`document.getElementById('a').play()`); await sleep(300);
        for (const k of [']', ']', ']']) { wc.sendInputEvent({ type: 'keyDown', keyCode: k }); wc.sendInputEvent({ type: 'char', keyCode: k }); wc.sendInputEvent({ type: 'keyUp', keyCode: k }); await sleep(150); }
        log('rate after ]]]', await wc.executeJavaScript(`document.getElementById('a').playbackRate`));
        await shot('v21-09-speed-badge');
        wc.sendInputEvent({ type: 'keyDown', keyCode: '\\' }); wc.sendInputEvent({ type: 'char', keyCode: '\\' }); wc.sendInputEvent({ type: 'keyUp', keyCode: '\\' }); await sleep(200);
        log('rate after \\', await wc.executeJavaScript(`document.getElementById('a').playbackRate`));
      });

      await step('screenshot', async () => {
        await js(`state.active.navigate('${base}/long')`); await sleep(2000);
        await js(`startShot()`); await sleep(400);
        await shot('v21-10-shot-overlay');
        await js(`document.getElementById('shot-full').click()`); await sleep(3500);
        const wc = await tabWc();
        { await sleep(500); const d = await wc.executeJavaScript(`(() => { const c=document.createElement('canvas'); const cv=document.getElementById('cv'); c.width=cv.width/4; c.height=cv.height/4; c.getContext('2d').drawImage(cv,0,0,c.width,c.height); return c.toDataURL(); })()`); fs.writeFileSync(path.join(OUT, 'v21-raw-full.png'), Buffer.from(d.split(',')[1], 'base64')); }
        log('shot page', wc.getURL(), await wc.executeJavaScript(`({w: document.getElementById('cv').width, h: document.getElementById('cv').height})`));
        // draw an arrow, a box and text
        const r = await wc.executeJavaScript(`(() => { const b=document.getElementById('cv').getBoundingClientRect(); return {x:b.left,y:b.top}; })()`);
        const drag = async (x1, y1, x2, y2) => { wc.sendInputEvent({ type: 'mouseDown', x: r.x + x1, y: r.y + y1, button: 'left', clickCount: 1 }); for (let i = 1; i <= 6; i++) { wc.sendInputEvent({ type: 'mouseMove', x: r.x + x1 + (x2 - x1) * i / 6, y: r.y + y1 + (y2 - y1) * i / 6, button: 'left' }); await sleep(30); } wc.sendInputEvent({ type: 'mouseUp', x: r.x + x2, y: r.y + y2, button: 'left', clickCount: 1 }); await sleep(150); };
        await drag(500, 300, 260, 110);
        await wc.executeJavaScript(`document.querySelector('[data-t=box]').click()`); await drag(40, 60, 420, 120);
        await wc.executeJavaScript(`document.querySelector('[data-t=blur]').click()`); await drag(60, 160, 500, 200);
        await wc.executeJavaScript(`document.querySelector('[data-c="#3E8DEB"]').click(); document.querySelector('[data-t=text]').click()`);
        wc.sendInputEvent({ type: 'mouseDown', x: r.x + 520, y: r.y + 260, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: r.x + 520, y: r.y + 260, button: 'left', clickCount: 1 }); await sleep(200);
        await wc.insertText('Look here!'); await sleep(100);
        wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' }); await sleep(300);
        log('undo enabled', await wc.executeJavaScript(`!document.getElementById('undo').disabled`));
        await shot('v21-11-shot-editor');
        await wc.executeJavaScript(`document.getElementById('copy').click()`); await sleep(600);
        log('clipboard image', await require('./clip').readImagePngSize());
        await js(`closeTab(state.active)`); await sleep(500);
        // area capture
        await js(`state.active.navigate('${base}/long')`); await sleep(1500);
        const area = await js(`(async () => { const t=state.active; return await nb.invoke('screenshot:capture',{wcId:t.wcId, mode:'area', rect:{x:20,y:20,width:300,height:150}}); })()`);
        log('area shot', area);
      });

      await step('workspaces', async () => {
        await js(`(async () => { const ws=[{id:'default',name:'Personal',color:'#7C68FA'},{id:'wschool',name:'School',color:'#3FAE5A'}]; await nb.invoke('settings:set',{tabs:{workspaces:ws}}); state.settings.tabs={...state.settings.tabs, workspaces:ws}; applyWs(); })()`); await sleep(500);
        const before = await js('visibleTabs().length');
        await js(`switchWs('wschool')`); await sleep(1500);
        log('school tabs', await js('visibleTabs().map(t=>t.url)'), 'personal had', before, 'ws name', await js(`document.getElementById('ws-name').textContent`));
        await js(`state.active.navigate('${base}/')`); await sleep(1200);
        await shot('v21-12-workspace-school');
        await js(`switchWs('default')`); await sleep(800);
        log('back to personal', await js('visibleTabs().length'), await js('state.tabs.filter(t=>!t.el.classList.contains("ws-hidden")).length'));
        // ctrl+alt+2
        await js(`shortcut({key:'2', ctrl:true, alt:true})`); await sleep(600);
        log('ctrl+alt+2 ->', await js('state.ws'));
        await js(`shortcut({key:'1', ctrl:true, alt:true})`); await sleep(600);
      });

      await step('sessions', async () => {
        const n = await js('visibleTabs().length');
        await js(`(() => { saveSessionAs(); setTimeout(() => { const i=document.querySelector('.ask input'); i.value='Train research'; document.querySelector('.ask [data-a=ok]').click(); }, 300); })()`); await sleep(1200);
        log('sessions', await js('state.sessions.map(s=>s.name+":"+s.count)'), 'open tabs', n);
        await js(`newTab({url:'noam://settings/#tools'})`); await sleep(2500);
        await (await tabWc()).executeJavaScript(`document.getElementById('tools').scrollIntoView()`); await sleep(500);
        await shot('v21-13-settings-tools');
        const before = await js('state.tabs.length');
        await (await tabWc()).executeJavaScript(`document.querySelector('[data-open]').click()`); await sleep(2000);
        log('tabs after open session', before, '->', await js('state.tabs.length'));
      });

      await step('gestures', async () => {
        await js(`newTab({url:'${base}/'})`); await sleep(1500);
        await js(`state.active.navigate('${base}/long')`); await sleep(1500);
        await js(`shortcut({key:'gesture-L'})`); await sleep(1200);
        log('after gesture L', await js('state.active.url'));
        const n = await js('state.tabs.length');
        await js(`shortcut({key:'gesture-U'})`); await sleep(800);
        await js(`shortcut({key:'gesture-DR'})`); await sleep(800);
        log('tabs', n, '-> after U+DR', await js('state.tabs.length'));
        // real right-drag in the page
        const wc = await tabWc(); wc.focus();
        const b = await js(`(() => { const r=state.active.wv.getBoundingClientRect(); return {x:r.left, y:r.top}; })()`);
        await js(`state.active.navigate('${base}/long')`); await sleep(1500);
        wc.sendInputEvent({ type: 'mouseDown', x: 600, y: 300, button: 'right', clickCount: 1 });
        for (let i = 1; i <= 12; i++) { wc.sendInputEvent({ type: 'mouseMove', x: 600 - i * 15, y: 300, button: 'right', modifiers: ['rightButtonDown'] }); await sleep(20); }
        await shot('v21-14-gesture-trail');
        wc.sendInputEvent({ type: 'mouseUp', x: 420, y: 300, button: 'right', clickCount: 1 }); await sleep(1500);
        log('after real gesture', await js('state.active.url'));
      });

      await step('downloads throttled', async () => {
        await js(`nb.invoke('settings:set',{downloads:{limitKBps:512, autoSort:true}})`); await sleep(300);
        await js(`state.active.navigate('http://news.example.org:${dlsrv.address().port}/photos.zip')`); await sleep(2500);
        let list = await js(`nb.invoke('downloads:list')`); let d = list[0];
        log('dl', d.name, d.state, d.received, d.total, 'speed', d.speed, 'limited', d.limited, d.path);
        await js(`document.getElementById('dl-btn').click()`); await sleep(400); await shot('v21-15-downloads');
        await js(`nb.invoke('downloads:action',{id:${JSON.stringify(d.id)},action:'pause'})`); await sleep(1500);
        const a = (await js(`nb.invoke('downloads:list')`))[0]; await sleep(1500); const b2 = (await js(`nb.invoke('downloads:list')`))[0];
        log('paused', a.paused, a.received, '->', b2.received);
        await js(`nb.invoke('downloads:action',{id:${JSON.stringify(d.id)},action:'resume'})`); await sleep(1500);
        log('resumed', (await js(`nb.invoke('downloads:list')`))[0].received);
        await js(`nb.invoke('settings:set',{downloads:{limitKBps:0}})`);
        for (let i = 0; i < 20; i++) { d = (await js(`nb.invoke('downloads:list')`))[0]; if (d.state !== 'progressing') break; await sleep(1000); }
        log('dl final', d.state, d.received, d.path, fs.existsSync(d.path) && fs.statSync(d.path).size);
        await js('closePanels()');
      });

      await step('breach check', async () => {
        const v = features.vault;
        v.save ? null : null;
        await js(`newTab({url:'noam://passwords/'})`); await sleep(1200);
        const wc = await tabWc();
        // seed via the vault directly
        v.items.push({ id: 'a1', origin: 'https://news.example.org', username: 'noam', password: 'password123', created: Date.now() }, { id: 'a2', origin: 'https://shop.example', username: 'noam', password: 'password123', created: Date.now() }, { id: 'a3', origin: 'https://bank.example', username: 'noam@x', password: 'Vq7#kLp2!xRt9wZ', created: Date.now() });
        await wc.reload(); await sleep(1500);
        await wc.executeJavaScript(`document.getElementById('check').click()`); await sleep(2500);
        log('report', await wc.executeJavaScript(`document.getElementById('report').innerText`));
        log('flags', await wc.executeJavaScript(`[...document.querySelectorAll('.row')].map(r=>r.innerText.replace(/\\s+/g,' '))`));
        await shot('v21-16-breach');
      });

      await step('sync extras', async () => {
        const snap = features2.snapshot();
        log('snapshot keys', Object.keys(snap), 'rl', snap.readingList.length, 'notes', Object.keys(snap.notes), 'todos', snap.todos.length, 'sessions', snap.sessions.length);
        const remote = JSON.parse(JSON.stringify(snap));
        remote.readingList.push({ id: 'r-remote', url: 'https://remote.example/a', title: 'From laptop', added: Date.now(), updated: Date.now(), read: false });
        remote.todos.push({ id: 't-remote', text: 'Added on Mac', done: false, updated: Date.now() });
        features2.merge(remote); await sleep(500);
        log('after merge', features2.snapshot().readingList.length, features2.snapshot().todos.map((t) => t.text));
      });

      log('DONE');
      setTimeout(() => app.exit(0), 500);
    });
    return;
  }
  if (process.env.NOAM_TEST_VPN) {
    (async () => {
      const { genKeys } = require('./vpn');
      const k = genKeys();
      fs.mkdirSync(path.join(app.getPath('userData'), 'vpn'), { recursive: true });
      fs.writeFileSync(path.join(app.getPath('userData'), 'vpn', 'warp-account.json'), JSON.stringify({ id: 'x', token: 'y', privateKey: k.privateKey, publicKey: k.publicKey, peerKey: 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=', endpoint: 'engage.cloudflareclient.com:2408', v4: '172.16.0.2', v6: '' }));
      vpn.on('status', (st) => log('vpn', st.state, st.message));
      await sleep(2000);
      await vpn.connect();
      log('vpn after connect', vpn.status());
      log('proxy for main session', await require('electron').session.fromPartition('persist:noam').resolveProxy('https://example.com'));
      await vpn.disconnect();
      log('proxy after off', await require('electron').session.fromPartition('persist:noam').resolveProxy('https://example.com'));
      app.exit(0);
    })();
    return;
  }
  server.listen(0, '127.0.0.1', async () => {
    const port = server.address().port;
    const base = `http://news.example.org:${port}/`;
    try {
      await sleep(3500);
      const win = [...windows][0];
      const ui = win.webContents;
      const shot = async (name) => { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG()); log('shot', name); };
      const js = (code) => ui.executeJavaScript(code);
      await shot('01-newtab');

      await js(`state.active.navigate(${JSON.stringify(base)})`);
      await sleep(4000);
      const wcId = await js('state.active.wcId');
      const tab = webContents.fromId(wcId);
      log('tab url', tab.getURL());
      log('summary', shields.tabSummary(wcId));
      const fp = await tab.executeJavaScript('window.__fp');
      log('fingerprint', fp);
      const cosmetic = await tab.executeJavaScript(`[getComputedStyle(document.getElementById('ad1')).display, getComputedStyle(document.getElementById('carbonads')).display]`);
      log('cosmetic display', cosmetic);
      const ua = await tab.executeJavaScript('navigator.userAgent');
      log('ua', ua);
      await shot('02-adpage');

      await js(`document.getElementById('shield-btn').click()`);
      await sleep(600);
      await shot('03-shield-panel');
      await js(`closePanels(); document.getElementById('vpn-btn').click()`);
      await sleep(600);
      await shot('04-vpn-panel');
      await js('closePanels()');

      // tracking param strip
      await tab.executeJavaScript(`document.getElementById('lnk').click()`);
      await sleep(1500);
      log('after link', tab.getURL());

      // multiple tabs + internal pages
      await js(`newTab({url:'noam://settings/'})`); await sleep(1800); await shot('05-settings');
      await js(`newTab({url:'noam://history/'})`); await sleep(1500); await shot('06-history');
      await js(`newTab({url:'noam://newtab/', private:true})`); await sleep(1500); await shot('07-private');
      await js(`newTab({url:'noam://newtab/'})`); await sleep(1500);
      await js(`document.getElementById('url').focus(); document.getElementById('url').value='127.0'; document.getElementById('url').dispatchEvent(new Event('input'))`);
      await sleep(800); await shot('08-omnibox');
      await js(`document.getElementById('url').blur()`);

      // download
      await js(`state.active.navigate(${JSON.stringify(base + 'dl')})`); await sleep(2500);
      await js(`document.getElementById('dl-btn').click()`); await sleep(500); await shot('09-downloads');
      await js('closePanels()');

      // dark theme + settings
      await js(`nb.invoke('settings:set',{theme:'dark'})`); await sleep(800);
      await js(`activate(state.tabs[1])`); await sleep(600); await shot('10-settings-dark');
      await js(`activate(state.tabs[0])`); await sleep(400); await shot('11-adpage-dark');
      await js(`activate(state.tabs[state.tabs.length-1])`); await js(`state.active.navigate('noam://newtab/')`); await sleep(1500); await shot('12-newtab-dark');

      // https failure path: unreachable host should show error card
      await js(`state.active.navigate('http://nonexistent.invalid/')`); await sleep(3000); await shot('13-error');
      log('tabs', await js('state.tabs.map(t=>t.url)'));
      log('stats', require('electron').app && shields.stats.get('totalBlocked'));
      log('DONE');
    } catch (e) { log('ERROR', e.stack || String(e)); }
    setTimeout(() => app.exit(0), 500);
  });
};
