const CACHE = 'herdenpro-v101';
const SHELL = [
  '/herdenpro/',
  '/herdenpro/manifest.json'
];

// Bei jedem Install sofort übernehmen, alte Caches löschen
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => null))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Firebase & externe APIs: nie anfassen
  if(
    e.request.url.includes('firebase') ||
    e.request.url.includes('googleapis') ||
    e.request.url.includes('openmeteo') ||
    e.request.url.includes('open-meteo') ||
    e.request.url.includes('qrserver')
  ) {
    return;
  }

  // index.html, app-*.js, styles.css IMMER frisch aus dem Netz holen
  // (network-first ohne Cache-Speicherung) – damit Updates sofort durchschlagen.
  const url = e.request.url;
  const isCritical = /\/(index\.html|app-[a-z]+\.js|styles\.css|sw\.js|manifest\.json)$/i.test(url) || url.endsWith('/herdenpro/');
  if(isCritical) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .catch(() => caches.match(e.request).then(r => r || caches.match('/herdenpro/index.html')))
    );
    return;
  }

  // Andere Assets: stale-while-revalidate
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fresh = fetch(e.request).then(response => {
        if(response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});

// Erlaube manuelles Skip-Waiting via postMessage (für Debug)
self.addEventListener('message', e => {
  if(e.data === 'skipWaiting') self.skipWaiting();
});
