const CACHE = 'herdenpro-v26';
const SHELL = [
  '/herdenpro/',
  '/herdenpro/index.html',
  '/herdenpro/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Network first for Firebase, cache first for shell
  if(e.request.url.includes('firebase') || e.request.url.includes('googleapis')) {
    return; // Let Firebase handle its own requests
  }
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request).then(r => r || caches.match('/herdenpro/index.html')))
  );
});
