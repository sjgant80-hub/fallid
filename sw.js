// FallID service worker · cache-first for shell, network-fallback
const CACHE = 'fallid-v1';
const ASSETS = ['./', './index.html', './fallid.js', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const clone = res.clone();
      if (res.ok) caches.open(CACHE).then(c => c.put(e.request, clone));
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
