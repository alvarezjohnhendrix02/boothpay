/* Service worker: keeps a full copy of the app on the device so it opens with no internet.
   Change VERSION on every release; phones then download the new copy and show "New version — tap to update". */
const VERSION = 'cs-2026-11-19b';
const FILES = [
  './', 'index.html', 'pos.html', 'admin.html', 'manifest.json',
  'css/tokens.css', 'css/ui.css', 'css/admin.css',
  'js/util.js', 'js/ui.js', 'js/csv.js', 'js/seed.js', 'js/store.js', 'js/sync.js', 'js/pwa.js', 'js/pin.js', 'js/demo.js',
  'js/login.js', 'js/stock.js', 'js/expenses.js', 'js/customer.js', 'js/queue.js', 'js/closeout.js', 'js/pos.js', 'js/admin.js', 'js/team.js', 'js/booths.js', 'js/people.js', 'js/xlsx.js', 'js/pms.js', 'js/import.js', 'js/reports.js',
  'assets/fonts/varelaround-400.ttf', 'assets/fonts/plexmono-500.woff2',
  'assets/icons/icon-192.png', 'assets/icons/icon-512.png', 'assets/icons/icon-any-512.png', 'assets/icons/apple-touch-icon.png', 'assets/icons/favicon-64.png',
];

self.addEventListener('install', e => {
  // cache: 'reload' skips the browser's HTTP cache so a new version never mixes in old files
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// The page asks for this when the user taps "Update"; never on its own, so a sale is never interrupted.
self.addEventListener('message', e => { if (e.data === 'update-now') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return; // Google Sheet calls go straight to the network
  e.respondWith(
    caches.open(VERSION).then(c => c.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok && res.type === 'basic') c.put(req, res.clone());
      return res;
    }).catch(() => req.mode === 'navigate' ? c.match('index.html') : Response.error())))
  );
});
