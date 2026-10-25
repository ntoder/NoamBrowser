// NoamBrowser built-in VPN.
//
// Mode "warp": registers a free Cloudflare WARP device (a real WireGuard
// account, no sign-up), then runs the bundled wireproxy (userspace WireGuard,
// no admin rights, no drivers) which exposes the tunnel as a local SOCKS5
// proxy. Every browser session is routed through that proxy, including DNS
// (SOCKS5 resolves hostnames on the far side), so nothing leaks.
//
// Mode "custom": routes through any SOCKS5/HTTP(S) proxy the user supplies.
//
// Kill switch: if the tunnel drops while the VPN is on, traffic is pointed at
// a dead proxy until the tunnel is back, so pages never silently go direct.
const { app, net, session } = require('electron');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const netMod = require('net');
const { EventEmitter } = require('events');

const API = 'https://api.cloudflareclient.com/v0a2158';
const WARP_PEER_KEY = 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=';
const FALLBACK_ENDPOINTS = ['162.159.192.1:2408', '162.159.193.10:2408', '162.159.195.1:2408', '188.114.97.1:2408', '162.159.192.1:500', '162.159.192.1:1701'];
const KILL_SWITCH_PROXY = 'socks5://127.0.0.1:9';

function b64url2b64(s) { return s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4); }

function genKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
  const pub = publicKey.export({ format: 'jwk' }).x;
  const priv = privateKey.export({ format: 'jwk' }).d;
  return { publicKey: b64url2b64(pub), privateKey: b64url2b64(priv) };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const s = netMod.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on('error', reject);
  });
}

function waitPort(port, ms) {
  const end = Date.now() + ms;
  return new Promise((resolve) => {
    const tryOnce = () => {
      const sock = netMod.connect(port, '127.0.0.1');
      sock.once('connect', () => { sock.destroy(); resolve(true); });
      sock.once('error', () => { sock.destroy(); if (Date.now() > end) resolve(false); else setTimeout(tryOnce, 150); });
    };
    tryOnce();
  });
}

function parseTrace(txt) {
  const o = {};
  for (const line of txt.split('\n')) { const i = line.indexOf('='); if (i > 0) o[line.slice(0, i)] = line.slice(i + 1).trim(); }
  return o;
}

class VPN extends EventEmitter {
  constructor({ getSessions, settings }) {
    super();
    this.getSessions = getSessions; // () => [Session]
    this.settings = settings; // Store
    this.dir = path.join(app.getPath('userData'), 'vpn');
    fs.mkdirSync(this.dir, { recursive: true });
    this.proc = null;
    this.port = null;
    this.state = 'off'; // off | connecting | on | error
    this.message = '';
    this.info = null; // { ip, loc, colo, warp }
    this.wantOn = false;
    this.retries = 0;
    this.creds = null;
    this.startToken = 0;
  }

  status() {
    return { state: this.state, message: this.message, info: this.info, mode: this.settings.get('vpn').mode, wantOn: this.wantOn };
  }

  setState(state, message = '') {
    this.state = state; this.message = message;
    this.emit('status', this.status());
  }

  binPath() {
    const name = process.platform === 'win32' ? 'wireproxy.exe' : 'wireproxy';
    const candidates = [
      path.join(process.resourcesPath || '', 'wireproxy', name),
      path.join(__dirname, '..', 'vendor', 'wireproxy', name),
      path.join(__dirname, '..', 'vendor', 'wireproxy', 'darwin-' + process.arch, name),
      path.join(__dirname, '..', 'vendor', 'wireproxy', 'linux-' + process.arch, name),
      path.join(__dirname, '..', 'vendor', 'wireproxy', process.platform === 'win32' ? 'wireproxy.exe' : 'wireproxy-' + process.platform),
    ];
    return candidates.find((p) => fs.existsSync(p));
  }

  async applyProxy(rules) {
    const cfg = rules ? { proxyRules: rules, proxyBypassRules: '<local>' } : { mode: 'direct' };
    await Promise.all(this.getSessions().map((s) => s.setProxy(cfg).then(() => s.closeAllConnections?.())));
  }

  // --- WARP account -------------------------------------------------------
  async warpAccount(forceNew = false) {
    const file = path.join(this.dir, 'warp-account.json');
    if (!forceNew) {
      try { const a = JSON.parse(fs.readFileSync(file, 'utf8')); if (a.privateKey && a.v4) return a; } catch {}
    }
    this.setState('connecting', 'Creating your private WARP key');
    const keys = genKeys();
    const headers = { 'User-Agent': 'okhttp/3.12.1', 'CF-Client-Version': 'a-6.10-2158', 'Content-Type': 'application/json; charset=UTF-8' };
    const body = { key: keys.publicKey, install_id: '', fcm_token: '', tos: new Date().toISOString(), model: 'PC', serial_number: '', locale: 'en_US', type: 'Android' };
    let res;
    try { res = await session.fromPartition('noam-vpn-reg').fetch(API + '/reg', { method: 'POST', headers, body: JSON.stringify(body) }); }
    catch (e) { throw new Error('Couldn’t reach Cloudflare to set up WARP. Check your internet connection.'); }
    if (res.status === 429) throw new Error('Cloudflare is rate-limiting new WARP devices. Wait a minute and try again.');
    if (!res.ok) throw new Error('Cloudflare refused the WARP sign-up (HTTP ' + res.status + ').');
    let j = await res.json();
    j = j.result || j;
    const cfg = j.config || {};
    const peer = (cfg.peers && cfg.peers[0]) || {};
    const acct = {
      id: j.id, token: j.token,
      privateKey: keys.privateKey, publicKey: keys.publicKey,
      peerKey: peer.public_key || WARP_PEER_KEY,
      endpoint: (peer.endpoint && peer.endpoint.host) || 'engage.cloudflareclient.com:2408',
      v4: cfg.interface?.addresses?.v4 || '172.16.0.2',
      v6: cfg.interface?.addresses?.v6 || '',
      created: Date.now(),
    };
    if (acct.id && acct.token) {
      try {
        await session.fromPartition('noam-vpn-reg').fetch(API + '/reg/' + acct.id, { method: 'PATCH', headers: { ...headers, Authorization: 'Bearer ' + acct.token }, body: JSON.stringify({ warp_enabled: true }) });
      } catch {}
    }
    fs.writeFileSync(file, JSON.stringify(acct, null, 2));
    return acct;
  }

  writeWireproxyConfig(acct, endpoint, port) {
    const addrs = [acct.v4 + '/32'];
    if (acct.v6) addrs.push(acct.v6 + '/128');
    const conf = [
      '[Interface]',
      `PrivateKey = ${acct.privateKey}`,
      `Address = ${addrs.join(', ')}`,
      'DNS = 1.1.1.1, 1.0.0.1',
      'MTU = 1280',
      '',
      '[Peer]',
      `PublicKey = ${acct.peerKey}`,
      `Endpoint = ${endpoint}`,
      'AllowedIPs = 0.0.0.0/0, ::/0',
      'PersistentKeepalive = 25',
      '',
      '[Socks5]',
      `BindAddress = 127.0.0.1:${port}`,
      '',
    ].join('\n');
    const file = path.join(this.dir, 'wireproxy.conf');
    fs.writeFileSync(file, conf, { mode: 0o600 });
    return file;
  }

  async probe(rules, timeoutMs = process.env.NOAM_TEST ? 3000 : 12000) {
    const s = session.fromPartition('noam-vpn-probe');
    await s.setProxy({ proxyRules: rules });
    await s.closeAllConnections?.();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await s.fetch('https://www.cloudflare.com/cdn-cgi/trace?nb=' + Date.now(), { signal: ctrl.signal, cache: 'no-store' });
      return parseTrace(await res.text());
    } finally { clearTimeout(t); }
  }

  killProc() {
    if (this.proc) {
      const p = this.proc; this.proc = null;
      p.removeAllListeners('exit');
      try { p.kill(); } catch {}
    }
  }

  async startWarp(token) {
    const bin = this.binPath();
    if (!bin) throw new Error('The VPN engine (wireproxy) is missing from this install.');
    let acct = await this.warpAccount();
    const endpoints = [acct.endpoint, ...FALLBACK_ENDPOINTS.filter((e) => e !== acct.endpoint)];
    const preferred = this.settings.get('vpn').lastGoodEndpoint;
    if (preferred && endpoints.includes(preferred)) { endpoints.splice(endpoints.indexOf(preferred), 1); endpoints.unshift(preferred); }
    let lastErr = null;
    for (let i = 0; i < endpoints.length; i++) {
      if (token !== this.startToken) return;
      const ep = endpoints[i];
      this.setState('connecting', i === 0 ? 'Opening the encrypted tunnel' : `Trying another route (${i + 1}/${endpoints.length})`);
      const port = await freePort();
      const conf = this.writeWireproxyConfig(acct, ep, port);
      this.killProc();
      try { if (process.platform !== 'win32') fs.chmodSync(bin, 0o755); } catch {}
      const proc = spawn(bin, ['-c', conf], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      this.proc = proc;
      let log = '';
      proc.stdout.on('data', (d) => { log = (log + d).slice(-4000); });
      proc.stderr.on('data', (d) => { log = (log + d).slice(-4000); });
      const ok = await waitPort(port, 6000);
      if (!ok) { lastErr = new Error('Tunnel process did not start: ' + log.split('\n').slice(-3).join(' ')); continue; }
      try {
        const trace = await this.probe(`socks5://127.0.0.1:${port}`);
        if (token !== this.startToken) { this.killProc(); return; }
        this.port = port;
        const vs = this.settings.get('vpn'); vs.lastGoodEndpoint = ep; this.settings.set('vpn', vs);
        proc.on('exit', () => this.onTunnelDropped());
        await this.applyProxy(`socks5://127.0.0.1:${port}`);
        this.info = { ip: trace.ip, loc: trace.loc, colo: trace.colo, warp: trace.warp };
        this.retries = 0;
        this.setState('on', trace.warp === 'on' || trace.warp === 'plus' ? 'Protected by WARP' : 'Connected');
        return;
      } catch (e) {
        lastErr = e;
        // A stale account (deleted server-side) makes every endpoint fail;
        // re-register once halfway through the list.
        if (i === 2) { try { acct = await this.warpAccount(true); } catch {} }
      }
    }
    this.killProc();
    console.error('WARP failed:', lastErr && lastErr.message);
    throw new Error('Couldn’t open the WARP tunnel from this network. Some networks block WireGuard traffic — try another Wi-Fi, or use your own proxy.');
  }

  async startCustom(token) {
    const raw = (this.settings.get('vpn').customProxy || '').trim();
    if (!raw) throw new Error('Add a proxy address in VPN settings first, e.g. socks5://host:1080');
    let u;
    try { u = new URL(raw.includes('://') ? raw : 'socks5://' + raw); } catch { throw new Error('That proxy address is not valid.'); }
    const scheme = u.protocol.replace(':', '');
    if (!['socks5', 'socks4', 'http', 'https'].includes(scheme)) throw new Error('Proxy must be socks5, socks4, http or https.');
    this.creds = u.username ? { username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) } : null;
    const rules = `${scheme}://${u.hostname}:${u.port || (scheme.startsWith('socks') ? 1080 : 8080)}`;
    this.setState('connecting', 'Connecting to your proxy');
    let trace = {};
    try { trace = await this.probe(rules); } catch (e) {
      if (!this.creds) throw new Error('Proxy did not respond: ' + e.message);
    }
    if (token !== this.startToken) return;
    await this.applyProxy(rules);
    this.info = { ip: trace.ip, loc: trace.loc, colo: trace.colo, warp: trace.warp };
    this.setState('on', 'Connected through your proxy');
  }

  onTunnelDropped() {
    this.proc = null;
    if (!this.wantOn) return;
    this.applyProxy(KILL_SWITCH_PROXY); // kill switch: no direct traffic
    this.setState('error', 'Tunnel dropped — reconnecting. Traffic is paused until it is back.');
    if (this.retries++ < 5) setTimeout(() => { if (this.wantOn) this.connect(); }, 1500 * this.retries);
  }

  async connect() {
    this.wantOn = true;
    const token = ++this.startToken;
    const mode = this.settings.get('vpn').mode;
    // Kill switch while connecting so nothing goes out unprotected.
    if (this.settings.get('vpn').killSwitch) await this.applyProxy(KILL_SWITCH_PROXY);
    try {
      if (mode === 'custom') await this.startCustom(token); else await this.startWarp(token);
    } catch (e) {
      if (token !== this.startToken) return;
      this.info = null;
      if (this.settings.get('vpn').killSwitch) {
        this.setState('error', e.message.replace(/\.?$/, '.') + ' The kill switch is pausing browsing — turn the VPN off to browse without it.');
      } else {
        await this.applyProxy(null);
        this.wantOn = false;
        this.setState('error', e.message);
      }
    }
  }

  async disconnect() {
    this.wantOn = false;
    this.startToken++;
    this.killProc();
    this.info = null;
    await this.applyProxy(null);
    this.setState('off', '');
  }

  async newIdentity() {
    // Fresh WARP device = fresh keys and a fresh exit identity.
    await this.disconnect();
    try { fs.unlinkSync(path.join(this.dir, 'warp-account.json')); } catch {}
    return this.connect();
  }

  // Applied to new sessions (e.g. private tabs) while the VPN is running.
  currentRules() {
    if (this.state === 'on' && this.port && this.settings.get('vpn').mode !== 'custom') return `socks5://127.0.0.1:${this.port}`;
    if (this.state === 'on' && this.settings.get('vpn').mode === 'custom') {
      const raw = this.settings.get('vpn').customProxy; try { const u = new URL(raw.includes('://') ? raw : 'socks5://' + raw); return `${u.protocol.replace(':', '')}://${u.hostname}:${u.port}`; } catch {}
    }
    if (this.wantOn && this.settings.get('vpn').killSwitch) return KILL_SWITCH_PROXY;
    return null;
  }

  shutdown() { this.wantOn = false; this.killProc(); }
}

module.exports = { VPN, genKeys };
