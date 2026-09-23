/* Sarh butcher dashboard SW: static assets only. Never touch /api or App Router data. */
const STATIC_CACHE = 'sarh-butcher-static-v3';
const BASE = new URL('.', self.location.href).pathname.replace(/\/$/, '');
const PRECACHE_URLS = [
  `${BASE}/offline.html`,
  `${BASE}/favicon.ico`,
  `${BASE}/favicon.png`,
  `${BASE}/apple-touch-icon.png`,
  `${BASE}/icons/icon-192.png`,
  `${BASE}/icons/icon-512.png`,
];

function shouldBypass(url, request) {
  if (request.method !== 'GET') return true;
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith('/api/')) return true;
  if (url.pathname.startsWith('/socket.io')) return true;
  if (url.searchParams.has('token')) return true;
  if (url.searchParams.has('_rsc')) return true;
  if (request.headers.get('RSC') === '1') return true;
  if (request.headers.get('Next-Router-Prefetch')) return true;
  if (request.mode === 'navigate') return true;
  if (request.destination === 'document') return true;
  return false;
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith(`${BASE}/_next/static/`) ||
    url.pathname.startsWith(`${BASE}/icons/`) ||
    url.pathname === `${BASE}/favicon.ico` ||
    url.pathname === `${BASE}/favicon.png` ||
    url.pathname === `${BASE}/apple-touch-icon.png` ||
    url.pathname === `${BASE}/offline.html` ||
    url.pathname === `${BASE}/manifest.webmanifest` ||
    url.pathname.startsWith('/_next/static/')
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (shouldBypass(url, request)) return;
  if (!isStaticAsset(url)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const networked = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networked;
    }),
  );
});
