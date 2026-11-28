/*
 * Service worker: guarda la app en el dispositivo para que abra y funcione SIN conexión.
 *
 *  - Archivos de la app: se sirven desde la copia local y se actualizan en segundo plano.
 *  - /api y /webhook: nunca se cachean (los datos vienen de IndexedDB y de la sincronización).
 *
 * La versión de abajo la reemplaza scripts/build-web.mjs en cada compilación: al cambiarla,
 * el navegador descarta la copia vieja y baja la nueva.
 */
const VERSION = '__VERSION__';
const CACHE = `finanzas-${VERSION}`;
const ARCHIVOS = ['./', './index.html', './app.js', './tema.js', './styles.css', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', evento => {
  evento.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', evento => {
  evento.waitUntil(
    caches.keys()
      .then(nombres => Promise.all(nombres.filter(n => n.startsWith('finanzas-') && n !== CACHE).map(n => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

// Avisos del servidor: llegan cifrados y el navegador los descifra solo; aquí solo se muestran.
self.addEventListener('push', evento => {
  let aviso = { titulo: 'Tus finanzas', cuerpo: '' };
  try { aviso = { ...aviso, ...evento.data.json() }; } catch { /* aviso sin datos */ }
  // la pantalla de bloqueo la ve cualquiera: si un aviso trajera montos, solo se muestra que hay algo (el Worker ya manda textos genéricos)
  if (/[$€]|\d[\d.,]{2,}|\d\s?(?:k|mil|lucas?)\b/i.test(`${aviso.titulo} ${aviso.cuerpo}`)) aviso = { titulo: 'Tienes un aviso', cuerpo: 'Ábrelo en la app para verlo.' };
  evento.waitUntil(self.registration.showNotification(aviso.titulo, { body: aviso.cuerpo, icon: './icon-192.png', badge: './icon-192.png' }));
});

self.addEventListener('notificationclick', evento => {
  evento.notification.close();
  evento.waitUntil(self.clients.matchAll({ type: 'window' }).then(ventanas => (ventanas[0] ? ventanas[0].focus() : self.clients.openWindow('./?accion=gasto'))));
});

self.addEventListener('fetch', evento => {
  const req = evento.request;
  const url = new URL(req.url);

  // «Compartir» desde otra app (Nequi, la galería): la imagen se guarda aparte y se abre la app, que la lee con la IA
  if (req.method === 'POST' && url.pathname.endsWith('/compartir')) {
    evento.respondWith((async () => {
      try {
        const datos = await req.formData();
        const archivo = datos.get('imagen');
        if (archivo && typeof archivo !== 'string') await (await caches.open('finanzas-compartido')).put('./imagen', new Response(archivo));
      } catch { /* sin imagen: se abre la app igual */ }
      return Response.redirect('./?compartido=1', 303);
    })());
    return;
  }
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/webhook/')) return;

  // Copia local primero; en paralelo se pide la nueva para la próxima vez.
  evento.respondWith(
    caches.open(CACHE).then(async cache => {
      const guardada = await cache.match(req, { ignoreSearch: true });
      const red = fetch(req).then(r => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
      return guardada || (await red) || (req.mode === 'navigate' ? cache.match('./index.html') : Response.error());
    }),
  );
});
