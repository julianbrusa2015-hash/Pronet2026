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

    // Otros planes: upsert en suscripciones
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
