# Plan de pruebas por circuito — PRONET

Mapa de los circuitos de negocio de la app, con una prueba propuesta por cada uno.
Los tests corren con Playwright contra `https://pronetprueba.netlify.app` (producción).

**Estado:** ✅ implementado · 🟡 parcial · ⬜ pendiente

---

## Cuentas de prueba necesarias

Varios circuitos necesitan cuentas dedicadas. Sin esto, los tests quedan en skip.

| Cuenta | Email | Rol | Estado |
|--------|-------|-----|--------|
| Vecino | `vecino_test@pronet.test` | vecino | ⬜ verificar |
| Prestador | `prestador_test@pronet.test` | prestador, **con rubro asignado** | 🟡 existe sin rubro |
| Doble perfil | `doble_test@pronet.test` | vecino + prestador_id | ⬜ crear |
| Admin | — | admin | ⬜ definir (¿cuenta separada?) |

Contraseña convenida: `Test1234!`

---

## Circuitos

### C1 · Acceso y sesión ⬜
**Cubre:** registro, confirmación de email, login, login Google, modo invitado, cierre de sesión.

**Prueba:** entrar como invitado → verificar que las pantallas protegidas muestran el gate de registro → loguearse → verificar que el gate desaparece y aparece el perfil.

**Por qué importa:** es la puerta de todo; si se rompe, ningún otro circuito es alcanzable.

---

### C2 · Publicación de pedido (vecino) ⬜
**Cubre:** wizard de 3 pasos, validación de campos, fotos, slider de presupuesto, publicación.

**Prueba:** login vecino → publicar pedido con título/rubro/zona/presupuesto → verificar que aparece en "Mis pedidos" y en el feed de un prestador del mismo rubro.

**Ojo:** deja datos en producción. Necesita limpieza al final o un rubro/zona reservado para tests.

---

### C3 · Descubrimiento (vecino) ⬜
**Cubre:** búsqueda de prestadores, filtros por rubro/zona, ranking, ficha de prestador, mapa.

**Prueba:** buscar por rubro → verificar que todos los resultados son de ese rubro → abrir una ficha → verificar nombre, rating y reseñas.

---

### C4 · Propuesta y límites de plan (prestador) ✅
**Cubre:** feed de pedidos disponibles, envío de propuesta, **límite de propuestas por plan**, edición de propuesta.

**Prueba:** ver `planes-limites.spec.js`. Verifica la resolución de límites por plan sin depender de datos, más la coherencia entre config y UI.

**Pendiente:** el corte real en la 4ª propuesta (necesita cuenta con cupo controlado).

---

### C5 · Elección y apertura de chat ⬜
**Cubre:** comparación de propuestas, elección del prestador, creación del chat de trabajo.

**Prueba:** con un pedido que tenga propuestas, elegir una → verificar que se crea el chat en estado `activo` y que las demás propuestas quedan `no_elegida`.

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

### C9 · Suscripción y planes ✅ (parcial)
**Cubre:** ver planes, activar, persistencia, sincronización con `prestadores.plan`, vencimiento, badge en búsqueda, interruptor de planes pagos.

**Prueba:** ver `planes-limites.spec.js`.

**Pendiente de automatizar:** activación real de un plan (escribe en producción) y el cron de vencimiento (corre a las 00:00).

---

### C10 · Moderación (admin) ⬜
**Cubre:** denuncias, canjes pendientes, ABM de beneficios, configuración de la app.

**Prueba:** login admin → verificar que el panel carga las tres secciones → verificar que un no-admin recibe el bloqueo al navegar a `s-moderacion`.

**El gating de no-admin se puede testear ya**, sin cuenta de admin.

---

### C11 · Notificaciones ⬜
**Cubre:** campanita in-app, contador de no leídas, push (roto — CORS en `enviar-push`).

**Prueba:** disparar un evento que notifique → verificar que aparece en la campanita y que el contador sube.

---

### C12 · Doble perfil y roles ⬜
**Cubre:** toggle vecino↔prestador, qué ve cada rol, que un prestador puro no pueda publicar pedidos.

**Prueba:** con la cuenta de doble perfil, alternar modo → verificar que el nav inferior y el botón "Publicar pedido" cambian. Con la cuenta de prestador puro, verificar que el toggle **no** aparece y que no hay botón de publicar.

**Regresión conocida:** `modoRol` persistía en localStorage entre cuentas (corregido v64), y el botón de publicar quedaba visible al entrar directo a `s-pedidos` (corregido v65). Ambos merecen test.

---

### C13 · PWA y offline ⬜
**Cubre:** service worker, versionado de caché, banner de offline, prompt de instalación, safe areas en iOS.

**Prueba:** cargar la app → verificar que el SW registra → simular offline → verificar que aparece el banner y que la app sigue navegable desde caché.

---

## Criterio de prioridad

Si hay que elegir por dónde empezar, el orden por riesgo × frecuencia:

1. **C1** — si se rompe, no hay app
2. **C12** — ya tuvo dos regresiones reales en una sola sesión
3. **C4/C9** — recién construidos, mucha superficie nueva
4. **C2, C5, C6** — el flujo central del marketplace, pero escriben datos en producción
5. El resto

## Deuda de infraestructura

- Los tests corren contra **producción**. Los circuitos que escriben datos (C2, C5, C6, C7) van a ensuciar la base. Antes de automatizarlos conviene definir un entorno de staging o convenir un rubro/zona reservado para tests y limpiarlo al final.
- No hay `storageState` por rol reutilizable; cada spec vuelve a loguearse. Con más suites eso se va a notar.
