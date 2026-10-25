// Tiny JSON persistence with debounced, atomic writes. Everything stays on
// the user's machine — NoamBrowser has no servers and sends no telemetry.
const fs = require('fs');
const path = require('path');

class Store {
  constructor(dir, name, defaults) {
    this.file = path.join(dir, name + '.json');
    this.defaults = defaults;
    this.timer = null;
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = mergeDefaults(raw, defaults);
    } catch {
      this.data = structuredClone(defaults);
    }
  }
  get(k) { return k === undefined ? this.data : this.data[k]; }
  set(k, v) { this.data[k] = v; this.save(); }
  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 400);
  }
  flush() {
    clearTimeout(this.timer);
    try {
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    } catch (e) { console.error('store save failed', this.file, e.message); }
  }
}

function mergeDefaults(raw, defaults) {
  if (Array.isArray(defaults)) return Array.isArray(raw) ? raw : structuredClone(defaults);
  if (defaults && typeof defaults === 'object') {
    const out = { ...structuredClone(defaults), ...(raw && typeof raw === 'object' ? raw : {}) };
    for (const k of Object.keys(defaults)) {
      const d = defaults[k];
      if (d && typeof d === 'object' && !Array.isArray(d)) out[k] = mergeDefaults(raw?.[k], d);
    }
    return out;
  }
  return raw ?? defaults;
}

module.exports = { Store };
