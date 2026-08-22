// Edge Function: eliminar-cuenta
// El usuario la llama autenticado para borrar su propia cuenta (requisito
// de Google Play: eliminación de cuenta accesible in-app).
//
// perfiles.id → auth.users tiene ON DELETE CASCADE, y la mayoría de las
// tablas que cuelgan de ahí también cascadean. Pero un puñado usa NO
// ACTION (confdeltype 'a' en pg_constraint) y bloquearían el DELETE de
// auth.users con una violación de FK: loyalty, loyalty_historial,
// suscripciones, pagos_procesados, loyalty_solicitudes, trabajo_fotos,
// denuncias y chats_trabajo.cancelado_por. Se limpian a mano antes de
// borrar el usuario; todo lo demás (chats, mensajes, pedidos, reseñas,
// publicaciones, notificaciones, push, rate_limits) cascadea solo.

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

    const sbUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await sbUser.auth.getUser();
    if (userErr || !user) return json({ error: 'No autenticado' }, 401);

    const uid = user.id;
    const sbAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: perfil } = await sbAdmin
      .from('perfiles').select('prestador_id').eq('id', uid).maybeSingle();
    const prestadorId = perfil?.prestador_id ?? null;

    // 1. Tablas con FK NO ACTION hacia el usuario o su ficha de prestador:
    //    hay que vaciarlas o el DELETE de auth.users falla.
    await sbAdmin.from('pagos_procesados').delete().eq('usuario_id', uid);
    await sbAdmin.from('suscripciones').delete().eq('usuario_id', uid);
    await sbAdmin.from('loyalty_solicitudes').delete().eq('usuario_id', uid);
    await sbAdmin.from('loyalty').delete().eq('usuario_id', uid);
    const loyaltyHistFiltro = prestadorId
      ? `usuario_id.eq.${uid},prestador_id.eq.${prestadorId}`
      : `usuario_id.eq.${uid}`;
    await sbAdmin.from('loyalty_historial').delete().or(loyaltyHistFiltro);
    await sbAdmin.from('trabajo_fotos').update({ subido_por: null }).eq('subido_por', uid);
    await sbAdmin.from('notificaciones').update({ emisor_id: null }).eq('emisor_id', uid);
    await sbAdmin.from('chats_trabajo').update({ cancelado_por: null }).eq('cancelado_por', uid);
    // denuncias: se borran las que este usuario hizo o recibió (denunciante/denunciado).
    await sbAdmin.from('denuncias').delete()
      .or(`denunciante_id.eq.${uid},denunciado_id.eq.${uid}`);

    // 2. Borrar la cuenta de auth. Cascadea perfiles y todo lo que cuelga
    //    de ahí con ON DELETE CASCADE (chats, mensajes, pedidos, reseñas,
    //    publicaciones, push, rate_limits, etc.).
    const { error: delErr } = await sbAdmin.auth.admin.deleteUser(uid);
    if (delErr) {
      console.error('[eliminar-cuenta] no se pudo borrar auth.users', delErr.message);
      return json({ error: 'No se pudo eliminar la cuenta', detalle: delErr.message }, 500);
    }

    return json({ ok: true }, 200);

  } catch (e) {
    console.error('[eliminar-cuenta]', e);
    return json({ error: 'Error interno' }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
