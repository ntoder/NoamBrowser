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

module.exports = ({ app, windows, shields, vpn, settings, webContents, features }) => {
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
