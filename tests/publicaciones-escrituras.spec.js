// @ts-check
// C18 · publicaciones_prestador: lo que el cliente NO puede escribir.
//
// Cuarto de la familia C15 (prestadores) / C16 (perfiles) / C17 (loyalty).
// Auditado 2026-08-22: esta tabla esta LIMPIA y es, de las auditadas, la mejor
// diseñada — supabase-publicaciones-prestador.sql revoca insert/update a nivel
// tabla y re-otorga solo (titulo, descripcion, rubro, foto_url, estado).
//
// Lo que protege:
//   impulso_hasta   → el boost PAGO. Escribible = impulso gratis, y
//                     activar_impulso_pagado() (revocada del cliente) queda
//                     sin sentido porque se llega al mismo lugar por al lado.
//   vigencia_hasta  → la renovacion PAGA, mismo razonamiento.
//   moderado_por / moderado_en / motivo_rechazo → la auditoria de moderacion.
//   renovaciones    → el contador de renovaciones consumidas.
//
// ── Por que no hace falta una fila propia ─────────────────────────────
// El chequeo de GRANT por columna ocurre ANTES que RLS: si la columna no esta
// otorgada, PostgREST devuelve 42501 sin importar a que fila apunte el filtro.
// Asi que se prueba contra cualquier fila, sin tocar datos y sin depender de
// que la cuenta de test tenga publicaciones.
const { test, expect } = require('@playwright/test');
const H = require('./helpers');

test.describe.configure({ retries: 0 });

const VEDADAS = [
  { col: 'impulso_hasta',   valor: '2099-01-01', porque: 'impulso pago gratis' },
  { col: 'vigencia_hasta',  valor: '2099-01-01', porque: 'renovacion paga gratis' },
  { col: 'moderado_por',    valor: null,          porque: 'borra la auditoria de moderacion' },
  { col: 'moderado_en',     valor: '2099-01-01', porque: 'falsea cuando se modero' },
  { col: 'motivo_rechazo',  valor: 'nada',        porque: 'borra el motivo del rechazo' },
  { col: 'renovaciones',    valor: 0,             porque: 'renovaciones infinitas' },
  { col: 'publicada_desde', valor: '2099-01-01', porque: 'falsea la antiguedad' },
];

test('C18 · el prestador no puede escribir las columnas del servidor', async ({ page }) => {
  await page.goto('/');
  await H.login(page, 'prestador');

  const r = await page.evaluate(async (columnas) => {
    const sb = window._sb;
    const NADIE = '00000000-0000-0000-0000-000000000000';
    const salida = [];
    for (const c of columnas) {
      const { error } = await sb.from('publicaciones_prestador')
        .update({ [c.col]: c.valor }).eq('id', NADIE);
      salida.push({
        col: c.col, porque: c.porque,
        rechazada: !!error && (error.code === '42501' || error.code === 'PGRST204'),
        codigo: error ? error.code : null,
      });
    }
    return salida;
  }, VEDADAS);

  for (const c of r) {
    console.log('[C18] ' + (c.rechazada ? 'cerrada  ' : 'ABIERTA  ') + c.col +
      (c.rechazada ? ' (' + c.codigo + ')' : '  → ' + c.porque));
  }

  const abiertas = r.filter(c => !c.rechazada).map(c => c.col + ' → ' + c.porque);
  expect(abiertas, 'columnas de publicaciones_prestador escribibles por el ' +
    'prestador:\n  - ' + abiertas.join('\n  - ')).toEqual([]);
});

test('C18 · un prestador no puede editar la publicacion de otro', async ({ page }) => {
  await page.goto('/');
  await H.login(page, 'prestador');

  const r = await page.evaluate(async () => {
    const sb = window._sb;
    const { data: pid } = await sb.rpc('mi_prestador_id');
    const { data: filas } = await sb.from('publicaciones_prestador').select('*').limit(20);
    const ajena = (filas || []).find(f => f.prestador_id && f.prestador_id !== pid);
    if (!ajena) return { sinAjena: true };

    // Se prueba con `titulo`, que el DUEÑO si puede editar. Probar una columna
    // vedada para todos (creado, por ejemplo) no distinguiria "lo freno RLS"
    // de "esa columna no la escribe nadie" — el primer intento de este test
    // cayo justo en esa trampa.
    const orig = ajena.titulo;
    await sb.from('publicaciones_prestador').update({ titulo: orig + '_AUDIT' }).eq('id', ajena.id);
    const { data: post } = await sb.from('publicaciones_prestador')
      .select('titulo').eq('id', ajena.id).maybeSingle();
    const cambio = post && post.titulo !== orig;
    if (cambio) await sb.from('publicaciones_prestador').update({ titulo: orig }).eq('id', ajena.id);
    return { editoAjena: !!cambio };
  });

  if (r.sinAjena) { console.log('[C18] no habia publicacion ajena para probar'); return; }
  console.log('[C18] editar publicacion ajena: ' + (r.editoAjena ? 'ABIERTA' : 'cerrada'));
  expect(r.editoAjena, 'un prestador pudo editar la publicacion de otro').toBe(false);
});
