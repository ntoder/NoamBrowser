// Zmanim and Hebrew dates, calculated on this computer (NOAA solar algorithm,
// sea-level, GRA shaot zmaniyot). Accurate to about a minute — for halachic
// decisions, follow a local luach / your rav.
(function () {
  const rad = Math.PI / 180, deg = 180 / Math.PI;

  // UTC hours of the sun crossing `zenith` degrees on y-m-d at lat/lon.
  function sunUTC(y, m, d, lat, lon, zenith, rising) {
    const N = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
    const lngHour = lon / 15;
    const t = N + ((rising ? 6 : 18) - lngHour) / 24;
    const M = 0.9856 * t - 3.289;
    let L = M + 1.916 * Math.sin(M * rad) + 0.020 * Math.sin(2 * M * rad) + 282.634;
    L = ((L % 360) + 360) % 360;
    let RA = deg * Math.atan(0.91764 * Math.tan(L * rad));
    RA = ((RA % 360) + 360) % 360;
    RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
    const sinDec = 0.39782 * Math.sin(L * rad), cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(zenith * rad) - sinDec * Math.sin(lat * rad)) / (cosDec * Math.cos(lat * rad));
    if (cosH > 1 || cosH < -1) return null;
    const H = (rising ? 360 - deg * Math.acos(cosH) : deg * Math.acos(cosH)) / 15;
    const T = H + RA - 0.06571 * t - 6.622;
    return (((T - lngHour) % 24) + 24) % 24;
  }

  // y-m-d as seen in a time zone
  function ymdIn(tz, date = new Date()) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map((x) => [x.type, x.value]));
    return { y: +p.year, m: +p.month, d: +p.day };
  }
  function at(y, m, d, utcHours, refHour) {
    if (utcHours == null) return null;
    let date = new Date(Date.UTC(y, m - 1, d) + utcHours * 3600000);
    // the algorithm can wrap across UTC midnight; keep times on the right civil day
    if (refHour != null) { const diff = utcHours - refHour; if (diff > 12) date = new Date(date - 86400000); else if (diff < -12) date = new Date(+date + 86400000); }
    return date;
  }

  // opts.elevation: true = sunrise/sunset as seen from the place's height (city.elevation, metres);
  // default false = sea level, the same as timeanddate.com and most printed calendars.
  function zmanim({ lat, lon, tz, elevation = 0 }, date = new Date(), opts = {}) {
    const { y, m, d } = ymdIn(tz, date);
    const noonGuess = 12 - lon / 15;
    const h = opts.elevation && elevation > 0 ? elevation : 0;
    const horizon = 90.833 + 0.0347 * Math.sqrt(h); // dip of the horizon from height h
    const sr = at(y, m, d, sunUTC(y, m, d, lat, lon, horizon, true), noonGuess);
    const ss = at(y, m, d, sunUTC(y, m, d, lat, lon, horizon, false), noonGuess);
    const alot = at(y, m, d, sunUTC(y, m, d, lat, lon, 106.1, true), noonGuess);
    const misheyakir = at(y, m, d, sunUTC(y, m, d, lat, lon, 101.0, true), noonGuess);
    const tzeit = at(y, m, d, sunUTC(y, m, d, lat, lon, 98.5, false), noonGuess);
    if (!sr || !ss) return { polar: true };
    const hour = (ss - sr) / 12; // sha'ah zmanit (GRA)
    const plus = (h) => new Date(+sr + h * hour);
    return {
      alot, misheyakir, sunrise: sr,
      shma: plus(3), tefila: plus(4), chatzot: plus(6),
      minchaGedola: plus(6.5), minchaKetana: plus(9.5), plag: plus(10.75),
      sunset: ss, tzeit, shaahZmanitMin: hour / 60000,
    };
  }

  // ---------- Hebrew dates
  const LETTERS = [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'], [9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']];
  function gematria(n) {
    n = n % 1000; let s = '';
    while (n > 0) {
      if (n === 15) { s += 'טו'; break; } if (n === 16) { s += 'טז'; break; }
      for (const [v, l] of LETTERS) if (n >= v) { s += l; n -= v; break; }
    }
    return s.length === 1 ? s + '׳' : s.slice(0, -1) + '״' + s.slice(-1);
  }
  function hebrewDate(date = new Date(), tz) {
    const opts = { timeZone: tz, day: 'numeric', month: 'long', year: 'numeric' };
    const en = new Intl.DateTimeFormat('en-u-ca-hebrew', opts).formatToParts(date);
    const he = new Intl.DateTimeFormat('he-u-ca-hebrew', opts).formatToParts(date);
    const g = (parts, t) => (parts.find((p) => p.type === t) || {}).value;
    const day = parseInt(g(en, 'day'), 10), year = parseInt(g(en, 'year'), 10);
    const heMonth = (g(he, 'month') || '').replace(/^ב/, '');
    return { en: `${day} ${g(en, 'month')} ${year}`, he: `${gematria(day)} ${heMonth} ${gematria(year)}`, day, year, month: g(en, 'month') };
  }

  const api = { zmanim, hebrewDate, gematria, ymdIn };
  if (typeof module === 'object' && module.exports) module.exports = api; else window.NoamZmanim = api;
})();
