# PRONET · Instructivo: Notificaciones Push (Etapa 3)

Las push usan **Web Push nativo** (el estándar de los navegadores) + una
**Edge Function de Supabase** que envía los mensajes. Sin servicios de
terceros, sin costo extra.

## Paso 1 — Generar las claves VAPID (una sola vez)

En una terminal con Node instalado:

```
npx web-push generate-vapid-keys
```

Te devuelve dos claves:
- **Public Key** → va en `config.js`, en `VAPID_PUBLIC_KEY`
- **Private Key** → va como secret en Supabase (paso 3). NUNCA en el código.

## Paso 2 — Crear la tabla

Supabase → SQL Editor → pegar y ejecutar `supabase-push-v3.sql`.

## Paso 3 — Deployar la Edge Function

Necesitás el CLI de Supabase (`npm i -g supabase`, luego `supabase login`
y `supabase link --project-ref TU_PROJECT_REF` desde la carpeta del proyecto).

```
supabase secrets set VAPID_PUBLIC_KEY="BN...tu clave pública..."
supabase secrets set VAPID_PRIVATE_KEY="...tu clave privada..."
supabase secrets set VAPID_SUBJECT="mailto:tu-email@dominio.com"
supabase functions deploy enviar-push
```

(La carpeta `supabase/functions/enviar-push/index.ts` va en la raíz del
proyecto, al lado de index.html.)

Alternativa sin CLI: Supabase → Edge Functions → New function →
pegar el contenido de `index.ts` en el editor del dashboard, y cargar
los 3 secrets en Settings → Edge Functions → Secrets.

## Paso 4 — Configurar el frontend

En `config.js`, completar:

```js
window.PRONET_CONFIG.VAPID_PUBLIC_KEY = "BN...tu clave pública...";
```

Subir todos los archivos actualizados (el SW pasa a v21).

## Paso 5 — Probar

1. **iPhone**: instalar la PWA (Compartir → Agregar a inicio) — en iOS las
   push SOLO funcionan desde la app instalada (iOS 16.4+). En Android/desktop
   funcionan también desde el navegador.
2. Iniciar sesión → Mi perfil → **Notificaciones push** → aceptar el permiso.
3. Desde OTRO dispositivo/usuario: publicar un pedido del rubro del prestador
   → al prestador le llega "🔔 Nuevo pedido en tu rubro".
4. Como prestador, enviar una propuesta → al vecino dueño del pedido le llega
   "📨 ¡Nueva propuesta!". Tocar la notificación abre la app.

## Cuándo se envían

| Evento | Quién la recibe |
|---|---|
| Se publica un pedido | Prestadores activos de ese rubro (menos el autor) |
| Llega/actualiza una propuesta | El vecino dueño del pedido |

## Notas

- Cada usuario puede activar/desactivar por dispositivo desde Mi perfil.
- Las suscripciones vencidas se limpian solas cuando la función detecta 404/410.
- Si el usuario bloqueó el permiso, el toggle lo explica y no insiste.
- Mientras `VAPID_PUBLIC_KEY` esté vacía, el toggle no aparece (la app
  funciona igual que antes).
