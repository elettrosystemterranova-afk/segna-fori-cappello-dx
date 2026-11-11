// Service worker: l'app funziona anche senza rete (dopo la prima apertura).
// Strategia: prima la rete (così gli aggiornamenti arrivano subito), se manca la rete usa la copia salvata.
// Per forzare un aggiornamento della cache cambia VERSIONE.
const VERSIONE = 'segna-fori-v1';
const FILE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSIONE).then(c => c.addAll(FILE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  // Cancella le vecchie versioni della cache
  e.waitUntil(
    caches.keys()
      .then(nomi => Promise.all(nomi.filter(n => n !== VERSIONE).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(
    fetch(r)
      .then(risp => {
        if (risp.ok) {
          const copia = risp.clone();
          caches.open(VERSIONE).then(c => c.put(r, copia));
        }
        return risp;
      })
      .catch(() => caches.match(r, { ignoreSearch: true }).then(x => x || caches.match('./index.html')))
  );
});
