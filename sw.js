// Guarda la app en el iPhone para que abra sin Internet. Cambiar VERSION en cada actualización.
const VERSION = 'arrendos-0.2.2';
const ARCHIVOS = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css', 'js/main.js', 'js/db.js', 'js/ui.js',
  'js/vistas.js', 'js/calculos.js', 'js/copias.js', 'js/formato.js', 'js/registros.js', 'js/formularios.js',
  'iconos/icono-180.png', 'iconos/icono-192.png', 'iconos/icono-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Primero lo guardado (funciona sin Internet); si hay conexión, actualiza en segundo plano.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const guardado = await cache.match(e.request, { ignoreSearch: true });
    const red = fetch(e.request).then((r) => { if (r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => guardado);
    return guardado || red;
  }));
});
