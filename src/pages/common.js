// Shared helpers for NoamBrowser's built-in pages.
window.$ = (s, r = document) => r.querySelector(s);
window.$$ = (s, r = document) => [...r.querySelectorAll(s)];
window.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
window.fmtNum = (n) => new Intl.NumberFormat().format(n || 0);
window.fmtBytes = (b) => { if (!b) return '0 B'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; const i = Math.min(4, Math.floor(Math.log(b) / Math.log(1024))); return (b / 1024 ** i).toFixed(i > 1 ? 1 : 0) + ' ' + u[i]; };
window.svg = (paths) => `<svg viewBox="0 0 24 24">${paths}</svg>`;
window.ICONS = {
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5S14.6 18.1 12 20.5C9.4 18.1 8.2 15.3 8.2 12S9.4 5.9 12 3.5z"/>',
  close: '<path d="M7 7l10 10M17 7L7 17"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  folder: '<path d="M3.5 7.5V18a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5V9.5A1.5 1.5 0 0 0 19 8h-7l-2-2.5H5A1.5 1.5 0 0 0 3.5 7z"/>',
  file: '<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z"/><path d="M14 3.5V8h4"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  shield: '<path d="M12 3c2.6 1.6 5.3 2.2 8 2.2 0 7.3-2.6 12-8 15.8C6.6 17.2 4 12.5 4 5.2c2.7 0 5.4-.6 8-2.2z"/>',
};
window.favImg = (url, fallback = 'globe') => url ? `<img src="${esc(url)}" alt="" data-fallback="${fallback}">` : svg(ICONS[fallback]);
document.addEventListener('error', (e) => { const t = e.target; if (t && t.tagName === 'IMG' && t.dataset.fallback) t.outerHTML = svg(ICONS[t.dataset.fallback] || ICONS.globe); }, true);
window.applyTheme = (s) => window.applyNoamTheme(s);
window.dayLabel = (t) => {
  const d = new Date(t); const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
};
window.timeLabel = (t) => new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
window.noamReady = (async () => {
  if (!window.noam) throw new Error('internal API unavailable');
  const s = await noam.invoke('settings:get');
  applyTheme(s);
  noam.on('settings', applyTheme);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => applyTheme(await noam.invoke('settings:get')));
  return s;
})();
