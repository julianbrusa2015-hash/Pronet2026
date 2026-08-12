// Edge Function: webhook-mp
// Recibe la notificación de pago de MercadoPago, verifica la firma x-signature
// y el estado real del pago contra la API de MP (nunca confía en el payload).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Resultado: 'ok' | 'sin_firma' | 'invalida'
async function verificarFirmaMP(req: Request, paymentId: string): Promise<'ok' | 'sin_firma' | 'invalida'> {
  const secret = Deno.env.get('MP_WEBHOOK_SECRET');
  if (!secret) {
    console.error('[webhook-mp] MP_WEBHOOK_SECRET no configurado');
    return 'invalida';
  }

  const xSignature = req.headers.get('x-signature');
  // Sin header: test de conectividad del panel de MP o solicitud sin firmar.
  // No rechazamos (evita falso 401 en el simulador), pero tampoco procesamos.
  if (!xSignature) return 'sin_firma';

  const xRequestId = req.headers.get('x-request-id') ?? '';

  // x-signature = "ts=<timestamp>,v1=<hmac>" — MP intercala espacios después
  // de la coma, así que hay que limpiar clave y valor de cada parte.
  const parts: Record<string, string> = {};
  for (const p of xSignature.split(',')) {
    const i = p.indexOf('=');
    if (i > 0) parts[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
  const ts = parts['ts'];
  const v1 = parts['v1'];
  if (!ts || !v1) return 'invalida';

  // Template documentado por MP — el punto y coma FINAL es obligatorio y su
  // omisión fue justamente lo que hacía fallar la verificación (2026-07-31).
  // Los ids alfanuméricos van en minúscula según la doc de MP.
  const manifest = `id:${paymentId.toLowerCase()};request-id:${xRequestId};ts:${ts};`;

  const cryptoKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign(
    'HMAC', cryptoKey, new TextEncoder().encode(manifest)
  );
  const computed = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  return computed === v1 ? 'ok' : 'invalida';
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
    const firma = await verificarFirmaMP(req, paymentId);
    if (firma === 'invalida') {
      console.warn('[webhook-mp] firma x-signature inválida', paymentId);
      return new Response('unauthorized', { status: 401 });
    }
    if (firma === 'sin_firma') {
      // Sin header: test de conectividad del panel de MP. Responder 200 sin procesar.
      console.log('[webhook-mp] sin firma — test de conectividad ignorado', paymentId);
      return new Response('ok', { status: 200 });
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
      // 404: el pago no existe (id del simulador del panel, o id forjado).
      // Nunca va a existir, así que 200 para que MP no reintente indefinidamente.
      if (mpRes.status === 404) {
        console.log('[webhook-mp] pago inexistente, ignorado', paymentId);
        return new Response('ok', { status: 200 });
      }
      // Errores transitorios (5xx, rate limit): 502 para que MP reintente.
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
    // Qué se compró, cuando el producto no es el plan en sí. Hoy: el id del
    // banner. MP baja las claves del metadata a snake_case.
    const ref = pago.metadata?.ref;
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

    // Publicación extra de ProMarket: acredita 1 crédito, no es una suscripción.
    if (plan === 'promarket_credito') {
      const { error: errCred } = await supabase.rpc('incrementar_creditos_promarket', {
        p_usuario_id: usuarioId,
        p_cantidad: 1,
      });
      if (errCred) {
        await supabase.from('pagos_procesados').delete().eq('payment_id', String(pago.id));
        console.error('[webhook-mp] error acreditando crédito ProMarket', errCred.message);
        return new Response('error', { status: 500 });
      }
      return new Response('ok', { status: 200 });
    }

    // Banner del carrusel: publica la pieza por los días comprados. No es una
    // suscripción ni un crédito, así que corta acá.
    //
    // `activar_banner_pagado` vuelve a validar que el banner sea del que pagó
    // y esté aprobado — no alcanza con que la preferencia lo haya chequeado:
    // esto corre con service_role y es la última puerta antes de publicar.
    if (plan === 'banner') {
      if (!ref) {
        // Sin referencia no hay nada que activar, y reintentar no lo va a
        // arreglar. Se suelta el candado para poder reprocesarlo a mano.
        await supabase.from('pagos_procesados').delete().eq('payment_id', String(pago.id));
        console.error('[webhook-mp] pago de banner sin ref', pago.id);
        return new Response('ok', { status: 200 });
      }
      const { data: resBanner, error: errBanner } = await supabase.rpc('activar_banner_pagado', {
        p_banner_id: ref,
        p_usuario_id: usuarioId,
      });
      if (errBanner || !resBanner?.ok) {
        await supabase.from('pagos_procesados').delete().eq('payment_id', String(pago.id));
        console.error('[webhook-mp] error activando banner', errBanner?.message || resBanner?.error);
        return new Response('error', { status: 500 });
      }
      return new Response('ok', { status: 200 });
    }

    // Impulso de un aviso de Servicios: lo sube en el orden del feed por los
    // días comprados. Tampoco es suscripción ni crédito, así que corta acá.
    // Mismo criterio que el banner: el RPC vuelve a validar dueño y estado,
    // porque esto corre con service_role y es la última puerta.
    if (plan === 'impulso') {
      if (!ref) {
        await supabase.from('pagos_procesados').delete().eq('payment_id', String(pago.id));
        console.error('[webhook-mp] pago de impulso sin ref', pago.id);
        return new Response('ok', { status: 200 });
      }
      const { data: resImp, error: errImp } = await supabase.rpc('activar_impulso_pagado', {
        p_pub_id: ref,
        p_usuario_id: usuarioId,
      });
      if (errImp || !resImp?.ok) {
        await supabase.from('pagos_procesados').delete().eq('payment_id', String(pago.id));
        console.error('[webhook-mp] error activando impulso', errImp?.message || resImp?.error);
        return new Response('error', { status: 500 });
      }
      return new Response('ok', { status: 200 });
    }

    // Renovación de un aviso vencido: vuelve al aire por otro período del
    // plan. Como el impulso, corta acá — no es suscripción ni crédito.
    if (plan === 'renovacion') {
      if (!ref) {
        await supabase.from('pagos_procesados').delete().eq('payment_id', String(pago.id));
        console.error('[webhook-mp] pago de renovacion sin ref', pago.id);
        return new Response('ok', { status: 200 });
      }
      const { data: resRen, error: errRen } = await supabase.rpc('activar_renovacion_pagada', {
        p_pub_id: ref,
        p_usuario_id: usuarioId,
      });
      if (errRen || !resRen?.ok) {
        await supabase.from('pagos_procesados').delete().eq('payment_id', String(pago.id));
        console.error('[webhook-mp] error activando renovacion', errRen?.message || resRen?.error);
        return new Response('error', { status: 500 });
      }
      return new Response('ok', { status: 200 });
    }

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
