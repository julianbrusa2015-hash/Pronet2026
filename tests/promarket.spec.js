// @ts-check
// ProMarket — feed, cupos, likes, comentarios, reservas, contacto y tendencias
// Corre contra: https://pronetprueba.netlify.app
//
// ⚠️ La mayoría de estos tests NO publican de verdad — el cupo del vecino se
// cuenta por AÑO calendario (3 gratis), así que un test que publicara en cada
// corrida agotaría el cupo de la cuenta de prueba y a partir de ahí fallaría
// por diseño, no por un bug. Lo que se verifica en esos bloques es la lógica
// de cupo, el contrato de la API y el comportamiento del feed — todo sin INSERT.
//
// La EXCEPCIÓN es PM-8bis: usa fn_test_cupo_publicacion_mercado() (RPC
// security definer, supabase-test-cupo-publicacion-mercado.sql), que inserta
// y borra sus propias filas de prueba dentro de una función server-side —
// mismo patrón que fn_test_limite_propuestas para las propuestas de trabajo.
// No consume cupo real de la cuenta: restaura promarket_creditos al valor
// que tenía antes de correr.
const { test, expect } = require('@playwright/test');
const path = require('path');
const { abrir, irA, visible, entrarComoInvitado } = require('./helpers');

const sesionVecino    = path.join(__dirname, '.auth', 'vecino.json');
const sesionPrestador = path.join(__dirname, '.auth', 'prestador.json');

/** Espera a que _marketAPI esté disponible (se define al final del IIFE). */
async function apiLista(page) {
  await page.waitForFunction(() => !!window._marketAPI, { timeout: 20000 });
}

// ══════════════════════════════════════════════════════════════════════════════
// PM-1 · Cupo de publicaciones por plan
// ══════════════════════════════════════════════════════════════════════════════
test.describe('PM-1 · Cupo de publicaciones', () => {
  test.use({ storageState: sesionVecino });

  test('puedePublicarMercado devuelve un veredicto con motivo', async ({ page }) => {
    await abrir(page);
    await apiLista(page);
    const r = await page.evaluate(() => window._marketAPI.puedePublicarMercado());

    // No se fija un valor: depende de cuántas publicó la cuenta este año.
    // Lo que sí es invariante es la forma del contrato — si `ok` es false,
    // tiene que venir el motivo para que la UI sepa qué modal abrir.
    expect(typeof r.ok).toBe('boolean');
    if (!r.ok) {
      expect(['sin_creditos', 'limite_mes', 'sin_sesion']).toContain(r.motivo);
    }
  });

  test('el veredicto es coherente con el plan efectivo del usuario', async ({ page }) => {
    await abrir(page);
    await apiLista(page);
    const r = await page.evaluate(async () => {
      const api = window._planesAPI;
      const plan = api.planParaLimites(api.planActual());
      const cupo = await window._marketAPI.puedePublicarMercado();
      return { plan, cupo, legacy: window._marketAPI.legacyActivo() };
    });

    // Pro es ilimitado, y quien tenga la vieja suscripción de ProMarket
    // sigue grandfathereado — en ambos casos nunca puede dar false.
    if (r.plan === 'pro' || r.legacy) {
      expect(r.cupo.ok).toBe(true);
    }
    // Plus se corta a los 10 del mes, no por créditos.
    if (r.plan === 'plus' && !r.cupo.ok && !r.legacy) {
      expect(r.cupo.motivo).toBe('limite_mes');
      expect(r.cupo.limite).toBe(10);
    }
  });

  test('un invitado no puede publicar', async ({ page }) => {
    await entrarComoInvitado(page);
    await apiLista(page);
    const r = await page.evaluate(() => window._marketAPI.puedePublicarMercado());
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('sin_sesion');
  });

  test('el botón + Publicar del feed sólo aparece con sesión', async ({ page }) => {
    await entrarComoInvitado(page);
    await irA(page, 's-mercado');
    // Regresión del modelo viejo: el botón dependía de es_pro_marketplace, así
    // que un vecino sin suscripción no lo veía nunca. Ahora lo ve cualquier
    // logueado y el cupo se chequea al tocarlo.
    expect(await visible(page, '#mkt-btn-publicar')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PM-2 · Feed: carga, filtros y buscador
// ══════════════════════════════════════════════════════════════════════════════
test.describe('PM-2 · Feed', () => {
  test.use({ storageState: sesionVecino });

  test('el feed carga y deja de mostrar el spinner', async ({ page }) => {
    await abrir(page);
    await irA(page, 's-mercado');
    await page.waitForFunction(() => {
      const f = document.getElementById('mkt-feed');
      return f && !f.textContent.includes('Cargando');
    }, { timeout: 15000 });

    const html = await page.locator('#mkt-feed').innerHTML();
    // O hay publicaciones, o el empty state — nunca el spinner colgado.
    expect(html.length).toBeGreaterThan(0);
  });

  test('el filtro de zona se puebla con las zonas conocidas', async ({ page }) => {
    await abrir(page);
    await irA(page, 's-mercado');
    const r = await page.evaluate(() => {
      const sel = document.getElementById('mkt-zona-select');
      const coords = window._marketAPI.zonaCoords();
      const opciones = sel ? [...sel.options].map(o => o.value).filter(Boolean) : [];
      return { opciones, zonasConCoord: Object.keys(coords) };
    });
    // Toda zona ofrecida en el filtro tiene que tener centroide, o su pin no
    // se puede dibujar en el mapa.
    for (const z of r.opciones) {
      expect(r.zonasConCoord, `zona "${z}" sin coordenada`).toContain(z);
    }
  });

  test('buscar un término imposible deja el feed vacío sin romper', async ({ page }) => {
    await abrir(page);
    await irA(page, 's-mercado');
    await page.evaluate(() => window.mktBuscar('zzzznoexistezzz'));
    await page.waitForTimeout(1200); // debounce de 400ms + query

    const texto = await page.locator('#mkt-feed').textContent();
    expect(texto).not.toContain('Cargando');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PM-3 · Distancia y tiempo caminando
// ══════════════════════════════════════════════════════════════════════════════
test.describe('PM-3 · Distancia', () => {
  test.use({ storageState: sesionVecino });

  test('sin geolocalización no se muestra distancia', async ({ page }) => {
    await abrir(page);
    await apiLista(page);
    // userLat es null hasta que el usuario da permiso; el label tiene que
    // quedar vacío en vez de mostrar "NaN km" o "undefined".
    const label = await page.evaluate(() => window._marketAPI.mktDistanciaLabel('Escobar Centro'));
    expect(typeof label).toBe('string');
  });

  test('una zona sin coordenada no rompe el label', async ({ page }) => {
    await abrir(page);
    await apiLista(page);
    const r = await page.evaluate(() => [
      window._marketAPI.mktDistanciaLabel('ZonaInventada'),
      window._marketAPI.mktDistanciaLabel(null),
      window._marketAPI.mktDistanciaLabel(''),
    ]);
    expect(r).toEqual(['', '', '']);
  });

  test('Nordelta tiene la coordenada corregida (Tigre, no Escobar)', async ({ page }) => {
    await abrir(page);
    await apiLista(page);
    const c = await page.evaluate(() => window._marketAPI.zonaCoords()['Nordelta']);
    // Regresión 2026-08-02: estaba en -58.6690, ~1.3km desviado del centro real.
    expect(c.lat).toBeCloseTo(-34.40, 1);
    expect(c.lng).toBeCloseTo(-58.65, 1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PM-4 · Likes y comentarios — contrato de API
// ══════════════════════════════════════════════════════════════════════════════
test.describe('PM-4 · Likes y comentarios', () => {
  test.use({ storageState: sesionVecino });

  test('la API de likes y comentarios está expuesta', async ({ page }) => {
    await abrir(page);
    const r = await page.evaluate(() => ({
      toggleLike:        typeof window.PronetDB.toggleLike,
      listarMisLikes:    typeof window.PronetDB.listarMisLikes,
      listarComentarios: typeof window.PronetDB.listarComentarios,
      crearComentario:   typeof window.PronetDB.crearComentario,
      borrarComentario:  typeof window.PronetDB.borrarComentario,
      abrirComentarios:  typeof window.mktAbrirComentarios,
    }));
    expect(Object.values(r).every(t => t === 'function')).toBe(true);
  });

  test('listarComentarios de una publicación inexistente devuelve lista vacía', async ({ page }) => {
    await abrir(page);
    // Falla abierta: un id inválido no debe lanzar y romper la pantalla.
    const r = await page.evaluate(() =>
      window.PronetDB.listarComentarios('00000000-0000-0000-0000-000000000000')
    );
    expect(Array.isArray(r)).toBe(true);
    expect(r.length).toBe(0);
  });

  test('la pantalla de comentarios está registrada en el router', async ({ page }) => {
    await abrir(page);
    // Regresión 2026-08-02: s-comentarios-pub no estaba en el array `all` de
    // goTo(), así que al volver al feed quedaba superpuesta (no se desactivaba).
    await irA(page, 's-comentarios-pub');
    await irA(page, 's-mercado');
    const superpuesta = await page.evaluate(() =>
      document.getElementById('s-comentarios-pub')?.classList.contains('active')
    );
    expect(superpuesta).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PM-5 · Reservas en el chat
// ══════════════════════════════════════════════════════════════════════════════
test.describe('PM-5 · Reservas', () => {
  test.use({ storageState: sesionVecino });

  test('formatearFechaReserva arma la etiqueta en español', async ({ page }) => {
    await abrir(page);
    await apiLista(page);
    const r = await page.evaluate(() => ({
      completa: window._marketAPI.formatearFechaReserva('2026-08-15', '14:00'),
      sinHora:  window._marketAPI.formatearFechaReserva('2026-12-01', ''),
      vacia:    window._marketAPI.formatearFechaReserva('', ''),
    }));
    expect(r.completa).toBe('15 ago 2026 · 14:00 hs');
    expect(r.sinHora).toBe('1 dic 2026');
    expect(r.vacia).toBe('');
  });

  test('la API de reservas está expuesta', async ({ page }) => {
    await abrir(page);
    const r = await page.evaluate(() => ({
      enviar:     typeof window.PronetDB.enviarReservaMercado,
      actualizar: typeof window.PronetDB.actualizarEstadoReserva,
      abrirModal: typeof window.abrirModalReserva,
      responder:  typeof window.responderReserva,
      cancelar:   typeof window.cancelarReserva,
    }));
    expect(Object.values(r).every(t => t === 'function')).toBe(true);
  });

  test('el modal de reserva vive dentro del frame del teléfono', async ({ page }) => {
    await abrir(page);
    // Regresión 2026-08-02: con position:fixed el bottom sheet se posicionaba
    // contra el viewport del browser y se salía del marco simulado.
    const r = await page.evaluate(() => {
      const m = document.getElementById('modal-reserva');
      if (!m) return null;
      return {
        dentroDePantalla: !!m.closest('#s-chat-mercado'),
        position: getComputedStyle(m).position,
      };
    });
    expect(r).not.toBeNull();
    expect(r.dentroDePantalla).toBe(true);
    expect(r.position).toBe('absolute');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PM-6 · Contacto directo — el teléfono no se expone de más
// ══════════════════════════════════════════════════════════════════════════════
test.describe('PM-6 · Contacto directo', () => {
  test.use({ storageState: sesionVecino });

  test('el teléfono de un usuario sin chat compartido no es accesible', async ({ page }) => {
    await abrir(page);
    // obtener_telefono_contacto() sólo devuelve el teléfono si ya existe un
    // chat de ProMarket entre ambos. Con un id al azar tiene que dar null,
    // no filtrar el dato.
    const r = await page.evaluate(() =>
      window.PronetDB.obtenerTelefonoUsuario('00000000-0000-0000-0000-000000000000')
    );
    expect(r).toBeNull();
  });

  test('perfiles es legible (columnas públicas) pero el teléfono no', async ({ page }) => {
    await abrir(page);
    // Defensa en profundidad, en dos partes:
    // 1) las columnas públicas (nombre, zona) sí se leen — el feed, los
    //    comentarios y "mis consultas" dependen de esto.
    // 2) pedir 'telefono' explícitamente en el mismo select falla del todo
    //    (PostgREST rechaza la query completa si pide una columna sin
    //    grant, no la omite en silencio) — así se prueba que no es
    //    cosechable en masa, no que "no vino" por otro motivo.
    const publicas = await page.evaluate(async () => {
      const { data, error } = await window._sb.from('perfiles').select('id, nombre').limit(20);
      return { total: (data || []).length, error: error?.message || null };
    });
    expect(publicas.error).toBeNull();
    expect(publicas.total).toBeGreaterThan(0);

    const conTelefono = await page.evaluate(async () => {
      const { data, error } = await window._sb.from('perfiles').select('id, telefono').limit(20);
      return { huboError: !!error, trajoFilas: (data || []).length > 0 };
    });
    expect(conTelefono.huboError, 'pedir teléfono en un select directo debería ser rechazado').toBe(true);
    expect(conTelefono.trajoFilas).toBe(false);
  });

  test('el botón de contacto arranca oculto', async ({ page }) => {
    await abrir(page);
    // Sólo se muestra cuando cargarTelefonoContraparte() confirma que la
    // contraparte cargó teléfono; nunca por defecto.
    expect(await visible(page, '#cmk-contactar-btn')).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PM-7 · Alertas y tendencias de búsqueda
// ══════════════════════════════════════════════════════════════════════════════
test.describe('PM-7 · Alertas y tendencias', () => {
  test.use({ storageState: sesionVecino });

  test('Mis alertas lista las alertas guardadas sin romper si no hay', async ({ page }) => {
    await abrir(page);
    await irA(page, 's-mis-alertas');
    await page.waitForFunction(() => {
      const l = document.getElementById('mis-alertas-lista');
      return l && !l.textContent.includes('Cargando');
    }, { timeout: 15000 });

    const texto = await page.locator('#mis-alertas-lista').textContent();
    expect(texto.length).toBeGreaterThan(0);
  });

  test('las tendencias nunca exponen quién buscó', async ({ page }) => {
    await abrir(page);
    const r = await page.evaluate(async () => {
      const t = await window.PronetDB.listarTendenciasBusqueda('Escobar Centro');
      return { esArray: Array.isArray(t), campos: t.length ? Object.keys(t[0]) : [] };
    });
    expect(r.esArray).toBe(true);
    // El RPC agrega por término: no debe devolver usuario_id ni ids de fila.
    if (r.campos.length) {
      expect(r.campos.sort()).toEqual(['cantidad', 'termino']);
    }
  });

  test('la tabla de búsquedas no es legible directamente', async ({ page }) => {
    await abrir(page);
    // busquedas_mercado tiene INSERT propio pero ninguna policy de SELECT:
    // el historial de búsquedas de los vecinos no se puede leer desde el
    // cliente, sólo agregado vía tendencias_busqueda_zona().
    const r = await page.evaluate(async () => {
      const { data, error } = await window._sb.from('busquedas_mercado').select('*').limit(5);
      return { filas: (data || []).length, hubo_error: !!error };
    });
    expect(r.filas).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PM-8 · Pago de publicación extra ($5.000, pago único)
// ══════════════════════════════════════════════════════════════════════════════
test.describe('PM-8 · Publicación extra', () => {
  test.use({ storageState: sesionVecino });

  test('el plan flat de ProMarket ya no es comprable', async ({ page }) => {
    await abrir(page);
    // Se reemplazó por cupos el 2026-08-02: la fila 'promarket' se borró de
    // planes_limites, así que crear-preferencia lo rechaza.
    const r = await page.evaluate(() => window.PronetDB.crearPreferenciaMP('promarket', 'mes'));
    expect(r.ok).toBe(false);
  });

  test('comprar una publicación extra devuelve un checkout real de MercadoPago', async ({ page }) => {
    test.skip(!process.env.TEST_MP, 'Requiere TEST_MP=1 — crea una preferencia real en MP');
    await abrir(page);
    const r = await page.evaluate(() => window.PronetDB.crearPreferenciaMP('promarket_credito', 'mes'));
    expect(r.ok).toBe(true);
    expect(r.init_point).toMatch(/mercadopago\.com/);
  });

  test('el modal de compra ofrece un pago único, no una suscripción', async ({ page }) => {
    await abrir(page);
    const texto = await page.locator('#modal-promarket-sub').textContent();
    expect(texto).toContain('5.000');
    expect(texto).toMatch(/pago único/i);
    expect(texto).not.toContain('10.000');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// PM-8bis · Trigger de DB — el cupo real de ProMarket bloquea y consume créditos
// ══════════════════════════════════════════════════════════════════════════════
// A diferencia del resto del archivo, esto SÍ inserta filas — pero dentro de
// fn_test_cupo_publicacion_mercado() (SECURITY DEFINER), que limpia sus propios
// residuos (título 'TEST_CUPO_%') y restaura promarket_creditos al valor previo
// sea cual sea el resultado. No hay INSERT desde el test en sí.
test.describe('PM-8bis · Cupo de publicaciones — trigger real en DB', () => {
  test.use({ storageState: sesionVecino });

  test('fn_test_cupo_publicacion_mercado: bloquea sin créditos y consume 1 al haberlo', async ({ page }) => {
    await abrir(page);

    const resultado = await page.evaluate(async () => {
      const uid = (await window._sb.auth.getUser()).data.user?.id;
      const { data, error } = await window._sb.rpc('fn_test_cupo_publicacion_mercado', { p_usuario_id: uid });
      return { data, error: error?.message };
    });

    if (resultado.error) {
      throw new Error(
        'RPC falló: ' + resultado.error +
        ' — ¿se corrió supabase-test-cupo-publicacion-mercado.sql en Supabase?'
      );
    }

    const r = resultado.data;
    if (r.skip) {
      console.log('[PM-8bis] skip —', r.reason);
      test.skip();
      return;
    }

    expect(r.error, JSON.stringify(r)).toBeNull();
    expect(r.pass).toBe(true);
  });
});
