/* Service worker for the Kundali PWA.
   Strategy:
   - HTML/manifest: network-first (so pushed updates are picked up when online),
     falling back to cache when offline.
   - Swiss Ephemeris engine files + icons: cache-first (they rarely change, and
     this is what actually makes chart calculation work with no connection at all).
   - Everything else (e.g. the jsPDF/jsPDF-AutoTable CDN scripts used only when
     the user taps "Download PDF"): left untouched, straight to network — PDF
     export already requires internet by design, same as before.
   Bump CACHE_VERSION whenever kundali.html or the engine files change, so old
   clients pick up the new version instead of being stuck on a stale cache. */

const CACHE_VERSION = 'kundali-v1';
const APP_SHELL = [
  './kundali.html',
  './manifest.json',
  './js/swisseph/swisseph-browser.js',
  './js/swisseph/swisseph.js',
  './js/swisseph/swisseph.wasm',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isAppShellAsset(url) {
  return APP_SHELL.some((path) => url.pathname.endsWith(path.replace('./', '/')));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never intercept cross-origin (CDN) requests

  const isHtmlOrManifest = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/manifest.json');

  if (isHtmlOrManifest) {
    // Network-first: always try to get the latest page/manifest when online.
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then((cached) => cached || caches.match('./kundali.html')))
    );
    return;
  }

  if (isAppShellAsset(url)) {
    // Cache-first: the engine/icons rarely change, and this is what keeps
    // chart calculation fully working with zero connection.
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        return res;
      }))
    );
  }
});
