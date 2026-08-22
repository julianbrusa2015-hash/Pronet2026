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

/** Borra la solicitud de prueba y apaga la bandera pública.
 *
 *  Va como ADMIN por dos motivos: la policy del prestador
 *  (verificacion_editar_propia) exige estado='pendiente' y no alcanza una
 *  solicitud ya resuelta, y desde el fix del badge forjable el prestador ya
 *  no tiene UPDATE sobre `prestadores.verificado`.
 *
 *  El prestador_id se pide ANTES, en sesión del prestador. La versión previa
 *  lo deducía de la solicitud, y cuando la solicitud ya no existía se salteaba
 *  el apagado del sello — dejando `verificado=true` colgado entre corridas y
 *  haciendo fallar al test siguiente por un motivo que no era el suyo. */
async function limpiar(page) {
  await page.goto('/');
  await H.login(page, 'prestador');
  const pid = await page.evaluate(async () => {
    const { data } = await window._sb.rpc('mi_prestador_id');
    return data;
  });

  await page.goto('/');
  await H.login(page, 'admin');
  return page.evaluate(async ({ pid, dni }) => {
    const sb = window._sb;

    // El sello se apaga por el MISMO camino que usa el panel: la RPC, que es
    // SECURITY DEFINER. Un `update` directo sobre prestadores.verificado ya no
    // funciona para nadie desde el cliente —el revoke por columna alcanza
    // también al admin, porque en Supabase el admin es el rol `authenticated`
    // igual que cualquier usuario. Ese es justamente el punto del fix.
    //
    // resolver_verificacion() apaga la bandera aunque no haya solicitud: el
    // update sobre `prestadores` corre igual, afecte o no filas de la solicitud.
    const rpc = await sb.rpc('resolver_verificacion', {
      p_prestador_id: pid, p_aprobar: false, p_motivo: 'limpieza de test C14',
    });

    // Recién después se borra la solicitud: al revés, la RPC no tendría qué
    // resolver y el motivo quedaría colgado.
    await sb.from('prestadores_verificacion').delete().eq('prestador_id', pid);
    await sb.from('prestadores_verificacion').delete().eq('dni', dni);

    const { data } = await sb.from('prestadores').select('verificado').eq('id', pid).maybeSingle();
    return {
      pid,
      rpc: rpc.error ? ('ERROR ' + rpc.error.message) : JSON.stringify(rpc.data),
      badgeDespues: data && data.verificado,
    };
  }, { pid, dni: DNI_TEST });
}

test.describe.serial('C14 · Verificacion de prestador por DNI', () => {
  test.skip(!H.CUENTAS.admin.pw, 'TEST_ADMIN_PW no configurada');

  test('Limpieza previa', async ({ page }) => {
    const n = await limpiar(page);
    console.log("[C14] limpieza previa:", JSON.stringify(n));
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

    // El toast es la señal de que guardarVerificacion() resolvió ok. Esperarlo
    // antes de leer evita competir con el upsert.
    await expect(page.locator('#edit-verif-estado')).toContainText(/revisión/i, { timeout: 15000 });

    // Un maybeSingle() que vuelve null no dice NADA de por qué: puede ser RLS,
    // cero filas o más de una. Traer el error crudo convierte el rojo en
    // diagnóstico en vez de adivinanza.
    const r = await page.evaluate(async () => {
      const sb = window._sb;
      const uno  = await sb.from('prestadores_verificacion').select('estado, dni, nombre_completo').maybeSingle();
      const todo = await sb.from('prestadores_verificacion').select('prestador_id, estado, dni');
      return {
        fila:  uno.data,
        error: uno.error ? (uno.error.code + ' ' + uno.error.message) : null,
        visibles: (todo.data || []).length,
        errorLista: todo.error ? (todo.error.code + ' ' + todo.error.message) : null,
      };
    });
    console.log('[C14] lectura de la solicitud:', JSON.stringify(r));

    expect(r.fila, 'no se pudo leer la solicitud recien creada: ' +
      (r.error || ('filas visibles=' + r.visibles))).not.toBeNull();
    const fila = r.fila;
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

    // ── Capa 1 · la UI ──────────────────────────────────────────────────
    // pintarVerificacion() deja los campos readOnly y esconde el botón cuando
    // la solicitud ya no está pendiente. (Un page.fill() acá se cuelga hasta
    // el timeout en vez de fallar: el input existe y es visible, sólo que no
    // acepta texto. Por eso se afirma el atributo y no se intenta escribir.)
    await expect(page.locator('#edit-verif-dni')).toHaveAttribute('readonly', /.*/, { timeout: 10000 });
    await expect(page.locator('#edit-verif-nombre')).toHaveAttribute('readonly', /.*/);
    await expect(page.locator('#edit-verif-dir')).toHaveAttribute('readonly', /.*/);
    await expect(page.locator('#edit-verif-btn')).toBeHidden();

    // ── Capa 2 · la base ────────────────────────────────────────────────
    // La que importa: la UI es una cortesía, el servidor es la barrera. Sin
    // esto, esconder el botón sólo probaría que el botón está escondido.
    const r = await page.evaluate(async () => {
      const sb = window._sb;
      const { data: pid } = await sb.rpc('mi_prestador_id');
      const { data, error } = await sb.from('prestadores_verificacion')
        .update({ dni: '30999888', estado: 'pendiente' })
        .eq('prestador_id', pid).select();
      const { data: ahora } = await sb.from('prestadores_verificacion')
        .select('dni, estado').maybeSingle();
      return { filas: (data || []).length, error: error ? error.message : null, ahora };
    });
    expect(r.filas, 'se pudo editar una solicitud ya resuelta').toBe(0);
    expect(r.ahora.dni, 'cambio el DNI de una solicitud ya aprobada').toBe(DNI_TEST);
    expect(r.ahora.estado, 'se pudo volver a pendiente una solicitud aprobada').toBe('verificado');
  });

  test('Limpieza final', async ({ page }) => {
    await limpiar(page);
  });
});
