# Auditoría PRONET — 2026-08-12

Foco: lo construido esta semana (avisos de prestador, impulso, renovación, zona
de cobertura, mapa por barrio), que es lo menos revisado. Todo lo que dice
"probado" se probó **desde el cliente real** con la anon key y una sesión de
prestador, no por la Management API — esa saltea RLS y da falsos positivos.

---

## Hallazgos a corregir

### 1 · Buckets públicos sin límite de tamaño ni lista de tipos — ✅ CERRADO 2026-08-12

> **Corregido el mismo día.** Los cinco buckets quedaron en 10 MB y allowlist
> `image/jpeg, image/png, image/webp, image/heic, image/heif`. SQL en
> `supabase-buckets-limites.sql`. Verificado desde el cliente real: el SVG con
> `<script>` y el `text/html` rebotan con 415, un jpeg de 12 MB rebota con 413,
> y una foto normal sigue subiendo. Se eligió 10 MB y no 5 porque la foto más
> grande ya subida pesaba 4,3 MB — con 5 MB una foto de celular quedaba al
> filo. Lo que sigue es el hallazgo original.

| bucket | público | límite | tipos permitidos |
|---|---|---|---|
| `avatares` | sí | **ninguno** | **cualquiera** |
| `banners` | sí | **ninguno** | **cualquiera** |
| `mercado` | sí | **ninguno** | **cualquiera** |
| `portfolio` | sí | **ninguno** | **cualquiera** |
| `trabajos` | no | **ninguno** | **cualquiera** |
| `pedidos` | no | 50 MB | jpeg, png, webp, heic |
| `propuestas-adjuntos` | sí | 5 MB | jpeg, png, webp, pdf |

Los dos últimos ya están bien: el patrón existe, sólo no se aplicó al resto.

**Probado en vivo** contra el bucket `mercado` (el de las fotos de avisos y de
Entre Vecinos), con una cuenta de prestador común:

- Subir un `.html` → **200**. Se sirve público, pero Supabase lo devuelve como
  `text/plain`, así que no se ejecuta.
- Subir un `.svg` con `<script>` dentro → **200**, y se sirve como
  `image/svg+xml`. Ese sí se ejecuta si alguien abre la URL directa.

Qué implica de verdad:

- **No es XSS sobre PRONET.** El script correría en el origen de
  `supabase.co`, no en `pronetprueba.netlify.app` — no puede leer la sesión ni
  el localStorage de la app.
- **Sí es hosting gratis bajo un dominio creíble** para armar una página de
  phishing, y el link sale de tu proyecto.
- **Lo más concreto es el costo:** sin límite de tamaño, una cuenta puede subir
  gigabytes al bucket público y la factura de storage es tuya.

Corrección sugerida (es configuración de bucket, no toca código):

- `avatares`, `mercado`, `portfolio`, `banners`: límite 5 MB, tipos
  `image/jpeg, image/png, image/webp`.
- `trabajos`: límite 10 MB, mismos tipos + `image/heic`.
- Ojo antes de aplicar: si hoy alguien sube HEIC desde iPhone a `avatares`,
  una allowlist sin `image/heic` lo rompe. Hay que decidir si se incluye.

### 2 · 23 funciones SECURITY DEFINER sin `search_path` fijo — BAJO (deuda)

Entre ellas `es_admin` y `fn_verificar_pin_admin`, que son las dos más
sensibles. Todas otorgadas a `authenticated`/`anon`/`PUBLIC`.

**No es explotable hoy**, y lo verifiqué en vez de suponerlo:

- `anon` y `authenticated` **no** tienen `CREATE` en el esquema `public`, así
  que no pueden plantar un objeto que le haga sombra a lo que la función
  resuelve sin calificar.
- Sí pueden crear tablas temporales (`TEMP` está en PUBLIC por defecto), que
  sería la otra vía — pero para eso hace falta ejecutar `CREATE TEMP TABLE`, y
  PostgREST no expone SQL arbitrario. Haría falta una conexión directa a la
  base, que un usuario de la app no tiene.

Es endurecimiento, no un agujero abierto. Se cierra con
`ALTER FUNCTION ... SET search_path = public` en cada una. **Cuidado:** hay que
mirar función por función si alguna usa algo de `extensions` (por ejemplo
`crypt()` de pgcrypto en el PIN de admin) — pinear a `public` a secas la
rompería. Las funciones nuevas de esta semana (`activar_impulso_pagado`,
`activar_renovacion_pagada`, `resolver_pub_prestador`) **ya lo tienen bien**.

Lista completa: `abrir_chat_propuesta, actualizar_ultimo_evento_chat,
admin_toggle_suspension, buscar_prestadores, check_rate_limit_denuncias,
check_rate_limit_mensajes, check_rate_limit_pedidos, check_rate_limit_propuestas,
chequear_cupo_publicacion_mercado, contar_propuestas_pedido, es_admin,
evaluar_badge_verificado, fn_handle_new_user, fn_rate_limit_crear_pedido,
fn_verificar_pin_admin, iniciar_consulta_prestador, limpiar_notificaciones_leidas,
limpiar_rate_limits_old, otorgar_puntos_por_cierre, otorgar_puntos_por_resena,
rechazar_otros_chats_del_pedido, trigger_evaluar_badge, verificar_rate_limit`.

---

## Verificado y limpio

### Circuito de pago (impulso y renovación, lo nuevo)

- El **monto sale del servidor**, leyendo `planes_limites`. El cliente no lo
  manda. Impulso y renovación valen $1.500 tanto mensual como anual, así que
  mandar `periodo:'anual'` no compra nada más barato.
- `crear-preferencia` valida **antes de cobrar** que el aviso sea del que paga,
  que esté en el estado correcto (impulso: al aire; renovación: vencido) y —
  en renovación — que haya cupo libre en el plan. Cobrar algo que después no se
  puede activar obligaría a devolver plata; está evitado.
- El webhook **falla cerrado**: sin `MP_WEBHOOK_SECRET` rechaza todo. Firma
  `x-signature` inválida → 401. Sin firma → 200 sin procesar.
- Idempotencia con `pagos_procesados` como candado, tomado recién después del
  chequeo de `approved`, y con rollback del candado si la activación falla.
- `activar_impulso_pagado` y `activar_renovacion_pagada` están otorgadas
  **sólo a `service_role`**. Un cliente no puede llamarlas para activarse algo
  sin pagar. Además tienen `search_path` fijo.

### Avisos de prestador (`publicaciones_prestador`)

Tiene **dos capas** y las dos funcionan. Al leer sólo la policy de RLS parecía
que faltaba algo — la policy de UPDATE chequea el estado pero no las columnas
de vigencia — pero eso lo tapa la otra capa: el `UPDATE` está otorgado **por
columna**, sólo sobre `titulo, descripcion, rubro, foto_url, estado`.
`impulso_hasta`, `vigencia_hasta` y `prestador_id` quedaron afuera.

Probado en vivo con una cuenta de prestador, sobre un borrador propio:

| intento | resultado |
|---|---|
| Regalarme un impulso (`impulso_hasta` a 2030) | bloqueado (sin permiso de columna) |
| Mover mi aviso a otro prestador | bloqueado (sin permiso de columna) |
| Extenderme la vigencia | bloqueado (sin permiso de columna) |
| Pasar el aviso a `activa` yo mismo | bloqueado por RLS |
| Mandarlo a moderación | funciona (correcto) |
| Editar el título estando pendiente | funciona (correcto) |

También: la aprobación del admin pisa `estado`, `publicada_desde` y
`vigencia_hasta`, y un aviso ya aprobado y vigente no se puede editar — no hay
cambiazo después de la moderación.

### Resto

- **`pagos_procesados`**: RLS activa con 0 policies = deny-all. Es la única
  tabla en ese estado y está bien así: sólo el webhook con `service_role`
  escribe ahí.
- **Sin tablas sin RLS** y **sin una sola policy de escritura con
  `using(true)`/`check(true)`**.
- **Columnas sensibles**: `perfiles.telefono` y `publicaciones.lote` siguen
  correctamente revocados (no hay ni grant de tabla ni de columna).
  `prealtas_prestador` (DNI + teléfono) y `prestadores_verificacion` (DNI)
  tienen grant amplio pero RLS los limita a dueño + admin.
- **XSS**: revisé las 195 interpolaciones dentro de plantillas HTML de
  `app.js`. Todos los campos que escribe un usuario pasan por `escHTML()`. El
  único `src` sin escapar (`app.js:10800`) es un `URL.createObjectURL` de un
  archivo local, no texto de nadie. La disciplina se sostiene.
- El chequeo estático (`scripts/chequeo.js`) pasa limpio, incluida la regla del
  `.catch()` colgado del builder de PostgREST.

---

## Estado

El **punto 1 quedó cerrado el mismo día** (ver la nota arriba). Queda abierto el
**punto 2**, que es una tarde de trabajo cuidadoso —hay que revisar función por
función si alguna depende de `extensions`— y no urge, porque está verificado que
hoy no es explotable.
