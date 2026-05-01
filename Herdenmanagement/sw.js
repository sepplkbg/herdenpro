const CACHE = 'herdenpro-v3';
const SHELL = ['/index.html', '/'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if(url.hostname.includes('firebasedatabase') || url.hostname.includes('googleapis')) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if(cached) return cached;
      return fetch(e.request)
        .then(response => {
          if(response && response.status===200 && response.type==='basic') {
            caches.open(CACHE).then(c => c.put(e.request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'));
    })
  );
});

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'HerdenPro', {
      body: data.body || '',
      tag: data.tag || 'herdenpro'
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/'));
});

self.addEventListener('message', e => {
  if(e.data && e.data.type === 'CHECK_WARTEZEITEN') {
    const faellig = e.data.faellig || [];
    faellig.forEach(item => {
      self.registration.showNotification('HerdenPro: ' + item.medikament, {
        body: item.kuhName + ' #' + item.kuhNr,
        tag: 'wartezeit-' + item.id
      });
    });
  }
});
