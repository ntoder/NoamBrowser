// Filter lists NoamBrowser blocks with. Fetched from GitHub mirrors so
// updates work even where easylist.to is unreachable.
const RAW = 'https://raw.githubusercontent.com';
exports.LISTS = [
  { id: 'easylist', name: 'EasyList (ads)', url: `${RAW}/easylist/easylist/gh-pages/easylist.txt` },
  { id: 'easyprivacy', name: 'EasyPrivacy (trackers)', url: `${RAW}/easylist/easylist/gh-pages/easyprivacy.txt` },
  { id: 'ubo-filters', name: 'uBlock filters', url: `${RAW}/uBlockOrigin/uAssets/master/filters/filters.txt` },
  { id: 'ubo-privacy', name: 'uBlock privacy', url: `${RAW}/uBlockOrigin/uAssets/master/filters/privacy.txt` },
  { id: 'ubo-quickfixes', name: 'uBlock quick fixes', url: `${RAW}/uBlockOrigin/uAssets/master/filters/quick-fixes.txt` },
  { id: 'ubo-badware', name: 'Malware & scam sites', url: `${RAW}/uBlockOrigin/uAssets/master/filters/badware.txt` },
  { id: 'ubo-unbreak', name: 'uBlock unbreak', url: `${RAW}/uBlockOrigin/uAssets/master/filters/unbreak.txt` },
  { id: 'fanboy-annoyance', name: 'Cookie banners & annoyances', url: `${RAW}/easylist/easylist/gh-pages/fanboy-annoyance.txt` },
];
