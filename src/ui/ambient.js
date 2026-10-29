// NoamBrowser — ambient sounds for the sidebar. Every sound is generated live with the Web Audio
// engine (no recordings, no internet): rain, waves, wind, fire, birds, a stream, a café, noise
// colours and gentle lo-fi music. Mix them, use presets, a sleep timer, or play during Focus.
'use strict';
(() => {
  const SOUNDS = [
    ['rain', '🌧️', 'Rain'], ['waves', '🌊', 'Ocean waves'], ['fire', '🔥', 'Fireplace'], ['birds', '🐦', 'Forest birds'],
    ['stream', '💧', 'Stream'], ['wind', '🍃', 'Wind'], ['cafe', '☕', 'Café'], ['lofi', '🎹', 'Lo-fi music'],
    ['brown', '🟤', 'Brown noise'], ['pink', '🌸', 'Pink noise'], ['white', '⚪', 'White noise'],
  ];
  const PRESETS = [
    ['🌧️', 'Rainy day', { rain: 0.7, fire: 0.35, lofi: 0.25 }], ['🌲', 'Forest', { birds: 0.6, stream: 0.45, wind: 0.25 }],
    ['🏖️', 'Beach', { waves: 0.8, wind: 0.2, birds: 0.15 }], ['☕', 'Café', { cafe: 0.6, lofi: 0.35 }],
    ['🧠', 'Deep focus', { brown: 0.55 }], ['😴', 'Sleep', { rain: 0.45, waves: 0.3 }], ['🎹', 'Lo-fi', { lofi: 0.7, rain: 0.2 }],
  ];
  let S = { levels: {}, master: 0.7, focusLink: false, timer: 0, playing: false };
  try { Object.assign(S, JSON.parse(localStorage.getItem('ambient') || '{}')); S.playing = false; } catch {}
  const save = () => { try { localStorage.setItem('ambient', JSON.stringify({ ...S, playing: false })); } catch {} };

  // ---------------------------------------------------------------- engine
  let ac = null, master = null; const live = new Map(); let timerEnd = 0, timerT = null;
  const rnd = (a, b) => a + Math.random() * (b - a);
  function ctx() {
    if (ac) return ac;
    ac = new AudioContext();
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master = ac.createGain(); master.gain.value = S.master;
    master.connect(comp).connect(ac.destination);
    return ac;
  }
  const bufCache = {};
  function noiseBuf(kind, secs = 4) {
    const k = kind + secs; if (bufCache[k]) return bufCache[k];
    const n = ac.sampleRate * secs, b = ac.createBuffer(2, n, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'white') d[i] = w * 0.5;
        else if (kind === 'pink') { b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; }
        else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      }
    }
    return (bufCache[k] = b);
  }
  const loop = (kind, secs = 4) => { const s = ac.createBufferSource(); s.buffer = noiseBuf(kind, secs); s.loop = true; s.loopStart = Math.random(); s.start(0, Math.random() * secs); return s; };
  const filt = (type, f, q = 0.7) => { const x = ac.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; };
  const gain = (v) => { const g = ac.createGain(); g.gain.value = v; return g; };
  function burst(out, { dur = 0.02, f = 3000, type = 'bandpass', q = 1, vol = 0.2, at = ac.currentTime }) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf('white', 1); const fl = filt(type, f, q); const g = gain(0);
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(fl).connect(g).connect(out); s.start(at, Math.random() * 0.9, dur + 0.05);
  }
  function tone(out, { f, type = 'sine', at, dur, vol, attack = 0.01, release = 0.3, filterF }) {
    const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, at);
    const g = gain(0); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + attack); g.gain.setValueAtTime(vol, at + Math.max(attack, dur - release)); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let n = o.connect(g); if (filterF) n = g.connect(filt('lowpass', filterF)); else n = g; n.connect(out); o.start(at); o.stop(at + dur + 0.05); return o;
  }
  // every sound: (out) => stop()
  const BUILD = {
    white: (out) => { const s = loop('white'); s.connect(gain(0.6)).connect(out); return () => s.stop(); },
    pink: (out) => { const s = loop('pink'); s.connect(gain(0.9)).connect(out); return () => s.stop(); },
    brown: (out) => { const s = loop('brown'); s.connect(filt('lowpass', 900)).connect(gain(0.9)).connect(out); return () => s.stop(); },
    rain: (out) => {
      const s = loop('pink'); s.connect(filt('highpass', 500)).connect(filt('lowpass', 7500)).connect(gain(0.75)).connect(out);
      const body = loop('brown'); body.connect(filt('lowpass', 400)).connect(gain(0.25)).connect(out);
      const t = setInterval(() => { const now = ac.currentTime; for (let i = 0; i < 6; i++) if (Math.random() < 0.7) burst(out, { at: now + rnd(0, 0.1), dur: rnd(0.008, 0.03), f: rnd(1800, 6500), q: rnd(0.8, 3), vol: rnd(0.04, 0.22) }); }, 100);
      return () => { clearInterval(t); s.stop(); body.stop(); };
    },
    waves: (out) => {
      const s = loop('brown', 6); const lp = filt('lowpass', 700); const g = gain(0.5);
      s.connect(lp).connect(g).connect(out);
      const lfo = ac.createOscillator(); lfo.frequency.value = 0.085; const depth = gain(0.42); lfo.connect(depth).connect(g.gain);
      const lfo2 = ac.createOscillator(); lfo2.frequency.value = 0.085; const d2 = gain(500); lfo2.connect(d2).connect(lp.frequency);
      lfo.start(); lfo2.start();
      const foam = loop('pink'); const fg = gain(0.05); foam.connect(filt('highpass', 2000)).connect(fg).connect(out); const fl = ac.createOscillator(); fl.frequency.value = 0.085; const fd = gain(0.05); fl.connect(fd).connect(fg.gain); fl.start();
      return () => { s.stop(); lfo.stop(); lfo2.stop(); foam.stop(); fl.stop(); };
    },
    wind: (out) => {
      const s = loop('pink'); const bp = filt('bandpass', 500, 1.2); const g = gain(0.5); s.connect(bp).connect(g).connect(out);
      const t = setInterval(() => { const now = ac.currentTime; bp.frequency.setTargetAtTime(rnd(250, 950), now, 1.2); g.gain.setTargetAtTime(rnd(0.25, 0.9), now, 1.5); }, 1800);
      return () => { clearInterval(t); s.stop(); };
    },
    stream: (out) => {
      const s = loop('white'); const bp = filt('bandpass', 1400, 0.9); const g = gain(0.4); s.connect(bp).connect(g).connect(out);
      const low = loop('brown'); low.connect(filt('lowpass', 500)).connect(gain(0.3)).connect(out);
      const t = setInterval(() => { const now = ac.currentTime; bp.frequency.setTargetAtTime(rnd(900, 2600), now, 0.05); g.gain.setTargetAtTime(rnd(0.25, 0.5), now, 0.06); }, 90);
      return () => { clearInterval(t); s.stop(); low.stop(); };
    },
    fire: (out) => {
      const r = loop('brown'); r.connect(filt('lowpass', 500)).connect(gain(0.6)).connect(out);
      const hiss = loop('pink'); hiss.connect(filt('highpass', 3000)).connect(gain(0.04)).connect(out);
      const t = setInterval(() => { const now = ac.currentTime; const n = Math.random() < 0.3 ? 3 : 1; for (let i = 0; i < n; i++) if (Math.random() < 0.55) burst(out, { at: now + rnd(0, 0.15), dur: rnd(0.004, 0.025), f: rnd(1500, 5000), type: 'highpass', vol: rnd(0.08, Math.random() < 0.08 ? 0.9 : 0.35) }); }, 140);
      return () => { clearInterval(t); r.stop(); hiss.stop(); };
    },
    birds: (out) => {
      const leaves = loop('pink'); leaves.connect(filt('bandpass', 1200, 0.6)).connect(gain(0.05)).connect(out);
      const pan = () => { const p = ac.createStereoPanner(); p.pan.value = rnd(-0.8, 0.8); p.connect(out); return p; };
      const sing = () => {
        const now = ac.currentTime + 0.05; const p = pan(); const base = rnd(2200, 4800); const notes = Math.floor(rnd(2, 7)); const kind = Math.random();
        for (let i = 0; i < notes; i++) {
          const at = now + i * rnd(0.09, 0.18); const o = ac.createOscillator(); o.type = 'sine'; const g = gain(0);
          const f0 = base * rnd(0.9, 1.1); o.frequency.setValueAtTime(f0, at);
          if (kind < 0.5) o.frequency.exponentialRampToValueAtTime(f0 * rnd(1.3, 1.8), at + 0.06); else o.frequency.exponentialRampToValueAtTime(f0 * rnd(0.6, 0.8), at + 0.08);
          g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(rnd(0.05, 0.14), at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
          o.connect(g).connect(p); o.start(at); o.stop(at + 0.12);
        }
      };
      let t; const next = () => { t = setTimeout(() => { sing(); if (Math.random() < 0.3) setTimeout(sing, rnd(150, 400)); next(); }, rnd(500, 2600)); };
      next();
      return () => { clearTimeout(t); leaves.stop(); };
    },
    cafe: (out) => {
      const m1 = loop('pink'), m2 = loop('brown');
      const bp = filt('bandpass', 550, 0.9); const g = gain(0.5); m1.connect(bp); m2.connect(filt('bandpass', 350, 1)).connect(bp); bp.connect(g).connect(out);
      const t = setInterval(() => { const now = ac.currentTime; g.gain.setTargetAtTime(rnd(0.3, 0.7), now, 0.25); bp.frequency.setTargetAtTime(rnd(380, 800), now, 0.3); }, 350);
      const clink = setInterval(() => { if (Math.random() < 0.35) { const at = ac.currentTime + 0.02; const f = rnd(2400, 4200); [1, 2.76, 5.4].forEach((h, i) => tone(out, { f: f * h, at, dur: 0.5 - i * 0.12, vol: 0.03 / (i + 1), attack: 0.002, release: 0.45 })); } }, 1800);
      return () => { clearInterval(t); clearInterval(clink); m1.stop(); m2.stop(); };
    },
    lofi: (out) => {
      const bus = gain(0.9); const warm = filt('lowpass', 2400); bus.connect(warm).connect(out);
      const crackle = loop('white'); const cg = gain(0.012); crackle.connect(filt('highpass', 4000)).connect(cg).connect(out);
      const pops = setInterval(() => { if (Math.random() < 0.5) burst(out, { dur: 0.004, f: 3000, vol: rnd(0.02, 0.07) }); }, 300);
      const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
      const CH = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]]; // Fmaj7 Em7 Dm7 Cmaj7
      const PENT = [72, 74, 76, 79, 81, 84];
      const beat = 60 / 72; let next = ac.currentTime + 0.1, step = 0;
      const sched = setInterval(() => {
        while (next < ac.currentTime + 0.3) {
          const bar = Math.floor(step / 8), s8 = step % 8, at = next;
          if (s8 === 0) { CH[bar % 4].forEach((n, i) => tone(bus, { f: midi(n), type: 'triangle', at: at + i * 0.012, dur: beat * 4, vol: 0.045, attack: 0.25, release: 1.2, filterF: 1400 })); tone(bus, { f: midi(CH[bar % 4][0] - 12), type: 'sine', at, dur: beat * 3.5, vol: 0.09, attack: 0.05, release: 0.8 }); }
          if (s8 === 0 || s8 === 5) { const o = ac.createOscillator(); const g = gain(0); o.frequency.setValueAtTime(110, at); o.frequency.exponentialRampToValueAtTime(42, at + 0.28); g.gain.setValueAtTime(0.32, at); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.35); o.connect(g).connect(bus); o.start(at); o.stop(at + 0.4); }
          if (s8 === 2 || s8 === 6) burst(bus, { at, dur: 0.16, f: 1800, q: 0.7, vol: 0.09 });
          if (step % 1 === 0) burst(bus, { at: at + (s8 % 2 ? beat * 0.08 : 0), dur: 0.025, f: 8000, type: 'highpass', vol: s8 % 2 ? 0.02 : 0.035 });
          if (Math.random() < 0.18) tone(bus, { f: midi(PENT[Math.floor(Math.random() * PENT.length)]), type: 'sine', at: at + rnd(0, beat / 2), dur: rnd(0.3, 0.9), vol: 0.035, attack: 0.02, release: 0.5 });
          next += beat / 2; step++;
        }
      }, 60);
      return () => { clearInterval(sched); clearInterval(pops); crackle.stop(); };
    },
  };
  function startSound(id) {
    if (live.has(id) || !BUILD[id]) return;
    ctx(); const g = gain(0); g.connect(master);
    const stop = BUILD[id](g);
    g.gain.setTargetAtTime(S.levels[id] ?? 0.5, ac.currentTime, 0.6);
    live.set(id, { g, stop });
  }
  function stopSound(id, fade = 0.5) {
    const l = live.get(id); if (!l) return; live.delete(id);
    l.g.gain.setTargetAtTime(0, ac.currentTime, fade / 3);
    setTimeout(() => { try { l.stop(); } catch {} try { l.g.disconnect(); } catch {} }, fade * 1000 + 200);
  }
  function play() { S.playing = true; ctx().resume(); for (const [id, v] of Object.entries(S.levels)) if (v > 0) startSound(id); refresh(); }
  function pause(fade = 0.6) { S.playing = false; for (const id of [...live.keys()]) stopSound(id, fade); clearTimeout(timerT); timerEnd = 0; refresh(); }
  function setLevel(id, v) {
    if (v > 0) S.levels[id] = v; else delete S.levels[id];
    save();
    if (!S.playing) { if (v > 0) play(); return; }
    if (v > 0) { if (!live.has(id)) startSound(id); else live.get(id).g.gain.setTargetAtTime(v, ac.currentTime, 0.15); } else stopSound(id);
    if (!Object.keys(S.levels).length) pause();
  }
  function setTimer(min) {
    S.timer = min; save(); clearTimeout(timerT); timerEnd = 0;
    if (min > 0 && S.playing) { timerEnd = Date.now() + min * 60000; timerT = setTimeout(() => { pause(8); toast('🌙 Ambient sounds stopped (sleep timer)'); }, min * 60000); }
  }
  window.ambient = { play, pause, setLevel, state: () => ({ ...S, live: [...live.keys()] }) };

  // ---------------------------------------------------------------- panel UI
  let body = null;
  function refresh() {
    document.querySelectorAll('.rail-btn[data-id="ambient"]').forEach((b) => b.classList.toggle('playing', S.playing));
    if (body && body.isConnected && body.querySelector('.amb')) render(body);
  }
  setInterval(() => { document.querySelectorAll('.rail-btn[data-id="ambient"]').forEach((b) => b.classList.toggle('playing', S.playing)); if (timerEnd && body && body.isConnected) { const el = body.querySelector('#amb-left'); if (el) { const s = Math.max(0, Math.round((timerEnd - Date.now()) / 1000)); el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} left`; } } }, 1000);
  function render(el) {
    body = el;
    [...el.children].forEach((c) => { if (c.tagName !== 'WEBVIEW') c.remove(); });
    const div = document.createElement('div'); div.className = 'amb';
    const on = Object.keys(S.levels).length;
    div.innerHTML = `<div class="amb-top"><button class="amb-play ${S.playing ? 'on' : ''}" id="amb-play" ${on || !S.playing ? '' : ''}>${S.playing ? '⏸' : '▶'}</button>
        <div class="amb-now"><b>${S.playing ? 'Playing' : on ? 'Paused' : 'Pick some sounds'}</b><span>${on ? SOUNDS.filter(([id]) => S.levels[id]).map(([, e, n]) => e + ' ' + n).join(' · ') : 'Mix as many as you like'}</span></div></div>
      <label class="amb-master">🔊 <input type="range" min="0" max="100" value="${Math.round(S.master * 100)}" id="amb-master"></label>
      <div class="amb-sub">Moods</div><div class="amb-presets">${PRESETS.map(([e, n], i) => `<button data-p="${i}">${e} ${n}</button>`).join('')}</div>
      <div class="amb-sub">Sounds</div><div class="amb-grid">${SOUNDS.map(([id, e, n]) => { const v = S.levels[id] || 0; return `<div class="amb-tile ${v ? 'on' : ''}" data-id="${id}"><button class="amb-t"><span>${e}</span>${n}</button><input type="range" min="0" max="100" value="${Math.round(v * 100)}"></div>`; }).join('')}</div>
      <div class="amb-sub">Options</div>
      <div class="amb-opt"><label>⏲️ Stop after <select id="amb-timer"><option value="0">never</option>${[15, 30, 45, 60, 90, 120].map((m) => `<option value="${m}" ${S.timer === m ? 'selected' : ''}>${m} min</option>`).join('')}</select></label><span id="amb-left" class="muted-p">${timerEnd ? '' : ''}</span></div>
      <label class="amb-opt"><input type="checkbox" id="amb-focus" ${S.focusLink ? 'checked' : ''}> 🍅 Play during Focus sessions, pause on breaks</label>
      <p class="amb-note">All sounds are made live on your computer — no internet needed.</p>`;
    el.appendChild(div);
    div.querySelector('#amb-play').onclick = () => { if (S.playing) pause(); else { if (!Object.keys(S.levels).length) S.levels = { ...PRESETS[0][2] }; play(); setTimer(S.timer); } };
    div.querySelector('#amb-master').oninput = (e) => { S.master = e.target.value / 100; if (master) master.gain.setTargetAtTime(S.master, ac.currentTime, 0.05); save(); };
    div.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { const p = PRESETS[+b.dataset.p][2]; for (const id of Object.keys(S.levels)) if (!p[id]) setLevel(id, 0); S.levels = { ...p }; save(); if (S.playing) { for (const [id, v] of Object.entries(p)) { if (live.has(id)) live.get(id).g.gain.setTargetAtTime(v, ac.currentTime, 0.3); else startSound(id); } } else play(); if (PRESETS[+b.dataset.p][1] === 'Sleep' && !S.timer) setTimer(30); else setTimer(S.timer); refresh(); }));
    div.querySelectorAll('.amb-tile').forEach((t) => {
      const id = t.dataset.id; const r = t.querySelector('input');
      t.querySelector('.amb-t').onclick = () => { setLevel(id, S.levels[id] ? 0 : 0.5); if (!S.playing && S.levels[id]) { play(); setTimer(S.timer); } refresh(); };
      r.oninput = () => { setLevel(id, r.value / 100); t.classList.toggle('on', r.value > 0); };
      r.onchange = refresh;
    });
    div.querySelector('#amb-timer').onchange = (e) => setTimer(+e.target.value);
    div.querySelector('#amb-focus').onchange = (e) => { S.focusLink = e.target.checked; save(); };
  }
  window.renderAmbientPanel = render;

  // follow Focus mode
  let lastPhase = null;
  nb.on('focus:state', (f) => {
    if (!S.focusLink || f.phase === lastPhase) { lastPhase = f.phase; return; }
    if (f.phase === 'focus' && !f.paused && !S.playing) { if (!Object.keys(S.levels).length) S.levels = { brown: 0.5 }; play(); }
    if ((f.phase === 'break' || f.phase === 'idle') && S.playing) pause(1.5);
    lastPhase = f.phase;
  });
  const _cmds = commands;
  commands = function () { return [..._cmds(), CMD('ambient', S.playing ? 'Pause ambient sounds' : 'Play ambient sounds 🎧', '', () => { if (S.playing) pause(); else { if (!Object.keys(S.levels).length) S.levels = { ...PRESETS[0][2] }; play(); } }, 'music')]; };

  // add the panel to the sidebar once for people who already had NoamBrowser
  const _init = hooks.init;
  hooks.init = async (init) => {
    await _init(init);
    let added = false; try { added = localStorage.getItem('ambient-added') === '1'; } catch {}
    const panels = (state.settings.sidePanel || {}).panels || [];
    if (!added && !panels.some((p) => p.kind === 'ambient')) {
      const i = Math.max(0, panels.findIndex((p) => p.kind === 'reading') + 1);
      const list = [...panels]; list.splice(i, 0, { id: 'ambient', kind: 'ambient', name: 'Ambient sounds' });
      state.settings = await nb.invoke('settings:set', { sidePanel: { panels: list } });
    }
    try { localStorage.setItem('ambient-added', '1'); } catch {}
  };
})();
