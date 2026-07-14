const CACHE = 'herdenpro-v204';
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
  const url = e.request.url;

  // Firebase Realtime DB (WebSocket) und Auth-API: NIE cachen — braucht Live-Verbindung
  if(
    url.includes('firebaseio.com') ||
    url.includes('firebasedatabase.app') ||
    url.includes('identitytoolkit.googleapis.com') ||
    url.includes('securetoken.googleapis.com')
  ) {
    return;  // Browser default-handling
  }

  // Wetter-API und QR-Code-Generator: nicht cachen (Live-Daten)
  if(
    url.includes('openmeteo') ||
    url.includes('open-meteo') ||
    url.includes('qrserver')
  ) {
    return;
  }

  // Firebase SDK JS (gstatic.com/firebasejs) + externe Libraries (Leaflet, jsQR):
  // stale-while-revalidate → offline verfügbar
  if(
    url.includes('gstatic.com/firebasejs') ||
    url.includes('unpkg.com/leaflet') ||
    url.includes('cdn.jsdelivr.net') ||
    url.includes('cdnjs.cloudflare.com')
  ) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fresh = fetch(e.request).then(response => {
          if(response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return response;
        }).catch(() => cached);
        return cached || fresh;
      })
    );
    return;
  }

  // App-Kern-Dateien: network-first mit Cache-Fallback (auch für Offline-Nutzung!)
  const isCritical = /\/(index\.html|app-[a-z0-9\-]+\.js|styles\.css|sw\.js|manifest\.json)$/i.test(url) || url.endsWith('/herdenpro/');
  if(isCritical) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(response => {
          // Frische Version im Cache speichern für Offline-Fallback
          if(response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(e.request).then(r => r || caches.match('/herdenpro/index.html') || caches.match('/herdenpro/')))
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
