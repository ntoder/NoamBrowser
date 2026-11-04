// NoamBrowser Accounts — a tiny Cloudflare Worker (free plan) with a D1 database.
//
// Zero-knowledge: the browser turns your password into two keys on your own computer. It sends only the
// "login key" here and keeps the "lock key" to itself, encrypting everything before upload. This server
// only ever stores scrambled data it cannot read, plus a salted hash of the login key.
//
// Endpoints (JSON):
//   POST   /v1/register        { user, auth }                 create an account
//   POST   /v1/login           { user, auth }                 check a password, list devices
//   GET    /v1/vaults                                         every device's encrypted snapshot
//   PUT    /v1/vaults/:device  { name, blob }                 upload this device's encrypted snapshot
//   DELETE /v1/vaults/:device                                 remove a device
//   POST   /v1/password        { auth, vaults: [{device,name,blob}] }  change password (re-encrypted data)
//   DELETE /v1/account                                        delete the account and everything in it
//   PUT    /v1/chatids         { ids: [...] }                 which NoamChat ids this account receives mail for
//   POST   /v1/mail/:to        { box }                        leave an encrypted chat message for someone offline
//   GET    /v1/mail                                           fetch (and remove) your waiting chat messages
//   PUT    /v1/profile         { invite }                     let friends add you by username (NoamChat)
//   DELETE /v1/profile                                        stop being findable by username
//   GET    /v1/find/:user                                     look up someone's NoamChat invite by username
// Every request except register/login uses:  Authorization: Basic base64(user:auth)

const MAX_BLOB = 1_800_000, MAX_MAIL = 64_000, MAX_BOX = 500, MAX_DEVICES = 20;
const USER_RE = /^[a-z0-9][a-z0-9_.-]{2,31}$/;
// usernames nobody can take, so no one can pretend to be NoamBrowser staff. Dots, dashes and underscores are
// ignored when checking, so "a.d.m.i.n" and "noam_browser" are blocked too.
const RESERVED_HAS = ['admin', 'noambrowser', 'noamtoder', 'moderator', 'official', 'support', 'helpdesk', 'security', 'staff', 'webmaster', 'postmaster', 'hostmaster', 'customerservice', 'verified', 'anthropic', 'claude', 'fuck', 'shit', 'bitch', 'porn', 'nazi', 'hitler', 'cunt', 'whore', 'slut', 'nigg', 'faggot', 'retard'];
const RESERVED_IS = ['noam', 'root', 'system', 'sysop', 'mod', 'mods', 'help', 'info', 'team', 'owner', 'ceo', 'founder', 'creator', 'developer', 'dev', 'devs', 'server', 'service', 'bot', 'api', 'www', 'mail', 'email', 'noamchat', 'account', 'accounts', 'null', 'undefined', 'nobody', 'everyone', 'anonymous', 'guest', 'test', 'user', 'username', 'me', 'you', 'police', 'gov', 'government', 'bank', 'paypal', 'visa', 'mastercard', 'microsoft', 'google', 'apple', 'amazon', 'meta', 'facebook', 'instagram', 'whatsapp', 'tiktok', 'youtube', 'discord', 'snapchat', 'twitter', 'telegram', 'openai', 'chatgpt', 'gemini', 'chrome', 'brave', 'firefox', 'cloudflare', 'github', 'sex', 'rape', 'kill', 'dick', 'penis', 'boobs', 'ass', 'asshole', 'bastard', 'damn', 'hell', 'piss', 'crap', 'zona', 'kus', 'sharmuta', 'manyak', 'koos', 'zayin'];
const reserved = (u) => { const k = String(u).toLowerCase().replace(/[._-]/g, '').replace(/0/g, 'o').replace(/1/g, 'i'); return RESERVED_IS.includes(k) || RESERVED_HAS.some((w) => k.includes(w)); };
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS', 'cache-control': 'no-store' } });
const err = (msg, status = 400) => json({ error: msg }, status);
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function hash(salt, auth) { const d = new Uint8Array([...unb64(salt), ...unb64(auth)]); return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', d))); }
const eq = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
const validAuth = (a) => typeof a === 'string' && /^[A-Za-z0-9+/]{43}=$/.test(a); // 32 bytes, base64

async function schema(db) {
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS users (user TEXT PRIMARY KEY, salt TEXT NOT NULL, hash TEXT NOT NULL, created INTEGER NOT NULL, fails INTEGER NOT NULL DEFAULT 0, fail_at INTEGER NOT NULL DEFAULT 0)'),
    db.prepare('CREATE TABLE IF NOT EXISTS vaults (user TEXT NOT NULL, device TEXT NOT NULL, name TEXT, blob TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (user, device))'),
    db.prepare('CREATE TABLE IF NOT EXISTS chatids (id TEXT PRIMARY KEY, user TEXT NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS mail (n INTEGER PRIMARY KEY AUTOINCREMENT, to_id TEXT NOT NULL, from_user TEXT NOT NULL, box TEXT NOT NULL, created INTEGER NOT NULL)'),
    db.prepare('CREATE INDEX IF NOT EXISTS mail_to ON mail (to_id)'),
    db.prepare('CREATE TABLE IF NOT EXISTS directory (user TEXT PRIMARY KEY, invite TEXT NOT NULL, updated INTEGER NOT NULL)'),
  ]);
}
let ready = null;

async function check(db, user, auth) {
  if (!USER_RE.test(user || '') || !validAuth(auth)) return { ok: false, status: 401, msg: 'Wrong username or password.' };
  const u = await db.prepare('SELECT * FROM users WHERE user = ?').bind(user).first();
  if (!u) return { ok: false, status: 401, msg: 'Wrong username or password.' };
  const now = Date.now();
  if (u.fails >= 10 && now - u.fail_at < 15 * 60_000) return { ok: false, status: 429, msg: 'Too many wrong passwords. Wait 15 minutes and try again.' };
  if (!eq(await hash(u.salt, auth), u.hash)) { await db.prepare('UPDATE users SET fails = ?, fail_at = ? WHERE user = ?').bind(now - u.fail_at > 15 * 60_000 ? 1 : u.fails + 1, now, user).run(); return { ok: false, status: 401, msg: 'Wrong username or password.' }; }
  if (u.fails) await db.prepare('UPDATE users SET fails = 0 WHERE user = ?').bind(user).run();
  return { ok: true, user };
}
function basic(req) {
  const h = req.headers.get('authorization') || ''; const m = h.match(/^Basic (.+)$/); if (!m) return {};
  try { const s = atob(m[1]); const i = s.indexOf(':'); return { user: s.slice(0, i), auth: s.slice(i + 1) }; } catch { return {}; }
}
const devicesOf = async (db, user) => (await db.prepare('SELECT device, name, updated FROM vaults WHERE user = ? ORDER BY updated DESC').bind(user).all()).results;

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return json({});
    const db = env.DB; if (!db) return err('The server has no database yet (bind a D1 database named DB).', 500);
    if (!ready) ready = schema(db).catch((e) => { ready = null; throw e; });
    await ready;
    const url = new URL(req.url); const p = url.pathname.replace(/\/+$/, '');
    let body = {};
    if (req.method === 'POST' || req.method === 'PUT') { try { const t = await req.text(); if (t.length > MAX_BLOB * 21) return err('Too big.', 413); body = t ? JSON.parse(t) : {}; } catch { return err('Bad request.'); } }

    if (p === '/v1' || p === '') return json({ service: 'NoamBrowser Accounts', version: 1 });
    if (p === '/v1/register' && req.method === 'POST') {
      const user = String(body.user || '').toLowerCase();
      if (!USER_RE.test(user)) return err('Usernames are 3–32 letters, numbers, dots, dashes or underscores, starting with a letter or number.');
      // the site owner can still take a reserved name with the secret OWNER_KEY (Worker → Settings → Variables)
      if (reserved(user) && !(env.OWNER_KEY && typeof body.ownerKey === 'string' && eq(body.ownerKey, env.OWNER_KEY))) return err('That username is reserved. Try another one.', 409);
      if (!validAuth(body.auth)) return err('Bad request.');
      if (await db.prepare('SELECT 1 FROM users WHERE user = ?').bind(user).first()) return err('That username is taken. Try another one.', 409);
      const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
      await db.prepare('INSERT INTO users (user, salt, hash, created) VALUES (?, ?, ?, ?)').bind(user, salt, await hash(salt, body.auth), Date.now()).run();
      return json({ ok: true, user, devices: [] });
    }
    if (p === '/v1/login' && req.method === 'POST') {
      const user = String(body.user || '').toLowerCase();
      const c = await check(db, user, body.auth); if (!c.ok) return err(c.msg, c.status);
      return json({ ok: true, user, devices: await devicesOf(db, user) });
    }
    // everything else needs a signed-in user
    const cred = basic(req); const c = await check(db, String(cred.user || '').toLowerCase(), cred.auth);
    if (!c.ok) return err(c.msg, c.status);
    const user = c.user;

    if (p === '/v1/vaults' && req.method === 'GET') return json({ vaults: (await db.prepare('SELECT device, name, blob, updated FROM vaults WHERE user = ?').bind(user).all()).results });
    let m = p.match(/^\/v1\/vaults\/([\w-]{4,40})$/);
    if (m && req.method === 'PUT') {
      if (typeof body.blob !== 'string' || body.blob.length > MAX_BLOB) return err('Your data is too big to sync (over 1.8 MB).', 413);
      const n = await db.prepare('SELECT COUNT(*) AS n FROM vaults WHERE user = ? AND device != ?').bind(user, m[1]).first();
      if (n.n >= MAX_DEVICES) return err('Too many devices on this account. Remove one first.', 409);
      await db.prepare('INSERT INTO vaults (user, device, name, blob, updated) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user, device) DO UPDATE SET name = excluded.name, blob = excluded.blob, updated = excluded.updated').bind(user, m[1], String(body.name || '').slice(0, 60), body.blob, Date.now()).run();
      return json({ ok: true, devices: await devicesOf(db, user) });
    }
    if (m && req.method === 'DELETE') { await db.prepare('DELETE FROM vaults WHERE user = ? AND device = ?').bind(user, m[1]).run(); return json({ ok: true, devices: await devicesOf(db, user) }); }
    if (p === '/v1/password' && req.method === 'POST') {
      if (!validAuth(body.auth)) return err('Bad request.');
      const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
      const stmts = [db.prepare('UPDATE users SET salt = ?, hash = ?, fails = 0 WHERE user = ?').bind(salt, await hash(salt, body.auth), user)];
      for (const v of Array.isArray(body.vaults) ? body.vaults.slice(0, MAX_DEVICES) : []) if (/^[\w-]{4,40}$/.test(v.device) && typeof v.blob === 'string' && v.blob.length <= MAX_BLOB) stmts.push(db.prepare('UPDATE vaults SET blob = ? WHERE user = ? AND device = ?').bind(v.blob, user, v.device));
      await db.batch(stmts);
      return json({ ok: true });
    }
    if (p === '/v1/account' && req.method === 'DELETE') {
      const ids = (await db.prepare('SELECT id FROM chatids WHERE user = ?').bind(user).all()).results.map((r) => r.id);
      await db.batch([db.prepare('DELETE FROM vaults WHERE user = ?').bind(user), db.prepare('DELETE FROM chatids WHERE user = ?').bind(user), db.prepare('DELETE FROM directory WHERE user = ?').bind(user), db.prepare('DELETE FROM users WHERE user = ?').bind(user), ...ids.map((id) => db.prepare('DELETE FROM mail WHERE to_id = ?').bind(id))]);
      return json({ ok: true });
    }
    if (p === '/v1/chatids' && req.method === 'PUT') {
      const ids = (Array.isArray(body.ids) ? body.ids : []).filter((x) => /^[a-f0-9]{12}$/.test(x)).slice(0, 4);
      for (const id of ids) {
        const o = await db.prepare('SELECT user FROM chatids WHERE id = ?').bind(id).first();
        if (o && o.user !== user) return err('That NoamChat identity belongs to another account.', 409);
      }
      await db.batch([db.prepare('DELETE FROM chatids WHERE user = ?').bind(user), ...ids.map((id) => db.prepare('INSERT INTO chatids (id, user) VALUES (?, ?)').bind(id, user))]);
      return json({ ok: true, ids });
    }
    m = p.match(/^\/v1\/mail\/([a-f0-9]{12})$/);
    if (m && req.method === 'POST') {
      if (typeof body.box !== 'string' || body.box.length > MAX_MAIL) return err('Message too big.', 413);
      if (!(await db.prepare('SELECT 1 FROM chatids WHERE id = ?').bind(m[1]).first())) return json({ ok: false, noAccount: true });
      const n = await db.prepare('SELECT COUNT(*) AS n FROM mail WHERE to_id = ?').bind(m[1]).first();
      if (n.n >= MAX_BOX) return err('Their mailbox is full.', 429);
      await db.prepare('INSERT INTO mail (to_id, from_user, box, created) VALUES (?, ?, ?, ?)').bind(m[1], user, body.box, Date.now()).run();
      return json({ ok: true });
    }
    if (p === '/v1/mail' && req.method === 'GET') {
      const ids = (await db.prepare('SELECT id FROM chatids WHERE user = ?').bind(user).all()).results.map((r) => r.id);
      if (!ids.length) return json({ mail: [] });
      const q = ids.map(() => '?').join(',');
      const rows = (await db.prepare(`SELECT n, to_id, box, created FROM mail WHERE to_id IN (${q}) ORDER BY n LIMIT 200`).bind(...ids).all()).results;
      if (rows.length) await db.prepare(`DELETE FROM mail WHERE n IN (${rows.map(() => '?').join(',')})`).bind(...rows.map((r) => r.n)).run();
      // old undelivered mail is cleaned up after 30 days
      await db.prepare('DELETE FROM mail WHERE created < ?').bind(Date.now() - 30 * 86400_000).run();
      return json({ mail: rows.map((r) => ({ to: r.to_id, box: r.box, t: r.created })) });
    }
    if (p === '/v1/profile' && req.method === 'PUT') {
      if (typeof body.invite !== 'string' || !/^NC1\.[A-Za-z0-9_-]{40,1500}$/.test(body.invite)) return err('Bad request.');
      await db.prepare('INSERT INTO directory (user, invite, updated) VALUES (?, ?, ?) ON CONFLICT (user) DO UPDATE SET invite = excluded.invite, updated = excluded.updated').bind(user, body.invite, Date.now()).run();
      return json({ ok: true });
    }
    if (p === '/v1/profile' && req.method === 'DELETE') { await db.prepare('DELETE FROM directory WHERE user = ?').bind(user).run(); return json({ ok: true }); }
    m = p.match(/^\/v1\/find\/([^/]{1,64})$/);
    if (m && req.method === 'GET') {
      const who = decodeURIComponent(m[1]).toLowerCase().replace(/^@/, '');
      const row = USER_RE.test(who) ? await db.prepare('SELECT invite FROM directory WHERE user = ?').bind(who).first() : null;
      if (!row) return err('No one on NoamChat has that username. Check the spelling, or ask them to open NoamChat once while signed in.', 404);
      return json({ user: who, invite: row.invite });
    }
    return err('Not found.', 404);
  },
};
