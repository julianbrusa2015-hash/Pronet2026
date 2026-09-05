#!/usr/bin/env node
// ═══ PRONET · build para Netlify ═══
//
// Arma dist/ con SÓLO lo que la app necesita en el browser, y Netlify publica
// esa carpeta.
//
// Antes no había `publish` en netlify.toml, así que Netlify servía la raíz del
// repo entera: los 183 .sql con el esquema y las policies de RLS, el código de
// las Edge Functions que cobran, los tests, los scripts y las notas del
// proyecto quedaban descargables por cualquiera desde el sitio público.
// Secretos no había —.env, config-secrets.js y el keystore están en
// .gitignore— pero publicar el esquema completo le ahorra la mitad del trabajo
// a cualquiera que quiera atacar la base, y dejaba la trampa armada para el
// día que alguien agregue un archivo sensible sin pensarlo.
//
// Es una lista blanca a propósito: un archivo nuevo NO se publica hasta que
// alguien lo agregue acá. Al revés —una lista negra— cada archivo que se suma
// al repo queda expuesto hasta que alguien se acuerde de bloquearlo.
//
// Ojo, no es la misma lista que scripts/sync-www.js: ese arma el payload de
// Capacitor, que deja sw.js afuera a propósito porque dentro del WebView las
// push van por FCM nativo. Acá sw.js SÍ va: es lo que hace que la PWA del
// browser funcione offline y se actualice.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const ARCHIVOS = [
  'index.html',
  'app.js',
  'datos.js',
  'config.js',
  'styles.css',
  'manifest.json',
  'sw.js',
];
const CARPETAS = ['iconos'];

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

let faltantes = [];
for (const archivo of ARCHIVOS) {
  const origen = path.join(ROOT, archivo);
  if (!fs.existsSync(origen)) { faltantes.push(archivo); continue; }
  fs.copyFileSync(origen, path.join(DIST, archivo));
}

// Un archivo de la lista que no existe es un error de build, no un aviso: si
// falta index.html o sw.js el deploy sale roto y nadie se entera hasta que un
// usuario abre la app.
if (faltantes.length) {
  console.error('[build-web] FALTAN archivos de la lista:', faltantes.join(', '));
  process.exit(1);
}

for (const carpeta of CARPETAS) {
  const origen = path.join(ROOT, carpeta);
  if (!fs.existsSync(origen)) {
    console.error('[build-web] FALTA la carpeta ' + carpeta);
    process.exit(1);
  }
  fs.cpSync(origen, path.join(DIST, carpeta), { recursive: true });
}

console.log('[build-web] dist/ con ' + ARCHIVOS.length + ' archivos y ' +
  CARPETAS.length + ' carpeta(s)');
