(async () => {
  let s = await noamReady;
  let range = 'today';
  const COLORS = ['#7C68FA', '#3E8DEB', '#14A89B', '#3FAE5A', '#D9A21B', '#EE7A2E', '#E5484D', '#E055A3'];
  const dur = (sec, short) => {
    const m = Math.round(sec / 60);
    if (sec > 0 && m < 1) return '< 1 min';
    if (m < 60) return m + ' min';
    const h = Math.floor(m / 60), r = m % 60;
    return short ? `${h}h ${r}m` : `${h} h ${r ? r + ' min' : ''}`.trim();
  };
  const dayName = (d, n) => { const x = new Date(d + 'T12:00'); return n > 7 ? x.getDate() + '/' + (x.getMonth() + 1) : x.toLocaleDateString([], { weekday: 'short' }); };
  const LIMITS = [0, 15, 30, 45, 60, 90, 120, 180, 240];
  const isTodayRange = () => range === 'today';

  async function render() {
    const r = await noam.invoke('screentime:get', range);
    const label = { today: 'Today', yesterday: 'Yesterday', 7: 'Last 7 days', 30: 'Last 30 days' }[range];
    $('#k-total').textContent = label;
    $('#v-total').textContent = r.total ? dur(r.total) : '0 min';
    const diff = r.prevTotal ? Math.round((r.total - r.prevTotal) / r.prevTotal * 100) : null;
    const prevLabel = { today: 'yesterday', yesterday: 'the day before', 7: 'the week before', 30: 'the 30 days before' }[range];
    $('#s-total').innerHTML = range === 'today' || range === 'yesterday'
      ? (diff === null ? '' : `<span class="${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)}%</span> vs ${prevLabel}`)
      : `About ${dur(r.total / Math.max(1, r.daysWithData))} a day${diff === null ? '' : ` · <span class="${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)}%</span> vs ${prevLabel}`}`;
    const top = r.sites[0];
    $('#v-top').textContent = top ? top.key : '—';
    $('#s-top').textContent = top ? `${dur(top.sec)} · ${Math.round(top.sec / r.total * 100)}% of your time` : '';
    $('#v-sites').textContent = r.sites.length;
    $('#s-sites').textContent = r.sites.length ? `${r.sites.filter((x) => x.sec >= 60).length} for more than a minute` : '';

    // chart
    $('#chart-wrap').hidden = r.perDay.length < 2;
    const max = Math.max(...r.perDay.map((d) => d.total), 60);
    const today = r.perDay[r.perDay.length - 1].day;
    $('#bars').innerHTML = r.perDay.map((d, i) => `<div class="b${d.day === today && range !== 'yesterday' && i === r.perDay.length - 1 ? ' today' : ''}" title="${esc(new Date(d.day + 'T12:00').toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' }))}: ${esc(dur(d.total))}"><i style="height:${Math.max(2, d.total / max * 100)}%"></i><span>${r.perDay.length > 14 && i % 3 ? '&nbsp;' : esc(dayName(d.day, r.perDay.length))}</span></div>`).join('');

    // sites
    if (!r.sites.length) {
      $('#list').innerHTML = `<div class="empty"><b>Nothing here yet</b><br>${r.enabled ? 'Browse for a bit and come back — time is added every few seconds.' : 'Screen time is turned off.'}</div>`;
    } else {
      const most = r.sites[0].sec;
      $('#list').innerHTML = r.sites.slice(0, 60).map((x, i) => {
        const over = x.limit && x.today >= x.limit * 60;
        return `<div class="site${over ? ' over' : ''}" data-i="${i}">
          <span class="fav">${x.icon ? `<img src="${esc(x.icon)}" alt="" data-fallback="globe">` : svg(ICONS.globe)}</span>
          <span class="n">${esc(x.key)}<small>${Math.round(x.sec / r.total * 100)}%${x.limit ? ` · limit ${dur(x.limit * 60)}/day` : ''}</small></span>
          <span class="track"><i style="width:${Math.max(1.5, x.sec / most * 100)}%;background:${COLORS[i % COLORS.length]}"></i></span>
          <span class="t">${esc(dur(x.sec, true))}${!isTodayRange() && x.today ? `<small>${esc(dur(x.today, true))} today</small>` : ''}</span>
          <select title="Daily limit" class="${x.limit ? 'has' : ''}">${LIMITS.map((m) => `<option value="${m}" ${m === x.limit ? 'selected' : ''}>${m ? 'Limit ' + dur(m * 60) : 'No daily limit'}</option>`).join('')}${x.limit && !LIMITS.includes(x.limit) ? `<option selected value="${x.limit}">Limit ${dur(x.limit * 60)}</option>` : ''}</select>
        </div>`;
      }).join('');
      $$('.site').forEach((row) => {
        const x = r.sites[+row.dataset.i];
        row.querySelector('select').onchange = async (e) => { await noam.invoke('screentime:set-limit', { key: x.key, minutes: +e.target.value }); render(); };
        row.querySelector('.n').style.cursor = x.url ? 'pointer' : '';
        row.querySelector('.n').onclick = () => { if (x.url) location.href = x.url; };
      });
    }
    $('#enabled').setAttribute('aria-checked', String(r.enabled));
  }
  $$('#range button').forEach((b) => (b.onclick = () => { range = b.dataset.r; $$('#range button').forEach((x) => x.classList.toggle('on', x === b)); render(); }));
  $('#enabled').onclick = async () => { const on = $('#enabled').getAttribute('aria-checked') !== 'true'; s = await noam.invoke('settings:set', { screenTime: { enabled: on } }); render(); };
  $('#clear').onclick = async () => { if (confirm('Delete all screen time history?')) { await noam.invoke('screentime:clear'); render(); } };
  $('#csv').onclick = async () => {
    const csv = await noam.invoke('screentime:csv');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'screen-time.csv'; a.click();
  };
  render();
  setInterval(() => { if (document.visibilityState === 'visible') render(); }, 30000);
})();
