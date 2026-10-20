// Service worker CABINA: приложение работает без интернета после первого открытия.
// Пользовательские данные (IndexedDB) service worker не трогает.
const VERSION = 'cabina-v1.4.0';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/ui.js', 'js/store.js', 'js/db.js', 'js/calc.js', 'js/calendar.js', 'js/forms.js', 'js/docs.js', 'js/backup.js', 'js/sun.js', 'js/tour.js', 'js/tours.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-192.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'data/calendar.json', 'fonts/onest.woff', 'fonts/unbounded.woff',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' — берём свежие файлы с сервера, а не из HTTP-кэша браузера
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'skip') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js')) return; // сам service worker не кэшируем

  // Календарь: сначала сеть (чтобы получать обновления), потом кэш
  if (url.pathname.endsWith('/data/calendar.json')) {
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req)));
    return;
  }

  // Навигация: оболочка приложения из кэша
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('index.html').then((hit) => hit || fetch(req)).catch(() => caches.match('./')));
    return;
  }

  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  })));
});
