const CACHE = 'herdenpro-v72';
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
  // Firebase & externe APIs: nie cachen
  if(
    e.request.url.includes('firebase') ||
    e.request.url.includes('googleapis') ||
    e.request.url.includes('openmeteo') ||
    e.request.url.includes('open-meteo') ||
    e.request.url.includes('qrserver')
  ) {
    return;
  }

  // Shell-Dateien: Network-first, bei Fehler Cache
  e.respondWith(
    fetch(e.request)
      .then(response => {
        // Erfolgreiche Antwort im Cache speichern
        if(response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('/herdenpro/index.html')))
  );
});
