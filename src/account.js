// NoamBrowser Account — sign in on any computer and everything syncs: bookmarks, passwords, settings,
// history and NoamChat (identity, friends, groups, chats). Zero-knowledge: your password is turned into
// two keys on this computer — a "login key" sent to the server and a "lock key" that never leaves. All
// data is compressed and encrypted with the lock key before upload, so the server can't read any of it.
// The server is a tiny Cloudflare Worker (see /server). Also delivers NoamChat messages to friends who
// are offline (encrypted end-to-end, collected when they next open NoamBrowser).
'use strict';
const crypto = require('crypto');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { safeStorage, net } = require('electron');
const CONFIG = require('./account-config');

const ITER = 600000;
const derive = (user, password) => new Promise((res, rej) => crypto.pbkdf2(password, 'noambrowser-account-v1:' + user, ITER, 64, 'sha256', (e, k) => (e ? rej(e) : res({ auth: k.subarray(0, 32).toString('base64'), enc: k.subarray(32).toString('base64') }))));
function lock(obj, encB64) {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(encB64, 'base64'), iv);
  const ct = Buffer.concat([c.update(zlib.gzipSync(Buffer.from(JSON.stringify(obj)))), c.final()]);
  return 'NBA1.' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
function unlock(str, encB64) {
  if (typeof str !== 'string' || !str.startsWith('NBA1.')) throw new Error('not a NoamBrowser vault');
  const b = Buffer.from(str.slice(5), 'base64'); const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(encB64, 'base64'), b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28));
  return JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(b.subarray(28)), d.final()])).toString('utf8'));
}

module.exports = function setupAccount({ settings, history, userData, uiHandle, pageHandle, broadcast, broadcastPages, features, chatApi, getSession }) {
  const syncer = features.syncer;
  const SECRET = path.join(userData, 'account.secret');
  const cfg = () => ({ passwords: true, history: true, chat: true, ...(settings.get('account') || {}) });
  const setCfg = (p) => settings.set('account', { ...cfg(), ...p });
  const server = () => String(cfg().server || CONFIG.server || '').replace(/\/+$/, '');
  if (!cfg().deviceId) setCfg({ deviceId: 'd-' + crypto.randomBytes(8).toString('hex') });
  let secret = null; // { user, auth, enc }
  try { const b = fs.readFileSync(SECRET); secret = JSON.parse(b.subarray(0, 4).toString() === 'NBA1' && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b.subarray(4)) : b.subarray(4).toString('utf8')); } catch {}
  const storeSecret = (s) => { secret = s; if (!s) { try { fs.unlinkSync(SECRET); } catch {} return; } const enc = safeStorage.isEncryptionAvailable(); fs.writeFileSync(SECRET, Buffer.concat([Buffer.from(enc ? 'NBA1' : 'NBA0'), enc ? safeStorage.encryptString(JSON.stringify(s)) : Buffer.from(JSON.stringify(s))]), { mode: 0o600 }); };
  const status = { state: secret ? 'idle' : 'signedout', last: cfg().last || 0, devices: cfg().devices || [], error: '' };
  const pub = () => ({ ...status, user: secret ? secret.user : null, server: server(), serverIsDefault: !cfg().server, hasDefaultServer: !!CONFIG.server, deviceId: cfg().deviceId, deviceName: deviceName(), passwords: cfg().passwords, history: cfg().history, chat: cfg().chat, findable: cfg().findable !== false });
  const announce = () => { broadcastPages('account', pub()); broadcast('account:status', pub()); };
  const set = (p) => { Object.assign(status, p); announce(); };
  const deviceName = () => `${os.hostname().replace(/\.local$/, '').slice(0, 30) || 'Computer'} (${{ win32: 'Windows', darwin: 'Mac', linux: 'Linux' }[process.platform] || process.platform})`;

  async function api(method, p, body, auth = true) {
    if (!server()) throw new Error('The account server isn’t set up yet.');
    const headers = { 'content-type': 'application/json' };
    if (auth) { if (!secret) throw new Error('Not signed in.'); headers.authorization = 'Basic ' + Buffer.from(secret.user + ':' + secret.auth).toString('base64'); }
    let r;
    try { r = await net.fetch(server() + p, { method, headers, body: body ? JSON.stringify(body) : undefined }); }
    catch { throw new Error('Can’t reach the account server. Check your internet connection.'); }
    let j = {}; try { j = await r.json(); } catch {}
    if (!r.ok) { const e = new Error(j.error || `Server error (${r.status})`); e.status = r.status; throw e; }
    return j;
  }

  // ---------------------------------------------------------------- what gets synced
  function snapshot() {
    const s = syncer.snapshot();
    s.device = { id: cfg().deviceId, name: deviceName(), platform: process.platform };
    s.passwords = cfg().passwords ? syncer.passwords.items : undefined;
    if (cfg().history) s.history = history.get('items').slice(0, 3000).map((h) => ({ url: h.url, title: h.title, t: h.t, visits: h.visits, favicon: h.favicon && h.favicon.length < 300 ? h.favicon : undefined }));
    if (cfg().chat && chatApi) s.chat = chatApi.snapshot();
    return s;
  }
  function merge(remote) {
    const r = syncer.merge({ ...remote, passwords: undefined }); // bookmarks, settings, extras
    if (cfg().passwords && remote.passwords) r.passwords = syncer.passwords.mergeFrom(remote.passwords);
    if (cfg().history && Array.isArray(remote.history)) {
      const items = history.get('items'); const byUrl = new Map(items.map((h) => [h.url, h])); let n = 0;
      for (const h of remote.history) { if (!/^https?:/.test(h.url || '')) continue; const x = byUrl.get(h.url); if (!x) { const y = { url: h.url, title: h.title || h.url, t: h.t || 0, visits: h.visits || 1, favicon: h.favicon }; items.push(y); byUrl.set(h.url, y); n++; } else if ((h.t || 0) > (x.t || 0)) { x.t = h.t; x.visits = Math.max(x.visits || 1, h.visits || 1); if (h.title) x.title = h.title; n++; } }
      if (n) { items.sort((a, b) => b.t - a.t); if (items.length > 25000) items.length = 25000; history.set('items', items); r.history = true; }
    }
    if (cfg().chat && chatApi && remote.chat) r.chat = chatApi.merge(remote.chat);
    return r;
  }

  let busy = false, again = false, timer = null;
  async function run() {
    if (!secret || !server()) return pub();
    if (busy) { again = true; return pub(); }
    busy = true; set({ state: 'syncing', error: '' });
    try {
      const { vaults } = await api('GET', '/v1/vaults');
      const result = {}; const devices = [];
      for (const v of vaults) {
        devices.push({ device: v.device, name: v.name, updated: v.updated, me: v.device === cfg().deviceId });
        if (v.device === cfg().deviceId) continue;
        try { const r = merge(unlock(v.blob, secret.enc)); for (const k of Object.keys(r)) result[k] = result[k] || r[k]; } catch (e) { console.error('account merge', v.device, e.message); }
      }
      syncer.emit('merged', result);
      if (result.passwords) broadcastPages('passwords', {});
      if (result.history) broadcastPages('history', {});
      const blob = lock(snapshot(), secret.enc);
      const out = await api('PUT', '/v1/vaults/' + cfg().deviceId, { name: deviceName(), blob });
      setCfg({ last: Date.now(), devices: out.devices });
      set({ state: 'idle', last: Date.now(), devices: out.devices.map((d) => ({ ...d, me: d.device === cfg().deviceId })), error: '' });
    } catch (e) {
      if (e.status === 401) { storeSecret(null); set({ state: 'signedout', error: 'Your password was changed on another computer. Sign in again.' }); }
      else set({ state: 'error', error: e.message });
    } finally { busy = false; if (again) { again = false; setTimeout(run, 2000); } }
    return pub();
  }
  const start = () => { clearInterval(timer); if (secret) { timer = setInterval(() => run().catch(() => {}), 2 * 60000); setTimeout(() => run().catch(() => {}), 4000); } };
  let touchT = null;
  const touch = () => { if (!secret) return; clearTimeout(touchT); touchT = setTimeout(() => run().catch(() => {}), 8000); };

  // ---------------------------------------------------------------- signing in and out
  const userOk = (u) => /^[a-z0-9][a-z0-9_.-]{2,31}$/.test(u);
  // same list as the server (server/account-worker.js): names nobody can take
  const RESERVED_HAS = ['admin', 'noambrowser', 'noamtoder', 'moderator', 'official', 'support', 'helpdesk', 'security', 'staff', 'webmaster', 'postmaster', 'hostmaster', 'customerservice', 'verified', 'anthropic', 'claude', 'fuck', 'shit', 'bitch', 'porn', 'nazi', 'hitler', 'cunt', 'whore', 'slut', 'nigg', 'faggot', 'retard'];
  const RESERVED_IS = ['noam', 'root', 'system', 'sysop', 'mod', 'mods', 'help', 'info', 'team', 'owner', 'ceo', 'founder', 'creator', 'developer', 'dev', 'devs', 'server', 'service', 'bot', 'api', 'www', 'mail', 'email', 'noamchat', 'account', 'accounts', 'null', 'undefined', 'nobody', 'everyone', 'anonymous', 'guest', 'test', 'user', 'username', 'me', 'you', 'police', 'gov', 'government', 'bank', 'paypal', 'visa', 'mastercard', 'microsoft', 'google', 'apple', 'amazon', 'meta', 'facebook', 'instagram', 'whatsapp', 'tiktok', 'youtube', 'discord', 'snapchat', 'twitter', 'telegram', 'openai', 'chatgpt', 'gemini', 'chrome', 'brave', 'firefox', 'cloudflare', 'github', 'sex', 'rape', 'kill', 'dick', 'penis', 'boobs', 'ass', 'asshole', 'bastard', 'damn', 'hell', 'piss', 'crap', 'zona', 'kus', 'sharmuta', 'manyak', 'koos', 'zayin'];
  const reserved = (u) => { const k = String(u).toLowerCase().replace(/[._-]/g, '').replace(/0/g, 'o').replace(/1/g, 'i'); return RESERVED_IS.includes(k) || RESERVED_HAS.some((w) => k.includes(w)); };
  async function signUp({ user, password }) {
    user = String(user || '').trim().toLowerCase();
    if (!userOk(user)) throw new Error('Usernames are 3–32 letters, numbers, dots, dashes or underscores.');
    if (reserved(user)) throw new Error('That username is reserved. Try another one.');
    if (String(password || '').length < 8) throw new Error('Use a password of at least 8 characters.');
    const k = await derive(user, password);
    await api('POST', '/v1/register', { user, auth: k.auth }, false);
    storeSecret({ user, ...k }); set({ state: 'idle', error: '' }); await run(); start(); registerChat(); return pub();
  }
  async function signIn({ user, password }) {
    user = String(user || '').trim().toLowerCase();
    const k = await derive(user, password);
    const r = await api('POST', '/v1/login', { user, auth: k.auth }, false);
    storeSecret({ user, ...k }); set({ state: 'idle', error: '', devices: r.devices }); await run(); start(); registerChat(); return pub();
  }
  async function signOut({ forget } = {}) {
    if (forget && secret) await api('DELETE', '/v1/vaults/' + cfg().deviceId).catch(() => {});
    storeSecret(null); clearInterval(timer); set({ state: 'signedout', error: '', devices: [] }); return pub();
  }
  async function changePassword({ current, password }) {
    if (!secret) throw new Error('Not signed in.');
    if (String(password || '').length < 8) throw new Error('Use a password of at least 8 characters.');
    const old = await derive(secret.user, current); if (old.auth !== secret.auth) throw new Error('Your current password isn’t right.');
    const k = await derive(secret.user, password);
    // re-lock every device's data with the new key so nothing is lost
    const { vaults } = await api('GET', '/v1/vaults');
    const re = vaults.map((v) => { try { return { device: v.device, name: v.name, blob: lock(unlock(v.blob, secret.enc), k.enc) }; } catch { return null; } }).filter(Boolean);
    await api('POST', '/v1/password', { auth: k.auth, vaults: re });
    storeSecret({ user: secret.user, ...k }); await run(); return pub();
  }
  async function deleteAccount({ password }) {
    if (!secret) throw new Error('Not signed in.');
    const k = await derive(secret.user, password); if (k.auth !== secret.auth) throw new Error('That password isn’t right.');
    await api('DELETE', '/v1/account'); storeSecret(null); clearInterval(timer); set({ state: 'signedout', devices: [], error: '' }); return pub();
  }

  // ---------------------------------------------------------------- NoamChat mailbox (messages for friends who are offline)
  let chatIds = [], chatInvite = '', published = '';
  const findable = () => cfg().findable !== false;
  async function publishProfile() {
    if (!secret || !chatInvite) return;
    const want = findable() ? secret.user + '|' + chatInvite : secret.user + '|hidden';
    if (want === published) return;
    try { if (findable()) await api('PUT', '/v1/profile', { invite: chatInvite }); else await api('DELETE', '/v1/profile'); published = want; } catch (e) { console.error('chat profile', e.message); }
  }
  async function registerChat() { if (!secret) return; published = ''; if (chatIds.length) { try { await api('PUT', '/v1/chatids', { ids: chatIds }); } catch (e) { console.error('chat ids', e.message); } } publishProfile(); }
  uiHandle('account:chat-id', (_e, id) => { if (/^[a-f0-9]{12}$/.test(id || '') && !chatIds.includes(id)) { chatIds = [id]; registerChat(); } return !!secret; });
  // friends can add you by your account username: your NoamChat invite (public keys only) is listed under it
  uiHandle('account:chat-profile', (_e, invite) => { if (typeof invite === 'string' && /^NC1\.[A-Za-z0-9_-]{40,1500}$/.test(invite)) { chatInvite = invite; publishProfile(); } return { user: secret ? secret.user : null, findable: findable() }; });
  uiHandle('account:findable', (_e, on) => { setCfg({ findable: !!on }); publishProfile(); announce(); return pub(); });
  uiHandle('account:find', async (_e, who) => {
    if (!secret) return { error: 'Sign in to your NoamBrowser account first (⋮ → Account).' };
    who = String(who || '').trim().replace(/^@/, '').toLowerCase();
    if (!userOk(who)) return { error: 'That doesn’t look like a username. Usernames are 3–32 letters, numbers, dots, dashes or underscores.' };
    if (who === secret.user) return { error: 'That’s your own username! Ask your friend for theirs.' };
    try { return await api('GET', '/v1/find/' + encodeURIComponent(who)); } catch (e) { return { error: e.message }; }
  });
  uiHandle('account:mail-send', async (_e, { to, box }) => { if (!secret) return { ok: false }; try { return await api('POST', '/v1/mail/' + to, { box }); } catch (e) { return { ok: false, error: e.message }; } });
  uiHandle('account:mail-fetch', async () => { if (!secret || !chatIds.length) return []; try { return (await api('GET', '/v1/mail')).mail; } catch { return []; } });
  uiHandle('account:status', () => pub());

  // ---------------------------------------------------------------- the account page
  pageHandle('account:status', () => pub());
  pageHandle('account:signup', (_e, d) => signUp(d));
  pageHandle('account:signin', (_e, d) => signIn(d));
  pageHandle('account:signout', (_e, d) => signOut(d || {}));
  pageHandle('account:sync', () => run());
  pageHandle('account:set', (_e, p) => { const ok = {}; for (const k of ['passwords', 'history', 'chat', 'findable']) if (k in (p || {})) ok[k] = !!p[k]; setCfg(ok); if ('findable' in ok) publishProfile(); touch(); return pub(); });
  pageHandle('account:server', async (_e, url) => {
    url = String(url || '').trim().replace(/\/+$/, '');
    if (url && !/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(url) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) throw new Error('That doesn’t look like a server address (it should start with https://).');
    if (url) { try { const r = await net.fetch(url + '/v1'); const j = await r.json(); if (j.service !== 'NoamBrowser Accounts') throw 0; } catch { throw new Error('No NoamBrowser account server answered at that address.'); } }
    setCfg({ server: url }); return pub();
  });
  pageHandle('account:password', (_e, d) => changePassword(d));
  pageHandle('account:delete', (_e, d) => deleteAccount(d));
  pageHandle('account:remove-device', async (_e, id) => { const r = await api('DELETE', '/v1/vaults/' + id); set({ devices: r.devices.map((d) => ({ ...d, me: d.device === cfg().deviceId })) }); return pub(); });

  start();
  return { touch, run, pub, signedIn: () => !!secret };
};
module.exports.lock = lock; module.exports.unlock = unlock; module.exports.derive = derive;
