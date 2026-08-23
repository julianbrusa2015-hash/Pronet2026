# PRONET · Definiciones de negocio

Estado al **2026-08-22**. Refleja lo que el código hace *hoy*, después de la
revisión de definiciones de esa fecha.

**Fuente de verdad de precios y límites: la tabla `planes_limites`.** Los valores
de `config.js` son fallback y se pisan al arrancar con lo que dice la base. Si
los dos difieren, manda la base — es la que lee `crear-preferencia` para cobrar.

---

## Los tres roles

| Rol | Qué hace |
|---|---|
| **Vecino** | Publica pedidos, contrata prestadores, vende cosas en Mercado |
| **Prestador** | Ofrece servicios, envía propuestas, publica anuncios |
| **Admin** | Modera, parametriza, resuelve denuncias y verificaciones |

---

## Prestador

### Planes de suscripción

Los planes son **del prestador**. Un vecino no tiene plan ni lo necesita.

| | Base | Plus | Pro |
|---|---|---|---|
| **Precio mensual** | $0 | $5.990 | $9.990 |
| **Precio anual** | $0 | $49.900 | $99.900 |
| Propuestas por mes | 3 | 10 | ilimitadas |
| Fotos de portfolio | 3 | 10 | 20 |
| Boost de loyalty | ×1.0 | ×1.25 | ×1.5 |
| Badge en búsqueda | — | — | ✔ |
| Desempate en ranking | — | — | ✔ |
| Estadísticas | — | básicas | completas + export |
| Publicaciones en Mercado | *(cupo de vecino)* | 10/mes | ilimitadas |

> ⚠️ **La última fila es una decisión abierta.** Ver "Pendientes de definición".

### Compras sueltas

No son suscripciones: se pagan una vez y valen para un aviso concreto.

| Producto | Precio | Qué da | Parametría |
|---|---|---|---|
| **Impulso** | $1.500 | El aviso aparece primero en Servicios por N días. No cambia el vencimiento. Se acumula si se compra de nuevo | `impulso_dias` (7) |
| **Renovación** | $1.500 | Vuelve a publicar un aviso vencido | — |
| **Banner** | $12.000 | Una pieza en el carrusel por N días. Pasa por moderación antes de cobrarse | `banner_dias` (30) |

**Anuncios** (`publicaciones_prestador`): el prestador arma su aviso de servicio,
pasa por moderación, y queda publicado con una vigencia. Sobre un aviso *activo*
se compra el impulso; sobre uno *vencido*, la renovación.

---

## Vecino

**No tiene plan y no debería tenerlo.** Un plan es un compromiso: para el
prestador tiene sentido porque es su trabajo, para el vecino que vende una bici
cada tanto es pedirle que se case para una cita. El vecino paga por uso.

| Qué | Cómo |
|---|---|
| Publicar en Mercado | **N gratis por mes**, después compra créditos. Parametría: `mkt_pub_vecino_mes` (hoy 5; `-1` = ilimitado, `0` = paga desde la primera) |
| Crédito de publicación | $5.000 cada uno, sirve para una publicación extra |
| Banner del carrusel | $12.000 — igual que el prestador, cualquiera puede contratarlo |
| Impulsar su publicación | **No existe.** Ver "Pendientes" |

Publicar pedidos, recibir propuestas, contratar y reseñar: **siempre gratis**.
Es el núcleo del marketplace y no se cobra.

---

## Qué publica cada uno, y dónde

Dos cosas distintas se llaman "publicación". Conviene no confundirlas:

| | Anuncio de prestador | Publicación de Mercado |
|---|---|---|
| Tabla | `publicaciones_prestador` | `publicaciones` |
| Quién | Prestador | Vecino y prestador |
| Qué | Servicios | Productos (vecino) / Servicios (prestador) |
| Dónde se ve | Feed de Servicios | Entre Vecinos |
| Mecánica | Contacto directo | Contacto directo |
| Se paga con | Cupo del plan | Cupo mensual + créditos |

El prestador **sólo puede publicar servicios** en Mercado, nunca productos: si
publicara un producto tendría una sección que después no ve.

> La diferencia con el núcleo de PRONET no es la categoría sino la **mecánica**:
> el núcleo es *pedido → propuestas → elección*; Mercado y Servicios son
> *contacto directo*.

---

## Pendientes de definición

**1. ¿El plan del prestador debe dar cupo en Mercado?**
Hoy sí: Pro ilimitado, Plus 10/mes. La regla que se propuso —y que resuelve la
tensión— es *"el plan cubre la actividad profesional, los créditos cubren la
venta entre vecinos"*: el plan no incluiría "Mercado" como sección, sino las
publicaciones **profesionales** del prestador, aparezcan donde aparezcan.
Cambiarlo es un downgrade para quien hoy publica por su plan.

**2. Impulso para el vecino.** No existe. El hueco de monetización más claro de
ese lado: el vecino que vende algo caro pagaría por aparecer primero en su
categoría, y hoy no se lo podés vender. **El umbral es medible**: cuando una
categoría de Mercado supere consistentemente ~15 publicaciones activas, la
posición pasa a ser escasa y el impulso vale. Antes, cobrarías por un beneficio
que no existe.

**3. Qué se conserva al borrar una cuenta.** Los pagos y el teléfono con
antecedentes ya se conservan. Sigue abierto qué pasa con las **reseñas que el
usuario escribió** —hoy se borran, y el rating de un prestador cambia por
decisión de un tercero— y con las **denuncias que hizo**.

---

## Notas de implementación que conviene recordar

**Los límites están escritos dos veces**, en el trigger de la base y en el
cliente. La base es la que manda; el cliente sólo decide qué mostrar antes de
que el usuario intente. Si se cambia uno hay que cambiar el otro, o la pantalla
promete algo que el servidor rechaza.

**Si el cliente lee una clave nueva de `config_app`**, hay que agregarla a la
policy `config_lectura_publica` (`supabase-config-lectura-publica-unificada.sql`,
único lugar donde se define). Si no, el usuario la recibe `undefined`, el valor
cae al default del código, y la parametría del panel no hace nada. Ya pasó con
siete claves.

**`es_pro_marketplace` es legacy.** Era un modelo viejo de suscripción a
ProMarket ($10.000/mes) que ya no existe. Nada lo enciende; sobrevive sólo para
grandfathering de quienes lo tenían.

**Etapa fundadora:** con `planes_pagos_activos` en `false`, los usuarios Base
reciben los límites de Plus. Hoy está en `true`, así que esa red **no** está
actuando.
