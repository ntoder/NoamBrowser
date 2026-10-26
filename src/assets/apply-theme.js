// Applies appearance settings to <html> as data attributes. Shared by the
// browser chrome and the built-in noam:// pages so they always match.
(function () {
  const DARK_PRESETS = new Set(['aurora', 'sunset', 'ocean', 'forest', 'neon', 'mono']);
  let lastSettings = null;
  setInterval(() => { if (lastSettings && (lastSettings.appearance || {}).preset === 'daylight') window.applyNoamTheme(lastSettings); }, 60000);
  window.applyNoamTheme = function (s) {
    lastSettings = s;
    const r = document.documentElement;
    const ap = s.appearance || {};
    const preset = ap.preset || 'default';
    r.dataset.preset = preset;
    let dark;
    if (preset === 'daylight') {
      const h = new Date().getHours() + new Date().getMinutes() / 60;
      const tod = h >= 5 && h < 8 ? 'dawn' : h >= 8 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'sunset' : 'night';
      r.dataset.tod = tod; dark = tod === 'sunset' || tod === 'night' || !!ap.liquidGlass;
    } else delete r.dataset.tod;
    if (preset === 'daylight') {}
    else if (DARK_PRESETS.has(preset) || ap.liquidGlass) dark = true;
    else if (preset === 'snow') dark = false;
    else dark = s.theme === 'dark' || (s.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    r.dataset.theme = dark ? 'dark' : 'light';
    if (s.accent && s.accent !== 'auto' && !ap.customAccent) r.dataset.accent = s.accent; else delete r.dataset.accent;
    if (ap.customAccent) { r.dataset.customAccent = ''; r.style.setProperty('--custom-accent', ap.customAccent); }
    else { delete r.dataset.customAccent; r.style.removeProperty('--custom-accent'); }
    r.dataset.tabs = ap.tabStyle || 'rounded';
    r.dataset.density = ap.density || 'comfortable';
    r.dataset.font = ap.font || 'manrope';
    r.dataset.anim = ap.animations || 'full';
    r.style.setProperty('--rk', String((ap.radius ?? 100) / 100));
    if (ap.liquidGlass) { r.dataset.glass = ''; r.style.setProperty('--glass', String((ap.glassStrength ?? 60) / 100)); }
    else delete r.dataset.glass;
  };
})();
