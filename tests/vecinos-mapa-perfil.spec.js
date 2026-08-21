// @ts-check
// Cobertura de lo agregado el 2026-08-12:
//   VP-1 · comunidad del vecino en Editar perfil
//   VP-2 · resumen de búsqueda por barrio
//   VP-3 · miniaturas en el pin del mapa
//
// Ninguno de estos tests escribe nada: leen el estado y comparan. El único
// que toca algo (VP-1) lo hace sobre el <select> sin guardar.
//
// Corre contra: https://pronetprueba.netlify.app
const { test, expect } = require('@playwright/test');
const path = require('path');
const { abrir, irA, omitirComunidadSiAparece } = require('./helpers');

const sesionVecino = path.join(__dirname, '.auth', 'vecino.json');

/** Deja el feed de Entre Vecinos abierto en la sección pedida, ampliado a
 *  toda la zona.
 *
 *  Todo se maneja por la UI real y NO seteando variables: `mktBusqueda` y
 *  `mktAmpliado` son `let` dentro del IIFE de app.js, así que
 *  `window.mktBusqueda = 'x'` crea otra variable y no cambia nada — el test
 *  daba verde en el evaluate y después medía el feed sin filtrar.
 *
 *  Ampliar importa: con el mercado acotado a la comunidad del vecino de
 *  prueba el feed puede quedar vacío, y entonces los tests comparan cero
 *  contra cero, que pasa sin probar nada. */
async function entrarAlMercado(page, tipo = 'producto') {
  await abrir(page);
  await page.locator('#nb-mercado').click();
  await omitirComunidadSiAparece(page);
  await page.waitForFunction(() => {
    const a = [...document.querySelectorAll('.screen.active')].map(s => s.id);
    return a.includes('s-vecinos-portada') || a.includes('s-mercado');
  }, { timeout: 15000 });
  if (await page.locator('#s-vecinos-portada.active').count()) {
    await page.locator('#s-vecinos-portada button').first().click();
  }
  await expect(page.locator('#s-mercado')).toHaveClass(/active/, { timeout: 10000 });

  // Sección: los botones son los del selector, no una variable.
  const secciones = page.locator('#mkt-secciones .mkt-sec');
  if (await secciones.count()) {
    await secciones.nth(tipo === 'producto' ? 1 : 0).click();
    await page.waitForTimeout(2000);
  }

  // Ampliar a toda la zona, si el botón está (sólo aparece con comunidad).
  const btnAmbito = page.locator('#mkt-ambito-btn');
  if (await btnAmbito.isVisible().catch(() => false)) {
    const txt = (await btnAmbito.textContent()) || '';
    if (/otros barrios/i.test(txt)) { await btnAmbito.click(); await page.waitForTimeout(2500); }
  }
  await page.waitForTimeout(1500);
}

/** Escribe en el buscador de verdad. `mktBuscar` tiene debounce, así que
 *  hay que esperar a que dispare el render. */
async function buscarEnMercado(page, texto) {
  await page.locator('#mkt-buscador').fill(texto);
  await page.waitForTimeout(3000);
}

// ══════════════════════════════════════════════════════════════════════════
test.describe('VP-1 · Comunidad del vecino en Editar perfil', () => {
  test.use({ storageState: sesionVecino });

  test('el selector se puebla con las comunidades reales', async ({ page }) => {
    await abrir(page);
    await irA(page, 's-edit-perfil');
    const sel = page.locator('#edit-comunidad');
    await expect(sel).toBeVisible({ timeout: 10000 });
    // Espera a que termine de poblarse: arranca con un <option> "Cargando…".
    await page.waitForFunction(
      () => (document.getElementById('edit-comunidad')?.options.length || 0) > 1,
      { timeout: 10000 });

    const { opciones, comunidadesReales } = await page.evaluate(async () => ({
      opciones: [...document.getElementById('edit-comunidad').options].map(o => o.value),
      comunidadesReales: (await listarComunidades()).map(c => c.nombre),
    }));
    // La primera es la salida ("ver todo Escobar"), con value vacío.
    expect(opciones[0]).toBe('');
    expect(opciones.slice(1).sort()).toEqual(comunidadesReales.sort());
  });

  test('preselecciona la comunidad resuelta, no la igualdad literal', async ({ page }) => {
    await abrir(page);
    await irA(page, 's-edit-perfil');
    await page.waitForFunction(
      () => (document.getElementById('edit-comunidad')?.options.length || 0) > 1,
      { timeout: 10000 });

    // `perfiles.zona` puede tener un BARRIO (nivel 3) y no una comunidad. El
    // selector ofrece comunidades, así que compararlo a secas dejaría vacío
    // el de alguien de Araucarias, como si nunca hubiera elegido nada.
    const { elegida, resuelta } = await page.evaluate(async () => ({
      elegida: document.getElementById('edit-comunidad').value,
      resuelta: await comunidadDelUsuario(),
    }));
    expect(elegida).toBe(resuelta || '');
  });
});

// ══════════════════════════════════════════════════════════════════════════
test.describe('VP-2 · Resumen de búsqueda por barrio', () => {
  test.use({ storageState: sesionVecino });

  // Este test afirmaba que sin filtro el resumen NUNCA se muestra. Dejó de
  // ser cierto en v238: sin filtro aparece a partir de 5 vecinos publicando
  // (abajo de eso, "1 vecino publicando" en la primera línea es el cartel de
  // que el mercado está vacío). Ahora verifica la regla y no un resultado
  // fijo, así no se vuelve a pudrir cuando cambien los datos de producción.
  test('sin filtro sólo se muestra a partir de 5 vecinos', async ({ page }) => {
    await entrarAlMercado(page);
    const totalVecinos = await page.evaluate(async () => {
      const filas = await PronetDB.contarPublicacionesPorBarrio({
        categoria: mktFiltroActivo, categorias: slugsDeTipo(mktTipoActivo),
        busqueda: '', zona: mktZonaActiva,
      });
      return filas.reduce((n, f) => n + f.vecinos, 0);
    });
    const resumen = page.locator('#mkt-resumen');
    if (totalVecinos < 5) await expect(resumen).toBeHidden();
    else await expect(resumen).toBeVisible();
  });

  test('con búsqueda aparece y cuenta VECINOS, no publicaciones', async ({ page }) => {
    await entrarAlMercado(page);
    await buscarEnMercado(page, 'a');

    const cont = page.locator('#mkt-resumen');
    await expect(cont).toBeVisible();

    const { vecinos, publicaciones } = await page.evaluate(async () => {
      const filas = await PronetDB.contarPublicacionesPorBarrio({
        categoria: mktFiltroActivo, categorias: slugsDeTipo(mktTipoActivo),
        busqueda: mktBusqueda, zona: mktZonaActiva,
      });
      return {
        vecinos: filas.reduce((n, f) => n + f.vecinos, 0),
        publicaciones: filas.reduce((n, f) => n + f.cantidad, 0),
      };
    });
    // Dos avisos de la misma persona son UN vecino: nunca puede haber más
    // vecinos que publicaciones. Decir de más sería inflar el mercado.
    expect(vecinos).toBeGreaterThan(0);
    expect(vecinos).toBeLessThanOrEqual(publicaciones);
    await expect(cont).toContainText(String(vecinos));
  });

  test('lo que promete el resumen es lo que muestra el feed', async ({ page }) => {
    // Es el test del bug real: el resumen contaba servicios Y productos,
    // pero el feed sólo muestra la sección activa. Decía "Araucarias (2)",
    // se tocaba, y aparecían cero.
    await entrarAlMercado(page);
    await buscarEnMercado(page, 'a');

    const botones = page.locator('#mkt-resumen button');
    const cuantos = await botones.count();
    test.skip(cuantos === 0, 'sin datos para comparar en este entorno');

    const etiqueta = (await botones.first().textContent()) || '';
    const prometidas = Number((etiqueta.match(/\((\d+)\)/) || [])[1] || 0);

    await botones.first().click();
    await page.waitForTimeout(3000);

    const enElFeed = await page.locator('#mkt-feed [id^="mkt-post-"]').count();
    expect(enElFeed).toBe(prometidas);
  });

  test('no aparece en el feed de prestadores', async ({ page }) => {
    await entrarAlMercado(page, 'servicio');
    const hayToggle = await page.locator('#mkt-origen').isVisible().catch(() => false);
    test.skip(!hayToggle, 'la feature de avisos de prestadores está apagada');
    await buscarEnMercado(page, 'a');
    // El selector era '.mkt-sec', que nunca existió en este toggle: quedó de
    // antes de rehacerlo como interruptor. Las dos opciones son '.mo-lbl'.
    await page.locator('#mkt-origen .mo-lbl').nth(1).click();  // Prestadores
    await page.waitForTimeout(3000);
    // Contaría publicaciones de VECINOS por barrio, que no es lo que está
    // abajo en este origen.
    await expect(page.locator('#mkt-resumen')).toBeHidden();
  });
});

// ══════════════════════════════════════════════════════════════════════════
test.describe('VP-3 · Miniaturas en el pin del mapa', () => {
  test.use({ storageState: sesionVecino });

  test('el globo trae las publicaciones del barrio, no sólo el número', async ({ page }) => {
    await entrarAlMercado(page);
    await page.evaluate(() => toggleMapaMercado());
    await page.waitForTimeout(5000);

    const pines = await page.evaluate(() => (typeof _mktPins !== 'undefined' ? _mktPins.length : 0));
    test.skip(pines === 0, 'sin pines en este entorno');

    const info = await page.evaluate(async () => {
      // _mktPins agrupa por UBICACIÓN, no sólo por barrio: cada elemento es
      // { lugar, posts, position }, donde `position` es la coordenada del
      // vendedor si la mostró, o el centroide del barrio si no.
      const grupo = _mktPins[0];
      const html = mktContenidoPin(grupo, 0);
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      return {
        lugar: grupo.lugar,
        miniaturas: tmp.querySelectorAll('[onclick^="mktIrAPublicacionDelPin"]').length,
        cacheadas: _mktPinPosts.length,
        texto: tmp.textContent,
      };
    });
    expect(info.miniaturas).toBeGreaterThan(0);
    // Hasta 4 en el globo: con 15 no se puede usar en un teléfono.
    expect(info.miniaturas).toBeLessThanOrEqual(4);
    expect(info.texto).toContain(info.lugar);
  });

  test('el segundo toque abre esa publicación en el feed', async ({ page }) => {
    await entrarAlMercado(page);
    await page.evaluate(() => toggleMapaMercado());
    await page.waitForTimeout(5000);

    const pines = await page.evaluate(() => (typeof _mktPins !== 'undefined' ? _mktPins.length : 0));
    test.skip(pines === 0, 'sin pines en este entorno');

    const r = await page.evaluate(async () => {
      mktContenidoPin(_mktPins[0], 0);
      const pubId = _mktPinPosts[0];
      await mktIrAPublicacionDelPin(0, 0);
      await new Promise(res => setTimeout(res, 3000));
      return {
        modo: mktModo,
        barrio: mktBarrioFiltro,
        fichaEnElFeed: !!document.getElementById('mkt-post-' + pubId),
      };
    });
    // Entre Vecinos no tiene pantalla de detalle: "llevar a la publicación"
    // es volver al feed, acotarlo al barrio y expandir esa ficha.
    expect(r.modo).toBe('lista');
    expect(r.barrio).toBe(await page.evaluate(() => _mktPins[0].lugar));
    expect(r.fichaEnElFeed).toBe(true);
  });

  test('los handlers del globo no llevan texto del usuario', async ({ page }) => {
    // Los nombres de barrio y los títulos los escribe gente. escHTML no
    // protege adentro de un onclick inline: el parser decodifica las
    // entidades antes de que el JS las lea. Por eso viaja el índice.
    await entrarAlMercado(page);
    await page.evaluate(() => toggleMapaMercado());
    await page.waitForTimeout(5000);
    const pines = await page.evaluate(() => (typeof _mktPins !== 'undefined' ? _mktPins.length : 0));
    test.skip(pines === 0, 'sin pines en este entorno');

    const handlers = await page.evaluate(async () => {
      const html = mktContenidoPin(_mktPins[0], 0);
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      return [...tmp.querySelectorAll('[onclick]')].map(e => e.getAttribute('onclick'));
    });
    expect(handlers.length).toBeGreaterThan(0);
    // Sólo dígitos y comas entre los paréntesis.
    handlers.forEach(h => expect(h).toMatch(/^mkt\w+\(\s*\d+\s*(,\s*\d+\s*)?\)$/));
  });
});
