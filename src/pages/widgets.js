// New tab widgets: clock + Hebrew date, weather, zmanim, to-do.
(async () => {
  let s = await noamReady;
  if (new URLSearchParams(location.search).has('private')) return;
  const W = () => s.widgets || {};
  const Z = window.NoamZmanim;
  const city = () => W().city || { name: 'Jerusalem', lat: 31.769, lon: 35.2163, tz: 'Asia/Jerusalem' };
  const save = async (patch) => { s = await noam.invoke('settings:set', { widgets: { ...W(), ...patch } }); render(); };
  const tfmt = (d, tz) => d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: tz }) : '—';

  function render() {
    const w = W();
    const any = w.clock || w.weather || w.zmanim || w.todo;
    $('#widgets').hidden = false;
    $('#wgrid').hidden = !any;
    $('#w-clock').hidden = !w.clock; $('#w-weather').hidden = !w.weather; $('#w-zmanim').hidden = !w.zmanim; $('#w-todo').hidden = !w.todo;
    $$('[data-w]').forEach((c) => (c.checked = !!w[c.dataset.w]));
    $('#w-candle').value = String(w.candle || 18);
    $('#city-now').textContent = [city().name, city().country].filter(Boolean).join(', ');
    $('#wx-units').textContent = w.units === 'f' ? '°F' : '°C';
    tickClock(); if (w.weather) loadWeather(); if (w.zmanim) renderZmanim(); if (w.todo) loadTodos();
  }

  // ---------- clock + Hebrew date
  function tickClock() {
    if (!W().clock) return;
    const now = new Date();
    $('#clock-t').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    $('#clock-d').textContent = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
    if (Z) {
      const c = city(); const z = Z.zmanim(c, now);
      const afterSunset = z.sunset && now > z.sunset;
      const hd = Z.hebrewDate(afterSunset ? new Date(+now + 86400000) : now, c.tz);
      $('#clock-hd').innerHTML = `<b dir="rtl">${esc(hd.he)}</b> · ${esc(hd.en)}${afterSunset ? ' (after sunset)' : ''}`;
    }
  }
  setInterval(tickClock, 15000);

  // ---------- weather (Open-Meteo, no account)
  const WMO = { 0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Cloudy'], 45: ['🌫️', 'Fog'], 48: ['🌫️', 'Icy fog'],
    51: ['🌦️', 'Light drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌧️', 'Heavy drizzle'], 61: ['🌦️', 'Light rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'],
    66: ['🌧️', 'Freezing rain'], 67: ['🌧️', 'Freezing rain'], 71: ['🌨️', 'Light snow'], 73: ['🌨️', 'Snow'], 75: ['❄️', 'Heavy snow'], 77: ['🌨️', 'Snow grains'],
    80: ['🌦️', 'Showers'], 81: ['🌧️', 'Showers'], 82: ['⛈️', 'Violent showers'], 85: ['🌨️', 'Snow showers'], 86: ['❄️', 'Snow showers'], 95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunderstorm, hail'], 99: ['⛈️', 'Thunderstorm, hail'] };
  async function loadWeather() {
    const c = city(); $('#wx-place').textContent = c.name;
    try {
      const r = await noam.invoke('widgets:weather', { lat: c.lat, lon: c.lon, units: W().units });
      const cur = r.current || {}; const u = W().units === 'f' ? '°F' : '°';
      let [emo, desc] = WMO[cur.weather_code] || ['🌡️', ''];
      if (cur.is_day === 0 && (cur.weather_code === 0 || cur.weather_code === 1)) emo = '🌙';
      const days = (r.daily && r.daily.time || []).slice(1, 4).map((t, i) => {
        const k = i + 1; const [e] = WMO[r.daily.weather_code[k]] || ['🌡️'];
        return `<div class="day">${new Date(t + 'T12:00').toLocaleDateString([], { weekday: 'short' })}<b>${e}</b>${Math.round(r.daily.temperature_2m_max[k])}° / ${Math.round(r.daily.temperature_2m_min[k])}°</div>`;
      }).join('');
      $('#wx-body').innerHTML = `<div class="now"><span class="emo">${emo}</span><div><div class="temp">${Math.round(cur.temperature_2m)}${u}</div><div class="desc">${esc(desc)} · feels ${Math.round(cur.apparent_temperature)}${u} · ${Math.round(cur.relative_humidity_2m)}% humidity</div></div></div><div class="days">${days}</div>`;
    } catch (e) {
      $('#wx-body').innerHTML = `<span class="muted">Weather isn’t available right now. ${navigator.onLine ? '' : 'You’re offline.'}</span>`;
    }
  }
  $('#wx-units').onclick = () => save({ units: W().units === 'f' ? 'c' : 'f' });

  // ---------- zmanim
  let jewish = null;
  async function renderZmanim() {
    if (!Z) return;
    const c = city(); const now = new Date();
    $('#zm-place').textContent = c.name;
    const z = Z.zmanim(c, now);
    if (z.polar) { $('#zm-body').innerHTML = '<span class="muted">The sun doesn’t rise or set here today.</span>'; return; }
    const fri = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: c.tz }).format(now) === 'Fri';
    const sat = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: c.tz }).format(now) === 'Sat';
    const rows = [
      ['Alot HaShachar', z.alot], ['Sunrise (Netz)', z.sunrise], ['Latest Shema', z.shma], ['Latest Shacharit', z.tefila],
      ['Chatzot', z.chatzot], ['Mincha Gedola', z.minchaGedola], ['Plag HaMincha', z.plag],
    ];
    if (fri) rows.push(['Candle lighting', new Date(+z.sunset - (W().candle || 18) * 60000)]);
    rows.push(['Sunset (Shkia)', z.sunset], [sat ? 'Shabbat ends (Tzeit)' : 'Nightfall (Tzeit)', z.tzeit]);
    const next = rows.find(([, t]) => t && t > now);
    const tags = [];
    const sh = jewish && jewish.shabbat && jewish.shabbat.items || [];
    const parasha = sh.find((i) => i.category === 'parashat');
    if (parasha) tags.push(parasha.title + (parasha.hebrew ? ' · ' + parasha.hebrew : ''));
    const today = new Date().toISOString().slice(0, 10);
    const hol = (jewish && jewish.holidays && jewish.holidays.items || []).filter((i) => i.date && i.date.slice(0, 10) >= today && i.category !== 'parashat').slice(0, 2);
    for (const h of hol) tags.push((h.date.slice(0, 10) === today ? 'Today: ' : new Date(h.date.slice(0, 10) + 'T12:00').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) + ': ') + h.title);
    const candles = sh.find((i) => i.category === 'candles');
    const afterSunset = now > z.sunset;
    const hd = Z.hebrewDate(afterSunset ? new Date(+now + 86400000) : now, c.tz);
    $('#zm-body').innerHTML = `<div class="heb" dir="rtl">${esc(hd.he)}</div><div class="sub">${esc(hd.en)}${candles && !fri ? ' · Candles ' + esc(new Date(candles.date).toLocaleDateString([], { weekday: 'short' })) + ' ' + esc(tfmt(new Date(candles.date), c.tz)) : ''}</div>`
      + tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')
      + `<ul>${rows.map(([n, t]) => `<li class="${t === (next && next[1]) ? 'next' : t && t < now ? 'past' : ''}"><span>${esc(n)}</span><b>${esc(tfmt(t, c.tz))}</b></li>`).join('')}</ul>`
      + `<div class="note">Calculated for sea level (GRA). Check your local luach for halachic use.</div>`;
  }
  async function loadJewish() {
    const c = city();
    try { jewish = await noam.invoke('widgets:jewish', { lat: c.lat, lon: c.lon, tz: c.tz, candle: W().candle || 18 }); } catch { jewish = null; }
    if (W().zmanim) renderZmanim();
  }
  setInterval(() => { if (W().zmanim) renderZmanim(); }, 60000);

  // ---------- to-do (synced)
  let todos = [];
  async function loadTodos() { todos = await noam.invoke('todos:list'); drawTodos(); }
  function drawTodos() {
    const list = $('#todo-list');
    if (!todos.length) { list.innerHTML = '<li class="empty">Nothing to do. Nice.</li>'; return; }
    list.innerHTML = todos.map((t) => `<li class="${t.done ? 'done' : ''}" data-id="${esc(t.id)}"><input type="checkbox" ${t.done ? 'checked' : ''}><span></span><button title="Delete">✕</button></li>`).join('');
    $$('#todo-list li[data-id]').forEach((li, i) => {
      li.querySelector('span').textContent = todos[i].text;
      li.querySelector('input').onchange = (e) => { todos[i].done = e.target.checked; todos[i].updated = Date.now(); persist(); };
      li.querySelector('button').onclick = () => { todos.splice(i, 1); persist(); };
    });
  }
  async function persist() { todos = await noam.invoke('todos:save', todos); drawTodos(); }
  $('#todo-f').onsubmit = (e) => { e.preventDefault(); const v = $('#todo-in').value.trim(); if (!v) return; todos.unshift({ id: crypto.randomUUID(), text: v, done: false, updated: Date.now() }); $('#todo-in').value = ''; persist(); };
  $('#todo-clear').onclick = () => { todos = todos.filter((t) => !t.done); persist(); };
  noam.on('extras', (what) => { if ((what === 'todos' || what === 'all') && W().todo) loadTodos(); });

  // ---------- customize
  $('#w-edit').onclick = () => { const c = $('#w-cfg'); c.hidden = !c.hidden; $('#w-edit').textContent = c.hidden ? 'Customize widgets' : 'Done'; };
  $$('[data-w]').forEach((c) => (c.onchange = () => save({ [c.dataset.w]: c.checked })));
  $('#w-candle').onchange = (e) => { save({ candle: +e.target.value }); loadJewish(); };
  let geoT;
  $('#city-q').oninput = (e) => {
    clearTimeout(geoT); const q = e.target.value.trim();
    if (q.length < 2) { $('#city-list').hidden = true; return; }
    geoT = setTimeout(async () => {
      let res = [];
      try { res = await noam.invoke('widgets:geocode', q); } catch {}
      const ul = $('#city-list');
      ul.innerHTML = res.length ? res.map((r, i) => `<li data-i="${i}">${esc(r.name)}<span class="muted">${esc([r.admin, r.country].filter(Boolean).join(', ') ? ' — ' + [r.admin, r.country].filter(Boolean).join(', ') : '')}</span></li>`).join('') : '<li class="muted">No places found (or you’re offline)</li>';
      ul.hidden = false;
      $$('#city-list li[data-i]').forEach((li) => (li.onclick = () => { const r = res[+li.dataset.i]; ul.hidden = true; $('#city-q').value = ''; save({ city: r }).then(loadJewish); }));
    }, 300);
  };

  noam.on('settings', (ns) => { const before = JSON.stringify(W()); s = ns; if (JSON.stringify(W()) !== before) render(); });
  render();
  loadJewish();
})();
