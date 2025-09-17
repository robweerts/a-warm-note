// sw.js — ultra light PWA cache
const VER = 'awn-v1';
const CORE = [
  '/', '/index.html', '/styles.css', '/script.js',
  '/messages.nl.json', '/mail.js', '/whatsapp.js', '/download.js'
];

self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open(VER).then(c=>c.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e)=>{
  e.waitUntil((async ()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k!==VER).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

// Cache-first voor alles uit CORE; network-first voor messages.nl.json (met fallback cache)
self.addEventListener('fetch', (e)=>{
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  if (CORE.some(p => url.pathname.endsWith(p) || url.pathname === p)) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
    return;
  }

  if (url.pathname.endsWith('/messages.nl.json')) {
    e.respondWith((async ()=>{
      try {
        const net = await fetch(e.request, { cache: 'no-store' });
        const cache = await caches.open(VER);
        cache.put(e.request, net.clone());
        return net;
      } catch {
        const cached = await caches.match(e.request);
        return cached || new Response(JSON.stringify({ lang:'nl', messages:[] }), { headers:{'Content-Type':'application/json'}});
      }
    })());
    return;
  }
});