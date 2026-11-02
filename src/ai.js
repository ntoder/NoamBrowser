// NoamBrowser — AI helper (main process). Two free engines, both running on your own computer:
//   • Built-in: a small open model (Qwen2.5 0.5B Instruct) that NoamBrowser downloads once from Hugging Face
//     and keeps in your profile folder. It runs inside the browser (WebGPU when available, else WebAssembly).
//   • Ollama: if you have Ollama installed (ollama.com), NoamBrowser can use any model you've pulled there.
// Nothing you ask is sent to any company.
'use strict';
const { app, net, session, webContents } = require('electron');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const HF = 'https://huggingface.co/';
const SAFE = /^[\w.-]+\/[\w.-]+$/;
const OLLAMA = 'http://127.0.0.1:11434';

module.exports = function setupAI({ userData, uiHandle, getSession, appDir, hfBase }) {
  const HFB = hfBase || HF;
  const MODELS = path.join(userData, 'ai-models');
  const RUNTIME = path.join(appDir, 'ui', 'vendor', 'ort');
  const downloads = new Map(); // file path -> promise
  const ses = () => (getSession ? getSession() : session.defaultSession);
  const sendAll = (ch, d) => { for (const wc of webContents.getAllWebContents()) { try { if (wc.getType() === 'window' && wc.getURL().includes('/ui/index.html')) wc.send(ch, d); } catch {} } };
  const cors = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };

  async function download(url, dest, label) {
    if (downloads.has(dest)) return downloads.get(dest);
    const p = (async () => {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const res = await ses().fetch(url, { redirect: 'follow' });
      if (!res.ok) throw new Error('download failed: ' + res.status);
      const total = +res.headers.get('content-length') || 0; let got = 0, lastSent = 0;
      const tmp = dest + '.part'; const out = fs.createWriteStream(tmp);
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        got += value.length; if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
        if (Date.now() - lastSent > 300) { lastSent = Date.now(); sendAll('ai:token', { kind: 'dl', file: label, got, total }); }
      }
      await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
      fs.renameSync(tmp, dest); sendAll('ai:token', { kind: 'dl', file: label, got, total: total || got, done: true });
    })();
    downloads.set(dest, p);
    try { await p; } finally { downloads.delete(dest); }
  }
  const fileResponse = (file, type) => { const st = fs.statSync(file); return new Response(Readable.toWeb(fs.createReadStream(file)), { headers: { ...cors, 'content-type': type || 'application/octet-stream', 'content-length': String(st.size) } }); };

  // noam://aimodels/runtime/<file>                       → the bundled AI runtime (WebAssembly)
  // noam://aimodels/<org>/<model>/resolve/<rev>/<file>   → model files, downloaded once then kept
  async function serve(req) {
    const origin = req.headers.get('origin') || '';
    if (origin && origin !== 'null' && !/^(file|noam):/.test(origin)) return new Response('no', { status: 403 });
    const u = new URL(req.url); const rel = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
    if (rel.startsWith('runtime/')) {
      const f = path.join(RUNTIME, path.basename(rel)); if (!fs.existsSync(f)) return new Response('missing', { status: 404, headers: cors });
      return fileResponse(f, f.endsWith('.mjs') ? 'text/javascript' : 'application/wasm');
    }
    const m = rel.match(/^([\w.-]+\/[\w.-]+)\/resolve\/([\w.-]+)\/(.+)$/);
    if (!m || !SAFE.test(m[1]) || m[3].includes('..')) return new Response('bad', { status: 400, headers: cors });
    const dest = path.join(MODELS, m[1].replace('/', '__'), m[3]);
    if (!path.resolve(dest).startsWith(path.resolve(MODELS))) return new Response('bad', { status: 400, headers: cors });
    try {
      if (!fs.existsSync(dest)) await download(`${HFB}${m[1]}/resolve/${m[2]}/${m[3]}`, dest, m[3]);
      return fileResponse(dest, m[3].endsWith('.json') ? 'application/json' : 'application/octet-stream');
    } catch (e) { return new Response(String(e.message || e), { status: 404, headers: cors }); }
  }

  const dirSize = (d) => { let n = 0; try { for (const f of fs.readdirSync(d, { withFileTypes: true })) n += f.isDirectory() ? dirSize(path.join(d, f.name)) : fs.statSync(path.join(d, f.name)).size; } catch {} return n; };
  uiHandle('ai:model-info', () => ({ bytes: dirSize(MODELS), dir: MODELS }));
  uiHandle('ai:model-delete', () => { try { fs.rmSync(MODELS, { recursive: true, force: true }); } catch {} return { bytes: 0 }; });

  // ---------------------------------------------------------------- Ollama
  async function ollamaModels() {
    try { const r = await net.fetch(OLLAMA + '/api/tags', { signal: AbortSignal.timeout(1500) }); if (!r.ok) return null; const j = await r.json(); return (j.models || []).map((m) => ({ name: m.name, size: m.size })); } catch { return null; }
  }
  uiHandle('ai:status', async () => ({ ollama: await ollamaModels() }));
  const running = new Map();
  uiHandle('ai:ollama-chat', async (e, { id, model, messages }) => {
    const ctl = new AbortController(); running.set(id, ctl);
    const send = (d) => { try { e.sender.send('ai:token', { id, ...d }); } catch {} };
    try {
      const r = await net.fetch(OLLAMA + '/api/chat', { method: 'POST', body: JSON.stringify({ model, messages, stream: true }), headers: { 'content-type': 'application/json' }, signal: ctl.signal });
      if (!r.ok) throw new Error('Ollama said: ' + (await r.text()).slice(0, 200));
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); let i;
        while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue; try { const j = JSON.parse(line); if (j.message && j.message.content) send({ token: j.message.content }); if (j.error) throw new Error(j.error); } catch (err) { if (err.message && !/JSON/.test(err.message)) throw err; } }
      }
      send({ done: true });
    } catch (err) { send({ done: true, error: ctl.signal.aborted ? null : String(err.message || err) }); }
    finally { running.delete(id); }
    return true;
  });
  uiHandle('ai:ollama-stop', (_e, id) => { const c = running.get(id); if (c) c.abort(); return true; });

  // ---------------------------------------------------------------- the page you're looking at
  uiHandle('ai:page', async (_e, wcId) => {
    const wc = wcId && webContents.fromId(wcId); if (!wc || wc.isDestroyed()) return null;
    try {
      return await wc.executeJavaScriptInIsolatedWorld(1998, [{ code: `(() => { const root = document.querySelector('article, main, [role=main]') || document.body; const sel = String(getSelection() || '').trim(); return { title: document.title, url: location.href, selection: sel.slice(0, 4000), text: (root ? root.innerText : '').replace(/\\s+/g, ' ').trim().slice(0, 12000) }; })()` }]);
    } catch { return null; }
  });
  return { serve };
};
