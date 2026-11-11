// Service worker CABINA: приложение работает без интернета после первого открытия.
// Пользовательские данные (IndexedDB) service worker не трогает.
const VERSION = 'cabina-v2.28.1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/boot.js', 'js/app.js', 'js/ui.js', 'js/store.js', 'js/db.js', 'js/calc.js', 'js/checks.js', 'js/remind.js', 'js/depot.js', 'js/table.js', 'js/calendar.js', 'js/forms.js', 'js/docs.js', 'js/backup.js', 'js/sun.js', 'js/tour.js', 'js/tours.js',
  'js/pay.js', 'js/rest.js', 'js/work.js', 'js/profile.js', 'js/stats.js', 'js/fix.js', 'js/career.js', 'js/med.js', 'js/slip.js', 'js/search.js', 'js/phones.js', 'js/day.js', 'js/account.js', 'js/auth.js', 'js/legal.js', 'js/money.js', 'js/lock.js', 'js/recap.js', 'js/year.js', 'js/avatar.js', 'js/avatar-edit.js', 'js/colleagues.js', 'js/pull.js', 'js/awards.js', 'js/share.js', 'js/help.js', 'js/invites.js', 'js/guest.js', 'js/groups.js', 'js/grp-pic.js', 'js/ideas.js', 'js/notices.js', 'js/learn-state.js', 'js/learn.js', 'js/learn-play.js', 'js/learn-art.js', 'js/learn/pte.js', 'js/learn/pte-q01.js', 'js/learn/pte-q02.js', 'js/learn/pte-q03.js', 'js/learn/pte-q04.js', 'js/learn/pte-q05.js', 'js/learn/pte-q06.js', 'js/learn/pte-q07.js', 'js/learn/pte-q08.js', 'js/learn/pte-q09.js', 'js/learn/pte-q10.js', 'js/learn/pte-q11.js', 'js/learn/pte-q12.js', 'js/learn/pte-q13.js', 'js/learn/pte-q14.js', 'js/learn/pte-q15.js', 'js/learn/pte-q16.js', 'js/learn/pte-q17.js', 'js/vendor/qrcode.js', 'js/vendor/jsqr.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-192.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
  'icons/awards/first.webp', 'icons/awards/s50.webp', 'icons/awards/s300.webp', 'icons/awards/s1000.webp', 'icons/awards/iron.webp', 'icons/awards/rocket.webp', 'icons/awards/heavy.webp', 'icons/awards/loco.webp', 'icons/awards/k10.webp', 'icons/awards/earth.webp', 'icons/awards/k100.webp', 'icons/awards/moon.webp', 'icons/awards/hours.webp', 'icons/awards/owl.webp', 'icons/awards/lark.webp', 'icons/awards/cabin.webp', 'icons/awards/wait.webp', 'icons/awards/pass.webp', 'icons/awards/newyear.webp', 'icons/awards/holiday.webp', 'icons/awards/account.webp', 'icons/awards/mentor.webp', 'icons/awards/idea.webp',
  'icons/learn/pte-course.webp',
  'icons/learn/road-bg.webp',
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
  if (url.pathname.endsWith('/data/changelog.json')) return; // список изменений — всегда с сервера

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
