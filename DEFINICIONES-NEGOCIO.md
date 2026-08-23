# PRONET · Definiciones de negocio

Estado al **2026-08-22**. Refleja lo que el código hace *hoy*, después de la
revisión de definiciones de esa fecha.

**Fuente de verdad de precios y límites: la tabla `planes_limites`.** Los valores
de `config.js` son fallback y se pisan al arrancar con lo que dice la base. Si
los dos difieren, manda la base — es la que lee `crear-preferencia` para cobrar.

---

## Productos pagos, de un vistazo

| Producto | Precio | ¿De quién? |
|---|---|---|
| Plan **Base** | $0 | Prestador |
| Plan **Plus** | $5.990 / $49.900 | Prestador |
| Plan **Pro** | $9.990 / $99.900 | Prestador |
| **Impulso** de aviso | $1.500 | Prestador |
| **Renovación** de aviso | $1.500 | Prestador |
| **Banner** del carrusel | $12.000 | Prestador o Vecino |
| **Crédito** de publicación | $5.000 | Vecino |
| **Destacar publicación** | $1.500 | Vecino |

> Plus sale **$5.990**, no $4.990. El $4.990 que figura en `config.js` es un
> fallback viejo que nunca se aplica: `planes_limites` dice $5.990 y es la que
> cobra. La pantalla muestra el precio correcto porque los valores de la base
> pisan a los del archivo al arrancar.

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
| Publicar en Mercado · Servicios | **no** | 10/mes | ilimitadas |

> **Decidido 2026-08-22:** publicar en la sección Servicios de Entre Vecinos es
> un beneficio de los planes superiores. Un prestador con plan **Base no puede
> publicar** ahí; el camino es upgradear, no comprar créditos sueltos.
>
> **El prestador publica servicios y nada más.** No publica productos: para eso
> está el mercado del vecino. Que un prestador con plan Base no pueda publicar
> nada en Mercado es la definición, no un efecto colateral — entra a Entre
> Vecinos por su oficio, no a vender una bicicleta.

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
| **Destacar** su publicación | $1.500 → 7 días primero **en su categoría**. Mismo precio y duración que el impulso del prestador |
| Publicar **servicios** en Mercado | **No.** Eso es del prestador |

Publicar pedidos, recibir propuestas, contratar y reseñar: **siempre gratis**.
Es el núcleo del marketplace y no se cobra.

---

## Qué publica cada uno, y dónde

Dos cosas distintas se llaman "publicación". Conviene no confundirlas:

| | Anuncio de prestador | Publicación de Mercado |
|---|---|---|
| Tabla | `publicaciones_prestador` | `publicaciones` |
| Quién | Prestador | Vecino (productos) · Prestador (servicios) |
| Qué | Servicios | Productos o Servicios, según quién publique |
| Dónde se ve | Feed de Servicios | Entre Vecinos |
| Mecánica | Contacto directo | Contacto directo |
| Se paga con | Cupo del plan | Cupo mensual + créditos |

El prestador **sólo puede publicar servicios** en Mercado, nunca productos: son
dos mercados distintos y él entra por su oficio.

> El código justifica esta restricción diciendo que el prestador "tendría una
> sección que después no ve". **Eso ya no es cierto** —verificado 2026-08-22: el
> prestador ve las dos secciones en el feed, las pestañas no se le esconden—.
> La restricción se sostiene igual, pero por la separación de mercados, no por
> esa razón. El comentario del código conviene corregirlo cuando se toque.

> La diferencia con el núcleo de PRONET no es la categoría sino la **mecánica**:
> el núcleo es *pedido → propuestas → elección*; Mercado y Servicios son
> *contacto directo*.

---

## Pendientes de definición

**1. CERRADO 2026-08-22 — el plan rige el acceso a Mercado.**
Publicar en la sección Servicios es beneficio de Plus y Pro. El prestador Base
no publica en Mercado, y el camino es upgradear.

**El prestador Base tampoco puede comprar un crédito suelto** — decidido, "no
por el momento". Un crédito a $5.000 competiría con Plus a $5.990 y
canibalizaría el upgrade. El "por el momento" importa: si algún día la barrera
resulta demasiado dura para prestadores que publican poco, habilitar el crédito
es revertir un `if` en `puedePublicarMercado()` y otro en el trigger.

Implementado en los tres lugares: validación, cartel de cupo y
`chequear_cupo_publicacion()`.

**2. CERRADO 2026-08-22 — el vecino tiene impulso, y el umbral es una regla.**

El vecino puede destacar su publicación: **$1.500, 7 días, primero en su
categoría**. Mismo precio y duración que el impulso del prestador.

Y el umbral dejó de ser "cuándo lo construimos" para volverse **regla del
producto**, que aplica a los dos:

> El botón de destacar sólo aparece si la lista donde vas a aparecer primero
> tiene competencia real. **Prestador** → avisos activos de su *rubro*.
> **Vecino** → publicaciones activas de su *categoría*.
> Parametría: `impulso_min_publicaciones`, hoy 15.

Aparecer primero entre tres no vale nada: el que paga se siente estafado y no
vuelve a comprar. Es peor que no haberlo ofrecido — se quema la credibilidad del
producto antes de que pueda funcionar.

Como regla, la decisión se vuelve automática: el impulso se ofrece donde vale y
desaparece donde no, sin que nadie tenga que acordarse de activarlo. **Hoy va a
estar oculto en casi todos lados, y eso es correcto.**

**3. CERRADO 2026-08-22 — se conservan las reseñas y las denuncias.**

Se guarda el **hecho** y se borra el **dato personal**: el autor queda en null.

Una reseña dice algo sobre el **prestador**, no sobre quien la escribió. Que un
plomero pierda una reseña de 5 estrellas porque el vecino que se la dejó se dio
de baja es reputación de la comunidad evaporándose por decisión de un tercero.
Las denuncias, igual: son registro de moderación.

Cortar la cadena no fue trivial. Borrar al vecino cascadeaba
`pedidos → propuestas → chats_trabajo → resenas`, así que la reseña se iba por
**dos** caminos: su `vecino_id` y su `chat_id`. Los dos pasaron a `SET NULL`.

`prestador_id` sigue en cascada a propósito: sin prestador, la reseña no
significa nada.

**El rating es de la persona, no del rubro.** Anotado 2026-08-23. Un prestador
multirubro tiene **un solo promedio**, que junta las reseñas de todos sus
rubros — no existe "rating en Electricistas" separado de "rating en
Vidriería". Verificado con un caso real: `servicios_001 prueba` (Electricistas
· Plomería · Vidrieria) tenía un 5 de un trabajo de Electricistas y recibió un
3 de un trabajo de Vidriería — el promedio pasó a **4.0** con las dos reseñas
juntas, y ese 4.0 es el que usan los cuatro lugares que hoy comparten la
fórmula bayesiana (`buscar_prestadores`, Ranking Zonal, feed de Inicio,
`ranking_propuestas`).

Consecuencia a tener presente: **`posicion_prestador()` sólo calcula la
posición contra el rubro PRINCIPAL** (el primero de `rubros[]`), no contra
cada rubro que tenga. Si un prestador multirubro mejora su reputación
trabajando en un rubro secundario, esa mejora empuja su posición en TODOS sus
rubros — incluido el principal — porque el rating que se usa es el mismo en
los cuatro lugares. No hay ranking por rubro separado; hay una sola
reputación que se lee distinto según el filtro, pero nunca se recalcula
distinto.

**4. CERRADO 2026-08-22 — el sello verificado pasa a Nivel 1 y se enciende.**

No era una feature de crecimiento: es confianza básica en un marketplace donde
alguien entra a tu casa.

Y no enciende nada más — no gatea ninguna pantalla ni ningún elemento. Lo único
que controla es una regla CSS que oculta las tres clases de badge. El circuito
ya funcionaba con el flag apagado; lo único que faltaba era que se **viera**.

**Qué significa "verificado".** Confianza básica de identidad, no una feature
de crecimiento: el prestador sube su DNI, el admin lo revisa y aprueba, se
enciende `prestadores.verificado = true`. Mide **quién es**, no **qué tan bien
labura** — por eso el premio que da va aparte de la reputación, no la
reemplaza.

**Y sí, da mejor exposición — con un límite a propósito.** Entra en la fórmula
del ranking con **+2 puntos fijos** en el numerador bayesiano:

```
(rating × reseñas + 15 + 2 si está verificado) / (reseñas + 5)
```

Anotado 2026-08-23:
- **Aditivo, no multiplicativo** — a diferencia del boost del plan Pro (×1.4,
  que escala con el puntaje), éste es fijo. No compite con pagar el plan ni se
  siente "pagar para ganar".
- **Nunca le gana a reseñas reales** — un verificado con 0 reseñas sigue por
  debajo de uno con reseñas buenas de verdad.
- **Misma fórmula en 4 lugares** — búsqueda (`buscar_prestadores`), Ranking
  Zonal, el feed de Inicio, y desde hoy también `ranking_propuestas` (el orden
  en que el vecino ve las propuestas). Si alguna se desincroniza, un
  prestador verificado deja de tener el mismo empuje según dónde lo mires —
  ver `supabase-boost-verificado-ranking.sql`, que lleva la cuenta de las
  cuatro copias.

**5. El circuito de puntos queda APAGADO, y anotado.**

Nunca se definió: qué eventos otorgan puntos, cuántos, y qué se canjea. Un
programa de puntos con pocos usuarios reparte premios que nadie ve y agrega
complejidad a cambio de nada. Es lo último que se enciende, y antes hay que
definirlo — encenderlo sin esa definición es encenderlo a ciegas.

---

## Pendiente grande · Rediseño del Catálogo de Servicios por Rubro

**Anotado 2026-08-23.** No es un ajuste, es un cambio de modelo.

**El problema:** hoy el precio de referencia está atado al **rubro**, no al
servicio. `catalogo_servicios` tiene una fila por rubro —sus columnas son
`rubro, descripcion, icono, incluye, no_incluye, precio_ref_min,
precio_ref_max, precio_unidad, activo, orden`, **ninguna de servicio**— y
`obtenerFichaPorRubro()` consulta `.eq('rubro', rubro).maybeSingle()`.

Los datos de hoy muestran por qué no sirve: *Electricistas $30.000–$300.000*,
*Plomería $30.000–$350.000*. Cambiar un enchufe y cablear una casa entran en el
mismo rango, así que el número no informa: sólo ancla mal la expectativa del
vecino, y después toda propuesta le parece cara.

**La definición correcta:** sólo hay precio si está asociado al alta de un
**servicio** concreto dentro del rubro. Un rubro es demasiado grande para tener
un precio.

**Trampa técnica que ya existe:** `maybeSingle()` devuelve error con más de una
fila. Si alguien diera de alta dos fichas activas del mismo rubro, no se
mostraría ningún precio — y sin ningún aviso.

**Qué implica:**

- Columna de servicio en `catalogo_servicios`; la clave pasa a ser
  `(rubro, servicio)`
- El vecino elige el **servicio** además del rubro al publicar — hoy sólo elige
  rubro
- `pedidos` guarda ese servicio
- El precio y `SLIDER_RANGOS` se resuelven por servicio
- El ABM del catálogo pasa a ser una lista por rubro, no una ficha única

**La pregunta que lo destraba:** ¿el vecino elige el servicio de una lista
cerrada al publicar? Si describe libremente, no hay dónde enganchar el precio
referencial.

> Esto ya figuraba como *"Fase 2: selector de tipo de servicio"*, postergada a
> propósito cuando se decidió el catálogo. Sigue postergada, ahora con el
> diagnóstico escrito.

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
