# Migración a dominio propio: pronet.com.ar

Estado: **esperando aprobación de NIC.ar** — expediente `EX-2026-81083284-APN-DNRDI#SLYT`

Destino:
- `pronet.com.ar` → landing institucional (futura). Por ahora, redirect a la app.
- `app.pronet.com.ar` → la PWA y lo que carga el APK de Capacitor.

Regla general: **cada paso es aditivo hasta la Fase 6.** Hasta ahí,
`pronetprueba.netlify.app` sigue funcionando y no hay corte para nadie.

---

## Fase 0 — Aprobación y pago

El dominio NO queda activo con la aprobación: hay que pagarlo. Recién con el
pago acreditado se puede cargar nameservers.

- [ ] Confirmar en TAD que el trámite está **aprobado** (no sólo iniciado)
- [ ] Pagar el período de registro (el panel de NIC.ar indica medio e importe)
- [ ] Confirmar que el pago se acreditó y el dominio figura activo a tu nombre
- [ ] **Agendar la renovación anual.** Si vence, el dominio se libera con la app
      apuntando ahí. Si hay débito automático o pago plurianual, tomarlo.
- [ ] Verificar que el dominio resuelve: `nslookup pronet.com.ar`

## Fase 1 — DNS

### Datos ya obtenidos (2026-08-22)

Al agregar `app.pronet.com.ar` en Netlify, pidió verificación de propiedad por
TXT (porque el dominio no está en la cuenta de Netlify). Valores:

| Campo | Valor |
|---|---|
| Tipo | TXT |
| Host | `subdomain-owner-verification` |
| Value | `58b4f19e9823acda3f851cc3c4bf7415` |
| Dónde | en la raíz de `pronet.com.ar` |

**Este TXT sólo hace falta si el DNS se queda en NIC.ar (Ruta B).** Si se pasan
los nameservers a Netlify (Ruta A, recomendada), Netlify controla la zona y la
verificación deja de ser necesaria.

### ⚠️ Trampa comprobada (2026-08-22)

Se intentó agregar `app.pronet.com.ar` en Netlify por adelantado y **Netlify lo
marcó Primary domain automáticamente** (el primer dominio custom siempre queda
primario). Efecto inmediato: todas las respuestas de `pronetprueba.netlify.app`
empezaron a mandar `Link: <http://app.pronet.com.ar/>; rel="canonical"`,
apuntando SEO a un dominio que no resuelve. El sitio siguió sirviendo 200 sin
redirect, así que no hubo caída — pero el estado era inconsistente.

**No se puede degradar**: Netlify no deja que un subdominio `.netlify.app` sea
primario mientras exista un dominio custom. En la fila del `.netlify.app` el
menú "Options" sólo ofrece **Change project name**, que renombraría el sitio y
mataría la URL de producción — NO tocar eso. La única salida es quitar el
dominio custom (se hizo, y el canonical desapareció).

**Conclusión: no agregar el dominio en Netlify hasta tener el DNS listo.**
Agregarlo por adelantado no ahorra nada y deja producción en estado raro.

### Ruta A — Nameservers a Netlify (recomendada)

- [ ] En Netlify: Site configuration → Domain management → Add domain → `app.pronet.com.ar`
- [ ] Netlify muestra los nameservers a usar. Copiarlos.
- [ ] En NIC.ar: cambiar los nameservers del dominio por los de Netlify
- [ ] Esperar propagación (minutos a horas). Verificar:
      `curl -sI https://app.pronet.com.ar/` → debe dar 200
- [ ] Confirmar que Netlify emitió el certificado HTTPS (panel → Domain management → HTTPS)
- [ ] Configurar redirect de la raíz `pronet.com.ar` → `https://app.pronet.com.ar`

**No avanzar hasta que `https://app.pronet.com.ar` sirva la app correctamente.**

## Fase 2 — Supabase Auth (aditivo, sin riesgo)

Panel de Supabase → Authentication → URL Configuration

- [x] **Redirect URLs**: AGREGAR (no reemplazar) las nuevas: — HECHO 2026-08-22
      - `https://app.pronet.com.ar/**`
      - Dejar las de `pronetprueba.netlify.app` por ahora
      - Aplicado vía Management API con `SUPABASE_PAT` de `.env.local`:
        `PATCH /v1/projects/{ref}/config/auth` con `uri_allow_list`.
        Verificado: quedaron las dos URLs, `site_url` sin tocar.
- [ ] **Site URL**: cambiar a `https://app.pronet.com.ar`
      (afecta los links de los mails de confirmación y recuperación de contraseña)

El cliente usa `window.location.origin` en `app.js:11364` y `datos.js:3214`,
así que se adapta solo — pero el origen nuevo tiene que estar en la allowlist
o Supabase rechaza el redirect.

## Fase 3 — Edge Functions

- [ ] Supabase → Edge Functions → Secrets: setear `SITE_URL = https://app.pronet.com.ar`
- [ ] Actualizar el fallback hardcodeado en `supabase/functions/crear-preferencia/index.ts:163`
- [ ] Redeploy de `crear-preferencia`
- [ ] Probar un pago de prueba y verificar que las `back_urls` vuelven al dominio nuevo

**NO hace falta tocar la `notification_url` del webhook**: apunta a
`*.functions.supabase.co`, no a Netlify. El circuito de cobro no se ve afectado.

## Fase 4 — Servicios externos

- [ ] Google Cloud Console → Credentials → API key de Maps:
      agregar `app.pronet.com.ar/*` a las restricciones de referrer
      (ver nota en `config.js:68`). Dejar el dominio viejo hasta la Fase 7.
- [ ] MercadoPago → panel de la aplicación: si el campo "Sitio web" o
      "URL de redirección" tiene el dominio viejo, actualizarlo.

## Fase 5 — Verificación previa al corte

Con TODO lo anterior hecho y el dominio viejo todavía activo:

- [ ] Login con email/password en `app.pronet.com.ar`
- [ ] Login con Google (usa `redirectTo` dinámico — verificar que no rebote)
- [ ] Recuperación de contraseña: que el mail llegue con link al dominio nuevo
- [ ] El mapa de Entre Vecinos carga (valida la API key de Maps)
- [ ] Un pago de prueba end-to-end: preferencia → pago → webhook → acreditación

## Fase 6 — Repo (el punto de no retorno para el APK)

- [ ] `capacitor.config.json` → `"url": "https://app.pronet.com.ar"`
- [ ] `playwright.config.js:35` → `baseURL`
- [ ] `tests/.auth/vecino.json` y `prestador.json`: **borrar y regenerar**
      (el storageState está atado al origen viejo; no se editan a mano)
- [ ] Comentarios `// Corre contra:` en los ~8 spec de `tests/`
- [ ] `CLAUDE.md`: líneas 27 y 43
- [ ] `config.js:68`: comentario de la restricción de la API key
- [ ] Bumpear `SW_VERSION` en `config.js`
- [ ] Correr la suite de Playwright completa contra el dominio nuevo

## Fase 7 — APK

- [ ] `npx cap sync android`
- [ ] Verificar que `android/app/src/main/assets/capacitor.config.json`
      quedó con el dominio nuevo (lo regenera el sync)
- [ ] Compilar release con el JBR de Android Studio (ver memoria `build_apk_java21`)
- [ ] Instalar y probar en dispositivo real ANTES de distribuir
- [ ] Recién ahora: subir a Google Play

## Fase 8 — Limpieza (semanas después)

No hacer hasta que el APK nuevo esté distribuido y adoptado.

- [ ] Quitar las Redirect URLs viejas de Supabase Auth
- [ ] Quitar `pronetprueba.netlify.app` de las restricciones de la API key de Maps
- [ ] Actualizar los permisos de `curl` en `.claude/settings.local.json`

**Mantener `pronetprueba.netlify.app` como alias de Netlify indefinidamente.**
Cuesta cero y cubre a cualquier usuario que tenga la PWA vieja instalada o
un APK sin actualizar. Liberar ese subdominio permite que un tercero lo tome.

---

## Lo que NO hay que tocar (verificado)

| Archivo | Por qué |
|---|---|
| `manifest.json` | usa rutas relativas (`./`) |
| `netlify.toml` | la CSP usa `'self'`, sin dominios hardcodeados |
| `sw.js` | sin URLs absolutas al sitio |
| `app.js` / `datos.js` | usan `window.location.origin`, se adaptan solos |
| `notification_url` de MP | apunta a `*.functions.supabase.co` |
| `appId` de Capacitor | `com.pronet.app` — independiente del dominio, y es inmutable |

## Efectos colaterales inevitables

- **Web Push**: las suscripciones están atadas al origen. Los usuarios con la
  PWA instalada en el dominio viejo mantienen su suscripción vieja hasta que
  reinstalen desde el dominio nuevo. El push nativo por FCM NO se ve afectado.
- **localStorage**: no se comparte entre orígenes. Un usuario que entre por el
  dominio nuevo arranca con sesión limpia y tiene que volver a loguearse.
