// Runs the Bergamot (Firefox Translations) engine fully on this computer.
// Only the language model files are downloaded, once per language pair; the
// text of the pages you translate never leaves your machine.
import { TranslatorBacking, BatchTranslator } from './bergamot/translator.js';

let backing = null;
let translator = null;

function ensure() {
  if (translator) return translator;
  // options are sent to the worker, so they must be plain data (no functions)
  backing = new TranslatorBacking({ downloadTimeout: 180000, pivotLanguage: 'en' });
  backing.onerror = (e) => window.host.log('worker error: ' + (e && e.message));
  backing.registry.catch(() => {});
  translator = new BatchTranslator({ workers: Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 2) - 1)) }, backing);
  return translator;
}

async function languages() {
  ensure();
  const reg = await backing.registry;
  const from = new Set(), to = new Set();
  for (const m of reg) { from.add(m.from); to.add(m.to); }
  // with English as a pivot, any from->en + en->to pair works
  return { from: [...from].sort(), to: [...to].sort() };
}

window.host.onRequest(async ({ id, op, from, to, texts }) => {
  try {
    if (op === 'selftest') { ensure(); const w = await backing.loadWorker(); w.worker.terminate(); return window.host.respond(id, { ok: true, result: 'engine ok' }); }
    if (op === 'languages') return window.host.respond(id, { ok: true, result: await languages() });
    if (op === 'translate') {
      const t = ensure();
      const out = await Promise.all(texts.map((text) => t.translate({ from, to, text, html: true }).then((r) => r.target.text)));
      return window.host.respond(id, { ok: true, result: out });
    }
    window.host.respond(id, { ok: false, error: 'unknown op' });
  } catch (e) {
    if (/No model available/.test(e.message)) {
      // drop a cached rejection so a later attempt can retry
      try { backing.models.clear(); } catch {}
    }
    window.host.respond(id, { ok: false, error: e.message || String(e) });
  }
});
window.host.ready();
