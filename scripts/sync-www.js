// Copia el código web (raíz del repo, lo que sirve Netlify) a www/, que es
// el webDir que usa Capacitor para empaquetar las apps nativas.
//
// Por qué una copia y no mover los archivos: la raíz del repo es la PWA que
// ya está en producción en Netlify. Moverla rompería ese deploy. www/ es
// exclusivo de las builds de Capacitor — correr este script antes de
// `npx cap sync` para que la app nativa lleve la versión más reciente.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');

const ARCHIVOS = [
  'index.html', 'app.js', 'datos.js', 'config.js', 'styles.css', 'manifest.json',
];
const CARPETAS = ['iconos'];

// sw.js queda afuera: dentro del WebView de Capacitor las notificaciones
// push van por @capacitor/push-notifications (FCM nativo), no por Web Push.
// Si en algún momento se decide mantener el Service Worker para cachear
// dentro de la app nativa también, agregarlo acá.

fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });

for (const archivo of ARCHIVOS) {
  fs.copyFileSync(path.join(ROOT, archivo), path.join(WWW, archivo));
}
for (const carpeta of CARPETAS) {
  fs.cpSync(path.join(ROOT, carpeta), path.join(WWW, carpeta), { recursive: true });
}

console.log(`[sync-www] Copiados ${ARCHIVOS.length} archivos y ${CARPETAS.length} carpetas a www/`);
