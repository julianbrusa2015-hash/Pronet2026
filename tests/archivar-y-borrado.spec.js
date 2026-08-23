// @ts-check
// C19 · Archivar y borrado condicionado.
//
// Cubre la regla "borrás lo que es tuyo; lo que involucró a otro, se
// archiva": un pedido que nadie respondió se sigue pudiendo borrar, uno con
// propuestas no, y archivar es la salida para sacárselo de la vista sin
// destruir el registro del prestador.
//
// La propuesta la inserta Node por la Management API en vez de abrir una
// segunda sesión de prestador: lo que se está probando es qué puede hacer
// EL VECINO con un pedido que ya tiene propuestas, y un segundo contexto de
// browser sólo agrega los gates de tutorial y T&C al camino.
const { test, expect } = require('@playwright/test');
const H = require('./helpers');

const TITULO = `Test E2E – archivar ${Date.now()}`;

async function sqlAdmin(sql) {
  const pat = process.env.SUPABASE_PAT, ref = process.env.SUPABASE_PROJECT_REF;
  if (!pat || !ref) return { skip: true };
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0, 300)}`);
  return JSON.parse(txt);
}

test.describe.serial('Archivar y borrar', () => {
  test.skip(!process.env.SUPABASE_PAT, 'Necesita SUPABASE_PAT para armar el escenario');

  /** @type {string} */ let pedidoId;

  test('Sin propuestas, el vecino sigue pudiendo borrar su pedido', async ({ page }) => {
    await page.goto('/');
    await H.login(page, 'vecino');

    const r = await page.evaluate(async (titulo) => {
      const sb = window._sb;
      const uid = (await sb.auth.getUser()).data.user.id;

      // El que va a quedar para los pasos siguientes.
      const { data, error } = await sb.from('pedidos').insert({
        usuario_id: uid, titulo, descripcion: 'Prueba de archivado.',
        rubro: 'Electricistas', zona: 'Escobar', estado: 'Publicado',
      }).select('id').single();
      if (error) return { error: error.message };

      // Y uno descartable, para comprobar que el caso legítimo no se rompió.
      const copia = await sb.from('pedidos').insert({
        usuario_id: uid, titulo: titulo + ' (descartable)', descripcion: 'x',
        rubro: 'Electricistas', zona: 'Escobar', estado: 'Cerrado',
      }).select('id').single();
      await sb.from('pedidos').delete().eq('id', copia.data.id);
      const { data: sigue } = await sb.from('pedidos').select('id').eq('id', copia.data.id);

      return { pedidoId: data.id, borradoSinPropuestas: (sigue || []).length === 0 };
    }, TITULO);

    console.log('[PASO 1]', JSON.stringify(r));
    expect(r.error).toBeUndefined();
    expect(r.borradoSinPropuestas).toBeTruthy();
    pedidoId = r.pedidoId;
  });

  test('Con una propuesta, el pedido ya no se borra', async ({ page }) => {
    await sqlAdmin(`
      insert into public.propuestas (prestador_id, pedido_id, precio, plazo, mensaje, estado)
      select p.id, '${pedidoId}', 9999, 'coordinar', 'Test E2E archivar', 'pendiente'
        from public.prestadores p limit 1;`);

    await page.goto('/');
    await H.login(page, 'vecino');
    const r = await page.evaluate(async (pid) => {
      const sb = window._sb;
      const del = await sb.from('pedidos').delete().eq('id', pid);
      const { data: sigue } = await sb.from('pedidos').select('id').eq('id', pid);
      return {
        errorDelete: del.error ? del.error.message : null,
        sigueExistiendo: (sigue || []).length > 0,
      };
    }, pedidoId);

    console.log('[PASO 2]', JSON.stringify(r));
    // RLS no devuelve error: filtra las filas y borra cero. Lo que importa
    // es que el pedido —y con él la propuesta y el chat— siga estando.
    expect(r.sigueExistiendo).toBeTruthy();
  });

  test('Archivar: bloqueado si está publicado, permitido una vez cerrado', async ({ page }) => {
    await page.goto('/');
    await H.login(page, 'vecino');

    const r = await page.evaluate(async (pid) => {
      const sb = window._sb;
      const out = {};
      const uid = (await sb.auth.getUser()).data.user.id;

      const a = await sb.rpc('archivar', { p_tipo: 'pedido', p_ref_id: pid, p_archivar: true });
      out.publicado = a.error ? 'RECHAZADO: ' + a.error.message : 'PERMITIDO';

      await sb.from('pedidos').update({ estado: 'Cerrado' }).eq('id', pid);
      const b = await sb.rpc('archivar', { p_tipo: 'pedido', p_ref_id: pid, p_archivar: true });
      out.cerrado = b.error ? 'RECHAZADO: ' + b.error.message : 'PERMITIDO';
      const { data: l1 } = await sb.from('archivados').select('ref_id').eq('tipo', 'pedido');
      out.quedoArchivado = (l1 || []).some(x => x.ref_id === pid);

      await sb.rpc('archivar', { p_tipo: 'pedido', p_ref_id: pid, p_archivar: false });
      const { data: l2 } = await sb.from('archivados').select('ref_id').eq('tipo', 'pedido');
      out.quedoLimpio = !(l2 || []).some(x => x.ref_id === pid);

      // No se archiva a nombre de otro.
      const ins = await sb.from('archivados').insert({
        usuario_id: '00000000-0000-0000-0000-000000000001', tipo: 'pedido', ref_id: pid,
      });
      out.aNombreDeOtro = ins.error ? 'RECHAZADO' : 'PERMITIDO';

      // Ni un pedido ajeno.
      const { data: ajenos } = await sb.from('pedidos').select('id').neq('usuario_id', uid).limit(1);
      if (ajenos && ajenos.length) {
        const c = await sb.rpc('archivar', { p_tipo: 'pedido', p_ref_id: ajenos[0].id, p_archivar: true });
        out.ajeno = c.error ? 'RECHAZADO' : 'PERMITIDO';
      }
      return out;
    }, pedidoId);

    console.log('[PASO 3]', JSON.stringify(r, null, 1));
    expect(r.publicado).toContain('RECHAZADO');
    expect(r.cerrado).toBe('PERMITIDO');
    expect(r.quedoArchivado).toBeTruthy();
    expect(r.quedoLimpio).toBeTruthy();
    expect(r.aNombreDeOtro).toBe('RECHAZADO');
    if (r.ajeno) expect(r.ajeno).toBe('RECHAZADO');
  });

  test.afterAll(async () => {
    // El pedido tiene una propuesta, así que ya no se borra desde el
    // cliente — justamente lo que este archivo verifica.
    await sqlAdmin(`delete from public.pedidos where titulo like 'Test E2E – archivar%';`).catch(() => {});
  });
});
