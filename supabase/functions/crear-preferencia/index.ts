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

    // `ref` identifica QUÉ se está pagando cuando el producto no es el plan en
    // sí: hoy, el id del banner. Va en el metadata para que el webhook sepa
    // qué activar. Los planes y los créditos no lo usan.
    const { plan, periodo, ref } = await req.json();
    // El frontend manda 'mes' (ver switchBilling en app.js), no 'mensual'.
    if (periodo !== 'mes' && periodo !== 'anual') {
      return json({ error: 'Periodo inválido' }, 400);
    }

    // Un banner se paga por período fijo y sólo si es TUYO y ya está aprobado.
    // Se valida acá y no sólo en el webhook porque generar una preferencia
    // para un banner ajeno permitiría pagarle la publicación a otro, o peor,
    // activar algo que la moderación todavía no vio.
    if (plan === 'banner') {
      if (typeof ref !== 'string' || !/^[0-9a-f-]{36}$/i.test(ref)) {
        return json({ error: 'Falta el banner a publicar' }, 400);
      }
      const { data: b } = await supabase
        .from('banners')
        .select('id, estado, usuario_id')
        .eq('id', ref)
        .maybeSingle();
      if (!b || b.usuario_id !== user.id) {
        return json({ error: 'Ese banner no es tuyo' }, 403);
      }
      if (b.estado !== 'aprobado') {
        return json({ error: 'El banner todavía no está aprobado' }, 409);
      }
    }

    // Impulsar un aviso de Servicios: mismo criterio que el banner. Tiene
    // que ser TUYO y estar al aire — impulsar un borrador o algo que la
    // moderación no vio sería pagar por nada, e impulsar el aviso de otro
    // le pagaría la promoción a un tercero.
    if (plan === 'impulso') {
      if (typeof ref !== 'string' || !/^[0-9a-f-]{36}$/i.test(ref)) {
        return json({ error: 'Falta el aviso a impulsar' }, 400);
      }
      const { data: pub } = await supabase
        .from('publicaciones_prestador')
        .select('id, estado, vigencia_hasta, prestador_id, perfiles:prestador_id (id)')
        .eq('id', ref)
        .maybeSingle();
      if (!pub) {
        return json({ error: 'Ese aviso no existe' }, 404);
      }
      // El dueño se resuelve por el perfil, que es quien tiene el user id.
      const { data: miPerfil } = await supabase
        .from('perfiles')
        .select('prestador_id')
        .eq('id', user.id)
        .maybeSingle();
      if (!miPerfil?.prestador_id || miPerfil.prestador_id !== pub.prestador_id) {
        return json({ error: 'Ese aviso no es tuyo' }, 403);
      }
      if (pub.estado !== 'activa' || new Date(pub.vigencia_hasta) <= new Date()) {
        return json({ error: 'El aviso tiene que estar publicado para impulsarlo' }, 409);
      }
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
        // Sin esto el webhook recibe `ref` vacío y no sabe QUÉ activar: el
        // pago entra bien pero el banner nunca se publica. Se validó arriba
        // que sea del que paga y esté aprobado, pero validarlo no alcanza —
        // hay que mandarlo.
        ...(ref ? { ref } : {}),
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
