// Edge Function: webhook-mp
// Recibe la notificación de pago de MercadoPago, verifica el estado real
// contra la API de MP (nunca confía en el payload de la notificación en sí,
// que puede ser falsificado) y activa la suscripción si el pago está aprobado.
//
// TODO producción: verificar la firma x-signature del webhook (requiere
// la Secret Key de webhooks que se obtiene al registrar la URL en el panel
// de MP → Tu aplicación → Webhooks). Sin eso, cualquiera que adivine la URL
// podría llamarla — el fetch a la API de MP para confirmar el pago real
// mitiga el riesgo por ahora, pero no reemplaza la verificación de firma.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const paymentId = url.searchParams.get('data.id') || url.searchParams.get('id');
    const topic = url.searchParams.get('type') || url.searchParams.get('topic');

    // Solo nos interesan notificaciones de pago; MP también manda otras (merchant_order, etc.)
    if (topic !== 'payment' || !paymentId) {
      return new Response('ignored', { status: 200 });
    }

    const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN');
    if (!mpAccessToken) {
      console.error('[webhook-mp] MP_ACCESS_TOKEN no configurado');
      return new Response('error', { status: 500 });
    }

    // Confirmar el pago consultando directamente a MP — nunca confiar en el
    // payload del webhook, que podría ser falso.
    const mpRes = await fetch('https://api.mercadopago.com/v1/payments/' + paymentId, {
      headers: { Authorization: 'Bearer ' + mpAccessToken },
    });
    if (!mpRes.ok) {
      console.error('[webhook-mp] error consultando pago', mpRes.status);
      return new Response('error', { status: 502 });
    }
    const pago = await mpRes.json();

    if (pago.status !== 'approved') {
      // pending, rejected, in_process, etc. — no activar nada todavía
      return new Response('ok', { status: 200 });
    }

    const usuarioId = pago.metadata?.usuario_id;
    const plan = pago.metadata?.plan;
    const periodo = pago.metadata?.periodo;
    if (!usuarioId || !plan || !periodo) {
      console.error('[webhook-mp] pago aprobado sin metadata esperada', pago.id);
      return new Response('ok', { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const vence = new Date();
    vence.setMonth(vence.getMonth() + (periodo === 'anual' ? 12 : 1));

    const { error } = await supabase.from('suscripciones').upsert({
      usuario_id: usuarioId,
      plan,
      estado: 'activo',
      periodo,
      activado_en: new Date().toISOString(),
      vence_en: vence.toISOString(),
    }, { onConflict: 'usuario_id' });

    if (error) {
      console.error('[webhook-mp] error activando suscripción', error.message);
      return new Response('error', { status: 500 });
    }

    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error('[webhook-mp]', e);
    return new Response('error', { status: 500 });
  }
});
