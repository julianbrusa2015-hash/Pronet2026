# Instructivo de pruebas · PRONET

Recorrido completo de punta a punta. Está pensado para hacerse **en orden**:
cada bloque deja el estado que necesita el siguiente.

## Antes de empezar

**Cuentas: las que ya existen.** Este instructivo **no prueba el alta** —
se usan cuatro cuentas ya creadas. Anotá cuál es cuál antes de empezar; de
acá en adelante se las nombra por el alias.

| Alias | Rol | Para qué |
|---|---|---|
| **V1** | Vecino | Publica el pedido, elige, califica |
| **P1** | Prestador | Manda la primera propuesta — la que gana |
| **P2** | Prestador | Manda la segunda — la que se rechaza |
| **V2** | Vecino | Compra en Entre Vecinos |

Si tenés dos teléfonos usalos; si no, alcanza con el navegador en ventana
normal + una ventana de incógnito.

**Teléfonos: uno por cuenta.** Un teléfono no puede repetirse entre cuentas.
Las cuatro tienen que tener el suyo cargado antes de arrancar — el bloque 1
lo verifica. Si falta alguno, cargalo con formato válido (ej. `11 4000-0001`).

**Estado esperado de los interruptores** (Panel admin → Parametrías):

| Interruptor | Cómo arranca | Dónde se prende |
|---|---|---|
| Planes pagos | **apagado** | — |
| Checkout MP | **apagado** (modo test) | bloques 8 y 8bis-e |
| ProMarket / Entre Vecinos | **encendido** | — |
| Venta de espacios del carrusel | **apagado** | bloque 8 |
| Avisos de prestadores en Servicios | **apagado** | bloque 8bis |
| Venta de impulsos | **apagado** | bloque 8bis-e |

> **Ojo con "Planes pagos".** Prendido, cada plan usa sus propios límites:
> Base baja a 1 aviso publicado y 7 días. Apagado rige la etapa fundadora y
> todos reciben los de Plus (3 y 15). Si los números que ves no coinciden con
> los que dice este instructivo, mirá este interruptor **antes** de reportar
> un bug.

**Tarjeta de prueba de MercadoPago** (para los bloques que cobran):
`5031 7557 3453 0604` · venc. `11/30` · CVV `123` · nombre **APRO** · DNI
`12345678`.

**Al terminar, apagá lo que hayas prendido.** Sobre todo el checkout: si
queda encendido, cualquiera que entre puede iniciar un pago real.

**Después de cada bloque**, si algo no coincide con lo esperado, anotá el
número del paso antes de seguir: los bloques siguientes dependen de éste.

---

## Bloque 1 · Punto de partida

No se prueban las altas: se usan las cuentas que ya existen. Sólo hay que
dejarlas en un estado conocido antes de arrancar.

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 1.1 | Entrar con **V1** | Entra sin pedir los T&C — ya están aceptados en la cuenta |
| 1.2 | Mi perfil → confirmar que tenga **teléfono** cargado | Si no lo tiene, cargarlo ahora (uno distinto por cuenta) |
| 1.3 | Repetir con **V2**, **P1** y **P2** | Las cuatro entran y tienen teléfono |
| 1.4 | Con **P1** y **P2**, mirar el inicio | Es el **tablero del prestador**, distinto al del vecino |

> **Si alguna vez querés probar el alta**, los pasos están en el historial de
> este archivo. Se sacaron porque crear cuentas en cada corrida ensucia la
> base y consume teléfonos, que no se pueden repetir entre cuentas.

## Bloque 2 · Perfil y comunidad de V1

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 2.1 | Mi perfil → Editar perfil → **"¿En qué comunidad vivís?"** | Trae la comunidad que ya tenía seleccionada |
| 2.2 | Cambiarla a **"Puertos del Lago"** y guardar | La cabecera de Mi perfil se actualiza sin recargar |
| 2.3 | Entrar a **Vecinos** | El feed dice **"Mercado de Puertos del Lago"** |
| 2.4 | Poner el teléfono **de otra cuenta ya creada** y guardar | Rechaza con "Ese teléfono ya está registrado en otra cuenta" |

## Bloque 3 · V1 publica un pedido

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 3.1 | *(Si V1 no tiene teléfono cargado)* Publicar un pedido | Antes de guardar, pide el teléfono en un modal. Al completarlo, **sigue solo** con lo que ya habías cargado |
| 3.2 | Publicar sin título | Rechaza y marca el campo |
| 3.3 | Completar rubro **Plomería**, título, descripción, urgencia y presupuesto. Publicar | Confirma la publicación |
| 3.4 | Ver el pedido en "Pedidos" | Aparece como **Publicado**, con 0 propuestas |

> **Qué se está probando.** El teléfono es obligatorio para publicar y lo
> exige el servidor, no sólo la pantalla. El modal es la versión amable del
> mismo control.

## Bloque 4 · Preparar a P1 y P2

Con las cuentas que ya existen. En ventana de incógnito o en el otro teléfono.

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 4.1 | P1 → Editar perfil: dejar **Plomería** como rubro | Guarda |
| 4.2 | Sacarle **todos** los rubros y guardar | Rechaza: pide al menos uno |
| 4.3 | P1 → zona de cobertura: elegir **Puertos del Lago** | Guarda |
| 4.4 | Subir 1 o 2 fotos al portfolio | Suben |
| 4.5 | Repetir con **P2**, mismo rubro y misma cobertura | Los dos quedan iguales, para competir por el mismo pedido |

> **Ojo con el límite de fotos.** Con los planes pagos **apagados** rige la
> etapa fundadora y Base recibe los límites de Plus: **10 fotos**. Prendidos,
> Base baja a los suyos. Si el número no coincide, mirá ese interruptor antes
> de reportar. La número que sobre tiene que rechazarla **el servidor**, no
> sólo la pantalla.

## Bloque 5 · Las dos propuestas, elección y cierre

Éste es el circuito central. Va en orden estricto.

### 5a · P1 y P2 envían

| # | Quién | Qué hacer | Qué tiene que pasar |
|---|---|---|---|
| 5.1 | P1 | Buscar el pedido de V1 en "Pedidos" | Lo ve (es de su rubro y su zona) |
| 5.2 | P1 | Enviar una propuesta con precio | Queda **pendiente** |
| 5.3 | P2 | Lo mismo, con **otro precio** | Queda pendiente |
| 5.4 | V1 | Abrir su pedido | Ve **2 propuestas** |

### 5b · V1 elige

| # | Quién | Qué hacer | Qué tiene que pasar |
|---|---|---|---|
| 5.5 | V1 | Elegir la de **P1** | El pedido pasa a **Cerrado** |
| 5.6 | P1 | Ver sus propuestas | La suya dice **elegida**, y se le abre el chat del trabajo |
| 5.7 | P2 | Ver sus propuestas | La suya dice **rechazada** — y no se queda esperando sin explicación |

### 5c · El trabajo

| # | Quién | Qué hacer | Qué tiene que pasar |
|---|---|---|---|
| 5.8 | V1 y P1 | Escribirse en el chat | Los mensajes llegan a los dos |
| 5.9 | P1 | "Marcar como terminado" | P1 ve **"Esperando confirmación del vecino"**, con el botón deshabilitado |
| 5.10 | V1 | Confirmar que el trabajo terminó | Aparece el botón de **dejar reseña** |

### 5d · La reseña

| # | Quién | Qué hacer | Qué tiene que pasar |
|---|---|---|---|
| 5.11 | V1 | Puntuar, escribir y marcar que **lo recomienda** | El chat queda **cerrado** y ya no se puede escribir |
| 5.12 | V1 | Intentar dejar **una segunda reseña** al mismo trabajo | No se puede — una por trabajo |
| 5.13 | — | Ver la ficha de P1 | Muestra la reseña y su puntaje |

> **El ranking.** Después de esto, P1 tiene 1 reseña real y P2 sigue con 0.
> En el listado, **P1 debería aparecer por encima** aunque los dos figuren con
> buen puntaje: el orden usa un promedio que le da peso a la cantidad de
> reseñas, justamente para que un perfil nuevo sin historia no le gane al que
> se la ganó trabajando.

---

## Bloque 6 · Entre Vecinos, con V1 y V2

Antes: entrar con **V2** y dejarle la **misma comunidad** que V1 — Puertos
del Lago — desde Editar perfil.

### 6a · V1 publica

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 6.1 | Vecinos → Publicar. Sección **🛒 Mercado**, con foto, precio y barrio | Publica |
| 6.2 | Cargar el **lote** y **NO** tildar "mostrar mi lote" | Publica, y el lote no se ve en la tarjeta |
| 6.3 | Publicar otra, esta vez **tildando** "mostrar mi lote" | El lote se ve en la tarjeta |

### 6b · V2 compra

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 6.4 | V2 entra a Vecinos | Ve las publicaciones de V1 (misma comunidad) |
| 6.5 | Ver la del paso 6.3 | **Ve el lote** de V1 |
| 6.6 | Dar 💚 me gusta | El contador sube, y sigue puesto al recargar |
| 6.7 | Comentar con un puntaje | El comentario aparece con su nota |
| 6.8 | "Consultar" | Se abre el chat con V1 |
| 6.9 | V1 responde | Le llega a V2 |

### 6c · El límite de la comunidad

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 6.10 | V2 → Mi perfil → cambiar la comunidad a **El Cantón** | Guarda |
| 6.11 | Volver a Vecinos y mirar la publicación de 6.3 | **Ya no se ve el lote** — es de otra comunidad |
| 6.12 | Tocar "Ver también otros barrios" | Aparecen las de todas las zonas |
| 6.13 | Volver el perfil de V2 a Puertos del Lago | El lote se ve de nuevo |

> **Qué se está probando.** Que el lote lo filtre **el servidor** y no la
> pantalla. Si te aparece el lote de otra comunidad, es un problema serio, no
> cosmético.

### 6d · El mapa y las miniaturas

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 6.14 | Vecinos → **Mapa** | Un pin **por barrio**, con la cantidad al lado |
| 6.15 | Tocar un pin que diga 2 o más | El globo muestra **las publicaciones con foto chica**, título y precio — no sólo el número |
| 6.16 | Tocar una de esas miniaturas | Sale del mapa, filtra por ese barrio y **abre esa publicación** (expandida, con scroll hasta ella) |
| 6.17 | Si el pin tiene más de 4 | Muestra 4 y un "Ver las N →" que lleva a la lista del barrio |
| 6.18 | "Quitar filtro" | Vuelven todas |
| 6.19 | Estando en el mapa, mirar la pantalla | El aviso azul "Publicá lo que tenés" **no aparece** — y no queda un hueco entre el mapa y el pie |

### 6e · El resumen de búsqueda por barrio

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 6.20 | En Mercado, sin buscar ni filtrar nada | **No** hay línea de resumen arriba del feed |
| 6.21 | Buscar algo que exista (ej. "pizza") | Aparece "**N vecinos ofrecen "pizza"**" y abajo los barrios con su cantidad |
| 6.22 | Contar las tarjetas del feed y sumar los números de los barrios | **Coinciden** |
| 6.23 | Si un vecino tiene 2 publicaciones del mismo tipo | El total dice **vecinos**, no publicaciones: 2 avisos de una persona cuentan **1** |
| 6.24 | Tocar uno de los barrios del resumen | Filtra a ese barrio, y la cantidad de tarjetas es la que prometía |
| 6.25 | Pasar a la sección **Servicios** con la búsqueda puesta | Los números cambian: cuenta **sólo** lo de esa sección |

> **Qué se está probando.** Que el resumen no prometa algo que el feed no
> muestra. Contaba servicios y productos juntos: decía "Araucarias (2)", se
> tocaba y aparecían cero.

### 6f · El filtro de zona

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 6.26 | En Mercado, elegir **"Puertos del Lago"** en el desplegable de zona | El feed muestra las publicaciones de esa comunidad — **no queda vacío** |
| 6.27 | Con esa zona puesta, ir al **Mapa** | Salen los pines de los barrios de Puertos, no un mapa vacío mostrando medio país |
| 6.28 | Cambiar a **El Cantón** | Cambia el feed y los pines |
| 6.29 | Volver a "📍 Zona" (sin filtro) | Vuelven todas |

> **Qué se está probando.** El desplegable ofrece **comunidades**, pero la
> publicación guarda `zona = "Escobar"` y el barrio aparte. Se comparaba
> contra la columna equivocada y elegir cualquier zona vaciaba todo.

### 6f-bis · Los chips de categoría

Los chips no entran en el ancho de la pantalla: son casi el triple. Se
comportan distinto según dónde estés, y **las dos cosas hay que probarlas**.

| # | Dónde | Qué hacer | Qué tiene que pasar |
|---|---|---|---|
| 6.29a | Teléfono | Deslizar la fila de chips con el dedo | Se mueve, y aparecen los que faltaban |
| 6.29b | Ambos | Mirar el borde derecho de la fila | Se **desvanece**, avisando que hay más |
| 6.29c | Ambos | Llegar al final | El desvanecido pasa al borde **izquierdo** |
| 6.29d | **Computadora** | Poner el mouse encima y girar la **rueda** | La fila se mueve **de costado** |
| 6.29e | Notebook | Deslizar de costado con el **trackpad** | Se mueve normal, sin ir al doble de rápido |

> **Por qué está separado.** En el teléfono esto siempre anduvo — se desliza
> con el dedo. Lo que estaba roto era la computadora: la barra de scroll está
> oculta a propósito y la rueda hace scroll vertical, así que la fila quedaba
> inmóvil y no se podía llegar a los últimos chips.

### 6g · El aviso de publicar se puede cerrar

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 6.30 | En la lista de Mercado, tocar la **×** del aviso azul "Publicá lo que tenés" | Desaparece |
| 6.31 | Moverse a Servicios y volver | **Sigue oculto** |
| 6.32 | Cerrar la app del todo y volver a abrirla | **Vuelve a aparecer** |
| 6.33 | (Opcional, si podés esperar) Cerrarlo y volver al otro día | Vuelve a aparecer |

---

## Bloque 7 · Captación de prestadores

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 7.1 | V1 → Mi perfil → **Invitar a un prestador** | Se ve un **QR** y un código de 6 letras |
| 7.2 | Escanear el QR con otro teléfono | Abre el formulario **sin pedir cuenta** |
| 7.3 | *(Android)* Tocar **"Escanear el DNI"** y apuntar al dorso | Completa nombre y documento. **Revisá que el nombre quede bien escrito** |
| 7.4 | *(iPhone)* Mirar si el botón aparece | Si no aparece, es lo esperado: ese navegador no sabe leer el código |
| 7.5 | Completar teléfono y rubro. Enviar | "Quedaste anotado" |
| 7.6 | V1 → Invitar | El anotado aparece como **Pendiente** |
| 7.7 | Tocar "Mandarle el link de alta" | Abre WhatsApp al número cargado, con el mensaje escrito |
| 7.8 | Abrir ese link en el otro teléfono | El registro se abre con **nombre precargado**, marcado como prestador y **rubros tildados** |
| 7.9 | Completar mail y contraseña | La ficha nace con esos rubros y **el teléfono ya cargado** |
| 7.10 | V1 → Invitar | Ahora figura **"Ya se sumó"** |

---

## Bloque 8 · Banners pagos *(opcional — hay que prenderlo)*

⚠️ **Antes:** tus 5 banners DEMO ocupan 5 de los 6 lugares. Borrá alguno desde
Parametrías → Banners o no vas a poder aprobar.

| # | Quién | Qué hacer | Qué tiene que pasar |
|---|---|---|---|
| 8.1 | Admin | Configuración → prender **Venta de espacios** | Avisa que quedó activa |
| 8.2 | V1 | Mi perfil | Aparece **"Promocionar mi negocio"** |
| 8.3 | V1 | Abrirlo | Muestra el **precio** y cuántos espacios quedan |
| 8.4 | V1 | Enviar sin imagen | Rechaza |
| 8.5 | V1 | Cargar imagen, elegir **WhatsApp** y enviar | Queda **En revisión**. No se cobró nada |
| 8.6 | Admin | Panel de Moderación | El aviso aparece arriba, con su imagen |
| 8.7 | Admin | **Rechazar** con un motivo | V1 ve "Rechazado" **con el motivo** |
| 8.8 | V1 | Enviar otro | Queda en revisión |
| 8.9 | Admin | **Aprobar** | A V1 le aparece **"Pagar y publicar"** |
| 8.10 | V1 | Tocar pagar (con checkout en modo test) | Avisa que el cobro está en test — **no cobra** |
| 8.11 | Admin | Prender el checkout MP y repetir | Redirige a MercadoPago. Pagando con la **cuenta compradora de prueba**, el banner pasa a **Publicado** y entra al carrusel |
| 8.12 | Cualquiera | Tocar el banner en el inicio | Abre el WhatsApp del anunciante, y el **contador de clicks sube** |
| 8.13 | Admin | Volver a apagar los dos interruptores | El carrusel vuelve a ser sólo editorial |

---

## Bloque 8bis · Avisos de prestadores en Servicios *(hay que prenderlo)*

Es lo más nuevo y lo que más piezas toca. Se prende en **Parametrías →
"Avisos de prestadores en Servicios"**.

> **Antes de empezar, entendé la diferencia**, porque son dos compras
> distintas y es fácil confundirlas:
>
> - **Impulsar** = aparece **primero** en la lista. No cambia el vencimiento.
> - **Renovar** = le da **más tiempo**. No cambia el orden.

### 8bis-a · El prestador arma su aviso

| # | Quién | Qué hacer | Qué tiene que pasar |
|---|---|---|---|
| 8b.1 | Admin | Prender el flag en Parametrías | Avisa que quedó activo |
| 8b.2 | P1 | Mi perfil | Aparece **"Mis avisos en Servicios"** |
| 8b.3 | V1 | Mi perfil | **No** aparece — es sólo para prestadores |
| 8b.4 | P1 | Abrirlo | Dice cuántos publicados tiene y cuántos días dura cada uno |
| 8b.5 | P1 | "Agregar aviso", completar **sin foto**, "Guardar como borrador" | Guarda. Queda **Borrador** |
| 8b.6 | P1 | Intentar "Enviar a revisión" sin foto | Rechaza: pide la foto |
| 8b.7 | P1 | Cargar foto, título y rubro → "Enviar a revisión" | Queda **En revisión** |
| 8b.8 | P1 | Tocar **"Vista previa"** | Muestra la tarjeta **como la ve un vecino** |
| 8b.9 | V1 | Entre Vecinos → Servicios | El aviso **todavía no está**: falta aprobarlo |

### 8bis-b · La moderación

| # | Quién | Qué hacer | Qué tiene que pasar |
|---|---|---|---|
| 8b.10 | Admin | Moderación | Sección **"🛠️ Avisos de prestadores por revisar"** con la foto |
| 8b.11 | Admin | **Rechazar** con un motivo | P1 lo ve **Rechazada con el motivo**, y le llega una **notificación** |
| 8b.12 | P1 | Corregir y reenviar | Vuelve a **En revisión** |
| 8b.13 | Admin | **Aprobar** | P1 lo ve **Publicada · N días** y le llega la notificación |

### 8bis-c · Lo que ve el vecino

| # | Quién | Qué hacer | Qué tiene que pasar |
|---|---|---|---|
| 8b.14 | V1 | Entre Vecinos → **Servicios** | Arriba de los chips aparece un **interruptor** con 🏘️ Vecinos a la izquierda y 🛠️ Prestadores a la derecha, arrancando en **Vecinos** |
| 8b.14b | V1 | Tocar la **perilla** | La perilla viaja a la derecha y la pista se pinta de **azul** |
| 8b.14c | V1 | Tocar directamente la palabra **"Vecinos"** | Vuelve, sin necesidad de acertarle a la perilla |
| 8b.15 | V1 | Estando en **Prestadores** | Los chips cambian a **oficios** (Plomería, Herrería…) y aparece el aviso con borde azul |
| 8b.16 | V1 | Mirar la reputación de la tarjeta | Si el prestador no tiene reseñas dice **"Nuevo en PRONET"** — no inventa estrellas ni pone 0 |
| 8b.17 | V1 | Tocar 🤍 | Queda en ❤️ y el número sube |
| 8b.18 | V1 | Tocar **"Contactar"** | Va al alta de pedido con el **cartel del destinatario** y el **rubro ya elegido** |
| 8b.19 | V1 | Completar y publicar | Se crea un pedido **dirigido sólo a P1** |
| 8b.20 | P2 | Mirar sus pedidos | **No** ve ese pedido |
| 8b.21 | P1 | Mirar sus pedidos | Sí lo ve, y puede mandar propuesta como siempre |
| 8b.22 | P1 | Entre Vecinos → Servicios | **No** ve el toggle: el prestador publica hacia ese espacio, no lo navega |

### 8bis-d · Las métricas

| # | Quién | Qué hacer | Qué tiene que pasar |
|---|---|---|---|
| 8b.23 | P1 | Mis avisos | El aviso muestra 👁 vistas · 👍 likes · 👆 clics · 📩 solicitudes |
| 8b.24 | P1 | Comparar con lo que hizo V1 | Las **solicitudes** cuentan el pedido de 8b.19 |
| 8b.25 | P1 | Abrir su propia vista previa varias veces | Las vistas **no suben**: sólo cuenta el vecino |

### 8bis-e · Impulsar y renovar *(necesita el checkout MP prendido)*

| # | Quién | Qué hacer | Qué tiene que pasar |
|---|---|---|---|
| 8b.26 | Admin | Prender **Venta de impulsos** en Parametrías | Queda activa. Depende del flag de avisos |
| 8b.27 | P1 | Con el checkout MP **apagado**, tocar Impulsar | Avisa que el cobro está en test — **no cobra** |
| 8b.28 | Admin | Prender el checkout MP | |
| 8b.29 | P1 | Tocar **⚡ Impulsar** | Muestra el precio y va a MercadoPago |
| 8b.30 | P1 | Pagar con la tarjeta de prueba | El aviso queda **⚡ Impulsado hasta …** y pasa **primero** en el feed del vecino |
| 8b.31 | P1 | Impulsar de nuevo | Los días se **suman**, no se pisan |
| 8b.32 | Admin | Apagar el checkout y la venta de impulsos | Vuelve a estar en test |

Para el vencimiento y la renovación hace falta que el aviso venza. Se puede
esperar, o pedir que se adelante la fecha desde la base.

| # | Quién | Qué hacer | Qué tiene que pasar |
|---|---|---|---|
| 8b.33 | P1 | Con el aviso vencido, abrir Mis avisos | Aparece **en gris**, marcado **Vencida** |
| 8b.34 | P1 | Mirar el cupo | El vencido **no ocupa lugar**: puede armar otro sin borrarlo |
| 8b.35 | P1 | Tocar **🔄 Renovar** | Pide **confirmación** diciendo cuántos días y **cuánto cuesta** |
| 8b.36 | P1 | Confirmar y pagar | Vuelve al aire, sin pasar de nuevo por moderación |
| 8b.37 | P1 | Dos días antes de vencer | Llega la **notificación** de que está por vencer |

### 8bis-f · Apagarlo

| # | Quién | Qué hacer | Qué tiene que pasar |
|---|---|---|---|
| 8b.38 | Admin | Apagar el flag de avisos de prestadores | Desaparece la fila de Mi perfil, la sección de Moderación y el toggle de Servicios — **sin rastros** |

---

## Bloque 8ter · Comunidad y cobertura

| # | Quién | Qué hacer | Qué tiene que pasar |
|---|---|---|---|
| 8t.1 | V1 | Mi perfil → Editar perfil | Hay un campo **"¿En qué comunidad vivís?"** |
| 8t.2 | V1 | Ver qué trae seleccionado | La comunidad que ya tenía. Si había elegido un **barrio**, muestra la comunidad de ese barrio |
| 8t.3 | V1 | Cambiarla y guardar | La cabecera de Mi perfil se actualiza **sin recargar** |
| 8t.4 | V1 | Entrar a Entre Vecinos | El feed dice el mercado de la comunidad nueva |
| 8t.5 | V1 | Elegir "Prefiero no decirlo" y guardar | Vuelve a ver todo Escobar |
| 8t.6 | P1 | Editar perfil → zona de cobertura | Puede elegir **en qué comunidades trabaja** |
| 8t.7 | P1 | Guardar y mirar sus pedidos | Ve los de esas comunidades |
| 8t.8 | P1 | Sacar una comunidad y guardar | Dejan de aparecer los pedidos de esa zona |

> **Qué se está probando.** Que "dónde vivo" y "dónde trabajo" son **dos
> datos distintos**. Un prestador tiene los dos y no tienen por qué coincidir.

---

## Bloque 9 · Verificación del admin

Se entra por **Mi perfil → tocar el número de versión → PIN**.

### 9a · Moderación

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 9.1 | V2 → denunciar una publicación de V1 | Confirma el envío |
| 9.2 | Admin → Panel de Moderación | La denuncia aparece con **el nombre real** del denunciante y del denunciado |
| 9.3 | Filtrar por estado con los chips | Filtra bien |
| 9.4 | Resolver la denuncia | Cambia de estado |
| 9.5 | Suspender a un usuario y volver a habilitarlo | Se refleja |

### 9b · Verificación de prestadores

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 9.6 | P1 → cargar nombre completo, DNI y dirección | Queda pendiente |
| 9.7 | P2 → cargar **el mismo DNI** | Rechaza: ese DNI ya está en otra cuenta |
| 9.8 | Admin → Verificaciones → aprobar la de P1 | P1 muestra el **escudo de verificado** |

### 9c · Parametrías

Entrar a cada una y **cambiar un valor**, verificando que el cambio se vea en
la app **sin volver a desplegar**:

| # | Pantalla | Prueba concreta |
|---|---|---|
| 9.9 | Planes | Cambiar el precio de Plus → se ve en la pantalla de planes |
| 9.10 | Rubros | Desactivar un rubro → desaparece de los chips del inicio |
| 9.11 | Zonas | Cambiar el nombre de un barrio → cambia en el selector |
| 9.12 | Niveles | Mover un umbral de loyalty → cambia la barra de progreso |
| 9.13 | Ajustes | Cambiar el máximo de fotos por pedido → se respeta al publicar |
| 9.14 | Categorías de Vecinos | Agregar una → aparece en el alta y en los chips |
| 9.15 | Banners | Cargar uno editorial → entra al carrusel |
| 9.16 | Funcionalidades | Apagar **PRONET Points** → desaparece de Mi perfil **para todos**, no sólo para vos |

### 9d · Loyalty

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 9.17 | Después de la reseña del bloque 5, V1 → PRONET Points | Tiene puntos acreditados |
| 9.18 | Canjear un beneficio | Queda **pendiente** |
| 9.19 | Admin → aprobar el canje | Se aplica y **descuenta** los puntos |
| 9.20 | Intentar aprobar **el mismo canje dos veces** | La segunda no hace nada — no se aplica el beneficio dos veces |

### 9e · Lo que el admin **no** debería poder hacer

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 9.21 | Con una cuenta **no admin**, abrir el panel | Bloquea con "solo para administradores" |
| 9.22 | Con V1, mirar los pedidos de otro vecino | **No los ve**: sólo los propios. Los pedidos ajenos los ven los prestadores |

---

## Bloque 10 · PWA y notificaciones

| # | Qué hacer | Qué tiene que pasar |
|---|---|---|
| 10.1 | Instalar la app en el teléfono | Se instala con ícono y nombre |
| 10.2 | Abrirla instalada | No se ve la barra del navegador |
| 10.3 | Poner el teléfono en modo avión y abrirla | Abre igual, con lo último cargado |
| 10.4 | Aceptar notificaciones y que otro usuario te escriba | Llega el push, y **al tocarlo abre el chat** |
| 10.5 | Con la app abierta, recibir un mensaje | La campanita suma sin recargar |

---

## Qué anotar cuando algo falla

Para que el reporte sirva, tres cosas:

1. **El número del paso** (ej. 5.9).
2. **Qué esperabas y qué pasó**, en una línea.
3. **Con qué cuenta** estabas (V1 / P1 / P2 / V2 / admin) y en qué dispositivo.

Si la pantalla queda en blanco o algo no responde, agregá lo que diga la
consola del navegador — eso suele decir la causa exacta.

---

## Lo que este instructivo **no** cubre

Cosas que hoy no se pueden probar de punta a punta, para que no las busques:

- **Cobros reales de MercadoPago.** Todo el circuito apunta a la cuenta de
  prueba. Salir a producción exige cambiar token y secreto del webhook
  **juntos** — uno sin el otro deja los pagos devolviendo 401.
- **Volumen.** No se corrió ninguna prueba de carga; con 15 cuentas todo
  responde rápido y eso no dice nada sobre 500.
- **iPhone y el escaneo de DNI.** Ese navegador no trae el lector, así que el
  botón no aparece. Es lo esperado, no una falla.
- **El precio de la renovación** está en $1.500 como **placeholder**: se puso
  para que el circuito funcione, no es un precio decidido.
- **El mapa del alta de prestador** (el iframe de OpenStreetMap del paso 3
  del onboarding) **no se ve**: la política de seguridad del sitio bloquea
  ese `<iframe>`. Es un problema conocido, anterior a todo esto.

---

## Qué cubre cada bloque

Para cuando quieras probar sólo una parte y no el recorrido entero.

| Bloque | Qué se prueba |
|---|---|
| 1–2 | Punto de partida, telefono unico, comunidad del vecino |
| 3–5 | Pedido, propuestas, elección, chat, cierre y reseña |
| 6 | Entre Vecinos: publicar, lote, likes, comentarios, mapa, resumen, filtros |
| 7 | Pre-alta de prestadores, QR y DNI |
| 8 | Banners pagos del carrusel |
| **8bis** | **Avisos de prestadores en Servicios, impulsar y renovar** |
| **8ter** | **Comunidad del vecino y cobertura del prestador** |
| 9 | Panel del admin: moderación, parametrías, denuncias |
| 10 | PWA, offline y notificaciones |
