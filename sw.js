const CACHE = 'herdenpro-v25';
const SHELL = ['./', './index.html'];

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
  if(url.hostname.includes('firebasedatabase') || url.hostname.includes('googleapis') || url.hostname.includes('gstatic') || url.hostname.includes('cdnjs')) return;
  // Network first for HTML, cache fallback
  if(url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('/herdenpro') || url.pathname.endsWith('/herdenpro/')) {
    e.respondWith(
      fetch(e.request)
        .then(r => { caches.open(CACHE).then(c=>c.put(e.request,r.clone())); return r; })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
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

self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'HerdenPro', {
      body: data.body || '', tag: data.tag || 'herdenpro'
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('./'));
});
