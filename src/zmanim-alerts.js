// Zmanim reminders: a desktop notification a set time before each chosen zman
// (calculated on this computer for the city chosen in the new-tab widgets).
const { Notification } = require('electron');
const path = require('path');
const Z = require('./assets/zmanim.js');

const ZMANIM = [
  ['alot', 'Alot HaShachar'], ['sunrise', 'Sunrise (Netz)'], ['shma', 'Latest Shema'], ['tefila', 'Latest Shacharit'],
  ['chatzot', 'Chatzot'], ['minchaGedola', 'Mincha Gedola'], ['minchaKetana', 'Mincha Ketana'], ['plag', 'Plag HaMincha'],
  ['candles', 'Candle lighting (Friday)'], ['sunset', 'Sunset (Shkia)'], ['tzeit', 'Nightfall (Tzeit)'],
];
const DEFAULTS = { enabled: false, before: 60, sound: true, which: { shma: true, tefila: true, minchaGedola: false, plag: false, candles: true, sunset: true, tzeit: false } };

module.exports = function setupZmanimAlerts({ settings, pageHandle, windows }) {
  const cfg = () => ({ ...DEFAULTS, ...(settings.get('zmanimAlerts') || {}), which: { ...DEFAULTS.which, ...((settings.get('zmanimAlerts') || {}).which || {}) } });
  const city = () => (settings.get('widgets') || {}).city || { name: 'Jerusalem', lat: 31.769, lon: 35.2163, tz: 'Asia/Jerusalem' };
  const fired = new Set();

  function upcoming(from = new Date()) {
    const c = city(); const out = [];
    for (const dayOffset of [0, 1]) {
      const d = new Date(+from + dayOffset * 86400000);
      const z = Z.zmanim(c, d); if (z.polar) continue;
      const fri = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: c.tz }).format(d) === 'Fri';
      const candle = (settings.get('widgets') || {}).candle || 40;
      for (const [k, name] of ZMANIM) {
        let t = k === 'candles' ? (fri ? new Date(+z.sunset - candle * 60000) : null) : z[k];
        if (t) out.push({ key: k, name: k === 'candles' ? 'Candle lighting' : name, time: t });
      }
    }
    return out;
  }
  const fmt = (t) => t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: city().tz });
  const inWords = (m) => m >= 60 ? (m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} hour${m === 60 ? '' : 's'}`) : `${m} minutes`;

  function notify(title, body) {
    if (!Notification.isSupported()) return false;
    const n = new Notification({ title, body, silent: !cfg().sound, icon: path.join(__dirname, 'assets', 'icon.png') });
    n.on('click', () => { const w = [...windows].find((x) => !x.isDestroyed()); if (w) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); } });
    n.show();
    return true;
  }

  function tick() {
    const c = cfg(); if (!c.enabled) return;
    const now = Date.now(); const before = Math.max(0, +c.before || 0) * 60000;
    for (const z of upcoming()) {
      if (!c.which[z.key]) continue;
      const at = +z.time - before;
      const id = z.key + '@' + z.time.toISOString().slice(0, 16) + '-' + c.before;
      // fire once, within 2 minutes after the reminder time (covers sleep/clock jitter without spamming old ones)
      if (now >= at && now - at < 120000 && !fired.has(id)) {
        fired.add(id);
        notify(`${z.name} in ${inWords(c.before)}`, `${z.name} is at ${fmt(z.time)} in ${city().name}.`);
      }
    }
    if (fired.size > 200) fired.clear();
  }
  setInterval(tick, 20000);
  setTimeout(tick, 5000);

  pageHandle('zmanim:alerts-info', () => {
    const c = cfg(); const now = Date.now(); const before = (+c.before || 0) * 60000;
    const next = upcoming().filter((z) => c.which[z.key] && +z.time - before > now).sort((a, b) => a.time - b.time)[0];
    return { list: ZMANIM.map(([key, name]) => ({ key, name })), cfg: c, city: city().name, supported: Notification.isSupported(),
      next: next ? { name: next.name, time: fmt(next.time), remindAt: fmt(new Date(+next.time - before)) } : null };
  });
  pageHandle('zmanim:alerts-test', () => notify('Latest Shema in 1 hour', `This is how a reminder looks. Times are for ${city().name}.`));
  return { tick, upcoming };
};
