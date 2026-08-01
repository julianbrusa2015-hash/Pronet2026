// @ts-check
// C4 · C9 — Sistema de planes y límites
// Corre contra: https://pronetprueba.netlify.app
//
// Estos tests verifican la LÓGICA de resolución de planes sin depender del
// estado de la base: se le pasan planes explícitos a las funciones puras.
// Los que sí dependen del estado (interruptor de pagos) verifican COHERENCIA
// entre la config y la UI, no un valor fijo — así no se rompen cuando el
// admin prende los pagos.
const { test, expect } = require('@playwright/test');
const path = require('path');
const { abrir } = require('./helpers');

const sesionPrestador = path.join(__dirname, '.auth', 'prestador.json');

async function abrirApp(page) {
  await page.goto('/');
  await page.waitForFunction(() =>
    document.querySelector('#s-home') !== null &&
    !document.querySelector('#anti-flash-login'),
    { timeout: 20000 }
  );
  // _planesAPI existe al parsear el script, pero la config se carga async y
  // reflejarPlan() corre después. Esperar la API sola es una carrera: el DOM
  // todavía no refleja el interruptor.
  await page.waitForFunction(
    () => !!window._planesAPI && window._planesAPI.configCargada(),
    { timeout: 20000 }
  );
}

test.describe('C9 · Catálogo de planes', () => {
  test.beforeEach(async ({ page }) => { await abrirApp(page); });

  test('los 4 planes existen con sus IDs y precios', async ({ page }) => {
    const planes = await page.evaluate(() => window.PRONET_CONFIG.PLANES);
    expect(planes.map(p => p.id)).toEqual(['base', 'plus', 'pro', 'elite']);

    const porId = Object.fromEntries(planes.map(p => [p.id, p]));
    expect(porId.base.precio_mes).toBe(0);
    expect(porId.plus.precio_mes).toBe(4990);
    expect(porId.pro.precio_mes).toBe(9990);
    expect(porId.elite.precio_mes).toBe(19990);
  });

  test('el precio anual equivale a 10 meses (2 gratis)', async ({ page }) => {
    const planes = await page.evaluate(() => window.PRONET_CONFIG.PLANES);
    for (const p of planes.filter(p => p.precio_mes > 0)) {
      expect(p.precio_anual, `plan ${p.id}`).toBe(p.precio_mes * 10);
    }
  });

  test('getPlanConfig no devuelve undefined ante un id desconocido', async ({ page }) => {
    // Regresión: los IDs viejos ('basico','empresa') quedaron en la DB y
    // rompían el render si getPlanConfig devolvía undefined.
    const cfg = await page.evaluate(() => window._planesAPI.getPlanConfig('basico'));
    expect(cfg).toBeTruthy();
    expect(cfg.id).toBe('base'); // cae al primer plan
  });
});

test.describe('C4 · Resolución de límites por plan', () => {
  test.beforeEach(async ({ page }) => { await abrirApp(page); });

  test('los planes superiores nunca se degradan', async ({ page }) => {
    // Invariante que vale con el interruptor en cualquier estado: el
    // prelanzamiento sólo puede mejorar Base, nunca empeorar Plus/Pro/Elite.
    const superiores = await page.evaluate(() =>
      ['plus', 'pro', 'elite'].map(p => window._planesAPI.planParaLimites(p))
    );
    expect(superiores).toEqual(['plus', 'pro', 'elite']);
  });

  test('Base nunca recibe límites peores que los suyos', async ({ page }) => {
    const efectivo = await page.evaluate(() => {
      const api = window._planesAPI;
      const plan = api.planParaLimites('base');
      const cfg  = api.getPlanConfig(plan);
      return { plan, propuestas: cfg.propuestas_mes, fotos: cfg.fotos_portfolio };
    });
    // Base propio = 3/3. En prelanzamiento sube a los de Plus = 10/10.
    expect(['base', 'plus']).toContain(efectivo.plan);
    expect(efectivo.propuestas).toBeGreaterThanOrEqual(3);
    expect(efectivo.fotos).toBeGreaterThanOrEqual(3);
  });

  test('la regla de prelanzamiento coincide con la del servidor', async ({ page }) => {
    // plan_para_limites() en SQL: si pagos off, base→plus; el resto igual.
    // Acá verificamos que el cliente implemente exactamente lo mismo.
    const r = await page.evaluate(() => {
      const api = window._planesAPI;
      const on = api.planesPagosActivos();
      return {
        on,
        base:  api.planParaLimites('base'),
        plus:  api.planParaLimites('plus'),
        pro:   api.planParaLimites('pro'),
        elite: api.planParaLimites('elite'),
      };
    });
    expect(r.base).toBe(r.on ? 'base' : 'plus');
    expect(r.plus).toBe('plus');
    expect(r.pro).toBe('pro');
    expect(r.elite).toBe('elite');
  });
});

test.describe('C9 · Badge de plan en búsqueda', () => {
  test.beforeEach(async ({ page }) => { await abrirApp(page); });

  test('sólo los planes con badge_busqueda muestran badge', async ({ page }) => {
    const r = await page.evaluate(() => ({
      base:  window._planesAPI.badgePlanPrestador('base'),
      plus:  window._planesAPI.badgePlanPrestador('plus'),
      pro:   window._planesAPI.badgePlanPrestador('pro'),
      elite: window._planesAPI.badgePlanPrestador('elite'),
    }));
    expect(r.base).toBe('');
    expect(r.plus).toBe('');
    expect(r.pro).toContain('Pro');
    expect(r.elite).toContain('Elite');
  });

  test('un plan inexistente no rompe ni inventa badge', async ({ page }) => {
    // Regresión: prestadores.plan tenía 'basico' para todos.
    const r = await page.evaluate(() => [
      window._planesAPI.badgePlanPrestador('basico'),
      window._planesAPI.badgePlanPrestador(null),
      window._planesAPI.badgePlanPrestador(''),
    ]);
    expect(r).toEqual(['', '', '']);
  });
});

test.describe('C9 · Interruptor de planes pagos', () => {
  test.beforeEach(async ({ page }) => { await abrirApp(page); });

  test('la UI de suscripción coincide con el estado del interruptor', async ({ page }) => {
    const r = await page.evaluate(() => {
      const on = window._planesAPI.planesPagosActivos();
      const aviso = document.getElementById('subs-aviso-prelanzamiento');
      const bodyOff = document.body.classList.contains('planes-pagos-off');
      return { on, avisoVisible: aviso ? aviso.style.display !== 'none' : null, bodyOff };
    });
    // El aviso de etapa fundadora y la clase del body son el inverso exacto
    // del interruptor. Este test no fija un valor: verifica coherencia.
    expect(r.bodyOff).toBe(!r.on);
    if (r.avisoVisible !== null) expect(r.avisoVisible).toBe(!r.on);
  });

  test('con pagos desactivados no se ofrecen planes comprables', async ({ page }) => {
    const r = await page.evaluate(() => {
      const on = window._planesAPI.planesPagosActivos();
      const visibles = ['plus', 'pro', 'elite'].filter(id => {
        const c = document.getElementById('subs-card-' + id);
        return c && c.style.display !== 'none';
      });
      return { on, visibles };
    });
    // Sin MercadoPago, un plan pago visible se podría activar gratis.
    if (!r.on) expect(r.visibles).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// D-04 · Trigger de DB — el límite de propuestas del plan vigente bloquea
// ══════════════════════════════════════════════════════════════════════════════
// Nunca se había verificado en producción que trg_limite_propuestas corte la
// propuesta que excede el cupo. fn_test_limite_fundador (grandfathering.spec.js)
// sólo prueba el caso fundador con 10 hardcodeado; esta llama a la versión
// genérica (fn_test_limite_propuestas, en supabase-test-limite-propuestas.sql)
// que lee el límite real de plan_de_prestador() + planes_limites, así que
// vale para cualquier plan que tenga prestador_test en el momento de correr.
test.describe('D-04 · Límite de propuestas — trigger real en DB', () => {
  test.use({ storageState: sesionPrestador });

  test('fn_test_limite_propuestas: la propuesta que excede el cupo del plan vigente es bloqueada', async ({ page }) => {
    await abrir(page);

    const resultado = await page.evaluate(async () => {
      const { data, error } = await window._sb.rpc('fn_test_limite_propuestas', {
        p_prestador_id: (await window._sb.from('perfiles')
          .select('prestador_id')
          .eq('id', (await window._sb.auth.getUser()).data.user?.id)
          .maybeSingle()).data?.prestador_id,
      });
      return { data, error: error?.message };
    });

    if (resultado.error) {
      // El trigger de rate-limit puede dispararse durante la inserción masiva de test.
      if (resultado.error.includes('RATE_LIMIT')) {
        console.log('[D-04] rate limit disparado durante inserciones de test — skip');
        test.skip();
        return;
      }
      // Si la función no existe todavía (SQL sin aplicar), avisar en vez de
      // fallar en seco — más rápido de diagnosticar en el log del test.
      throw new Error(
        'RPC falló: ' + resultado.error +
        ' — ¿se corrió supabase-test-limite-propuestas.sql en Supabase?'
      );
    }

    if (resultado.data?.skip) {
      console.log('[D-04] skip:', resultado.data.reason);
      test.skip();
      return;
    }

    expect(resultado.data?.pass, resultado.data?.error ?? 'trigger no bloqueó').toBe(true);
    console.log(
      `[D-04] PASS — plan=${resultado.data.plan}, límite=${resultado.data.limite}, ` +
      `existentes_prev=${resultado.data.existentes_prev}, insertadas_test=${resultado.data.insertadas_test}`
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// D-01 · Edge Function crear-preferencia — precios leídos de planes_limites
// ══════════════════════════════════════════════════════════════════════════════
// No completa ningún pago: sólo pide la preferencia a MercadoPago y verifica
// que la Edge Function haya podido resolver el precio contra la tabla (ya no
// contra la constante PRECIOS hardcodeada, eliminada en D1) y que MP la haya
// aceptado. Confirma que el deploy salió bien sin gastar un pago de sandbox.
// ══════════════════════════════════════════════════════════════════════════════
// D-01b · Sync de precios — PRONET_CONFIG.PLANES refleja planes_limites
// ══════════════════════════════════════════════════════════════════════════════
// Compara contra la tabla en vivo, no contra números fijos: si alguien cambia
// un precio en planes_limites y restaurarSesion() no lo sincroniza, esto se
// entera aunque el valor fijo de arriba ("C9 · Catálogo de planes") ya haya
// quedado desactualizado también y no lo note.
//
// Requiere sesión autenticada: la policy de planes_limites es
// "for select to authenticated" — un invitado recibe 0 filas por RLS, no por
// una falla del sync. Para invitados, restaurarSesion() no puede sincronizar
// nada y PRONET_CONFIG.PLANES se queda con el fallback hardcodeado de
// config.js (limitación preexistente, no algo que haya cambiado hoy).
test.describe('D-01b · Sync precio_mes/precio_anual desde planes_limites', () => {
  test.use({ storageState: sesionPrestador });
  test.beforeEach(async ({ page }) => { await abrir(page); });

  test('PRONET_CONFIG.PLANES coincide con planes_limites para los 4 planes', async ({ page }) => {
    const { planes, filas } = await page.evaluate(async () => ({
      planes: window.PRONET_CONFIG.PLANES,
      filas:  await window.PronetDB.listarPlanesLimites(),
    }));
    expect(filas.length, 'listarPlanesLimites() no devolvió filas').toBeGreaterThan(0);

    const porId = Object.fromEntries(planes.map(p => [p.id, p]));
    for (const fila of filas) {
      const p = porId[fila.plan];
      expect(p, `plan "${fila.plan}" de la DB no existe en PRONET_CONFIG.PLANES`).toBeTruthy();
      expect(p.precio_mes,   `precio_mes desincronizado para "${fila.plan}"`).toBe(fila.precio_mes);
      expect(p.precio_anual, `precio_anual desincronizado para "${fila.plan}"`).toBe(fila.precio_anual);
    }
  });
});

test.describe('D-01 · crear-preferencia lee precios de planes_limites', () => {
  test.use({ storageState: sesionPrestador });

  test('plan pago (plus/mes) devuelve un init_point real de MercadoPago', async ({ page }) => {
    await abrir(page);
    const res = await page.evaluate(() => window.PronetDB.crearPreferenciaMP('plus', 'mes'));
    expect(res.ok, res.error).toBe(true);
    expect(res.init_point).toMatch(/mercadopago\.com/);
  });

  test('plan "base" es rechazado (precio $0, no es comprable)', async ({ page }) => {
    await abrir(page);
    const res = await page.evaluate(() => window.PronetDB.crearPreferenciaMP('base', 'mes'));
    expect(res.ok).toBe(false);
  });
});
