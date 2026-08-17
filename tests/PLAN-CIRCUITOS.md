# Plan de pruebas por circuito — PRONET

Mapa de los circuitos de negocio de la app, con una prueba propuesta por cada uno.
Los tests corren con Playwright contra `https://pronetprueba.netlify.app` (producción).

**Estado:** ✅ implementado · 🟡 parcial · ⬜ pendiente

**Actualizado 2026-08-01.** Resumen ejecutivo: **8 de 13 circuitos con cobertura** (antes 2). Quedan sin automatizar: C6 (cierre de trabajo), C7 (reseña), C8 (loyalty/canjes), C11 (notificaciones), C13 (PWA offline). El archivo de specs creció de 2 a 7: `circuito-principal.spec.js`, `ciclo-negocio.spec.js`, `acceso-y-roles.spec.js`, `busqueda-y-analitica.spec.js`, `planes-limites.spec.js`, `grandfathering.spec.js`, `nuevos-circuitos.spec.js` (+ `helpers.js` compartido y `auth.setup.js` con sesión persistida por rol).

---

## Cuentas — inventario real (2026-07-29)

Contraseña de las cuentas de test: `Test1234!`

### Las que importan

| Cuenta | tipo | Ficha | Para qué sirve |
|--------|------|-------|----------------|
| `admin@pronet.com.ar` | admin | — | C10 moderación, aprobar canjes, config de app. **Único con `roles=['admin']`** |
| `vecino_test@pronet.test` | cliente | — | C1, C2, C5, C6, C7. **La usa la suite en 4 archivos — no borrar** |
| `julianbrusa2015@gmail.com` | cliente | — | Segundo vecino **sin relación** con los prestadores: el único con el que se puede probar que `notificar_usuario()` **rechaza** por falta de vínculo |
| `prestador_test@pronet.test` | prestador | ✓ Electricistas | C4 propuestas y límites. **La usa la suite — no borrar** |
| `prestador@gmail.com` (Prestador Puertos) | prestador | ✓ Electricistas | Segundo prestador: propuestas que compiten, ranking, badge. Tiene 1.350 pts e historial de suscripción |
| `doble2@pronettext.com` (Prestador y Vecino) | vecino | ✓ Plomería | C12 doble perfil — el toggle |

### El resto (existen, sin rol asignado en el plan)

`vecinopuertos@gmail.com` (dice "Admin PRONET" pero `roles=[]`, **no es admin**), `servicios_001@gmail.com`, `carla.test@test.com`, `servicios_1@gmail.com`, `carla2@test.com`, `doble@pronettext.com` (segundo doble perfil, Plomería).

Se evaluó limpiarlas y se decidió **no borrar nada**: el borrado cascadea a pedidos, chats, propuestas, reseñas y loyalty, y las fichas de `prestadores` quedarían huérfanas apareciendo en el directorio público (la FK va `perfiles.prestador_id → prestadores`, no al revés).

### Estado del setup — ✅ resuelto 2026-07-29

`supabase-ordenar-usuarios-prueba.sql` dejó las cuentas operativas: creó las 4 fichas que faltaban, sacó el rubro `General`, y completó precio, descripción, medios de pago, iniciales y coordenadas (sin `lat`/`lng` los prestadores no aparecían en el mapa ni tenían distancia real).

Rubros: **Electricistas** — Prestador Puertos, Prestador Test, Servicios 1, Vecino 2 · **Plomería** — Carla Prestadora, y las dos cuentas de doble perfil.

Cuatro prestadores en el mismo rubro sirve para probar ranking y boost, que necesitan varios para que haya orden que verificar.

**Causa raíz de las fichas faltantes**, por si reaparece: `usuarioActual()` intenta auto-crear la fila en `prestadores`, pero no hay policy de INSERT y RLS la rechaza con 403. Y el cliente descartaba el `error` del insert, así que fallaba en silencio. El RPC de `supabase-ficha-prestador-rpc.sql` lo cierra para las cuentas nuevas.

**Trampa relacionada:** el `DEFAULT` de `prestadores.plan` quedó en `'basico'` cuando se migró a los 4 planes nuevos, desalineado con su propio CHECK. No se disparó hasta el primer INSERT que no especificaba la columna, horas después de la migración.

### Inconsistencia de datos detectada

La columna `tipo` usa **`'cliente'` y `'vecino'` como sinónimos** — hay cuentas con cada valor. Hoy no rompe porque todos los chequeos son `tipo === 'prestador'` o `!==`, así que ambos caen del mismo lado por accidente. Cualquier código nuevo que pregunte `tipo === 'vecino'` va a ignorar a la mitad de los usuarios. Falta elegir uno, migrar el otro y poner un CHECK.

También `roles` está desincronizado de `tipo` en varias filas (ej. `servicios_1` es `tipo='prestador'` con `roles=['cliente']`) — dos fuentes de verdad para el rol.

---

## Circuitos

### C1 · Acceso y sesión ✅
**Cubre:** registro, confirmación de email, login, login Google, modo invitado, cierre de sesión.

**Prueba:** `acceso-y-roles.spec.js` (describe "C1"). Invitado ve el gate en pantallas protegidas con mensaje explicativo, home navegable sin cuenta, con sesión el gate desaparece y sobrevive a un reload. También `circuito-principal.spec.js` (validaciones de formulario, login exitoso).

**Por qué importa:** es la puerta de todo; si se rompe, ningún otro circuito es alcanzable.

---

### C2 · Publicación de pedido (vecino) ✅
**Cubre:** wizard de 3 pasos, validación de campos, fotos, slider de presupuesto, publicación.

**Prueba:** `ciclo-negocio.spec.js`, test A ("Vecino publica un pedido"). Completa los 3 pasos con rubro Electricistas, verifica el mensaje de éxito y confirma que el INSERT llegó a Supabase (no solo localStorage) antes de dar el test por bueno.

**Ojo:** escribe en producción con título `Test E2E – … <timestamp>`. `global-setup.js` borra los pedidos con ese prefijo antes de cada corrida — no hace falta limpieza manual, pero si se corre offline o el DELETE falla, se van acumulando.

---

### C3 · Descubrimiento (vecino) ✅
**Cubre:** búsqueda de prestadores, filtros por rubro/zona, ranking, ficha de prestador, mapa.

**Prueba:** `busqueda-y-analitica.spec.js` (describe "C3"). Carga de `s-buscar`, chips de filtro (Todos/Premium) alternan selección, `#search-results` se popula o muestra empty state, el meta de resultados refleja el filtro activo, texto sin resultados muestra el mensaje correcto, clicar una card navega a `s-prof`.

**Pendiente:** mapa (pines, distancias) sin cobertura directa — ver C13/features.

---

### C4 · Propuesta y límites de plan (prestador) ✅
**Cubre:** feed de pedidos disponibles, envío de propuesta, **límite de propuestas por plan**, edición de propuesta.

**Prueba:**
- `ciclo-negocio.spec.js`, test B — envío real de una propuesta de punta a punta (feed filtrado por rubro, detalle de pedido, formulario de propuesta, confirmación).
- `planes-limites.spec.js` (describe "C4") — resolución de límites por plan sin depender de datos (fundadores, prelanzamiento, coherencia config↔servidor).
- `planes-limites.spec.js` (describe "D-04") — **el corte real en la propuesta que excede el cupo, verificado contra el trigger de la DB** (`fn_test_limite_propuestas`, generaliza el límite al plan vigente del prestador, no solo al caso fundador). Cerrado y verificado en producción 2026-08-01.

**Pendiente:** edición de una propuesta existente (no debería consumir cupo — regla ya implementada, sin test dedicado).

---

### C5 · Elección y apertura de chat ✅
**Cubre:** comparación de propuestas, elección del prestador, creación del chat de trabajo.

**Prueba:** `ciclo-negocio.spec.js`, test C ("Vecino elige la propuesta del prestador"). Serie con A y B — depende del pedido y la propuesta creados en los tests anteriores (`test.describe.serial`, sin retries porque mutan estado en Supabase).

---

### C6 · Ejecución y cierre del trabajo ⬜
**Cubre:** mensajería, fotos de trabajo, marcar terminado (prestador), confirmar (vecino), cierre por inactividad.

**Prueba:** en un chat activo, prestador marca terminado → verificar banner en la vista del vecino → vecino confirma → estado pasa a `terminado_por_vecino`.

---

### C7 · Reseña y reputación ⬜
**Cubre:** dejar reseña, recálculo de rating del prestador, acreditación de puntos por reseñar.

**Prueba:** dejar reseña sobre un trabajo terminado → verificar que el rating del prestador cambia y que se acreditaron los puntos (+100 prestador / +50 vecino).

---

### C8 · PRONET Points ⬜
**Cubre:** acumulación, niveles, catálogo de canjes, solicitud de canje, aprobación admin, aplicación automática del beneficio.

**Prueba:** canjear un beneficio de tipo `puntos_extra` → verificar que el saldo baja por el costo → aprobar como admin → verificar que el saldo sube por el bonus y que la solicitud queda `aprobado`.

**Nota:** este circuito se probó a mano el 2026-07-29 y funciona de punta a punta. Automatizarlo requiere sesión de admin.

---

### C9 · Suscripción y planes ✅
**Cubre:** ver planes, activar, persistencia, sincronización con `prestadores.plan`, vencimiento, badge en búsqueda, interruptor de planes pagos, grandfathering de fundadores.

**Prueba:**
- `planes-limites.spec.js` (describes "C9") — catálogo de 4 planes, precio anual = 10 meses, `getPlanConfig` no rompe con IDs viejos, badge por plan, coherencia interruptor↔UI.
- `planes-limites.spec.js` (describe "D-01"/"D-01b") — `crearPreferenciaMP()` devuelve `init_point` real de MercadoPago para un plan pago y rechaza `base` (precio $0); `PRONET_CONFIG.PLANES` sincronizado en vivo contra `planes_limites` (cierra la duplicación de precios, D1, 2026-08-01).
- `grandfathering.spec.js` — contrato de API (`es_fundador_activo`), límites de fundador (Base recibe los de Plus), badge "Fundador" en Mi Perfil, y el trigger real de DB (`fn_test_limite_fundador`, inserta 10 propuestas y verifica que la 11ª es bloqueada).

**Pendiente de automatizar:** completar un pago real end-to-end en sandbox (se prueba manualmente, ver memoria MP-1) y el cron de vencimiento (corre a las 00:00 BA).

---

### C10 · Moderación (admin) 🟡
**Cubre:** denuncias, canjes pendientes, ABM de beneficios, configuración de la app.

**Prueba:** `busqueda-y-analitica.spec.js` (describe "C10") — el gating está cubierto: `goTo('s-moderacion')` no activa la pantalla ni para vecino ni para prestador, `goTo('s-parametrias')` tampoco (el panel de niveles/funcionalidades vive ahí, ya no detrás de un PIN), otras pantallas admin (`s-loyalty-admin`, `s-catalogo`) tampoco son alcanzables.

**Pendiente:** el panel en sí (las tres secciones, aprobar canjes, ABM) sin cobertura — necesita sesión de admin real, no automatizada todavía.

---

### C11 · Notificaciones ⬜
**Cubre:** campanita in-app, contador de no leídas, push (roto — CORS en `enviar-push`).

**Prueba:** disparar un evento que notifique → verificar que aparece en la campanita y que el contador sube.

---

### C12 · Doble perfil y roles ✅
**Cubre:** toggle vecino↔prestador, qué ve cada rol, que un prestador puro no pueda publicar pedidos.

**Prueba:** `acceso-y-roles.spec.js` (describe "C12"). Prestador puro: sin toggle, sin botón de publicar, nav sin Buscar/Cerca, y **no hereda `modoRol` de una sesión anterior** (test dedicado a la regresión v64). Vecino: ve publicar y nav completo, sin toggle si no tiene ficha, ve el CTA para ofrecer servicios. Doble perfil (si `TEST_DOBLE_EMAIL` está configurada): toggle visible, alterna el modo mostrado, y en modo vecino puede publicar pero en modo prestador no.

**Regresiones que ya tienen test:** `modoRol` persistiendo en localStorage entre cuentas (v64) y el botón de publicar visible al entrar directo a `s-pedidos` (v65) — ambas cerradas y cubiertas.

---

### C13 · PWA y offline ⬜
**Cubre:** service worker, versionado de caché, banner de offline, prompt de instalación, safe areas en iOS.

**Prueba:** cargar la app → verificar que el SW registra → simular offline → verificar que aparece el banner y que la app sigue navegable desde caché.

**Nota (2026-08-01):** cobra más relevancia con la migración a Capacitor decidida (ver `roadmap-stores` en memoria) — Capacitor no usa el Service Worker del mismo modo, así que antes de migrar conviene tener claro qué de este circuito sigue aplicando en la app empaquetada y qué se resuelve distinto (notificaciones push nativas reemplazan `@capacitor/push-notifications` al Web Push actual).

---

## Features adicionales cubiertas (fuera de la numeración de circuitos)

`nuevos-circuitos.spec.js` prueba funcionalidades puntuales que no mapean 1 a 1 a los 13 circuitos de negocio:

- **E-02 · Widget de soporte WhatsApp** — FAB visible para invitado, popup con link a `wa.me`, cierre por botón X y por toggle, fila visible en Mi Perfil para vecino logueado.
- **D-01 · Modo invitado — pedidos gateados** — nav Pedidos muestra el gate para invitado en vez de la pantalla, tabs ocultos cuando se fuerza el render.
- **B-08 · CTA "Quiero ofrecer mis servicios"** — visible para invitado con texto de registro.
- **F.1 · Feed de prestador pre-filtrado por rubro** — `catActiva` se resuelve al rubro del perfil al entrar como prestador, feed no muestra vista de vecino.
- **D-03 · Loyalty — contrato invertido a propósito** — verifica que `PronetDB.acreditarPuntos`/`aplicarBeneficio` **no** existan en el cliente (la acreditación es 100% server-side), que los RPC de canje sí estén expuestos, y que el widget de WhatsApp esté en `window`.

`busqueda-y-analitica.spec.js` también prueba el **contrato de API de Portfolio** (`listarPortfolio`/`subirFotoPortfolio`/`eliminarFotoPortfolio` expuestas, `eliminarFotoPortfolio(null)` no lanza excepción) y **C4/C9 · Analítica por tier de plan** (secciones visibles coherentes con el tier, aviso de upsell, export CSV solo Elite).

---

## Criterio de prioridad

Actualizado 2026-08-01 — con 8/13 circuitos cubiertos, el orden por riesgo × frecuencia de lo que falta:

1. **C6** — ejecución y cierre del trabajo: el corazón del ciclo de vida de un pedido, sin cobertura
2. **C7** — reseña y reputación: dispara acreditación de puntos, ya identificado como fuente de bugs de RLS (ver auditoría 2026-07-29)
3. **C11** — notificaciones: tuvo el bug de "CORS" (en realidad slug/RLS mal diagnosticado) y sigue con el slug desalineado (`enviar-push` en dashboard vs `bright-service` real)
4. **C8** — loyalty/canjes: probado a mano y funciona, pero necesita sesión de admin para automatizar
5. **C13** — PWA/offline: baja frecuencia de cambio, pero gana relevancia con la migración a Capacitor

## Deuda de infraestructura

- Los tests corren contra **producción**. C2 y C5 ya escriben datos reales (pedidos/propuestas con prefijo `Test E2E`); `global-setup.js` los limpia antes de cada corrida. C6 y C7, cuando se automaticen, van a necesitar el mismo patrón. Sigue sin existir un entorno de staging — se optó por limpiar en vez de aislar.
- ~~No hay `storageState` por rol reutilizable~~ — ✅ resuelto. `auth.setup.js` loguea una vez por rol (vecino/prestador/doble) y guarda la sesión en `tests/.auth/*.json`; los specs nuevos la reusan vía `test.use({ storageState: ... })` en vez de loguearse en cada test. Bajó el tiempo de suite de ~4 minutos (11 logins seguidos contra producción) a corridas de segundos por spec.
- **Flakiness detectada 2026-08-01:** el login de `vecino_test`/`prestador_test` en `auth.setup.js` viene fallando por timeout (60s) en el primer intento en varias corridas recientes, y pasa recién al reintento automático. Investigación abierta como tarea aparte — no se descartó si es rate limiting de Supabase Auth por la cantidad de corridas del día o lentitud real del endpoint.
- Los specs viejos (`circuito-principal.spec.js`, `ciclo-negocio.spec.js`, `nuevos-circuitos.spec.js`) tienen su propia copia de los helpers de sesión (login, esperarDOM, etc.) en vez de usar `tests/helpers.js` — a propósito, para no tocar suites que ya pasaban. Los specs nuevos sí usan el módulo compartido.
