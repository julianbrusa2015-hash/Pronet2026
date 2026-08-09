// Genera 5 imágenes de ejemplo para probar el carrusel de publicidad.
//
// Son placeholders a propósito: sirven para verificar el carrusel (recorte,
// rotación, deslizado, puntos) sin usar creatividades reales de nadie. Se
// reemplazan cargando publicidad de verdad desde Parametrías → Publicidad.
//
//   node scripts/gen-banners-demo.mjs
//
// Mismo enfoque que gen-favicon.mjs: rasteriza con el Chromium de Playwright,
// que ya está instalado para los tests, en vez de sumar una dependencia.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = join(raiz, 'iconos', 'banners-demo');

// 1200×525 es 16:7, la relación con la que el carrusel recorta.
const ANCHO = 1200, ALTO = 525;

const EJEMPLOS = [
  { t: 'Coffee House',      s: 'Arrancá tu día con energía · 30% OFF', a: '#7A2E33', b: '#C08B84' },
  { t: 'Vivero del Lago',   s: 'Plantas de estación · Envío sin cargo', a: '#1F5B3F', b: '#8FC0A9' },
  { t: 'Gimnasio Escobar',  s: 'Primer mes gratis para vecinos',        a: '#1A2A57', b: '#7C93C3' },
  { t: 'Pinturería Norte',  s: 'Látex interior · 3x2 esta semana',      a: '#7A4B10', b: '#D8B08C' },
  { t: 'Óptica Puertos',    s: 'Examen visual sin cargo',               a: '#3D2352', b: '#A78BC0' },
];

mkdirSync(SALIDA, { recursive: true });

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: ANCHO, height: ALTO } });

try {
  for (const [i, e] of EJEMPLOS.entries()) {
    await pagina.setContent(`
      <style>
        html,body{margin:0;padding:0}
        .b{width:${ANCHO}px;height:${ALTO}px;display:flex;flex-direction:column;
           justify-content:center;padding:0 80px;box-sizing:border-box;
           background:linear-gradient(115deg,${e.a},${e.b});
           font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#fff}
        h1{font-size:76px;margin:0 0 18px;font-weight:800;letter-spacing:-1px}
        p{font-size:38px;margin:0;opacity:.9;font-weight:500}
        .tag{position:absolute;top:34px;right:56px;font-size:22px;opacity:.65;
             letter-spacing:3px;text-transform:uppercase}
      </style>
      <div class="b"><div class="tag">Ejemplo</div>
        <h1>${e.t}</h1><p>${e.s}</p></div>`);
    const png = await pagina.screenshot();
    writeFileSync(join(SALIDA, `banner-${i + 1}.png`), png);
  }
} finally {
  await navegador.close();
}

console.log(`${EJEMPLOS.length} banners de ejemplo en iconos/banners-demo/`);
