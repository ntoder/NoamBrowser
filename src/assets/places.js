// Built-in places for zmanim (work offline). Elevation in metres.
(function () {
  const IL = 'Asia/Jerusalem';
  const PLACES = [
    ['Jerusalem', 'ירושלים', 31.7690, 35.2163, 754, IL], ['Beit Shemesh', 'בית שמש', 31.7470, 34.9881, 300, IL],
    ['Ramat Beit Shemesh', 'רמת בית שמש', 31.7166, 34.9930, 340, IL], ['Bnei Brak', 'בני ברק', 32.0807, 34.8338, 30, IL],
    ['Tel Aviv', 'תל אביב', 32.0809, 34.7806, 20, IL], ['Petah Tikva', 'פתח תקווה', 32.0840, 34.8878, 50, IL],
    ['Modiin Illit', 'מודיעין עילית', 31.9330, 35.0410, 320, IL], ['Modiin', 'מודיעין', 31.8980, 35.0104, 250, IL],
    ['Beitar Illit', 'ביתר עילית', 31.6960, 35.1150, 750, IL], ['Elad', 'אלעד', 32.0522, 34.9510, 150, IL],
    ['Haifa', 'חיפה', 32.7940, 34.9896, 100, IL], ['Tzfat', 'צפת', 32.9646, 35.4960, 850, IL],
    ['Tiberias', 'טבריה', 32.7959, 35.5310, 0, IL], ['Netanya', 'נתניה', 32.3215, 34.8532, 30, IL],
    ['Ashdod', 'אשדוד', 31.8014, 34.6435, 30, IL], ['Beersheba', 'באר שבע', 31.2518, 34.7913, 260, IL],
    ['Efrat', 'אפרת', 31.6560, 35.1540, 900, IL], ['Eilat', 'אילת', 29.5577, 34.9519, 10, IL],
    ['Lakewood, NJ', '', 40.0821, -74.2097, 20, 'America/New_York'], ['Brooklyn, NY', '', 40.6782, -73.9442, 10, 'America/New_York'],
    ['Monsey, NY', '', 41.1112, -74.0685, 150, 'America/New_York'], ['Miami, FL', '', 25.7617, -80.1918, 2, 'America/New_York'],
    ['Toronto', '', 43.6532, -79.3832, 80, 'America/Toronto'], ['Los Angeles', '', 34.0522, -118.2437, 90, 'America/Los_Angeles'],
    ['London', '', 51.5074, -0.1278, 20, 'Europe/London'], ['Manchester', '', 53.4808, -2.2426, 40, 'Europe/London'],
    ['Antwerp', '', 51.2194, 4.4025, 10, 'Europe/Brussels'], ['Paris', '', 48.8566, 2.3522, 35, 'Europe/Paris'],
  ].map(([name, he, lat, lon, elevation, tz]) => ({ name, he, lat, lon, elevation, tz, country: tz === IL ? 'Israel' : '' }));
  const api = { PLACES, TIMEANDDATE: { Jerusalem: 'https://www.timeanddate.com/sun/israel/jerusalem' } };
  if (typeof module === 'object' && module.exports) module.exports = api; else window.NoamPlaces = api;
})();
