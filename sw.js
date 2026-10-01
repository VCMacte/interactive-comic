// Офлайн-кэш: история и картинки доступны без сети.
// Распознавание речи сетью всё равно пользуется — оно идёт через серверы Google.
const CACHE = 'comic-v6';
const ASSETS = [
  './',
  './index.html',
  './story.json',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/voice.js',
  './js/match.js',
  './js/tasks.js',
  './js/stage.js',
  './assets/bg/far-forest.svg',
  './assets/bg/far-forest.webp',
  './assets/bg/far-hills.svg',
  './assets/bg/far-hills.webp',
  './assets/bg/near-burrow.svg',
  './assets/bg/near-forest.svg',
  './assets/bg/near-glade.svg',
  './assets/bg/near-oak.svg',
  './assets/bg/near-river.svg',
  './assets/bg/sky.svg',
  './assets/bg/sky.webp',
  './assets/bg/stars.svg',
  './assets/char/beaver.svg',
  './assets/char/firefly.svg',
  './assets/char/hedgehog.svg',
  './assets/char/owl.svg',
  './assets/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
