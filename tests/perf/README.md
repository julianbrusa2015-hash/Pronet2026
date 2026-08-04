# Pruebas de carga y rendimiento

Implementación del plan de performance. Ver el plan completo para estrategia, escenarios y KPIs.

## ⛔ Antes de correr nada

**Nunca ejecutar contra producción.** `pronetprueba.netlify.app` procesa cobros reales de MercadoPago y envía push a usuarios reales. Los scripts tienen guardas que abortan si detectan una URL de producción, pero la guarda es la última línea de defensa, no la primera.

**Nunca generar carga contra MercadoPago.** Testear un gateway de terceros con cientos de usuarios virtuales es abuso de servicio y deriva en bloqueo de credenciales. Se usa sandbox y un emulador propio de webhook.

## Estado

| Pieza | Estado |
|---|---|
| Índices P0/P1 | ✅ aplicados (`supabase-perf-indices.sql`) |
| Script E1 — contratación | ✅ `e1-contratacion.js` |
| Script E2 — marketplace | ✅ `e2-marketplace.js` |
| Script E3 — pagos/idempotencia | ✅ `e3-pagos.js` (parcial, ver abajo) |
| Seed de volumetría | ✅ `seed-volumetria.sql` (requiere staging) |
| RPC de contadores por zona | ✅ aplicado + `datos.js` migrado |
| Alta de usuarios de prueba | ✅ `seed-usuarios.mjs` |
| Entorno de staging | ⬜ **pendiente — bloqueante** |
| Pagos de sandbox para idempotencia | ⬜ pendiente (ver E3) |

## Puesta en marcha

### 1. Crear el proyecto de staging

Proyecto Supabase separado con el mismo esquema que producción. Aplicar en orden todos los `supabase-*.sql` del repo.

### 2. Marcar la base como staging

El seed se niega a correr sin este marcador. Es deliberado que no se pueda saltear por parámetro:

```sql
insert into public.config_app (clave, valor) values ('entorno','staging')
  on conflict (clave) do update set valor = 'staging';
```

### 3. Crear las cuentas de prueba

```bash
export SUPABASE_URL=https://<ref-staging>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<service_role de STAGING>
node tests/perf/seed-usuarios.mjs --vecinos=60 --prestadores=200
```

Crea `vecinoNNNN@load.test` y `prestaNNNN@load.test`, todas con la misma contraseña (`TEST_PW`, por defecto `LoadTest1234!`). **Es idempotente**: se puede re-correr, las que ya existen se saltean.

Otras opciones:

```bash
node tests/perf/seed-usuarios.mjs --dry-run   # muestra qué haría, sin escribir
node tests/perf/seed-usuarios.mjs --limpiar   # borra todas las @load.test
```

**Por qué hace falta un script y no basta SQL:** `pedidos.usuario_id` y `resenas.vecino_id` referencian `auth.users`, y las cuentas de Auth no se pueden crear por SQL directo — van por la Admin API.

**Lo que hace solo:** el trigger `handle_new_user()` se dispara al crear el usuario y, a partir del metadata, arma la fila en `perfiles`, la ficha en `prestadores`, el enlace `prestador_id` y la fila de `loyalty`. El script solo crea el usuario con el metadata correcto.

**Lo que sí tiene que forzar:** la suscripción `pro`. Los prestadores nacen en plan `base` y el trigger `chequear_limite_propuestas` los cortaría a las 3 propuestas del mes (10 en etapa fundadora, porque `plan_para_limites` mapea base→plus). `pro` tiene `propuestas_mes = null` ⇒ ilimitadas. Sin esto la prueba mide el trigger rechazando, no el sistema.

#### Guardas de seguridad

Dos comprobaciones independientes, **ninguna salteable por parámetro**:

1. **Host exacto en lista negra** — aborta contra `zgmwtyxtygnjfakeriiz.supabase.co` (producción). Comparación por host exacto y no por substring, para no bloquear un staging llamado `<ref>-staging`.
2. **Marcador en `config_app`** — exige `entorno = 'staging'` en la base. Es la guarda autoritativa: producción no tiene esa clave, así que aborta incluso con credenciales válidas.

La `SERVICE_ROLE_KEY` saltea RLS por completo: va siempre por variable de entorno, nunca como argumento (quedaría en el historial del shell) ni commiteada.

### 4. Sembrar volumetría

```bash
psql "$STAGING_DB_URL" -f tests/perf/seed-volumetria.sql
```

Objetivo: 5 000 prestadores · 50 000 pedidos · 200 000 reseñas. El script termina con `ANALYZE` — sin eso Postgres conserva las estimaciones de la tabla vacía y elige planes equivocados.

### 5. Ejecutar

```bash
k6 run -e SUPABASE_URL=https://<ref>.supabase.co -e SUPABASE_ANON_KEY=<anon> tests/perf/e1-contratacion.js
k6 run -e SUPABASE_URL=https://<ref>.supabase.co -e SUPABASE_ANON_KEY=<anon> tests/perf/e2-marketplace.js
```

## E2 — Marketplace

Escenario de lectura intensiva. Mix: 70 % scroll paginado · 20 % filtros · 10 % búsqueda por texto.

Usa **`ramping-arrival-rate`** en lugar de VUs fijos. La diferencia importa: con VUs fijos, si el servidor se degrada los usuarios virtuales esperan más y la carga ofrecida baja sola, enmascarando el problema. Con arrival rate la carga se mantiene aunque el sistema sufra, que es lo que hace un usuario real.

| Métrica | Umbral | Qué mide |
|---|---|---|
| `op_feed_offset_0` | p95 < 600 ms | Primera página — línea base |
| `op_feed_offset_50` | p95 < 700 ms | Scroll medio |
| `op_feed_offset_200` | p95 < 900 ms | Scroll profundo |
| `op_filtro_zona_categoria` | p95 < 600 ms | Filtro combinado (con índices) |
| `op_busqueda_texto` | p95 < 1200 ms | `ILIKE '%…%'` — el subcaso caro |
| `op_contadores_mapa` | p95 < 1500 ms | Contadores por zona |
| `bytes_contadores_mapa` | — | **Peso transferido**, ver abajo |

**Las tres profundidades de offset se miden por separado a propósito.** El costo de `OFFSET` crece con la profundidad porque Postgres genera y descarta las filas previas antes de devolver la página. Un p95 único las promediaría y escondería exactamente la degradación que hay que detectar. **Criterio: si offset 200 supera 2× el de offset 0, migrar a paginación por cursor (keyset).**

### Hallazgo: los contadores del mapa transfieren la tabla entera

`contarPublicacionesPorZona()` en `datos.js` **no es un `GROUP BY` server-side**. Hace `select('zona')` sin límite y agrupa en JavaScript en el navegador:

```js
const { data } = await q;                    // ← trae TODAS las filas
data.forEach(p => { counts[p.zona] = ... }); // ← agrupa en el cliente
```

A 50 000 publicaciones eso transfiere 50 000 filas para construir un contador de 11 números. Por eso E2 mide `bytes_contadores_mapa` además de la latencia: acá el problema es el volumen transferido, no el tiempo de consulta. La corrección es un RPC con `GROUP BY` que devuelva sólo los pares zona→conteo.

## E3 — Pagos e idempotencia

**No es un test de throughput sino de correctitud bajo concurrencia.** Concurrencia baja (20 VUs) y criterios binarios: en dinero, "casi correcto" es un incidente. Subir los VUs no aporta — lo que se busca es la carrera, no el volumen.

```bash
k6 run -e SUPABASE_URL=… -e SUPABASE_ANON_KEY=… \
       -e MP_WEBHOOK_SECRET=<secret de staging> \
       tests/perf/e3-pagos.js
```

Cuatro escenarios; tres corren sin nada extra:

| # | Qué valida | Requiere sandbox |
|---|---|---|
| A | Firma `x-signature` válida bajo concurrencia | No |
| B | Rechazo de firma forjada (**control negativo**) | No |
| C | `crear-preferencia` + arranque en frío del isolate | Token MP sandbox |
| D | **Carrera de idempotencia** | Sí — ver abajo |

El escenario B tiene `abortOnFail`: si empieza a devolver 200, la verificación de firma dejó de proteger el endpoint y cualquiera podría activarse un plan. Es una regresión de seguridad, no de rendimiento.

### Por qué el escenario D necesita pagos de sandbox reales

`webhook-mp` consulta el pago contra la API de MercadoPago **antes** de tocar `pagos_procesados`:

```
firma OK → GET api.mercadopago.com/v1/payments/{id} → 404 → return 200
                                                              ↑
                                        nunca llega al candado de idempotencia
```

Con un `payment_id` inventado, MP devuelve 404 y la función responde 200 sin activar nada — **la ruta de idempotencia jamás se ejercita**. Para probarla de verdad hacen falta pagos de sandbox en estado `approved`, creados previamente con las credenciales de prueba de MP, y pasados por env var:

```bash
-e MP_SANDBOX_PAYMENT_IDS=1234567890,1234567891,1234567892
```

Sin esa variable el escenario D se saltea (con aviso en consola) y los otros tres corren igual.

### Verificación posterior — la hace SQL, no k6

`pagos_procesados` tiene RLS activa **sin policies**: sólo el webhook con `service_role` la escribe y nadie la lee desde el cliente. Por diseño k6 no puede verificar el resultado. Después de la corrida:

```sql
-- Debe devolver 0 filas: un payment_id, un registro.
select payment_id, count(*) from public.pagos_procesados
 where payment_id in ('...')
 group by payment_id having count(*) <> 1;

-- vence_en debe ser ~1 mes, NO N meses acumulados por las N llamadas.
select usuario_id, plan, vence_en from public.suscripciones
 where activado_en > now() - interval '10 minutes';
```

## Interpretación de resultados

Métricas segmentadas por operación en lugar de un `http_req_duration` global, porque el agregado promedia lecturas baratas con escrituras caras y esconde justamente lo que hay que vigilar:

| Métrica | Umbral | Qué mide |
|---|---|---|
| `op_feed_vecino` | p95 < 500 ms | Feed sin filtros (hoy sin `LIMIT`) |
| `op_feed_prestador_filtrado` | p95 < 500 ms | Feed por rubro + zona |
| `op_publicar_pedido` | p95 < 900 ms | INSERT + triggers |
| `op_enviar_propuesta` | p95 < 1200 ms | INSERT + `COUNT` de cupo — la escritura más cara |
| `op_notificar_rubro` | p95 < 1500 ms | Amplificación 1:N |

Dos contadores **no** son errores de rendimiento y se reportan aparte:

- **`propuestas_duplicadas_409`** — choque contra el índice único `(pedido_id, prestador_id)`. El asignador determinista los minimiza; un residuo bajo es normal.
- **`cupo_plan_agotado`** — si aparece, el seed quedó mal: las cuentas de prestador no tienen plan `pro`. Los resultados de esa corrida no son válidos.

## Índices aplicados

`supabase-perf-indices.sql` ya está aplicado en producción (aditivo y reversible con `DROP INDEX`). Línea base medida antes de aplicarlos:

```
Seq Scan on pedidos  (Rows Removed by Filter: 40)
Execution Time: 0.167 ms
```

Rápido sólo porque hay 55 filas — el plan ya era el equivocado. Después de aplicarlos, forzando al planner a considerarlos:

```
Index Scan using idx_pedidos_feed_filtrado
  Index Cond: ((estado = ...) AND (rubro = ...) AND (zona = ...))
```

Las tres condiciones resuelven en el índice y el `ORDER BY creado DESC` no genera nodo `Sort`.

**Pendiente de código:** los índices trigram (`idx_*_busqueda_trgm`) están creados pero **inactivos**. Son índices sobre una expresión concatenada, y el planner sólo los usa si la consulta filtra por esa misma expresión. El código hoy hace tres `ILIKE` por columna separada, que no matchea. Para aprovecharlos hay que migrar la búsqueda a un RPC que filtre por la expresión.
