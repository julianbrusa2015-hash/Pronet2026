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

  // `loyalty` puede estar apagada en config_app (etapa fundadora). Con la
  // feature off, goTo() bloquea s-loyalty y el test moría con
  // "No se pudo navegar a s-loyalty: la app no quedó lista" — un mensaje que
  // no dice nada del motivo real y costó horas de diagnóstico. Saltearlo es
  // lo correcto: un rojo permanente por una feature apagada a propósito
  // enseña a ignorar los rojos.
  const SIN_LOYALTY = 'loyalty apagada en config_app.features_off';

  test('El prestador solicita el canje', async ({ page }) => {
    await page.goto('/');
    test.skip(!(await H.featureActiva(page, 'loyalty')), SIN_LOYALTY);
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
    test.skip(!(await H.featureActiva(page, 'loyalty')), SIN_LOYALTY);
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

  /** Saca de la base las denuncias que dejó este mismo test.
   *
   *  Sin esto cada corrida suma una denuncia con el MISMO detalle, y el
   *  locator `.mod-card` filtrado por texto empieza a matchear varias: el
   *  test falla por strict mode violation aunque la app funcione perfecto.
   *  Pasó — llegó a haber 3 acumuladas en producción, mezcladas con las
   *  denuncias reales del panel de moderación.
   *
   *  MEDIDO 2026-08-22: el admin NO puede borrar denuncias — no hay policy de
   *  delete sobre la tabla, así que el delete vuelve sin error y sin efecto.
   *  El fallback las marca resueltas: no las saca del panel, pero deja de
   *  haber pendientes falsas compitiendo con las reales, y el locator de abajo
   *  filtra por `.mod-actions` para no tropezar con ellas.
   *
   *  Sacarlas de verdad requiere SQL Editor — ver
   *  supabase-limpiar-denuncias-test.sql. */
  async function limpiarDenunciasDePrueba(page) {
    await page.goto('/');
    await H.login(page, 'admin');
    return page.evaluate(async (detalle) => {
      const sb = window._sb;
      const { data: previas } = await sb.from('denuncias').select('id, estado').eq('detalle', detalle);
      const habia = (previas || []).length;
      if (!habia) return { habia: 0, via: 'nada que limpiar', quedan: 0 };

      // Ni delete ni update directo funcionan sobre `denuncias`: la tabla no
      // tiene policies para ninguno de los dos, así que vuelven sin error y
      // sin efecto. El único camino es la MISMA RPC que usa el panel.
      let resueltas = 0;
      for (const d of previas) {
        if (d.estado === 'resuelta') continue;
        const { data, error } = await sb.rpc('resolver_denuncia', {
          p_denuncia_id: d.id, p_resolucion: 'desestimada',
        });
        if (!error && data && data.ok) resueltas++;
      }

      const { data: despues } = await sb.from('denuncias')
        .select('id').eq('detalle', detalle).neq('estado', 'resuelta');
      return {
        habia, resueltas,
        pendientesQueQuedan: (despues || []).length,
        nota: 'no se pueden borrar desde el cliente; ver supabase-limpiar-denuncias-test.sql',
      };
    }, DETALLE);
  }

  test('Limpieza de corridas anteriores', async ({ page }) => {
    const r = await limpiarDenunciasDePrueba(page);
    console.log('[C10] limpieza previa:', JSON.stringify(r));
  });

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

  // A4 · El denunciado no puede ver la denuncia ni quién la hizo.
  //
  // Se verifica contra la BASE, no contra la pantalla. Que la UI no muestre la
  // denuncia no prueba nada: si el RLS la deja leer, el prestador la saca por
  // la consola en una línea. Es el mismo patrón que dejó forjable el badge
  // `verificado` — la pantalla decía una cosa y la base permitía otra.
  //
  // Importa porque saber QUIÉN denunció convierte la moderación en un riesgo
  // para el denunciante: si el prestador se entera, la represalia es contra un
  // vecino que dio su nombre y su dirección para contratarlo.
  test('A4 · el prestador denunciado no ve la denuncia ni al denunciante', async ({ page }) => {
    await page.goto('/');
    await H.login(page, 'prestador');

    const r = await page.evaluate(async (detalle) => {
      const sb = window._sb;
      const uid = (await sb.auth.getUser()).data.user.id;

      // 1. ¿Puede leer LA denuncia que lo tiene de denunciado?
      const propia = await sb.from('denuncias')
        .select('id, denunciante_id, motivo, detalle').eq('detalle', detalle);

      // 2. ¿Puede leer las denuncias donde figura como denunciado?
      const contraMi = await sb.from('denuncias')
        .select('id, denunciante_id').eq('denunciado_id', uid);

      // 3. ¿Puede leer la tabla entera?
      const todas = await sb.from('denuncias').select('id, denunciante_id, denunciado_id');

      return {
        porDetalle:  { filas: (propia.data || []).length,  error: propia.error ? propia.error.message : null },
        contraMi:    { filas: (contraMi.data || []).length, error: contraMi.error ? contraMi.error.message : null },
        tablaEntera: { filas: (todas.data || []).length,    error: todas.error ? todas.error.message : null },
        // Lo mas sensible: los ids de quienes denunciaron, si es que se filtran.
        denunciantesVisibles: [...new Set([
          ...(propia.data || []).map(d => d.denunciante_id),
          ...(contraMi.data || []).map(d => d.denunciante_id),
          ...(todas.data || []).map(d => d.denunciante_id),
        ])].filter(Boolean).length,
      };
    }, DETALLE);

    console.log('[A4] ' + JSON.stringify(r));

    expect(r.porDetalle.filas, 'el prestador puede leer la denuncia hecha contra el').toBe(0);
    expect(r.contraMi.filas, 'el prestador puede listar las denuncias en su contra').toBe(0);
    expect(r.denunciantesVisibles, 'se filtro la identidad de quien denuncio').toBe(0);
  });

  test('El admin desestima la denuncia', async ({ page }) => {
    await page.goto('/');
    await H.login(page, 'admin');
    await H.irA(page, 's-moderacion');

    // Sólo la tarjeta SIN resolver. Filtrar por texto a secas matcheaba también
    // las denuncias de prueba viejas —que no se pueden borrar desde el cliente,
    // ver limpiarDenunciasDePrueba()— y el test moría por strict mode
    // violation, sin que la app tuviera nada malo.
    //
    // El discriminador es la clase `resuelta`, NO la presencia de
    // `.mod-actions`: las resueltas también lo tienen, con el botón "↩ Reabrir"
    // adentro (app.js, rama else de renderModeracion).
    const card = page.locator('.mod-card:not(.resuelta)').filter({ hasText: DETALLE });
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card).toContainText('Pendiente');

    await card.locator('.mod-btn-ok', { hasText: /desestimar/i }).click();

    // La tarjeta sale del locator —que es `:not(.resuelta)`— porque
    // accionDenuncia() repinta la lista y la fila pasa a estado 'resuelta'.
    // Ésa es la señal de que resolvió.
    //
    // No se afirma el texto "Desestimada" sobre esta misma tarjeta: ya no
    // matchea. Y un locator que incluya las resueltas vuelve a ser ambiguo,
    // porque las denuncias de prueba viejas comparten el detalle exacto. El
    // estado real se verifica contra la base, abajo.
    await expect(card).toHaveCount(0, { timeout: 10000 });

    const estadoFinal = await page.evaluate(async (detalle) => {
      const { data } = await window._sb.from('denuncias').select('estado, resolucion')
        .eq('detalle', detalle).order('creado', { ascending: false }).limit(1).maybeSingle();
      return data;
    }, DETALLE);
    expect(estadoFinal?.estado).toBe('resuelta');
    expect(estadoFinal?.resolucion).toBe('desestimada');
  });

  // Limpiar también al final, no sólo al principio: así el panel de moderación
  // queda como estaba para quien lo mire después de correr la suite.
  test('Limpieza final', async ({ page }) => {
    const r = await limpiarDenunciasDePrueba(page);
    console.log('[C10] limpieza final:', JSON.stringify(r));
  });
});
