// Regenera iconos/favicon.ico desde iconos/pronet-isotipo.svg.
//
// No hay librería de imágenes en el proyecto (sharp, jimp, etc.) y no vale
// la pena sumar una dependencia por un archivo que se toca una vez al año.
// Playwright ya está instalado para los tests, así que el rasterizado lo
// hace su Chromium: es el mismo motor que después dibuja el favicon.
//
//   node scripts/gen-favicon.mjs
//
// El .ico resultante lleva PNG adentro (no BMP): el formato lo admite desde
// Vista y lo entienden todos los navegadores actuales. Un BMP con canal
// alfa hay que armarlo a mano fila por fila y es donde se rompen los .ico
// caseros.

import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const SVG = join(raiz, 'iconos', 'pronet-isotipo.svg');
const ICO = join(raiz, 'iconos', 'favicon.ico');

// 16 para la pestaña, 32 para pantallas HiDPI y la barra de favoritos,
// 48 para el acceso directo de escritorio en Windows.
const TAMAÑOS = [16, 32, 48];

/** Empaqueta varios PNG en un contenedor .ico. */
function armarIco(imagenes) {
  const cabecera = Buffer.alloc(6);
  cabecera.writeUInt16LE(0, 0);                 // reservado
  cabecera.writeUInt16LE(1, 2);                 // 1 = icono (2 sería cursor)
  cabecera.writeUInt16LE(imagenes.length, 4);

  const directorio = Buffer.alloc(16 * imagenes.length);
  let offset = cabecera.length + directorio.length;

  imagenes.forEach(({ size, png }, i) => {
    const e = i * 16;
    // 256 se escribe como 0; acá no llegamos, pero que quede dicho.
    directorio.writeUInt8(size === 256 ? 0 : size, e);
    directorio.writeUInt8(size === 256 ? 0 : size, e + 1);
    directorio.writeUInt8(0, e + 2);             // colores de paleta
    directorio.writeUInt8(0, e + 3);             // reservado
    directorio.writeUInt16LE(1, e + 4);          // planos
    directorio.writeUInt16LE(32, e + 6);         // bits por pixel
    directorio.writeUInt32LE(png.length, e + 8);
    directorio.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });

  return Buffer.concat([cabecera, directorio, ...imagenes.map(i => i.png)]);
}

const svg = readFileSync(SVG, 'utf8');
const navegador = await chromium.launch();
const imagenes = [];

try {
  for (const size of TAMAÑOS) {
    const pagina = await navegador.newPage({
      viewport: { width: size, height: size },
      // El isotipo ya trae su propio fondo con el degradado de marca; el
      // fondo del navegador tiene que quedar transparente para no comerse
      // las esquinas redondeadas.
      deviceScaleFactor: 1,
    });
    await pagina.setContent(
      `<style>html,body{margin:0;padding:0;background:transparent}
       svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
    );
    imagenes.push({ size, png: await pagina.screenshot({ omitBackground: true }) });
    await pagina.close();
  }
} finally {
  await navegador.close();
}

writeFileSync(ICO, armarIco(imagenes));
console.log('favicon.ico regenerado:', imagenes.map(i => i.size + 'px').join(', '));
