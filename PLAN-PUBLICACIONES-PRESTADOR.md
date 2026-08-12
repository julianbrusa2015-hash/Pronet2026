# Plan · Publicaciones de Prestadores en Servicios

Sobre el bosquejo `bosquejo-servicios-vecino.html` (2026-08-12). El prestador
arma publicaciones con foto desde su panel y aparecen en la solapa Servicios
de Entre Vecinos, bajo un toggle Vecinos/Prestadores. El prestador **publica
hacia** ese espacio; no lo navega.

---

## Definiciones cerradas (no rediscutir sin motivo)

| # | Definición |
|---|---|
| 1 | **Sin comentarios ni estrellas abiertas** en publicaciones de prestador. Su tarjeta muestra la reputación real: rating bayesiano + cantidad de reseñas verificadas. Un solo número de reputación por prestador en toda la app. El 👍 like sí queda. |
| 2 | **El prestador no navega el espacio.** Ve su pieza con "Ver cómo la ve un vecino" (vista previa de solo lectura). Perfil doble: el acceso sigue al rol activo (`modoRol`). |
| 3 | **Métricas solo del lado vecino.** Ni las vistas propias ni la vista previa suman. La conversión se calcula sobre un denominador honesto. |
| 4 | Toggle por defecto en **Vecinos**; se recuerda la última elección. |
| 5 | **"✓ Verificado" no se muestra** hasta definir qué lo otorga. |
| 6 | Suscripción = bolsa + publicaciones, **un solo cobro**. Cupos y duraciones son parámetros del plan en la base. |
| 7 | "Impulsar" es **compra suelta**, mismo circuito que el banner (preferencia MP con `ref` + webhook). |
| 8 | Todo nace **detrás de un flag** (`publicaciones_prestador` en `config_app`), como los banners pagos. Apagado = sin rastros. |

## Decisión abierta — BLOQUEA LA FASE 4

**¿Qué pasa al tocar "Pedir presupuesto"?**

- **Opción A (recomendada): genera un pedido real dirigido.** El vecino
  completa qué necesita y eso crea un pedido visible solo para ese prestador,
  que responde con una propuesta normal. Reusa propuestas, chat, cierre y
  reseña — un solo circuito, y la reputación se sigue alimentando. Costo:
  hay que construir el concepto "pedido dirigido" (visibilidad restringida
  en RLS + el feed del prestador lo destaca).
- **Opción B: abre chat directo** (como el contacto de Entre Vecinos).
  Mucho más rápido de construir. Riesgo: canal paralelo sin cierre ni
  reseña que compite con el circuito principal — si contactar por tarjeta
  es más fácil que publicar un pedido, el flujo con reputación se vacía.

Las fases 1–3 no dependen de esta decisión; se puede arrancar ya.

---

## Fase 1 · Base de datos

**Tabla nueva `publicaciones_prestador`** — no recargar `publicaciones`:
el ciclo de vida es distinto y el RLS de esa tabla ya se depuró tres veces.

```
id, prestador_id → prestadores, titulo, descripcion, rubro, foto_url,
estado ('borrador'|'pendiente'|'activa'|'rechazada'|'vencida'),
creado, publicada_desde, vigencia_hasta, impulso_hasta,
moderado_por, moderado_en, motivo_rechazo
```

- RLS: el prestador CRUD sobre lo suyo; el vecino SELECT solo `estado='activa'
  and vigencia_hasta > now()` (filtro **en el servidor**, lección del lote);
  admin todo. Repasar GRANT de tabla vs columna.
- Likes: tabla `likes_publicaciones_prestador` (mismo diseño que la existente).
- Métricas: contadores por RPC — `fn_pub_vista`, `fn_pub_clic_contacto` —
  copiando `fn_registrar_vista`: security definer, bloquea eventos del propio
  prestador y de cuentas con rol prestador activo, deduplica por día. Nunca
  UPDATE directo del cliente.
- **Parámetros de plan**: columnas nuevas en `planes_limites` →
  `pub_slots`, `pub_duracion_dias`, `pub_destacados_mes`. Cargar valores para
  base/plus/premium. `banner` y `promarket_credito` quedan en null.
- Límite de slots **también como trigger en la base** (patrón
  `fn_test_limite_propuestas`): el cliente muestra el límite, el servidor lo
  garantiza. Etapa fundadora: `plan_para_limites()` ya resuelve que todos
  tengan lo de Plus mientras los pagos estén apagados.
- Flag `publicaciones_prestador` en `config_app` + whitelist
  `config_lectura_publica` (sin esto el cliente no lo ve — ya pasó).
- Todo en un `.sql` versionado en el repo **y aplicado** (verificar la base,
  no el archivo).

## Fase 2 · Panel del prestador

Pantalla nueva `s-mis-publicaciones` — registrarla en los TRES lugares
(`all` de goTo, `navMap`, `FEATURE_SCREENS`).

- Slots según `pub_slots` del plan, con estados: Publicada (días restantes),
  Pendiente de revisión, Borrador, Rechazada (con motivo), Disponible.
- Alta/edición: foto (Storage, mismo bucket-patrón que portfolio), título,
  rubro (catálogo existente), descripción. `escHTML` en todo render.
- Duración al publicar según `pub_duracion_dias` del plan.
- **"Ver cómo la ve un vecino"**: vista previa de solo lectura de su tarjeta
  y detalle. No registra vista.
- Publicar → `estado='pendiente'` (va a moderación, no directo al aire).

## Fase 3 · Moderación del admin

Copiar el flujo de banners (`renderBannersPendientes` / `resolver_denuncia`):

- Cola "Publicaciones por revisar" en el panel: aprobar (activa y arranca la
  vigencia) / rechazar con motivo (vuelve al prestador como Rechazada).
- Queda registrado quién y cuándo decidió, con reversión (patrón ya hecho
  en la moderación de denuncias).
- Las activas entran al circuito de denuncias existente.

## Fase 4 · Vista del vecino

- Toggle Vecinos/Prestadores dentro de Servicios (segmented, como el
  bosquejo). Default Vecinos; recuerda la última elección por sesión.
- Mismos filtros de rubro/zona en ambas vistas — solo cambia la fuente.
- Tarjeta de prestador: acento visual propio, tag "Prestador", **rating
  bayesiano + n reseñas** (dato existente), sin comentarios, con 👍.
- Detalle: carrusel de fotos, mini-perfil, botón según la decisión abierta
  ("Pedir presupuesto" A o B). **Gate de teléfono** antes del contacto.
- Prestador logueado (rol activo prestador): no ve el toggle ni el feed.

## Fase 5 · Vencimiento y renovación

Patrón de vencimiento de pedidos, tal cual:

- Al vencer `vigencia_hasta`: sale del feed (el RLS ya lo garantiza), pasa a
  `vencida` en el panel del prestador.
- Aviso **antes** de vencer (push/notificación existente) + al vencer:
  "Renovala en 1 toque" — nunca un simple "se borró". La renovación re-entra
  por moderación solo si cambió el contenido; si es idéntica, directo.

## Fase 6 · Monetización (encendido después, como banners)

- Gating real por plan cuando los pagos se enciendan (los límites ya quedan
  escritos en Fase 1; esto es apagar la etapa fundadora, no desarrollo).
- **Impulsar**: compra suelta desde el slot — `crear-preferencia` con
  `ref` de la publicación + rama en `webhook-mp` que setea `impulso_hasta`.
  Copiar el circuito del banner **incluyendo el ref en metadata** (el bug
  que ya nos comimos una vez).
- Toggle del admin para la venta de impulsos, separado del flag general.

## Fase 7 · Métricas visibles

- En cada slot: vistas, 👍, clics de contacto, solicitudes, conversión.
- Barra de métricas del detalle del prestador (como el bosquejo).
- Fuente: los RPCs de Fase 1. Si más adelante se agregan vistas a las
  publicaciones de vecinos (pedido anotado), usar **la misma mecánica**.

## Transversal

- Tests Playwright por fase (los helpers de gates ya existen; ojo con los
  overlays que se ocultan por opacity — esperar `.show`).
- `npm run check` antes de cada push; bump de `CACHE_VERSION` en cada
  entrega que toque app.js/index.html/styles.css/datos.js.
- Actualizar `INSTRUCTIVO-PRUEBAS.md` con el circuito completo al cerrar.

## Orden y dependencias

```
F1 (base) ──► F2 (panel) ──► F3 (moderación) ──► F4 (vecino) ──► F5 (vencimiento)
                                                    │
                          decisión del contacto ────┘        F6 y F7: después de F4,
                                                             en cualquier orden
```

Entregable mínimo con valor: F1–F4 con contacto **provisorio por chat** si
la decisión A se demora — dejando la tarjeta lista para redirigir el botón.

## Deuda anotada (no entra en este desarrollo)

- Comentarios con estrellas de la vista Vecinos sin compra verificada.
- Definición de "✓ Verificado" (¿DNI de la pre-alta? ¿admin?).
- Vistas como contador en publicaciones de vecinos (pedido 2026-08-11).
