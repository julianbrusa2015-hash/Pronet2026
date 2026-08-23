// Edge Function: verificar-pago-mp
// El cliente la llama con el payment_id que MP devuelve en la URL de retorno.
// Verifica el pago directamente contra la API de MP y activa el plan si
// corresponde. Funciona como fallback cuando el webhook no llegó a tiempo.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Sin autenticación' }, 401);

    // Cliente autenticado como el usuario que llama
    const sbUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await sbUser.auth.getUser();
    if (userErr || !user) return json({ error: 'No autenticado' }, 401);

    const { payment_id } = await req.json();
    if (!payment_id) return json({ error: 'Falta payment_id' }, 400);

    const mpToken = Deno.env.get('MP_ACCESS_TOKEN');
    if (!mpToken) return json({ error: 'MP no configurado' }, 500);

    // Consultar el pago directamente a MercadoPago
    const mpRes = await fetch('https://api.mercadopago.com/v1/payments/' + payment_id, {
      headers: { Authorization: 'Bearer ' + mpToken },
    });
    if (!mpRes.ok) {
      if (mpRes.status === 404) return json({ ok: false, motivo: 'pago_no_encontrado' }, 200);
      return json({ error: 'Error consultando MP' }, 502);
    }
    const pago = await mpRes.json();

    if (pago.status !== 'approved') {
      return json({ ok: false, motivo: 'no_aprobado', status: pago.status }, 200);
    }

    // Verificar que el pago pertenece al usuario autenticado
    const usuarioIdPago = pago.metadata?.usuario_id;
    if (!usuarioIdPago || usuarioIdPago !== user.id) {
      console.warn('[verificar-pago-mp] usuario_id no coincide', usuarioIdPago, user.id);
      return json({ ok: false, motivo: 'usuario_no_coincide' }, 200);
    }

    const plan    = pago.metadata?.plan;
    const periodo = pago.metadata?.periodo;
    if (!plan || !periodo) {
      return json({ ok: false, motivo: 'metadata_incompleta' }, 200);
    }
    // Qué se compró, cuando el producto no es el plan en sí — hoy, el id del
    // banner/publicación. Mismo campo que lee webhook-mp.
    const ref = pago.metadata?.ref;

    // Cliente con service_role para poder escribir sin restricciones de RLS
    const sbAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Idempotencia: registrar el pago (mismo mecanismo que el webhook)
    const { error: errPago } = await sbAdmin.from('pagos_procesados').insert({
      payment_id: String(pago.id),
      usuario_id: user.id,
      plan,
      periodo,
      monto: pago.transaction_amount ?? null,
    });
    if (errPago) {
      // 23505 = ya procesado por el webhook: la activación ya ocurrió, devolver éxito.
      if (errPago.code === '23505') {
        return json({ ok: true, ya_procesado: true, plan }, 200);
      }
      console.error('[verificar-pago-mp] error registrando pago', errPago.message);
      return json({ error: 'Error interno' }, 500);
    }

    const vence = new Date();
    vence.setMonth(vence.getMonth() + (periodo === 'anual' ? 12 : 1));

    if (plan === 'promarket_credito') {
      const { error: errCred } = await sbAdmin.rpc('incrementar_creditos_promarket', {
        p_usuario_id: user.id,
        p_cantidad: 1,
      });
      if (errCred) {
        await sbAdmin.from('pagos_procesados').delete().eq('payment_id', String(pago.id));
        console.error('[verificar-pago-mp] error acreditando crédito ProMarket', errCred.message);
        return json({ error: 'Error acreditando publicación' }, 500);
      }
      return json({ ok: true, plan: 'promarket_credito' }, 200);
    }

    // ── banner, impulso, impulso_mercado, renovación ────────────────────
    //
    // Hasta acá estos cuatro quedaban SIN respaldo: si webhook-mp no
    // procesaba el pago —MP nunca lo notificó, o notificó y algo falló—
    // esta función se negaba a tocarlos ("lo_activa_el_webhook") y no había
    // ningún otro camino. El dinero entraba y el producto se quedaba
    // colgado en 'aprobado' para siempre, hasta que alguien lo notara y lo
    // reprocesara a mano. Es lo que le pasó a un banner real: pago
    // approved/accredited en MercadoPago, cero rastro en pagos_procesados.
    //
    // El motivo original para excluirlos era la carrera con el upsert de
    // `suscripciones` (onConflict:'usuario_id', que REEMPLAZA la fila) — pero
    // estos cuatro nunca llegan a esa rama, tienen la suya propia acá arriba,
    // igual que promarket_credito. Mismo patrón: activar con el RPC
    // idempotente (revalida estado antes de tocar nada) y soltar el candado
    // si falla, para que el webhook —si igual llega, tarde— pueda
    // reintentarlo sin chocar con un 23505 fantasma.
    if (plan === 'banner' || plan === 'impulso' || plan === 'impulso_mercado' || plan === 'renovacion') {
      if (!ref) {
        await sbAdmin.from('pagos_procesados').delete().eq('payment_id', String(pago.id));
        console.error('[verificar-pago-mp] pago de', plan, 'sin ref', pago.id);
        return json({ ok: false, motivo: 'sin_referencia', plan }, 200);
      }
      const RPC_POR_PLAN: Record<string, { fn: string; param: string }> = {
        banner:           { fn: 'activar_banner_pagado',          param: 'p_banner_id' },
        impulso:          { fn: 'activar_impulso_pagado',         param: 'p_pub_id' },
        impulso_mercado:  { fn: 'activar_impulso_mercado_pagado', param: 'p_pub_id' },
        renovacion:       { fn: 'activar_renovacion_pagada',      param: 'p_pub_id' },
      };
      const { fn, param } = RPC_POR_PLAN[plan];
      const { data: resAct, error: errAct } = await sbAdmin.rpc(fn, {
        [param]: ref,
        p_usuario_id: user.id,
      });
      if (errAct || !resAct?.ok) {
        await sbAdmin.from('pagos_procesados').delete().eq('payment_id', String(pago.id));
        console.error('[verificar-pago-mp] error activando', plan, errAct?.message || resAct?.error);
        return json({ error: 'Error activando ' + plan }, 500);
      }
      return json({ ok: true, plan }, 200);
    }

    // Planes de suscripción: lista EXPLÍCITA, no un "todo lo demás".
    //
    // Antes esto era el else de la cadena, así que cualquier producto nuevo
    // caía acá y se escribía como si fuera una suscripción. Así es como
    // impulso y banner terminaban pisando el plan del usuario. Una lista
    // explícita convierte ese error silencioso en un error visible.
    const PLANES_SUSCRIPCION = ['plus', 'pro'];
    if (!PLANES_SUSCRIPCION.includes(plan)) {
      // Se suelta el candado: si no se sabe qué hacer con este pago, hay que
      // dejar que el webhook lo intente en vez de bloquearlo para siempre.
      await sbAdmin.from('pagos_procesados').delete().eq('payment_id', String(pago.id));
      console.error('[verificar-pago-mp] plan desconocido, no se activa nada:', plan);
      return json({ ok: false, motivo: 'plan_no_reconocido', plan }, 200);
    }

    const { error: errSub } = await sbAdmin.from('suscripciones').upsert({
      usuario_id: user.id,
      plan, estado: 'activo', periodo,
      activado_en: new Date().toISOString(),
      vence_en: vence.toISOString(),
    }, { onConflict: 'usuario_id' });
    if (errSub) {
      await sbAdmin.from('pagos_procesados').delete().eq('payment_id', String(pago.id));
      return json({ error: 'Error activando suscripción' }, 500);
    }

    return json({ ok: true, plan, vence: vence.toISOString() }, 200);

  } catch (e) {
    console.error('[verificar-pago-mp]', e);
    return json({ error: 'Error interno' }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
