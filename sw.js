// ═══ PRONET · Service Worker ═══
// Cachea el "shell" de la app para que abra al instante y funcione offline.
//
// IMPORTANTE al actualizar la app: subí una versión nueva cambiando el número
// de CACHE_VERSION. Eso invalida el caché viejo y los usuarios reciben la
// versión nueva en la próxima apertura.
const CACHE_VERSION = 'pronet-v45'; // v45: no interceptar externos (CSP connect-src) · v43: roles y separación admin ·  v16: fix ID duplicado np-titulo · v10: network-first para JS/CSS/HTML (fin del Ctrl+Shift+R en dev)

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './datos.js',
  './config.js',
  './manifest.json',
  './iconos/favicon.ico',
  './iconos/icon-192.png',
  './iconos/icon-512.png',
  './iconos/icon-512-maskable.png',
  './iconos/icon-180.png',
];

// Instalación: precachear el shell completo
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

// Activación: borrar cachés de versiones anteriores
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Estrategia:
// - Shell propio → cache-first (velocidad y offline)
// - Recursos externos (Google Fonts) → network-first con fallback a caché
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const esPropio = url.origin === self.location.origin;

  if (esPropio) {
    // Código de la app (HTML/JS/CSS/SQL) → RED-PRIMERO.
    // Así cualquier cambio se ve en la próxima apertura sin Ctrl+Shift+R.
    // El caché queda como respaldo solo cuando no hay conexión.
    // Estáticos que no cambian (íconos, imágenes, manifest) → CACHÉ-PRIMERO (velocidad).
    const archivo = url.pathname.split('/').pop();
    const esEstatico = /\.(png|jpg|jpeg|svg|ico|webp|woff2?|ttf)$/i.test(archivo) || archivo === 'manifest.json';

    if (!esEstatico) {
      // Network-first para todo el código
      event.respondWith(
        fetch(req).then((res) => {
          const copia = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copia));
          return res;
        }).catch(() => caches.match(req))
      );
      return;
    }
    // Cache-first para estáticos (velocidad y offline)
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copia = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, copia));
        return res;
      }))
    );
  }
  // Recursos externos (Google Fonts, CDN de supabase-js): no interceptar.
  // Un fetch() desde el SW se evalúa contra connect-src, más restrictivo que
  // el script-src/style-src que aplica cuando los carga la página directo.
});

// ═══ Notificaciones Push ═══
// El payload viene de la Edge Function 'enviar-push': {titulo, cuerpo, url}
self.addEventListener('push', (event) => {
  let datos = { titulo: 'PRONET', cuerpo: '', url: '/' };
  try { if (event.data) datos = { ...datos, ...event.data.json() }; } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(datos.titulo, {
      body: datos.cuerpo,
      icon: './iconos/icon-192.png',
      badge: './iconos/icon-192.png',
      data: { url: datos.url },
      tag: 'pronet-push', // reemplaza la anterior en vez de apilar
    })
  );
});

// Al tocar la notificación: enfocar la app si está abierta, o abrirla
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const c of lista) {
        if ('focus' in c) { c.navigate(destino); return c.focus(); }
      }
      return clients.openWindow(destino);
    })
  );
});
