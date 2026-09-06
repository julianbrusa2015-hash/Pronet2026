#!/usr/bin/env node
// ═══ PRONET · generar todos los tamaños de ícono desde un SVG ═══
//
//   node scripts/gen-iconos.js
//
// Fuente única: iconos/pronet-isotipo-red.svg. Si el ícono cambia, se edita
// ese archivo y se vuelve a correr esto — no se retocan PNGs a mano.
//
// Rasteriza con el Chromium que ya trae Playwright (está por los tests), así
// que no hace falta instalar ninguna librería de imágenes.
//
// Genera tres familias, que NO son intercambiables:
//
//  1. mipmap-*/ic_launcher.png y _round.png — el ícono "legacy", para
//     launchers anteriores a Android 8. Lleva el fondo incluido.
//  2. mipmap-*/ic_launcher_foreground.png — la capa de adelante del ícono
//     ADAPTATIVO. Va con fondo TRANSPARENTE y el dibujo achicado al 66% del
//     lienzo: Android recorta el resto con la máscara del launcher (círculo,
//     squircle, gota...). Si el arte ocupa todo, se come los bordes.
//     El fondo de esa capa es drawable/ic_launcher_background.xml.
//  3. iconos/icon-*.png — los de la PWA.

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'iconos', 'pronet-isotipo-red.svg');

// Densidades de Android. El legacy es 48dp y el foreground adaptativo 108dp.
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

function svgFuente() {
  return fs.readFileSync(SRC, 'utf8');
}

/** El SVG entero, con su fondo. Para el ícono legacy y para la PWA. */
function conFondo(svg, redondo) {
  if (!redondo) return svg;
  // El _round lo pinta el launcher recortado en círculo, pero algunos
  // fabricantes usan el PNG tal cual: se le da el radio máximo para que no
  // quede un cuadrado con esquinas vivas dentro de un hueco redondo.
  return svg.replace(/rx="118"/, 'rx="256"');
}

/** Sólo el dibujo, sin fondo y encogido al 66%. Para el adaptativo. */
function soloArte(svg) {
  const sinFondo = svg.replace(/<rect[^>]*fill="url\(#gRed\)"[^>]*\/>/, '');
  // 0.66 es la zona segura del ícono adaptativo de Android; el 17% de cada
  // lado que queda afuera es lo que la máscara puede llegar a comerse.
  return sinFondo.replace(
    /<g transform="translate\(60,100\) scale\(3\.3\)">/,
    '<g transform="translate(256,256) scale(0.66) translate(-256,-256)">' +
    '<g transform="translate(60,100) scale(3.3)">'
  ).replace(/<\/svg>\s*$/, '</g></svg>');
}

async function pintar(page, svg, tam, transparente) {
  await page.setViewportSize({ width: tam, height: tam });
  await page.setContent(
    '<style>html,body{margin:0;padding:0;background:' +
    (transparente ? 'transparent' : '#fff') + '}svg{display:block;width:' +
    tam + 'px;height:' + tam + 'px}</style>' + svg
  );
  return page.screenshot({ omitBackground: !!transparente });
}

function guardar(destino, buffer) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, buffer);
  console.log('  ' + path.relative(ROOT, destino).replace(/\\/g, '/') +
    '  (' + Math.round(buffer.length / 1024) + ' KB)');
}

(async () => {
  if (!fs.existsSync(SRC)) {
    console.error('No encuentro ' + SRC);
    process.exit(1);
  }
  const svg = svgFuente();
  const navegador = await chromium.launch();
  const page = await navegador.newPage();

  console.log('Android — ícono legacy (con fondo):');
  for (const [dens, f] of Object.entries(DENS)) {
    const tam = Math.round(48 * f);
    guardar(path.join(ROOT, 'android/app/src/main/res/mipmap-' + dens, 'ic_launcher.png'),
      await pintar(page, conFondo(svg, false), tam, false));
    guardar(path.join(ROOT, 'android/app/src/main/res/mipmap-' + dens, 'ic_launcher_round.png'),
      await pintar(page, conFondo(svg, true), tam, true));
  }

  console.log('Android — capa de adelante del adaptativo (transparente):');
  const arte = soloArte(svg);
  for (const [dens, f] of Object.entries(DENS)) {
    const tam = Math.round(108 * f);
    guardar(path.join(ROOT, 'android/app/src/main/res/mipmap-' + dens, 'ic_launcher_foreground.png'),
      await pintar(page, arte, tam, true));
  }

  console.log('PWA:');
  for (const [archivo, tam] of [['icon-180.png', 180], ['icon-192.png', 192],
                                ['icon-512.png', 512], ['icon-512-maskable.png', 512]]) {
    guardar(path.join(ROOT, 'iconos', archivo), await pintar(page, svg, tam, false));
  }

  await navegador.close();
  console.log('\nListo. Acordate de correr `npm run cap:sync` antes de compilar el APK.');
})();
