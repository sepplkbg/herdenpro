const CACHE = 'herdenpro-v320';

// Relative Pfade → funktioniert unter /herdenpro/ UND /HerdenPro-Falkaunsalm/
const SHELL_FILES = [
  './',
  'index.html',
  'manifest.json',
  'icon.svg',
  'styles.css',
  'app-core.js',
  'app-icons.js',
  'app-auth-refresh.js',
  'app-features.js',
  'app-views.js',
  'app-milch-v2.js',
  'app-milch-xlsx.js',
  'app-milch-screenshot.js',
  'app-milchsperre.js',
  'app-milestone.js',
  'app-onboarding.js',
  'app-suche.js',
  'app-sennerei.js',
  'app-sennerei-produktion.js',
  'app-sennerei-verkauf.js',
  'app-saisonabschluss.js',
  'app-email-send.js',
  'app-env-switch.js',
  'app-install.js'
];
const SCOPE = self.registration.scope;               // z.B. https://sepplkbg.github.io/herdenpro/
const SHELL = SHELL_FILES.map(f => new URL(f, SCOPE).href);
const INDEX_URL = new URL('index.html', SCOPE).href;

// Install: jede Datei EINZELN cachen — eine fehlende Datei darf nicht alles abbrechen
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.allSettled(SHELL.map(url =>
        fetch(url, { cache: 'no-store' }).then(r => { if(r && r.ok) return c.put(url, r); })
      ))
    )
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
  if(e.request.method !== 'GET') return;

  // Firebase Realtime DB + Auth: NIE cachen
  if(
    url.includes('firebaseio.com') ||
    url.includes('firebasedatabase.app') ||
    url.includes('identitytoolkit.googleapis.com') ||
    url.includes('securetoken.googleapis.com')
  ) return;

  // Live-Daten: nicht cachen
  if(url.includes('openmeteo') || url.includes('open-meteo') || url.includes('qrserver')) return;

  // Externe Libraries + Iconify: stale-while-revalidate
  if(
    url.includes('gstatic.com/firebasejs') ||
    url.includes('unpkg.com/leaflet') ||
    url.includes('cdn.jsdelivr.net') ||
    url.includes('cdnjs.cloudflare.com') ||
    url.includes('code.iconify.design') ||
    url.includes('api.iconify.design') ||
    url.includes('api.simplesvg.com') ||
    url.includes('api.unisvg.com')
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

  // App-Kern-Dateien: network-first, Cache als Offline-Fallback
  const isCritical = /\/(index\.html|app[a-z0-9\-]*\.js|styles\.css|sw\.js|manifest\.json)(\?.*)?$/i.test(url) || url === SCOPE || url.startsWith(SCOPE + '?');
  if(isCritical) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(response => {
          if(response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(e.request, { ignoreSearch: true })
            .then(r => r || caches.match(INDEX_URL) || caches.match(SCOPE))
        )
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

self.addEventListener('message', e => {
  if(e.data === 'skipWaiting') self.skipWaiting();
});
