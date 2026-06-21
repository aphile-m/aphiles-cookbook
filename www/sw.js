/* Service worker for the installable web app. Network-first for same-origin
   requests (so updates land on reload), falling back to cache when offline.
   Cross-origin requests (Google Fonts, the Anthropic API, GitHub releases) are
   left untouched. Bump CACHE to invalidate old caches on a new release. */
const CACHE = 'cookbook-v15';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== location.origin) return; // don't touch fonts/API/releases
  e.respondWith(
    fetch(req)
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then(m => m || caches.match('./index.html')))
  );
});
