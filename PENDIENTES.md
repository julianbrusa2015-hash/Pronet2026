# PRONET · Pendientes

Estado al cierre del **2026-07-29**. Deploy en producción: **SW v76** (`be68670`).

---

## 🔴 Retomar primero

### 1. ✅ Parte 4 — CERRADA (2026-07-30)

Los 5 casos probados y el `DROP POLICY` + `REVOKE INSERT` confirmados:

- ✅ Mensaje en chat · ✅ Propuesta enviada · ✅ Trabajo terminado
- ✅ Broadcast — 4 notificaciones, una por electricista del rubro, mismo `emisor_id` y mismo `creado` (un solo INSERT masivo del RPC)
- ✅ El caso que debía fallar — Carla intentando notificar a un usuario sin relación devolvió `{ok: false, error: "sin relación con el destinatario"}`
- ✅ INSERT directo verificado como bloqueado: `403` al intentar insertar sin pasar por el RPC

El INSERT directo a `notificaciones` está revocado. Solo los RPC `SECURITY DEFINER` (`notificar_usuario`, `notificar_rubro`) pueden escribir, y toda notificación queda atribuida con `emisor_id`.

### 2. Rotar el PIN de admin — sin confirmar

Estuvo legible sin sesión. El valor `1234` hay que darlo por quemado aunque ya no se filtre.

```sql
UPDATE config_app SET valor = '<pin nuevo de 6 dígitos>' WHERE clave = 'admin_pin';
```

---

## 🟡 Seguridad restante

### 3. Parte 5 — analítica forjable
`perfil_vistas` y `perfil_contactos` aceptan INSERT de **`anon`** con `with_check (true)`. Sin login se pueden inflar las vistas de un perfil propio o ensuciar el de un competidor. El "N vistas este mes" no es un dato confiable hoy.

### 4. Auto-inflación de puntos — cerrada, pero verificar
El `revoke` ya se aplicó. Para confirmar que sigue cerrado, esto debe fallar desde la consola:
```js
await window._sb.from('loyalty').upsert({ usuario_id: '<propio>', puntos: 999999 }, { onConflict: 'usuario_id' })
```

---

## 🟠 Monetización

### 5. MercadoPago — el único bloqueante para cobrar
`confirmarPago()` activa el plan sin cobrar nada. Falta checkout real, webhook que confirme antes de activar, y manejo de rechazos.

**Lo bueno:** el resto del circuito ya funciona y queda intacto. El webhook solo tiene que escribir la misma fila en `suscripciones` que hoy escribe `confirmarPago()`.

### 6. Grandfathering de fundadores
Al activar los pagos, los prestadores que ya estaban pasan de 10 a 3 propuestas. Decidido: hay que marcarlos.

Implementar como **fecha, no booleano** — `limites_fundador_hasta` por usuario (`null` = para siempre). Así la decisión permanente-vs-plazo se resuelve con números reales de uso.

Recomendación registrada: con plazo, pero **comunicado desde el arranque**.

### 7. Sync `planes_limites` ↔ `config.js`
Los límites viven duplicados: `PRONET_CONFIG.PLANES` (cliente) y la tabla `planes_limites` (triggers). Cambiar uno sin el otro produce drift silencioso. Idealmente `config.js` debería leer de la tabla al iniciar.

---

## 🔵 Bugs conocidos

| # | Bug | Detalle |
|---|-----|---------|
| 8 | **CORS en `enviar-push`** | Los push no llegan a nadie; la campanita in-app sí funciona. Sospecha principal: `verify_jwt` activo hace que el gateway rechace el preflight `OPTIONS` (que viaja sin `Authorization`) con un 401 sin headers CORS, y el browser lo reporta como error de CORS. La función ya valida el JWT por su cuenta. **Bloqueado:** hace falta saber si la Edge Function se despliega por dashboard o por CLI. |
| 9 | **400 en loop** | ~10 requests fallidos por carga, en una consulta con `estado=eq.calificado`. Probablemente el checklist de bienvenida o el banner de primer trabajo. Sin diagnosticar. |
| 10 | **`quieroSerPrestador()` sobrescribe `tipo`** | [app.js:3317](app.js:3317) hace `.update({ tipo: 'prestador' })`, así que un vecino que se suma como prestador **pierde para siempre la vista de vecino** y el toggle no le aparece (`tieneDoblePerfil()` exige `tipo !== 'prestador'`). Debería no tocar `tipo` y apoyarse solo en `prestador_id`. Requiere además decidir cómo recuperar a los ya convertidos. |
| 11 | **`tipo`: `'cliente'` vs `'vecino'`** | Dos valores para el mismo rol conviviendo en la columna. Hoy no rompe porque todos los chequeos son `tipo = 'prestador'` o su negación, así que ambos caen del mismo lado **por accidente**. Cualquier código nuevo que pregunte `tipo === 'vecino'` va a ignorar a la mitad de los usuarios. Falta elegir uno, migrar el otro, agregar un CHECK. |
| 12 | **`roles` desincronizado de `tipo`** | Se sincronizó en las cuentas de prueba, pero nada lo mantiene así. Dos fuentes de verdad para el rol. |
| 13 | **Foto huérfana en Storage** | `subirFotoPortfolio()` sube el archivo **antes** del INSERT. Si el trigger de límite rechaza, el archivo queda huérfano en el bucket. Mover el chequeo antes del upload, o limpiar en el catch. |
| 14 | **Otros métodos que tragan errores** | `crear()` descartaba el `error` de Supabase y guardaba en localStorage, simulando éxito. Ya está corregido. **Falta revisar el resto de `datos.js`** por el mismo patrón — recordar que `supabase-js` no lanza excepciones, devuelve `{data, error}`, así que un `try/catch` alrededor no atrapa nada. |
| 15 | **`.gitignore` incompleto** | Solo cubre `.claude/`. `node_modules/`, `package-lock.json` y `test-results/` están sin trackear y podrían colarse en un `git add .`. |

---

## ⚪ Features y mejoras

- **Estadísticas por tier** — Básicas (Plus) / Completas (Pro) / Export (Elite) definidas; la UI muestra "(próx.)" en todo.
- **"62% · Visibilidad del mes"** — número fijo en el HTML de la tarjeta de plan en Mi Perfil.
- **Validación de formularios** — cero `<form>`, cero `required`/`pattern` en todo `index.html`. El registro no valida formato de email.
- **Login con Apple** — provider no habilitado en Supabase.
- **Login biométrico** — `showBiometric()` existe pero solo revalida sesión, no usa WebAuthn. Botón oculto.
- **Catálogo con precio dinámico** — calcular min/max/promedio desde propuestas reales cuando haya 5+.
- **14 constantes de negocio hardcodeadas** en `app.js` (72hs propuesta, 7 días inactividad, 4 fotos, 5 MB, etc.) → mover a `config.js`.
- **Niveles de loyalty hardcodeados** en `app.js` → mover a tabla.

---

## 🧪 Tests

- **`planes-limites.spec.js`: 10/10 pasando.** Correr con `npx.cmd playwright test tests/planes-limites.spec.js` (PowerShell bloquea `npm` por ExecutionPolicy).
- **Límite de 3 propuestas: nunca verificado.** Las propuestas del mes de Prestador Puertos se movieron un mes atrás, así que el contador está en cero. Falta enviar 3 y confirmar que la 4ª se frena.
- **Plan de circuitos** en [tests/PLAN-CIRCUITOS.md](tests/PLAN-CIRCUITOS.md): 13 circuitos mapeados, 2 con cobertura. Prioridad sugerida: **C1** (acceso) y **C12** (roles, ya tuvo dos regresiones).
- **Deuda:** los tests corren contra **producción**. Los circuitos que escriben datos (C2, C5, C6, C7) van a ensuciar la base. Antes de automatizarlos, decidir staging o un rubro/zona reservado que se limpie al final.

---

## ⚠️ Orden de aplicación de los SQL

Nos costó dos tropiezos en un día. Dos reglas:

**1. Código antes que SQL.** Si el trigger empieza a acreditar mientras los navegadores siguen con la versión vieja que también acredita, los puntos se cuentan dos veces en datos reales. Al revés la ventana es inofensiva: unos minutos sin acreditar. **Perder un evento se arregla; contarlo dos veces se propaga.**

**2. Dependencias entre archivos.** `supabase-loyalty-server-side.sql` antes que `supabase-canjes-rpc.sql`: el segundo usa `acreditar_puntos()` del primero y termina con un `revoke`. Correrlo solo deja el saldo inescribible sin nada que lo reemplace. Ya tiene un bloque `DO` que corta con un mensaje si falta la dependencia.

**El patrón peligroso:** un `revoke` quita el camino viejo antes de que el nuevo exista. Es lo mismo que borrar una columna antes de migrar los datos.

---

## Trampas encontradas, para no repetirlas

- **`using (true)` en una tabla de configuración es peligroso por diseño.** Las tablas de config acumulan claves con el tiempo y la policy no se revisa cuando eso pasa. Así quedó expuesto el `admin_pin`. Ahora es lista blanca explícita.
- **Un `DEFAULT` puede quedar desalineado con su propio `CHECK`.** La migración de planes cambió los valores y agregó el CHECK, pero no el `DEFAULT` de `prestadores.plan`, que siguió en `'basico'`. No se disparó hasta el primer INSERT sin esa columna, **horas después**.
- **Un test puede consagrar un bug.** El de D-03 verificaba que `PronetDB.acreditarPuntos` existiera, o sea fijaba el diseño insecuro que había que sacar. Se invirtió: ahora verifica que **no** exista.
- **RLS filtra filas, no valida valores.** Mientras el cliente pudiera escribir su propia fila de `loyalty`, ninguna policy podía impedirle poner el saldo que quisiera. La única solución fue quitarle la escritura.
