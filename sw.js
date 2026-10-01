// Офлайн-кэш: история и картинки доступны без сети.
// Распознавание речи сетью всё равно пользуется — оно идёт через серверы Google.
const CACHE = 'comic-v9';
const ASSETS = [
  './',
  './index.html',
  './comics.json',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/voice.js',
  './js/match.js',
  './js/tasks.js',
  './js/stage.js',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/bg/far-forest.webp',
  './assets/bg/far-hills.webp',
  './assets/bg/near-burrow.svg',
  './assets/bg/near-forest.svg',
  './assets/bg/near-glade.svg',
  './assets/bg/near-oak.svg',
  './assets/bg/near-river.svg',
  './assets/bg/sky.webp',
  './assets/bg/stars.svg',
  './assets/char/beaver.svg',
  './assets/char/firefly.svg',
  './assets/char/hedgehog.svg',
  './assets/char/owl.svg',
  './assets/covers/hedgehog.webp',
  './assets/covers/minecraft.webp',
  './assets/mc/cow.svg',
  './assets/mc/creeper.svg',
  './assets/mc/far-cave.webp',
  './assets/mc/far-hills.webp',
  './assets/mc/moon-night.svg',
  './assets/mc/near-build.svg',
  './assets/mc/near-cave.svg',
  './assets/mc/near-craft.svg',
  './assets/mc/near-forest.svg',
  './assets/mc/near-house.svg',
  './assets/mc/sky-day.webp',
  './assets/mc/sky-night.webp',
  './assets/mc/sky-sunset.webp',
  './assets/mc/steve.svg',
  './assets/mc/sun-day.svg',
  './assets/mc/sun-sunset.svg',
  './stories/hedgehog.json',
  './stories/minecraft.json',
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
