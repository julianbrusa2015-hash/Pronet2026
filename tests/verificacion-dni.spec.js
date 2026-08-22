// @ts-check
// C14 · Verificación de prestador (DNI) — el prestador declara, el admin resuelve.
//
// Corre contra: https://pronetprueba.netlify.app
// Necesita TEST_ADMIN_PW en .env.local — si no está, se saltea solo.
//
// El circuito vive en supabase-verificacion-prestador.sql:
//   prestador → upsert en prestadores_verificacion (estado 'pendiente')
//   admin     → resolver_verificacion() → estado final + prestadores.verificado
//
// Lo que importa acá no es sólo el camino feliz: el badge "verificado" es una
// promesa al vecino, así que hay que probar que NO se pueda encender sin que
// un admin haya mirado. De ahí el test de seguridad del medio.
//
// A diferencia de C10, este spec limpia lo que crea (antes y después): si no,
// cada corrida deja una solicitud y los locators empiezan a matchear de más.
const { test, expect } = require('@playwright/test');
const H = require('./helpers');

test.describe.configure({ retries: 0 });

const DNI_TEST  = '30111222';
const NOMBRE    = 'Prestador Test Verificacion';
const DIRECCION = 'Calle Falsa 123, Escobar';

/** Borra la solicitud del DNI de prueba y apaga la bandera pública.
 *  Va como ADMIN porque la policy del prestador (verificacion_editar_propia)
 *  exige estado='pendiente' y no alcanza una solicitud ya resuelta. */
async function limpiarComoAdmin(page) {
  await page.goto('/');
  await H.login(page, 'admin');
  return page.evaluate(async (dni) => {
    const sb = window._sb;
    const { data: filas } = await sb.from('prestadores_verificacion')
      .select('prestador_id').eq('dni', dni);
    for (const f of filas || []) {
      await sb.from('prestadores_verificacion').delete().eq('prestador_id', f.prestador_id);
      await sb.from('prestadores').update({ verificado: false, verificado_en: null })
        .eq('id', f.prestador_id);
    }
    return (filas || []).length;
  }, DNI_TEST);
}

test.describe.serial('C14 · Verificacion de prestador por DNI', () => {
  test.skip(!H.CUENTAS.admin.pw, 'TEST_ADMIN_PW no configurada');

  test('Limpieza previa', async ({ page }) => {
    const n = await limpiarComoAdmin(page);
    console.log('[C14] solicitudes previas borradas:', n);
  });

  test('El prestador declara sus datos y queda pendiente', async ({ page }) => {
    await page.goto('/');
    await H.login(page, 'prestador');
    await H.irA(page, 's-edit-perfil');

    // El bloque sólo se pinta para cuentas con prestador_id. Si no está
    // visible, la cuenta de test perdió el rol y el resto no tiene sentido.
    await expect(page.locator('#edit-verif-field')).toBeVisible({ timeout: 10000 });

    await page.fill('#edit-verif-nombre', NOMBRE);
    await page.fill('#edit-verif-dni', DNI_TEST);
    await page.fill('#edit-verif-dir', DIRECCION);
    await page.click('#edit-verif-btn');

    const fila = await page.waitForFunction(async () => {
      const { data } = await window._sb.from('prestadores_verificacion')
        .select('estado, dni, nombre_completo').maybeSingle();
      return data && data.dni ? data : null;
    }, null, { timeout: 15000 }).then(h => h.jsonValue());

    expect(fila.estado, 'la solicitud no quedo pendiente').toBe('pendiente');
    expect(fila.dni).toBe(DNI_TEST);
    expect(fila.nombre_completo).toBe(NOMBRE);

    // Completar el formulario NO enciende la bandera publica.
    const verificado = await page.evaluate(async () => {
      const sb = window._sb;
      const { data: pid } = await sb.rpc('mi_prestador_id');
      const { data } = await sb.from('prestadores')
        .select('verificado').eq('id', pid).maybeSingle();
      return data && data.verificado;
    });
    expect(verificado, 'el badge se encendio sin que un admin revisara').toBeFalsy();
  });

  test('SEGURIDAD · el prestador no puede autoaprobarse', async ({ page }) => {
    await page.goto('/');
    await H.login(page, 'prestador');

    // El `with check` de verificacion_editar_propia mira la fila DESPUES del
    // cambio: un update a 'verificado' tiene que quedar sin efecto.
    const r = await page.evaluate(async () => {
      const sb = window._sb;
      const { data: pid } = await sb.rpc('mi_prestador_id');
      const { data, error } = await sb.from('prestadores_verificacion')
        .update({ estado: 'verificado' })
        .eq('prestador_id', pid).select();
      return { filas: (data || []).length, error: error ? error.message : null };
    });
    expect(r.filas, 'el prestador cambio su propio estado a verificado').toBe(0);

    // Y tampoco por la puerta de atras: encender prestadores.verificado directo.
    const badge = await page.evaluate(async () => {
      const sb = window._sb;
      const { data: pid } = await sb.rpc('mi_prestador_id');
      await sb.from('prestadores').update({ verificado: true }).eq('id', pid);
      const { data } = await sb.from('prestadores')
        .select('verificado').eq('id', pid).maybeSingle();
      return data && data.verificado;
    });
    expect(badge, 'el prestador encendio su propio badge en prestadores').toBeFalsy();
  });

  test('El admin la ve en la cola y la aprueba', async ({ page }) => {
    await page.goto('/');
    await H.login(page, 'admin');
    await H.irA(page, 's-verificaciones');

    const card = page.locator('#verif-lista > div').filter({ hasText: DNI_TEST });
    await expect(card, 'la solicitud no aparece en la cola del admin').toBeVisible({ timeout: 15000 });
    await expect(card).toContainText(NOMBRE);
    await expect(card).toContainText(DIRECCION);

    await card.getByRole('button', { name: /Verificar/ }).click();

    // renderVerificaciones() repinta al terminar: que la tarjeta salga del
    // filtro 'pendiente' es la senal de que resolver_verificacion() resolvio.
    await expect(card).toHaveCount(0, { timeout: 15000 });

    const estado = await page.evaluate(async (dni) => {
      const sb = window._sb;
      const { data: v } = await sb.from('prestadores_verificacion')
        .select('prestador_id, estado, revisado_en').eq('dni', dni).maybeSingle();
      const { data: p } = await sb.from('prestadores')
        .select('verificado').eq('id', v.prestador_id).maybeSingle();
      return { solicitud: v.estado, revisado: !!v.revisado_en, badge: p && p.verificado };
    }, DNI_TEST);

    expect(estado.solicitud).toBe('verificado');
    expect(estado.revisado, 'no quedo registro de quien reviso').toBe(true);
    expect(estado.badge, 'el admin aprobo pero el badge publico no se encendio').toBe(true);
  });

  test('Ya resuelta, el prestador no puede reeditarla', async ({ page }) => {
    await page.goto('/');
    await H.login(page, 'prestador');
    await H.irA(page, 's-edit-perfil');

    await page.fill('#edit-verif-dni', '30999888');
    await page.click('#edit-verif-btn');

    // guardarVerificacion() devuelve el mensaje de "ya fue revisada" cuando el
    // RLS filtra sin error y el upsert vuelve con cero filas.
    await expect(page.locator('#edit-verif-error')).toBeVisible({ timeout: 10000 });

    const dni = await page.evaluate(async () => {
      const { data } = await window._sb.from('prestadores_verificacion')
        .select('dni').maybeSingle();
      return data && data.dni;
    });
    expect(dni, 'se pudo cambiar el DNI de una solicitud ya aprobada').toBe(DNI_TEST);
  });

  test('Limpieza final', async ({ page }) => {
    await limpiarComoAdmin(page);
  });
});
