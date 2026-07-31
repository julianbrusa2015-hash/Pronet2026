// Edge Function: crear-preferencia
// Recibe { plan, periodo } de un usuario autenticado, crea una preferencia
// de pago en MercadoPago (Checkout Pro) y devuelve la URL de checkout.
//
// El precio se resuelve SIEMPRE server-side, leyendo la tabla planes_limites
// — nunca se confía en un monto que mande el cliente, para que no se pueda
// manipular el pago.
//
// planes_limites es también la tabla que usan los triggers de límite de
// propuestas/fotos (supabase-limites-plan.sql): es la fuente única de verdad
// de plan tanto para límites como para precio. window.PRONET_CONFIG.PLANES
// (config.js) trae valores hardcodeados solo como fallback offline/inicial;
// restaurarSesion() en app.js los pisa con los de esta misma tabla al
// arrancar la app, así que ambos lados quedan sincronizados en runtime.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Falta autenticación' }, 401);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return json({ error: 'Usuario no autenticado' }, 401);
    }

    const { plan, periodo } = await req.json();
    // El frontend manda 'mes' (ver switchBilling en app.js), no 'mensual'.
    if (periodo !== 'mes' && periodo !== 'anual') {
      return json({ error: 'Periodo inválido' }, 400);
    }

    const { data: precioPlan, error: precioError } = await supabase
      .from('planes_limites')
      .select('nombre, precio_mes, precio_anual')
      .eq('plan', plan)
      .maybeSingle();
    if (precioError || !precioPlan) {
      return json({ error: 'Plan inválido' }, 400);
    }

    const monto = periodo === 'anual' ? precioPlan.precio_anual : precioPlan.precio_mes;
    // Base vale $0 en la tabla — no es un plan comprable. Sin este chequeo,
    // pedir plan='base' generaría una preferencia de MP por $0.
    if (!monto || monto <= 0) {
      return json({ error: 'Plan inválido' }, 400);
    }
    const titulo = 'Plan ' + precioPlan.nombre + ' PRONET · ' + (periodo === 'anual' ? 'Anual' : 'Mensual');

    const mpAccessToken = Deno.env.get('MP_ACCESS_TOKEN');
    if (!mpAccessToken) {
      return json({ error: 'MP no configurado' }, 500);
    }

    const siteUrl = Deno.env.get('SITE_URL') || 'https://pronetprueba.netlify.app';
    const functionsBase = Deno.env.get('SUPABASE_URL')!.replace('.supabase.co', '.functions.supabase.co');

    const preference = {
      items: [
        {
          title: titulo,
          quantity: 1,
          unit_price: monto,
          currency_id: 'ARS',
        },
      ],
      payer: { email: user.email },
      metadata: {
        usuario_id: user.id,
        plan,
        periodo,
      },
      back_urls: {
        success: siteUrl + '/?mp=success',
        failure: siteUrl + '/?mp=failure',
        pending: siteUrl + '/?mp=pending',
      },
      auto_return: 'approved',
      notification_url: functionsBase + '/webhook-mp',
    };

    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + mpAccessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preference),
    });

    if (!mpRes.ok) {
      const errBody = await mpRes.text();
      console.error('[crear-preferencia] MP error', mpRes.status, errBody);
      return json({ error: 'No se pudo crear la preferencia de pago' }, 502);
    }

    const mpData = await mpRes.json();
    return json({ init_point: mpData.init_point, preference_id: mpData.id }, 200);
  } catch (e) {
    console.error('[crear-preferencia]', e);
    return json({ error: 'Error interno' }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
