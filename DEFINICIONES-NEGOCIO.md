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

> **Decidido 2026-08-22, revertido 2026-08-23.** La idea era que publicar en
> la sección Servicios de Entre Vecinos fuera un beneficio de los planes
> superiores. Se llegó a construir el enganche (consultar ahí armaba una
> propuesta) antes de que quedara claro que **el prestador no tiene que
> llegar a Entre Vecinos para nada** — ni para publicar ni para nada más. Su
> lugar es "Mis avisos en Servicios" (más abajo), que ya existía y hacía
> exactamente esto sin pasar por el mercado de los vecinos. El código de esa
> ruta quedó revertido; esta fila de la tabla es **aspiracional, no
> alcanzable hoy** — no hay ningún botón en la app que lleve a publicar un
> servicio ahí. Ver ["Mis avisos en Servicios"](#mis-avisos-en-servicios---el-circuito-completo)
> para el circuito real.

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

### "Mis avisos en Servicios" — el circuito completo

**Repasado 2026-08-23**, después de un ida y vuelta que primero construyó esto
mismo en el lugar equivocado (Entre Vecinos) antes de encontrar que ya existía
acá. Queda anotado para no repetir la confusión.

**Qué es.** La ficha con foto que el prestador arma desde su propio perfil
(*Mi Perfil → Mis avisos en Servicios*) — sube una foto, título, descripción,
la previsualiza y la manda a revisión. Tabla propia:
`publicaciones_prestador`, distinta de `publicaciones` (la de los vecinos).

**Dónde salen: adentro de Entre Vecinos.** En la solapa **Servicios**, del
lado **Prestadores** del selector de origen. `renderFeedPrestadores()` es el
único lugar del código que los renderiza, y se llama desde `renderMercado()`,
que es la pantalla de Entre Vecinos.

> **Corregido 2026-08-29.** Este párrafo decía antes *"No es Entre Vecinos…
> vive en la solapa Servicios (la búsqueda normal de prestadores)"*. Era
> falso por partida doble: la solapa Servicios **es** parte de Entre Vecinos,
> y estos avisos no aparecen en la búsqueda de prestadores. Lo que sí sigue
> siendo cierto es lo de abajo — el prestador no NAVEGA Entre Vecinos: arma
> el aviso desde su perfil y las consultas le entran por el canal habitual.
> Su contenido vive ahí; él no.

**El prestador no navega Entre Vecinos para nada de esto — ni un poco.** Ni
para publicar (lo hace desde su perfil, sin salir de ahí) ni para ver quién
lo contactó ni para nada del mercado de los vecinos. La sección entera
"Entre Vecinos" del menú de Mi Perfil (Mis publicaciones, Consultas
recibidas, Consultas enviadas, Mis alertas, Ir a Entre Vecinos) se oculta
completa para él (`seccion-promarket-perfil`, controlado en
`reflejarUsuario()`).

> **Corregido 2026-08-23.** La primera versión de este ocultamiento sólo
> escondía 3 de los 5 ítems ("Ir a Entre Vecinos", "Consultas enviadas",
> "Mis alertas"), bajo la idea de que "Mis publicaciones" y "Consultas
> recibidas" eran sobre lo que el prestador publicó *como vecino* — un rol
> separado, no navegación. Error: esos dos ítems van a `s-mis-publicaciones`
> y `s-mis-consultas-mkt`, las pantallas del **mercado de los vecinos**
> (tabla `publicaciones`), no a "Mis avisos en Servicios". Un prestador
> logueado los seguía viendo en su perfil aunque nunca hubiera vendido nada
> ahí, porque una regla aparte (`usuarioActual ? '' : 'none'`, pensada para
> "cualquier logueado puede publicar en Mercado") los mostraba sin mirar el
> rol. La consulta al prestador entra siempre por el canal habitual —el
> vecino contacta, se crea un pedido— nunca por un chat de Entre Vecinos.

**Cupo por plan** — no está atado exclusivamente a un plan pago, el Base ya
tiene uno:

| plan | avisos al aire | duración por aviso | destacados incluidos/mes |
|---|---|---|---|
| Base | 1 | 7 días | 0 |
| Plus | 3 | 15 días | 1 |
| Pro | 6 | 30 días | 2 |

Subir de plan no *destraba* la función — la **amplía**: más cupos simultáneos,
más días al aire, destacados de regalo. Distinto de publicar en Entre
Vecinos, donde el Base directamente no puede publicar nada (0).

**Moderación.** `borrador → pendiente → activa` (o `rechazada`). Sólo el
admin resuelve (`resolver_pub_prestador`), y a diferencia de los banners —que
no avisan nada, el anunciante entra a mirar si quiere saber— **acá sí se
notifica al prestador** el resultado: una revisión sin respuesta se siente
como un rechazo silencioso.

**Cómo lo contacta el vecino — la pieza central.** Toca **"Consultar"** en el
aviso, y eso arma un **pedido dirigido** a ese prestador puntual (mismo
mecanismo que "recontratar" a alguien con quien ya trabajaste antes:
`dirigirPedidoA`). El prestador responde con una **propuesta normal**, que se
elige, se cierra y se reseña — el circuito completo de PRONET.

**No** es un chat suelto por fuera de ese circuito. Es la diferencia central
con el mercado de los vecinos: ahí "Consultar" abre un chat de contacto
directo porque comprar un objeto no es un trabajo con propuesta ni cierre.
Acá sí es un trabajo, así que entra al mismo lugar que mide reputación,
alimenta el ranking y decide quién aparece primero.

**Las cuatro métricas de la tarjeta.** Es un embudo, en este orden:

| ícono | qué mide |
|---|---|
| 👁 Vistas | cuántos vieron el aviso en el feed de Servicios |
| 👍 Me gusta | a cuántos les gustó |
| 👆 Clics en "Contactar" | cuántos tocaron el botón — intención, no un "no me gusta" |
| 📩 Pedidos enviados | cuántos llegaron a mandar un pedido de verdad — la única en verde |

Cada paso filtra al anterior: ver → gustar → tocar contactar → mandar el
pedido. El de **pedidos** es el que importa de verdad —es plata en
potencial, no sólo interés— por eso es el único destacado en color. Muchas
vistas y cero pedidos dice que el aviso llama la atención pero no convierte;
pocas vistas con buena conversión dice que el problema es que no lo
encuentran, no el aviso en sí.

### Las cinco vías del prestador para hacerse ver

**Repasado 2026-08-29.** Los dos ítems del perfil se leían como lo mismo,
así que quedaron rotulados con lo que son: *Promocionar mi negocio
(Banner)* y *Mis avisos en Servicios (Vecinos)*. El mapa completo:

| | Qué es | Dónde sale | Cuánto |
|---|---|---|---|
| **1. Banner** | Pieza gráfica que diseña él | Carrusel de Inicio | $12.000 / 30 días |
| **2. Avisos en Servicios** | Ficha con foto, título y descripción | Entre Vecinos → Servicios → Prestadores | Cupo del plan |
| **3. Impulso** | Sube un aviso del punto 2 al principio | Mismo feed | $1.500 / 7 días |
| **4. Renovación** | Revive un aviso del punto 2 ya vencido | Mismo feed | $1.500 |
| **5. Su ficha** | El perfil de prestador | Buscar, mapa y feed de Inicio | Gratis |

**La diferencia entre 1 y 2 no es el precio, es a dónde lleva.** El banner
abre WhatsApp o un flyer: **saca al vecino de PRONET**. El aviso arma un
**pedido dirigido** y lo mete al circuito de pedido → propuesta → elección
→ reseña, que es lo que alimenta la reputación y el ranking. Por eso el
banner se cobra aparte y el aviso viene con el plan: uno es publicidad, el
otro es el producto.

**El punto 5 es la base y es gratis.** Un prestador existe en la app sin
pagar nada; el plan Pro le suma badge en la búsqueda y desempate en el
ranking. Todo lo demás es amplificación, no acceso.

#### Impulso y renovación: dónde están y cuándo aparecen

No son ítems de menú. Viven **dentro de "Mis avisos en Servicios", en la
tarjeta de cada aviso**, y sólo aparece el que corresponde:

| | Botón | Condición |
|---|---|---|
| Impulso | ⚡ Impulsar | El aviso está **activo y vigente**, la venta de impulsos está encendida, y **hay competencia en su rubro** |
| Renovación | 🔄 Renovar | El aviso está **vencido** y ya pasó por moderación al menos una vez |

Son excluyentes por definición —uno pide que esté al aire y el otro que
esté vencido—, así que nunca se ven los dos juntos.

Las dos condiciones que sorprenden:

- **Impulsar exige competencia en el rubro.** Si es el único electricista
  de la zona, aparecer primero no le da nada. Cobrarle por eso sería
  venderle humo, y el que paga por nada no vuelve a comprar.
- **Renovar exige moderación previa.** Un borrador no se renueva, se envía.

Y el impulso tiene su propio interruptor de admin (*Parametrías → Ajustes
→ Venta de impulsos*): apagado, el botón no existe para nadie.

**Qué compra cada uno, que es lo que más se confunde:** impulsar es
**visibilidad** —aparece primero por 7 días, no cambia el vencimiento—;
renovar es **tiempo** —vuelve a publicar lo vencido, no lo pone primero—.

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
| Quién | Prestador | Vecino (productos) |
| Qué | Servicios | Productos |
| Dónde se ve | Feed de Servicios | Entre Vecinos |
| Mecánica | Contacto directo → arma pedido dirigido | Contacto directo (chat) |
| Se paga con | Cupo del plan | Cupo mensual + créditos |

**El prestador no publica en Mercado.** La columna "Prestador (servicios)"
que decía esto antes describía un plan que se revirtió el 2026-08-23 — ver
la nota en [Planes de suscripción](#planes-de-suscripción) y en ["Mis avisos
en Servicios"](#mis-avisos-en-servicios---el-circuito-completo). Sólo el
vecino publica en Mercado, y sólo productos.

> El código justifica esta restricción diciendo que el prestador "tendría una
> sección que después no ve". **Eso ya no es cierto** —verificado 2026-08-22: el
> prestador ve las dos secciones en el feed, las pestañas no se le esconden—.
> La restricción se sostiene igual, pero por la separación de mercados, no por
> esa razón. El comentario del código conviene corregirlo cuando se toque.

> La diferencia con el núcleo de PRONET no es la categoría sino la **mecánica**:
> el núcleo es *pedido → propuestas → elección*; Mercado y Servicios son
> *contacto directo*.

---

## La cara: el prestador la muestra, el vecino no

**Decidido 2026-08-29.**

| | Ve su propia foto | Cómo lo ven los demás |
|---|---|---|
| **Prestador** | Sí | **Con foto** (`prestadores.foto_url`) |
| **Vecino** | Sí | **Iniciales** |

**El fundamento no es prudencia, es simetría con lo que cada uno ofrece.**
El prestador expone su cara porque vende un servicio y esa exposición es
parte de lo que vende: el vecino contrata a una persona. El vecino publica
una torta o pide un plomero, y no tiene por qué poner la cara para eso.

**Y hay un motivo técnico que lo refuerza:** la vista `perfiles_publicos`
—que es de donde saldría la foto del vecino para el resto de la app—
**está expuesta al rol `anon`**. Publicarla ahí la haría legible por
cualquiera sin cuenta, no sólo por los vecinos del barrio. Es el mismo
criterio que ya cerró el teléfono cosechable.

Por eso `perfiles.foto_url` existe y el vecino la guarda, pero **no se
agregó a `perfiles_publicos`**. Si algún día se agrega, conviene que sea
detrás de un `auth.uid() is not null` para que el invitado siga viendo
iniciales.

> **Bug que destapó esta definición** (`supabase-foto-perfil-vecino.sql`):
> `perfiles` no tenía la columna, y como el nombre, el teléfono y la foto
> viajan en un único `UPDATE`, elegir una foto le rompía al vecino el
> guardado **completo** del perfil (PGRST204). Encima engañaba: la imagen
> sí se subía al Storage, así que decía "✓ Foto lista" y recién al guardar
> fallaba con un mensaje que sugería reintentar.

---

## Los dos carruseles de banners

**Decidido 2026-08-24.** Había un solo carrusel —el de la portada— y una
sola bolsa de 6 espacios. El problema no era el cupo sino la mezcla: un
aviso que un prestador compró para la portada era el mismo objeto que
podía aparecer dentro del mercado de los vecinos. Se abre un segundo
carrusel, con inventario propio.

| | Portada (Inicio) | Entre Vecinos |
|---|---|---|
| `banners.ubicacion` | `'portada'` | `'vecinos'` |
| Quién compra ahí | **Prestador** | **Vecino** |
| Dónde se ve | Carrusel de Inicio, lo ve todo el mundo al entrar | Arriba del feed de Entre Vecinos |
| Espacios | 6 (`banners_activos_max`) | 6, contados aparte |

**Quién compra dónde lo decide el rol, no una opción del formulario**
(`promoUbicacion()` en `app.js`, revalidado en `crear_banner`). Ofrecerlo
como elección sería pedirle al usuario que resuelva una pregunta de
arquitectura que ya tiene una respuesta correcta: el prestador va a la
portada porque su oficio le interesa a todo el barrio; el vecino va a
Entre Vecinos porque es donde ya publica lo que vende.

**El carrusel de Inicio es EXCLUSIVO de prestadores — ratificado
2026-08-29.** El vecino no tiene forma de comprar ahí: no existe el
camino en la interfaz, y `crear_banner` lo rechaza en el servidor con
*"El carrusel de la portada es para prestadores"*.

El motivo, en palabras del usuario: **Inicio es la pantalla donde el
vecino busca prestadores**, así que es ahí donde tiene sentido que un
prestador se muestre. La pauta acompaña a la intención de quien mira.

> Esto **acota** la definición #1 de los banners pagos del 2026-08-10
> (*"puede comprar cualquiera con cuenta, no sólo prestadores"*), que se
> escribió cuando el carrusel de la portada era el único que existía. Hoy
> sigue siendo cierta en general —cualquiera con cuenta compra un
> banner— pero cada rol compra en el suyo.

**El recorte real es 16:5** (1200×375). Está en un solo lugar del código,
`.ads-slide img` en `styles.css`, y todo lo demás tiene que coincidir: la
caja de previsualización, el texto de ayuda, la tarjeta de moderación y la
lista "Mis avisos". Llegaron a convivir cuatro relaciones distintas
—3:1, 16:7 y 16:5— y ninguna era la que se publicaba, así que a nadie le
quedaba el aviso como lo había subido. Al tocar cualquiera de esas
pantallas, verificar contra `.ads-slide img`.

**Por qué inventario separado y no una bolsa compartida.** Con 6 en total,
el que compra para la portada le come el lugar al que compra para Entre
Vecinos y viceversa, sin que ninguno entienda por qué se quedó sin
espacio. Son dos públicos distintos y pueden tener precios distintos.

**El CTA azul es un slide, no un bloque.** "Publicá lo que tenés o lo que
sabés hacer" pasó a ser una tarjeta del carrusel, por la misma razón que
en la portada: como bloque aparte suma alto propio y empuja el feed fuera
de la pantalla; como slide no ocupa nada extra y encima rota. Con banners
vendidos el carrusel rota; sin ninguno, el azul queda **fijo** (un solo
slide no tiene a dónde ir).

**Cerrar el CTA no cierra los banners pagos.** La × sólo aparece cuando el
carrusel es puro CTA. Lo que alguien compró no se descarta de un toque, y
una cruz flotando sobre un aviso pago parecería ofrecer exactamente eso.

**El botón "Publicar" no vive adentro del carrusel.** Está fijo en la barra,
a la izquierda de Fichas/Mapa. Adentro desaparecería cada vez que el
carrusel rota a un banner pago — justo cuando está lleno y más gente lo
está mirando. Es la acción principal de la pantalla: no puede depender de
en qué slide quedó parado.

> **Nota de implementación.** La maquinaria del carrusel se generalizó
> (`pintarCarruselAds({pref, ubicacion, propias, house})`) en vez de
> duplicarla. Antes el estado eran tres variables sueltas —`_adsTimer`,
> `_adsPausado`, `_adsObserver`— que alcanzaban para un solo carrusel: con
> dos, el último en pintarse le pisaba el timer al otro y uno de los dos se
> quedaba quieto. Ahora hay un estado por carrusel, indexado por el prefijo
> de sus ids.

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

---

## Cierre de un servicio fijo (trabajo periódico)

**El problema:** `elegir_propuesta()` crea un `servicios_fijos` cuando
`pedidos.modalidad='recurrente'` (ej. corte de pasto mensual), y por separado
abre el `chats_trabajo` de siempre. Pero el chat no distinguía nada: al llegar
a `estado='activo'` el prestador veía el mismo botón **"Marcar como
terminado"** que en un trabajo puntual — y tocarlo cerraba toda la relación en
la primera visita, cuando en realidad el trabajo se repite indefinidamente.

**La definición:** un servicio fijo no "termina" con cada visita — queda
**abierto hasta que el vecino decide cerrar el contrato**. El chat sigue
disponible todo ese tiempo para coordinar (fechas, cambios), pero no ofrece
"terminar". El cierre es una decisión del vecino, no del prestador, y vive en
**Mis servicios fijos**, no en el chat.

**Por qué cerrar = calificar, y no un botón mudo:** dar de baja en silencio
perdería justo el dato que más vale de una relación larga — cómo le fue al
vecino. Por eso "Cerrar y calificar" abre la pantalla de reseña; sólo al
enviarla se da de baja el `servicio_fijo`. Si el vecino sale sin calificar, no
se da de baja nada.

**El prestador no tiene este botón.** Sigue usando "Dar de baja"
(`terminarServicioFijoUI`, mudo, sin reseña) — no es su lugar calificarse a sí
mismo.

**Circuito:**

1. Chat en `estado='activo'` con `pedidos.modalidad='recurrente'` → en vez del
   banner de "Marcar como terminado", muestra una nota fija: *"Servicio
   fijo — sigan coordinando por acá. El vecino cierra la relación desde Mis
   servicios fijos cuando ya no lo necesite."* (`actualizarBannersChat`,
   `app.js`)
2. Desde **Mis servicios fijos**, el vecino toca **"Cerrar y calificar"**
   (`cerrarServicioFijoUI`) → busca el `chats_trabajo` de la propuesta que
   originó el servicio fijo, carga ese chat y ese prestador, y abre la
   pantalla de reseña (`abrirResena`).
3. Al enviar la reseña (`enviarResena`): se guarda en `resenas` vía
   `dejar_resena()` — y **recién después**, como segundo paso independiente,
   se llama `PronetDB.terminarServicioFijo()`. Son tablas separadas a
   propósito: `dejar_resena()` no sabe nada de `servicios_fijos`. Si el
   segundo paso fallara, la reseña ya quedó guardada — no se aborta nada.
4. Si el vecino cierra la pantalla sin calificar (`cerrarResena`), no se da de
   baja nada — el flag que marca "hay un servicio fijo pendiente de cerrar"
   no sobrevive a la pantalla.

**Verificado end-to-end** con cuentas de prueba (2026-08-23): el chat del
prestador no ofrece terminar y muestra la nota; el vecino tiene "Cerrar y
calificar"; al calificar, la reseña queda guardada y el servicio fijo pasa a
`estado='terminado'`.

**El cierre no lo borra, lo marca — para las dos partes.** Un servicio fijo
`terminado` sigue apareciendo en **Mis servicios fijos** (vecino) y **Mis
clientes fijos** (prestador), con un chip "Finalizado" y sin botón de acción.
Es el registro de que la relación existió, no algo que deba desaparecer.
`listarServiciosFijos(soloActivos)` acepta ese parámetro justamente para esto:
la lista de la pantalla llama con `false` para traer activos y terminados
juntos (ordenados con los activos primero), pero cualquier otra pantalla que
sólo necesite los vigentes puede seguir pidiendo `true`.

**Bug encontrado de paso (no relacionado):** `enviarResena()` tenía tres
líneas de un refactor viejo que referenciaban variables no declaradas
(`bannerResena`, `bannerCerrado`, `footer`), lo que tiraba un `ReferenceError`
después de guardar la reseña — rompía en silencio el push al prestador y el
festejo de "primer trabajo" en **toda** reseña del sitio, no sólo en
servicios fijos. Corregido (v343).
