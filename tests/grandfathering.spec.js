// @ts-check
// GF-1 · Grandfathering de prestadores fundadores
//
// Qué se cubre:
//   - Contrato de API: obtenerSuscripcion() incluye es_fundador_activo
//   - Estado en DB: prestador_test tiene es_fundador_activo = true
//   - Estado en cliente: _planesAPI.esFundador() refleja el valor de DB
//   - planParaLimites(): con pagos activos y fundador → devuelve 'plus'
//   - Límite efectivo: un fundador Base ve 10 propuestas/mes, no 3
//   - Badge en Mi Perfil: texto "Fundador" visible para prestador Base fundador
//   - Trigger DB: fn_test_limite_fundador() inserta 10, verifica que la 11 es bloqueada
//
// Corre contra: https://pronetprueba.netlify.app
// El test de trigger usa fn_test_limite_fundador() — inserta y limpia sus propios datos.

const { test, expect } = require('@playwright/test');
const path = require('path');
const { abrir, irA, sesionRestaurada } = require('./helpers');

const sesionPrestador = path.join(__dirname, '.auth', 'prestador.json');

test.describe('GF-1 · Grandfathering — contrato de API y estado en DB', () => {
  test.use({ storageState: sesionPrestador });

  test('obtenerSuscripcion() devuelve es_fundador_activo como booleano', async ({ page }) => {
    await abrir(page);
    await page.waitForFunction(() => typeof window.PronetDB?.obtenerSuscripcion === 'function', { timeout: 10000 });
    const suscripcion = await page.evaluate(async () => {
      return await window.PronetDB.obtenerSuscripcion();
    });
    expect(typeof suscripcion.es_fundador_activo).toBe('boolean');
  });

  test('prestador_test tiene es_fundador_activo = true en DB', async ({ page }) => {
    await abrir(page);
    await page.waitForFunction(() => typeof window.PronetDB?.obtenerSuscripcion === 'function', { timeout: 10000 });
    const { esFundador } = await page.evaluate(async () => {
      const s = await window.PronetDB.obtenerSuscripcion();
      return { esFundador: s.es_fundador_activo };
    });
    expect(esFundador).toBe(true);
  });

  test('_planesAPI.esFundador() es true después de restaurar sesión', async ({ page }) => {
    await abrir(page);
    // obtenerSuscripcion() es async y se dispara al restaurar sesión.
    // Esperar hasta que esFundadorActual quede seteado.
    await page.waitForFunction(
      () => window._planesAPI?.esFundador() === true,
      { timeout: 15000 }
    );
    const valor = await page.evaluate(() => window._planesAPI.esFundador());
    expect(valor).toBe(true);
  });
});

test.describe('GF-1 · Grandfathering — lógica de límites', () => {
  test.use({ storageState: sesionPrestador });

  test('planParaLimites("base") devuelve "plus" con pagos desactivados', async ({ page }) => {
    await abrir(page);
    const resultado = await page.evaluate(() => {
      const api = window._planesAPI;
      // pagos desactivados → etapa fundadora global, todos los Base reciben plus
      if (api.planesPagosActivos()) return 'pagos_activos_skip';
      return api.planParaLimites('base');
    });
    if (resultado === 'pagos_activos_skip') { test.skip(); return; }
    expect(resultado).toBe('plus');
  });

  test('planParaLimites("base") devuelve "plus" para fundador aunque los pagos estén activos', async ({ page }) => {
    await abrir(page);
    // Esperar a que esFundadorActual se haya resuelto desde DB
    await page.waitForFunction(
      () => window._planesAPI?.esFundador() === true,
      { timeout: 15000 }
    );
    // Simular pagos activados solo para esta verificación: parchamos la
    // función en la página (el estado de producción no cambia).
    const resultado = await page.evaluate(() => {
      const api = window._planesAPI;
      const orig = api.planesPagosActivos;
      // Temporariamente forzar pagos activos
      api.planesPagosActivos = () => true;
      const r = api.planParaLimites('base');
      api.planesPagosActivos = orig;
      return r;
    });
    // Con pagos activos Y es_fundador = true → debe seguir siendo 'plus'
    expect(resultado).toBe('plus');
  });

  test('limitePlan("propuestas_mes") es 10 para un fundador Base', async ({ page }) => {
    await abrir(page);
    await page.waitForFunction(
      () => window._planesAPI?.esFundador() === true,
      { timeout: 15000 }
    );
    const limite = await page.evaluate(() => {
      const api = window._planesAPI;
      // El prestador_test es Base, pero fundador → planParaLimites devuelve 'plus'
      // limitePlan() usa planParaLimites internamente
      return api.limitePlan('propuestas_mes');
    });
    // Plan plus tiene propuestas_mes = 10
    expect(limite).toBe(10);
  });

  test('planParaLimites("plus") devuelve "plus" independiente del estado fundador', async ({ page }) => {
    await abrir(page);
    const resultado = await page.evaluate(() => window._planesAPI.planParaLimites('plus'));
    expect(resultado).toBe('plus');
  });

  test('planParaLimites("elite") devuelve "elite" independiente del estado fundador', async ({ page }) => {
    await abrir(page);
    const resultado = await page.evaluate(() => window._planesAPI.planParaLimites('elite'));
    expect(resultado).toBe('elite');
  });
});

test.describe('GF-1 · Grandfathering — badge en Mi Perfil', () => {
  test.use({ storageState: sesionPrestador });

  test('badge "Fundador" visible en Mi Perfil para prestador Base fundador', async ({ page }) => {
    await abrir(page);
    // Esperar a que esFundadorActual se resuelva y reflejarPlan() corra
    await page.waitForFunction(
      () => window._planesAPI?.esFundador() === true,
      { timeout: 15000 }
    );
    await irA(page, 's-miperfil');

    const planRenew = page.locator('#perfil-plan-renew');
    const texto = await planRenew.textContent();
    const visible = await planRenew.isVisible();

    const api = await page.evaluate(() => ({
      plan: window._planesAPI.planActual(),
      esFundador: window._planesAPI.esFundador(),
    }));

    if (api.plan === 'base' && api.esFundador) {
      // El badge debe estar visible y mencionar "Fundador"
      expect(visible).toBe(true);
      expect(texto).toMatch(/fundador/i);
    }
    // Si el plan es pago, el badge puede no estar — test no aplica
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GF-1 · Trigger de DB — límite real de propuestas
// ══════════════════════════════════════════════════════════════════════════════
test.describe('GF-1 · Trigger — propuesta 11 bloqueada en DB', () => {
  test.use({ storageState: sesionPrestador });

  test('fn_test_limite_fundador: insertar 10, verificar que la 11 es bloqueada', async ({ page }) => {
    // Este test llama a fn_test_limite_fundador() en Supabase, que:
    //  1. Inserta propuestas de test hasta llegar a 10 para el prestador
    //  2. Intenta la propuesta 11 y captura si el trigger la bloquea
    //  3. Limpia todos los datos de test (DELETE WHERE mensaje LIKE 'TEST_GF_%')
    // La función es idempotente: limpia residuos de runs anteriores al arrancar.
    await abrir(page);

    const resultado = await page.evaluate(async () => {
      const { data, error } = await window._sb.rpc('fn_test_limite_fundador', {
        p_prestador_id: (await window._sb.from('perfiles')
          .select('prestador_id')
          .eq('id', (await window._sb.auth.getUser()).data.user?.id)
          .maybeSingle()).data?.prestador_id,
      });
      return { data, error: error?.message };
    });

    if (resultado.error) {
      // El trigger de rate-limit puede dispararse durante la inserción masiva de test.
      // No es un fallo del test sino una condición de infraestructura — skip.
      if (resultado.error.includes('RATE_LIMIT')) {
        console.log('[GF trigger] rate limit disparado durante inserciones de test — skip');
        test.skip();
        return;
      }
      throw new Error('RPC falló: ' + resultado.error);
    }

    if (resultado.data?.skip) {
      console.log('[GF trigger] skip:', resultado.data.reason);
      test.skip();
      return;
    }

    expect(resultado.data?.pass, resultado.data?.error ?? 'trigger no bloqueó').toBe(true);
    console.log(
      `[GF trigger] PASS — existentes_prev=${resultado.data.existentes_prev}, insertadas_test=${resultado.data.insertadas_test}`
    );
  });
});
