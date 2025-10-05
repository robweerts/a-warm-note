/* sw.js — robuuste pre-cache + cache-first fetch
   - Geen cache.addAll (één 404 mag installatie niet breken)
   - Querystrings tolerant (ignoreSearch bij match)
   - Alles in root: gebruik absolute paden
*/

const SW_VERSION  = 'v2025-10-05-1';         // ← bump dit bij elke release
const CACHE_NAME  = 'awn-' + SW_VERSION; 

// Alleen assets die écht bestaan in productie en same-origin zijn:
const PRECACHE_URLS = [
  '/',                 // voor navigatie fallback
  '/index.html',
  '/styles.css',
  '/download.js',
  '/mail.js',
  '/whatsapp.js',
  '/data/messages.en.json',
  '/data/messages.nl.json',
  // Voeg hier evt. icons/fonts/images toe, bv. '/favicon.ico', '/icon-192.png', etc.
];

// -------- Install: prefetch elk item veilig (zonder addAll) --------
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    for (const url of PRECACHE_URLS) {
      try {
        // Vers van het netwerk; SW mag geen mixed-content/http cachen op https
        const resp = await fetch(url, { cache: 'no-store' });
        // Sla alleen bruikbare responses op
        if (resp && (resp.ok || resp.type === 'opaque')) {
          await cache.put(url, resp.clone());
        } else {
          console.warn('[sw] skip pre-cache', url, resp && resp.status);
        }
      } catch (err) {
        console.warn('[sw] pre-cache error', url, err);
      }
    }

    await self.skipWaiting();
  })());
});

// -------- Activate: oude caches weg + direct controle --------
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.map(n => (n === CACHE_NAME ? Promise.resolve() : caches.delete(n)))
    );
    await self.clients.claim();
  })());
});

// -------- Fetch: cache-first met nette fallbacks --------
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Navigatieverzoeken (documenten): network-first met index.html fallback
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        return net;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        const index = await cache.match('/index.html', { ignoreSearch: true });
        return index || new Response('', { status: 504, statusText: 'Offline' });
      }
    })());
    return;
  }

  // Overige GETs: cache-first, dan network (+ runtime bij same-origin cachen)
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Belangrijk: ignoreSearch zodat '/data/messages.nl.json?ts=...' matcht
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;

    try {
      const net = await fetch(req);
      // Runtime-cachen alleen same-origin en ok
      if (net.ok && new URL(req.url).origin === self.location.origin) {
        cache.put(req, net.clone()).catch(() => {});
      }
      return net;
    } catch {
      // Fallback voor asset-requests: niets of evt. een lege 504
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});

// Optioneel: direct updaten zonder herladen (postMessage('SKIP_WAITING'))
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});