// ═══ PRONET · Edge Function: enviar-push ═══
// Envía notificaciones Web Push a los dispositivos suscriptos de uno o más usuarios.
//
// Deploy:  supabase functions deploy enviar-push
// Secrets: supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:tu@email.com
//
// Body esperado (POST, con el JWT del usuario logueado):
// { "destino": "usuario" | "prestadores_rubro",
//   "usuario_id": "<uuid>"            (si destino=usuario)
//   "rubro": "Electricistas"          (si destino=prestadores_rubro)
//   "titulo": "...", "cuerpo": "...", "url": "/#s-pedidos" }

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// Allow-Methods y Max-Age son correctos de declarar, pero NO eran la causa del
// error de CORS: POST es un método CORS-safelisted, así que el preflight es
// válido aunque falte Allow-Methods. La causa real hay que buscarla en el
// estado del preflight OPTIONS (ver más abajo).
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req) => {
  // El preflight tiene que responder 200 CON headers CORS y sin exigir auth:
  // el OPTIONS que manda el browser NO lleva Authorization.
  //
  // OJO — si el proyecto tiene `verify_jwt` activo para esta función, este
  // handler nunca llega a ejecutarse: el gateway de Supabase rechaza el
  // OPTIONS con 401 antes, y esa respuesta no lleva headers CORS, así que el
  // browser lo reporta como error de CORS aunque el problema sea de auth.
  // Esta función ya valida el JWT por su cuenta (más abajo), así que la
  // verificación del gateway es redundante y hay que desactivarla.
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: cors });

  try {
    // El que invoca debe estar logueado (anti-spam básico)
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!jwt) return json({ ok: false, error: "Sin autorización" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user } } = await supabase.auth.getUser(jwt);
    if (!user) return json({ ok: false, error: "Sesión inválida" }, 401);

    const { destino, usuario_id, rubro, titulo, cuerpo, url } = await req.json();
    if (!titulo) return json({ ok: false, error: "Falta título" }, 400);

    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT") || "mailto:soporte@pronet.app",
      Deno.env.get("VAPID_PUBLIC_KEY")!,
      Deno.env.get("VAPID_PRIVATE_KEY")!,
    );
    console.log('[push] VAPID configurado. destino:', destino, 'rubro:', rubro, 'usuario_id:', usuario_id);

    // Resolver los usuarios destino
    let usuarioIds: string[] = [];
    if (destino === "usuario" && usuario_id) {
      usuarioIds = [usuario_id];
    } else if (destino === "prestadores_rubro" && rubro) {
      // Prestadores activos del rubro (vía perfiles vinculados)
      const { data: filas } = await supabase
        .from("perfiles")
        .select("id, prestadores!inner(rubro, activo)")
        .eq("prestadores.rubro", rubro)
        .eq("prestadores.activo", true);
      usuarioIds = (filas || []).map((f: { id: string }) => f.id)
        .filter((id: string) => id !== user.id); // no notificarse a sí mismo
    } else {
      return json({ ok: false, error: "Destino inválido" }, 400);
    }
    if (!usuarioIds.length) return json({ ok: true, enviadas: 0, msg: 'sin destinatarios' });

    const { data: subs } = await supabase
      .from("push_suscripciones")
      .select("*")
      .in("usuario_id", usuarioIds);
    console.log('[push] suscripciones encontradas:', subs?.length || 0, 'para usuarios:', usuarioIds);
    if (!subs?.length) return json({ ok: true, enviadas: 0, msg: 'sin suscripciones' });

    const payload = JSON.stringify({
      titulo,
      cuerpo: cuerpo || "",
      url: url || "/",
    });

    let enviadas = 0;
    const muertas: string[] = [];
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
        enviadas++;
      } catch (e) {
        // 404/410 = suscripción vencida → limpiarla
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) muertas.push(s.id);
      }
    }));
    if (muertas.length) {
      await supabase.from("push_suscripciones").delete().in("id", muertas);
    }

    return json({ ok: true, enviadas, limpiadas: muertas.length });
  } catch (e) {
    console.error('[push] ERROR:', String(e));
    return json({ ok: false, error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
