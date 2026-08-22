// @ts-check
// C17 · Las tablas de loyalty no se escriben desde el cliente.
//
// Tercero de la familia C15 (prestadores) / C16 (perfiles). Auditado
// 2026-08-22: loyalty esta limpia, no hubo nada que arreglar. Este spec es la
// red de contencion — un grant de mas o una policy nueva reabren el agujero y
// nadie se entera.
//
// Los puntos son dinero: si se pueden escribir desde el cliente, el programa
// entero deja de significar algo.
//
// ── Dos capas, dos formas de romperse ─────────────────────────────────
// El GRANT dice "podes tocar esta tabla"; RLS dice "estas filas y bajo estas
// condiciones". Una tabla puede tener el GRANT suelto y estar igual protegida
// por RLS. Por eso hay dos bloques de tests con tecnicas distintas: no
// alcanza con probar una sola capa.
const { test, expect } = require('@playwright/test');
const H = require('./helpers');

test.describe.configure({ retries: 0 });

// Saldos y movimientos. Aca el GRANT esta revocado (supabase-canjes-rpc.sql),
// asi que PostgREST devuelve 42501 antes de mirar una sola fila.
const TABLAS_SALDO = ['loyalty', 'loyalty_historial', 'loyalty_solicitudes'];

test('C17 · saldos e historial de puntos: sin escritura desde el cliente', async ({ page }) => {
  await page.goto('/');
  await H.login(page, 'prestador');

  const r = await page.evaluate(async (tablas) => {
    const sb = window._sb;
    // Un id que no existe: si falta el permiso da 42501 antes de resolver el
    // filtro, y si el permiso estuviera, afectaria CERO filas. Se audita el
    // permiso sin tocar un solo dato real — no hace falta restaurar nada.
    const NADIE = '00000000-0000-0000-0000-000000000000';
    const salida = [];
    for (const t of tablas) {
      const upd = await sb.from(t).update({ id: NADIE }).eq('id', NADIE);
      const del = await sb.from(t).delete().eq('id', NADIE);
      // Payload vacio: si falta el permiso da 42501; si estuviera, lo
      // rechazaria una constraint con OTRO codigo. Ese codigo distinto es la
      // señal de que el GRANT esta. Tampoco llega a crear nada.
      const ins = await sb.from(t).insert({}).select();
      const cod = (e) => (e ? e.code : null);
      salida.push({ tabla: t, update: cod(upd.error), delete: cod(del.error), insert: cod(ins.error) });
    }
    return salida;
  }, TABLAS_SALDO);

  const abiertas = [];
  for (const f of r) {
    for (const op of ['update', 'delete', 'insert']) {
      const ok = f[op] === '42501';
      if (!ok) abiertas.push(f.tabla + '.' + op + ' (codigo ' + f[op] + ')');
    }
    console.log('[C17] ' + f.tabla.padEnd(22) + ' upd=' + f.update + ' del=' + f.delete + ' ins=' + f.insert);
  }
  expect(abiertas, 'operaciones permitidas sobre los puntos:\n  - ' +
    abiertas.join('\n  - ')).toEqual([]);
});

// Catalogo. Aca el GRANT de update/delete SI esta, y lo que protege es RLS.
// Por eso no sirve el sondeo con un id inexistente: RLS filtra en silencio y
// "cero filas afectadas" seria indistinguible de "bloqueado". Hay que intentar
// sobre una fila REAL y ver si cambio.
const CATALOGO = [
  { tabla: 'loyalty_canjes', columna: 'costo_puntos', porque: 'un premio a costo cero' },
  { tabla: 'loyalty_reglas', columna: 'puntos',       porque: 'acreditarse mas puntos por accion' },
];

test('C17 · catalogo de canjes y reglas: RLS impide editarlo', async ({ page }) => {
  await page.goto('/');
  await H.login(page, 'prestador');

  const r = await page.evaluate(async (casos) => {
    const sb = window._sb;
    const salida = [];
    for (const c of casos) {
      const { data: filas } = await sb.from(c.tabla).select('*').limit(1);
      if (!filas || !filas.length) { salida.push({ ...c, sinDatos: true }); continue; }
      const fila = filas[0];
      const original = fila[c.columna];
      if (typeof original !== 'number') { salida.push({ ...c, sinDatos: true }); continue; }

      await sb.from(c.tabla).update({ [c.columna]: original + 1 }).eq('id', fila.id);
      const { data: post } = await sb.from(c.tabla).select(c.columna).eq('id', fila.id).maybeSingle();
      const cambio = post && post[c.columna] !== original;

      // Si cambio, devolverlo: este test no puede dejar el catalogo alterado.
      if (cambio) await sb.from(c.tabla).update({ [c.columna]: original }).eq('id', fila.id);
      salida.push({ ...c, escribible: !!cambio });
    }
    return salida;
  }, CATALOGO);

  for (const c of r) {
    if (c.sinDatos) { console.log('[C17] ' + c.tabla + ': sin filas para probar'); continue; }
    console.log('[C17] ' + c.tabla.padEnd(22) + (c.escribible ? 'ABIERTA → ' + c.porque : 'cerrada (RLS)'));
  }

  const abiertas = r.filter(c => c.escribible).map(c => c.tabla + '.' + c.columna + ' → ' + c.porque);
  expect(abiertas, 'el catalogo de loyalty es editable por un usuario comun:\n  - ' +
    abiertas.join('\n  - ')).toEqual([]);
});
