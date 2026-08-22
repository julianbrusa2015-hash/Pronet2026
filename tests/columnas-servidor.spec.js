// @ts-check
// C15 · Columnas de `prestadores` que sólo debe escribir el servidor.
//
// Corre contra: https://pronetprueba.netlify.app
//
// Hermano del C14. Aquel encontró que `verificado` era forjable porque RLS
// filtra FILAS y no COLUMNAS: la policy `prestador_edita_su_fila` deja
// escribir la fila propia entera. Cerrar sólo el sello dejaba abierta la misma
// puerta para todo lo demás que vive en esa tabla.
//
// Este spec recorre las columnas que decide el servidor —plan, moderación,
// reputación, beneficios— y verifica que el prestador NO pueda escribirlas.
//
// Cada intento guarda el valor original y lo restaura, para que un test que
// encuentra el agujero no lo deje explotado.
const { test, expect } = require('@playwright/test');
const H = require('./helpers');

test.describe.configure({ retries: 0 });

// Qué significa cada una si el prestador la escribe:
//   suspendido            → se des-suspende solo, anula la moderación
//   plan / premium        → se da el plan pago gratis
//   rating / resenas      → reputación falsa
//   denuncias_confirmadas → se borra los antecedentes
//   es_fundador / limites_fundador_hasta → se auto-otorga beneficios
//   verificado_gracia_hasta → se extiende la gracia del sello
const COLUMNAS = [
  { col: 'suspendido',              valor: false,       porque: 'anula la suspension de un admin' },
  { col: 'plan',                    valor: 'premium',   porque: 'plan pago gratis' },
  { col: 'premium',                 valor: true,        porque: 'plan pago gratis' },
  { col: 'rating',                  valor: 5,           porque: 'reputacion falsa' },
  { col: 'resenas',                 valor: 999,         porque: 'reputacion falsa' },
  { col: 'denuncias_confirmadas',   valor: 0,           porque: 'borra antecedentes' },
  { col: 'es_fundador',             valor: true,        porque: 'beneficios de fundador' },
  { col: 'limites_fundador_hasta',  valor: '2099-01-01', porque: 'beneficios de fundador' },
  { col: 'verificado_gracia_hasta', valor: '2099-01-01', porque: 'extiende la gracia del sello' },
];

test('C15 · el prestador no puede escribir las columnas del servidor', async ({ page }) => {
  await page.goto('/');
  await H.login(page, 'prestador');

  const r = await page.evaluate(async (columnas) => {
    const sb = window._sb;
    const { data: pid } = await sb.rpc('mi_prestador_id');
    const salida = [];

    for (const c of columnas) {
      const { data: antes } = await sb.from('prestadores')
        .select(c.col).eq('id', pid).maybeSingle();
      const original = antes ? antes[c.col] : null;

      // Escribir el valor que ya tiene no probaría nada. Pero el reemplazo
      // NO puede ser null: varias de estas columnas son NOT NULL, y si alguna
      // aceptara el null este test dejaría la fila rota en producción. Se
      // elige otro valor del mismo tipo.
      let valor = c.valor;
      if (JSON.stringify(original) === JSON.stringify(valor)) {
        if (typeof original === 'boolean')      valor = !original;
        else if (typeof original === 'number')  valor = original + 1;
        else                                    valor = '2098-01-01';
      }

      const { error } = await sb.from('prestadores')
        .update({ [c.col]: valor }).eq('id', pid);

      const { data: despues } = await sb.from('prestadores')
        .select(c.col).eq('id', pid).maybeSingle();
      const nuevo = despues ? despues[c.col] : null;
      const cambio = JSON.stringify(nuevo) !== JSON.stringify(original);

      // Si cambió, devolverlo a como estaba: este test no puede dejar la
      // cuenta con un plan regalado ni con la suspensión levantada.
      if (cambio) {
        await sb.from('prestadores').update({ [c.col]: original }).eq('id', pid);
      }

      salida.push({
        col: c.col, porque: c.porque, escribible: cambio,
        error: error ? error.message : null,
      });
    }
    return salida;
  }, COLUMNAS);

  for (const c of r) {
    console.log('[C15] ' + (c.escribible ? 'ABIERTA  ' : 'cerrada  ') + c.col +
      (c.escribible ? '  → ' + c.porque : ''));
  }

  const abiertas = r.filter(c => c.escribible).map(c => c.col + ' (' + c.porque + ')');
  expect(abiertas, 'columnas escribibles por el prestador:\n  - ' +
    abiertas.join('\n  - ')).toEqual([]);
});
