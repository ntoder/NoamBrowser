// NoamBrowser AI helper worker: runs a small language model inside the browser (WebGPU or WebAssembly).
import { pipeline, env, TextStreamer, InterruptableStoppingCriteria } from '@huggingface/transformers';
env.allowLocalModels = false;
env.useBrowserCache = false;
env.useWasmCache = false;
// keep the normal Hugging Face addresses (the library only checks http/https files exist) but fetch every file
// through NoamBrowser, which downloads it once and keeps it in your profile folder
const HF = 'https://huggingface.co/';
const realFetch = self.fetch.bind(self);
env.fetch = (url, opts) => realFetch(typeof url === 'string' && url.startsWith(HF) ? 'noam://aimodels/' + url.slice(HF.length) : url, opts);
env.backends.onnx.wasm.wasmPaths = { mjs: 'noam://aimodels/runtime/ort-wasm-simd-threaded.asyncify.mjs', wasm: 'noam://aimodels/runtime/ort-wasm-simd-threaded.asyncify.wasm' };
env.backends.onnx.wasm.numThreads = 1;
let gen = null, loading = null, device = 'wasm';
const stopper = new InterruptableStoppingCriteria();
async function load({ model, dtype, forceWasm }) {
  if (gen) return gen;
  if (loading) return loading;
  loading = (async () => {
    let gpu = false;
    try { gpu = !forceWasm && !!navigator.gpu && !!(await navigator.gpu.requestAdapter()); } catch {}
    device = gpu ? 'webgpu' : 'wasm';
    const files = {};
    gen = await pipeline('text-generation', model, {
      device, dtype: dtype || (gpu ? 'q4f16' : 'q4'),
      progress_callback: (p) => { if (p.status === 'progress' && p.file) { files[p.file] = [p.loaded || 0, p.total || 0]; const v = Object.values(files); postMessage({ type: 'progress', loaded: v.reduce((a, x) => a + x[0], 0), total: v.reduce((a, x) => a + x[1], 0) }); } },
    });
    postMessage({ type: 'ready', device });
    return gen;
  })();
  try { return await loading; } catch (e) { loading = null; throw e; }
}
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') await load(data);
    else if (data.type === 'stop') stopper.interrupt();
    else if (data.type === 'chat') {
      await load(data); stopper.reset();
      const streamer = new TextStreamer(gen.tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: (t) => postMessage({ type: 'token', id: data.id, t }) });
      await gen(data.messages, { max_new_tokens: data.maxTokens || 600, do_sample: false, repetition_penalty: 1.1, streamer, stopping_criteria: stopper });
      postMessage({ type: 'done', id: data.id });
    }
  } catch (e) { postMessage({ type: 'error', id: data.id, error: String((e && e.message) || e) }); }
};
