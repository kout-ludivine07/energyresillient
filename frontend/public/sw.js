const CACHE = 'energyresilient-shell-v1';
const SHELL = ['/', '/manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).pathname.startsWith('/api/')) return;
  event.respondWith(fetch(req).then(res => {
    const copy = res.clone(); caches.open(CACHE).then(cache => cache.put(req, copy)); return res;
  }).catch(() => caches.match(req).then(cached => cached || caches.match('/'))));
});
