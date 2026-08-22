// ═══ PRONET · Edge Function: enviar-push ═══
// Envía notificaciones a los dispositivos suscriptos de uno o más usuarios,
// por dos caminos según cómo llegó la suscripción:
//   - Web Push (VAPID) — PWA / navegador.
//   - FCM (HTTP v1) — app nativa Android (Capacitor), que no tiene Service
//     Worker y no puede usar Web Push.
// push_suscripciones.tipo distingue cuál es cuál (ver supabase-push-fcm.sql).
//
// Deploy:  supabase functions deploy enviar-push
// Secrets: supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:tu@email.com
//          supabase secrets set FCM_SERVICE_ACCOUNT_JSON='<json de la cuenta de servicio de Firebase>'
// Sin FCM_SERVICE_ACCOUNT_JSON configurado, el camino FCM se salta con un
// aviso en el log — Web Push sigue funcionando igual (no es un secreto que
// exista todavía; se suma cuando se arme el proyecto de Firebase).
//
// Body esperado (POST, con el JWT del usuario logueado):
// { "destino": "usuario" | "prestadores_rubro",
//   "usuario_id": "<uuid>"            (si destino=usuario)
//   "rubro": "Electricistas"          (si destino=prestadores_rubro)
//   "titulo": "...", "cuerpo": "...", "url": "/#s-pedidos" }

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.5.0";
import { SignJWT, importPKCS8 } from "npm:jose@5";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

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

    const subsWebPush = subs.filter((s) => s.tipo !== 'fcm');
    const subsFCM = subs.filter((s) => s.tipo === 'fcm');

    await Promise.all(subsWebPush.map(async (s) => {
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

    if (subsFCM.length) {
      const fcm = await obtenerAccesoFCM();
      if (!fcm) {
        console.warn('[push][fcm]', subsFCM.length, 'suscripciones FCM sin enviar — FCM_SERVICE_ACCOUNT_JSON no configurado');
      } else {
        await Promise.all(subsFCM.map(async (s) => {
          try {
            const res = await fetch(
              `https://fcm.googleapis.com/v1/projects/${fcm.projectId}/messages:send`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${fcm.accessToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  message: {
                    token: s.fcm_token,
                    notification: { title: titulo, body: cuerpo || "" },
                    data: { url: url || "/" },
                  },
                }),
              },
            );
            if (res.ok) {
              enviadas++;
            } else {
              const errBody = await res.text();
              // UNREGISTERED / NOT_FOUND = token vencido o desinstaló la app → limpiarlo
              if (res.status === 404 || errBody.includes('UNREGISTERED')) muertas.push(s.id);
              else console.error('[push][fcm] error enviando', res.status, errBody);
            }
          } catch (e) {
            console.error('[push][fcm] excepción enviando', String(e));
          }
        }));
      }
    }

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

// Cachea el access token entre invocaciones del mismo isolate (dura ~1hs,
// se pide de nuevo si venció). Evita firmar un JWT y pegarle a Google en
// cada notificación — con varios destinatarios en la misma llamada, esto
// ya ahorra la mayoría de los round-trips.
let fcmTokenCache: { accessToken: string; projectId: string; vence: number } | null = null;

async function obtenerAccesoFCM(): Promise<{ accessToken: string; projectId: string } | null> {
  if (fcmTokenCache && fcmTokenCache.vence > Date.now()) return fcmTokenCache;

  const credJson = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!credJson) return null;

  try {
    const cred = JSON.parse(credJson);
    const key = await importPKCS8(cred.private_key, "RS256");
    const jwt = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuedAt()
      .setIssuer(cred.client_email)
      .setSubject(cred.client_email)
      .setAudience("https://oauth2.googleapis.com/token")
      .setExpirationTime("1h")
      .sign(key);

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    if (!tokenRes.ok) {
      console.error('[push][fcm] error obteniendo access token', await tokenRes.text());
      return null;
    }
    const data = await tokenRes.json();
    fcmTokenCache = {
      accessToken: data.access_token,
      projectId: cred.project_id,
      vence: Date.now() + (data.expires_in - 60) * 1000, // 60s de margen
    };
    return fcmTokenCache;
  } catch (e) {
    console.error('[push][fcm] excepción firmando/pidiendo token', String(e));
    return null;
  }
}