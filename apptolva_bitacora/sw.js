const CACHE_NAME = 'apptolva-v4-offline';
const ASSETS = [
  './',
  './index.html',
  './bitacora_master.html',
  './manifest.json',
  './js/tailwindcss.js',
  './js/confetti.min.js',
  './js/signature_pad.min.js',
  './js/jspdf.min.js',
  './js/qrcode.min.js',
  './css/fontawesome.min.css',
  './webfonts/fa-solid-900.woff2',
  './webfonts/fa-brands-400.woff2',
  './webfonts/fa-regular-400.woff2',
  './aceite2.jpg',
  './arco.jpg',
  './arco1.jpg',
  './atasco.jpg',
  './atras.jpg',
  './cable1.jpg',
  './des.jpg',
  './descfin.jpg',
  './final.jpg',
  './mangue.jpg',
  './manometros.jpg',
  './palancas.jpg',
  './peligro.jpg',
  './pto.jpg',
  './reg.jpg',
  './reg1.jpg',
  './silo.jpg',
  './suelo.jpg'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cacheando todo...');
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      })
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request).catch(() => {
          return new Response("Offline");
      });
    })
  );
});
