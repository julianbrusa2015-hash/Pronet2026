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

async function abrirApp(page) {
  await page.goto('/');
  await page.waitForFunction(() =>
    document.querySelector('#s-home') !== null &&
    !document.querySelector('#anti-flash-login'),
    { timeout: 20000 }
  );
  // La superficie de test se expone al final de app.js
  await page.waitForFunction(() => !!window._planesAPI, { timeout: 20000 });
}

test.describe('C9 · Catálogo de planes', () => {
  test.beforeEach(abrirApp);

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
  test.beforeEach(abrirApp);

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
  test.beforeEach(abrirApp);

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
  test.beforeEach(abrirApp);

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
