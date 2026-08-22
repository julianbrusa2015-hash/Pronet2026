// @ts-check
// C16 · Columnas de `perfiles` que sólo debe escribir el servidor.
//
// Hermano del C15 (prestadores). `perfiles` ya se cerró el 2026-08-03
// (supabase-fix-perfiles-columnas-sensibles.sql, tras la auditoría que
// encontró la autopromoción a admin). Este spec existe para que no se
// vuelva a abrir: un `grant update` de más, o una columna nueva agregada
// sin pensar, y el agujero vuelve sin que nadie lo note.
//
// Un `.sql` commiteado no es un `.sql` aplicado. Esto verifica la BASE.
//
// Nota sobre el método: a diferencia del C15 no se lee el valor previo para
// compararlo. `perfiles` tiene los SELECT restringidos por columna, así que
// `roles` o `es_pro_marketplace` ni siquiera se pueden leer. La señal es el
// error de permisos que devuelve PostgREST (42501) al intentar escribirlas.
const { test, expect } = require('@playwright/test');
const H = require('./helpers');

test.describe.configure({ retries: 0 });

// Qué pasa si el usuario las escribe (del comentario del .sql del fix):
//   roles / tipo          → se auto-promueve a admin
//   prestador_id          → se apropia de la ficha de otro prestador
//   es_pro_marketplace    → se activa el plan pago de Entre Vecinos
//   promarket_creditos    → se regala créditos
//   pro_marketplace_hasta → se extiende la vigencia del plan
const VEDADAS = [
  { col: 'roles',                 valor: ['admin'],     porque: 'autopromocion a admin' },
  { col: 'tipo',                  valor: 'admin',       porque: 'autopromocion a admin' },
  { col: 'prestador_id',          valor: null,          porque: 'apropiarse de la ficha de otro' },
  { col: 'es_pro_marketplace',    valor: true,          porque: 'plan pago gratis' },
  { col: 'promarket_creditos',    valor: 9999,          porque: 'creditos regalados' },
  { col: 'pro_marketplace_hasta', valor: '2099-01-01',  porque: 'extiende el plan pago' },
];

// Lo que el usuario SÍ tiene que poder editar de su propio perfil.
//
// `telefono` queda AFUERA a proposito, y el motivo vale documentarlo: es
// escribible pero NO legible. El fix del telefono cosechable
// (supabase-fix-telefono-cosechable.sql) revoco el select para que nadie pueda
// cosechar telefonos, y dejo el update para que uno pueda cargar el suyo.
//
// Consecuencia para este test: no hay forma no destructiva de probar el
// permiso de escritura, porque la tecnica que se usa aca —reescribir el mismo
// valor— exige leerlo primero. Escribir un valor inventado cambiaria el
// telefono real de la cuenta.
const PROPIAS = ['nombre', 'zona'];

test('C16 · el usuario no puede escribir las columnas del servidor en perfiles', async ({ page }) => {
  await page.goto('/');
  await H.login(page, 'vecino');

  const r = await page.evaluate(async (columnas) => {
    const sb = window._sb;
    const uid = (await sb.auth.getUser()).data.user.id;
    const salida = [];
    for (const c of columnas) {
      const { error } = await sb.from('perfiles').update({ [c.col]: c.valor }).eq('id', uid);
      salida.push({
        col: c.col, porque: c.porque,
        // Sin error = la escritura fue aceptada = la columna está abierta.
        // Con 42501 (permission denied) o 42703 (la columna no existe) está
        // fuera del alcance del usuario, que es lo que se busca.
        rechazada: !!error,
        codigo: error ? error.code : null,
      });
    }
    return salida;
  }, VEDADAS);

  for (const c of r) {
    console.log('[C16] ' + (c.rechazada ? 'cerrada  ' : 'ABIERTA  ') + c.col +
      (c.rechazada ? ' (' + c.codigo + ')' : '  → ' + c.porque));
  }

  const abiertas = r.filter(c => !c.rechazada).map(c => c.col + ' (' + c.porque + ')');
  expect(abiertas, 'columnas de perfiles escribibles por el usuario:\n  - ' +
    abiertas.join('\n  - ')).toEqual([]);
});

// La otra mitad, misma logica que el C15: un revoke de mas romperia el
// editor de perfil entero, porque Postgres rechaza el UPDATE completo si
// toca una sola columna sin permiso.
test('C16 · el usuario SÍ puede editar su propio perfil', async ({ page }) => {
  await page.goto('/');
  await H.login(page, 'vecino');

  const r = await page.evaluate(async (columnas) => {
    const sb = window._sb;
    const uid = (await sb.auth.getUser()).data.user.id;
    const { data: antes } = await sb.from('perfiles')
      .select(columnas.join(',')).eq('id', uid).maybeSingle();
    if (!antes) return [{ col: '(lectura)', ok: false, error: 'no se pudo leer el perfil propio' }];

    const salida = [];
    for (const col of columnas) {
      // Reescribir el MISMO valor: prueba el permiso sin cambiar datos.
      const { error } = await sb.from('perfiles').update({ [col]: antes[col] }).eq('id', uid);
      salida.push({ col, ok: !error, error: error ? error.message : null });
    }
    return salida;
  }, PROPIAS);

  for (const c of r) if (!c.ok) console.log('[C16] PERDIDA  ' + c.col + ' → ' + c.error);

  const perdidas = r.filter(c => !c.ok).map(c => c.col + ': ' + c.error);
  expect(perdidas, 'el usuario ya NO puede editar su propio perfil — el revoke ' +
    'se paso de largo:\n  - ' + perdidas.join('\n  - ')).toEqual([]);
});
