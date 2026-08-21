// @ts-check
// C8 · PRONET Points — solicitar y aprobar un canje, de punta a punta.
// C10 · Moderación — el vecino denuncia, el admin la resuelve.
//
// Corre contra: https://pronetprueba.netlify.app
// Necesita TEST_ADMIN_PW en .env.local — si no está, los describes de
// abajo se saltean solos (ver CUENTAS.admin en helpers.js).
const { test, expect } = require('@playwright/test');
const H = require('./helpers');

test.describe.configure({ retries: 0 });

// ══════════════════════════════════════════════════════════════════════════
// C8 · PRONET Points — canje solicitado por el prestador, resuelto por admin
// ══════════════════════════════════════════════════════════════════════════
// Serial: la segunda mitad depende de la solicitud que crea la primera.
test.describe.serial('C8 · Canje de puntos — de punta a punta', () => {
  test.skip(!H.CUENTAS.admin.pw, 'TEST_ADMIN_PW no configurada');

  // "500 puntos bonus Prueba" es un canje de prueba ya cargado en el
  // catálogo (tipo puntos_extra): cuesta 100 y al aprobarse acredita 500,
  // así que no hace falta tocar el saldo de la cuenta para que alcance.
  const NOMBRE_CANJE = '500 puntos bonus Prueba';

  test('El prestador solicita el canje', async ({ page }) => {
    await page.goto('/');
    await H.login(page, 'prestador');
    await H.irA(page, 's-loyalty');
    await page.evaluate(() => window.switchLoyalty('canjear'));

    const antes = await page.evaluate(async () => {
      const { data } = await window._sb.from('loyalty')
        .select('puntos').eq('usuario_id', (await window._sb.auth.getUser()).data.user.id).maybeSingle();
      return data?.puntos ?? 0;
    });

    // Que no haya quedado una solicitud pendiente de una corrida anterior:
    // canjear_puntos() la rechaza si ya existe una del mismo canje.
    await page.evaluate(async () => {
      const uid = (await window._sb.auth.getUser()).data.user.id;
      await window._sb.from('loyalty_solicitudes').delete()
        .eq('usuario_id', uid).eq('nombre_canje', '500 puntos bonus Prueba').eq('estado', 'pendiente');
    });

    const card = page.locator('.canje-card').filter({ hasText: NOMBRE_CANJE });
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.locator('.canje-btn').click();

    // El toast de confirmación es la señal de que canjear() resolvió ok —
    // si canjear_puntos() hubiese fallado, el toast dice el error en vez de
    // "activado" y nunca queda esta clase en pantalla.
    await expect(page.locator('#canje-confirm')).toBeVisible({ timeout: 8000 });

    const solicitud = await page.evaluate(async () => {
      const uid = (await window._sb.auth.getUser()).data.user.id;
      const { data } = await window._sb.from('loyalty_solicitudes')
        .select('id, estado, puntos_descontados')
        .eq('usuario_id', uid).eq('nombre_canje', '500 puntos bonus Prueba')
        .order('creado', { ascending: false }).limit(1).maybeSingle();
      return data;
    });
    expect(solicitud, 'no se creó la solicitud de canje').not.toBeNull();
    expect(solicitud.estado).toBe('pendiente');
    expect(solicitud.puntos_descontados).toBe(100);

    const despues = await page.evaluate(async () => {
      const { data } = await window._sb.from('loyalty')
        .select('puntos').eq('usuario_id', (await window._sb.auth.getUser()).data.user.id).maybeSingle();
      return data?.puntos ?? 0;
    });
    // canjear_puntos() descuenta al pedirlo, no al aprobarlo — "primero se
    // reserva, después se aplica el beneficio", ver resolver_canje().
    expect(despues, 'no se descontaron los puntos al solicitar el canje').toBe(antes - 100);
  });

  test('El admin aprueba el canje', async ({ page }) => {
    await page.goto('/');
    await H.login(page, 'admin');
    await H.irA(page, 's-loyalty-admin');

    // El id de la solicitud viaja en el onclick del botón — buscarlo por
    // texto en la tarjeta en vez de tocar el DOM a mano.
    const card = page.locator('.mod-card').filter({ hasText: '500 puntos bonus Prueba' });
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card).toContainText('Prestador Test');

    const solicitudId = await page.evaluate(async () => {
      const { data } = await window._sb.from('loyalty_solicitudes')
        .select('id, usuario_id').eq('nombre_canje', '500 puntos bonus Prueba').eq('estado', 'pendiente')
        .order('creado', { ascending: false }).limit(1).maybeSingle();
      return data;
    });
    expect(solicitudId, 'no se encontró la solicitud pendiente a aprobar').not.toBeNull();

    const puntosVecinoAntes = await page.evaluate(async (uid) => {
      const { data } = await window._sb.from('loyalty').select('puntos').eq('usuario_id', uid).maybeSingle();
      return data?.puntos ?? 0;
    }, solicitudId.usuario_id);

    await card.locator('.mod-btn-ok', { hasText: /aprobar/i }).click();

    // accionCanje() vuelve a pintar la lista al terminar — esperar a que la
    // tarjeta ya no tenga los botones de acción es la señal de que resolvió.
    await expect(card.locator('.mod-actions')).toHaveCount(0, { timeout: 10000 });

    const estadoFinal = await page.evaluate(async (id) => {
      const { data } = await window._sb.from('loyalty_solicitudes').select('estado').eq('id', id).maybeSingle();
      return data?.estado;
    }, solicitudId.id);
    expect(estadoFinal).toBe('aprobado');

    // tipo_beneficio = puntos_extra: aprobar acredita 500 más — el saldo del
    // prestador queda neto +400 contra como estaba ANTES de pedir el canje
    // (-100 al pedirlo, +500 al aprobarlo).
    const puntosVecinoDespues = await page.evaluate(async (uid) => {
      const { data } = await window._sb.from('loyalty').select('puntos').eq('usuario_id', uid).maybeSingle();
      return data?.puntos ?? 0;
    }, solicitudId.usuario_id);
    expect(puntosVecinoDespues, 'no se acreditó el bonus de puntos al aprobar').toBe(puntosVecinoAntes + 500);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// C10 · Moderación — denuncia real, resuelta por admin
// ══════════════════════════════════════════════════════════════════════════
test.describe.serial('C10 · Denuncia — de punta a punta', () => {
  test.skip(!H.CUENTAS.admin.pw, 'TEST_ADMIN_PW no configurada');

  const DETALLE = 'Test E2E — denuncia de prueba, se desestima sola.';

  test('El vecino hace una denuncia sobre el prestador', async ({ page }) => {
    await page.goto('/');
    await H.login(page, 'vecino');

    // abrirPerfilPrestador() pinta la ficha y fija prestadorActual — mismo
    // efecto que tocar una card de prestador en Buscar, sin depender de que
    // haya uno visible en el feed en este momento.
    const prestador = await page.evaluate(async () => {
      const { data } = await window._sb.from('prestadores').select('*')
        .eq('rubro', 'Electricistas').ilike('nombre', '%Prestador Test%').limit(1).maybeSingle();
      return data;
    });
    expect(prestador, 'no se encontró la ficha de prestador_test').not.toBeNull();

    await page.evaluate((p) => { window.abrirPerfilPrestador(p); window.goTo('s-prof'); }, prestador);
    await expect(page.locator('#s-prof')).toHaveClass(/active/, { timeout: 8000 });

    const linkDenuncia = page.locator('#prof-denuncia-wrap span');
    await expect(linkDenuncia).toBeVisible({ timeout: 8000 });
    await linkDenuncia.click();
    await expect(page.locator('#s-denuncia')).toHaveClass(/active/, { timeout: 8000 });

    await page.locator('.denuncia-tipo').first().click();
    await page.locator('#f-conta-con-el-mayor-detalle-posible').fill(DETALLE);
    await page.locator('#s-denuncia button[onclick="enviarDenuncia()"]').click();

    await expect(page.locator('#denuncia-exito')).toBeVisible({ timeout: 10000 });

    const creada = await page.evaluate(async (detalle) => {
      const { data } = await window._sb.from('denuncias').select('id, estado')
        .eq('detalle', detalle).order('creado', { ascending: false }).limit(1).maybeSingle();
      return data;
    }, DETALLE);
    expect(creada, 'no se guardó la denuncia').not.toBeNull();
    expect(creada.estado).toBe('pendiente');
  });

  test('El admin desestima la denuncia', async ({ page }) => {
    await page.goto('/');
    await H.login(page, 'admin');
    await H.irA(page, 's-moderacion');

    const card = page.locator('.mod-card').filter({ hasText: DETALLE });
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card).toContainText('Pendiente');

    await card.locator('.mod-btn-ok', { hasText: /desestimar/i }).click();

    // El badge pasa a "✕ Desestimada" y los botones de acción desaparecen —
    // señal de que accionDenuncia() resolvió y volvió a pintar la tarjeta.
    await expect(card.locator('.mod-actions')).toHaveCount(0, { timeout: 10000 });
    await expect(card).toContainText('Desestimada');

    const estadoFinal = await page.evaluate(async (detalle) => {
      const { data } = await window._sb.from('denuncias').select('estado, resolucion')
        .eq('detalle', detalle).order('creado', { ascending: false }).limit(1).maybeSingle();
      return data;
    }, DETALLE);
    expect(estadoFinal?.estado).toBe('resuelta');
    expect(estadoFinal?.resolucion).toBe('desestimada');
  });
});
