// Edge Function: webhook-mp
// Recibe la notificación de pago de MercadoPago, verifica la firma x-signature
// y el estado real del pago contra la API de MP (nunca confía en el payload).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

async function verificarFirmaMP(req: Request, paymentId: string): Promise<boolean> {
  const secret = Deno.env.get('MP_WEBHOOK_SECRET');
  if (!secret) {
    console.error('[webhook-mp] MP_WEBHOOK_SECRET no configurado');
    return false;
  }

  const xSignature = req.headers.get('x-signature');
  const xRequestId = req.headers.get('x-request-id') ?? '';
  if (!xSignature) return false;

  // x-signature = "ts=<timestamp>,v1=<hmac>"
  const parts = Object.fromEntries(
    xSignature.split(',').map(p => p.split('=') as [string, string])
  );
  const ts = parts['ts'];
  const v1 = parts['v1'];
  if (!ts || !v1) return false;

  const manifest = `id:${paymentId};request-id:${xRequestId};ts:${ts}`;
  const keyBytes = new TextEncoder().encode(secret);
  const msgBytes = new TextEncoder().encode(manifest);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgBytes);
  const computed = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  return computed === v1;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const paymentId = url.searchParams.get('data.id') || url.searchParams.get('id');
    const topic = url.searchParams.get('type') || url.searchParams.get('topic');

    // Solo nos interesan notificaciones de pago; MP también manda otras (merchant_order, etc.)
    if (topic !== 'payment' || !paymentId) {
      return new Response('ignored', { status: 200 });
    }

    // Verificar que la notificación viene realmente de MercadoPago.
    // Complementa la idempotencia: la firma prueba el origen; la idempotencia
    // evita que una notificación válida se aplique más de una vez.
    const firmaValida = await verificarFirmaMP(req, paymentId);
    if (!firmaValida) {
      console.warn('[webhook-mp] firma x-signature inválida o ausente', paymentId);
      return new Response('unauthorized', { status: 401 });
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

    // Idempotencia: registrar el pago ANTES de activar. El PK de
    // pagos_procesados actúa de candado — si este payment_id ya se aplicó,
    // la unique violation corta acá y no se toca `suscripciones`.
    //
    // Esto se hace recién ahora (y no antes del chequeo de 'approved') a
    // propósito: un pago puede notificarse primero como 'pending' y después
    // como 'approved' con el MISMO id. Si lo registráramos en la primera
    // notificación, la segunda se descartaría como duplicada y el plan
    // nunca se activaría.
    const { error: errPago } = await supabase.from('pagos_procesados').insert({
      payment_id: String(pago.id),
      usuario_id: usuarioId,
      plan,
      periodo,
      monto: pago.transaction_amount ?? null,
    });

    if (errPago) {
      if (errPago.code === '23505') {
        // Ya procesado: replay malicioso o reintento legítimo de MP (que
        // reenvía la misma notificación hasta recibir un 200). En ambos
        // casos la respuesta correcta es 200 sin volver a activar.
        return new Response('ok (ya procesado)', { status: 200 });
      }
      console.error('[webhook-mp] error registrando pago', errPago.message);
      return new Response('error', { status: 500 });
    }

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
      // Soltar el candado: si no soltáramos, el reintento de MP se
      // descartaría como duplicado y quedaría un pago cobrado sin plan.
      await supabase.from('pagos_procesados').delete().eq('payment_id', String(pago.id));
      console.error('[webhook-mp] error activando suscripción', error.message);
      return new Response('error', { status: 500 });
    }

    return new Response('ok', { status: 200 });
  } catch (e) {
    console.error('[webhook-mp]', e);
    return new Response('error', { status: 500 });
  }
});
