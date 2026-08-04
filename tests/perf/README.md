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
| Seed de volumetría | ✅ `seed-volumetria.sql` (requiere staging) |
| Entorno de staging | ⬜ **pendiente — bloqueante** |
| Alta de usuarios de prueba | ⬜ pendiente |
| Script E2 — marketplace | ⬜ pendiente |
| Script E3 — pagos/idempotencia | ⬜ pendiente |

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

Necesarias porque `pedidos.usuario_id` y `resenas.vecino_id` referencian `auth.users`, y las cuentas no se pueden crear con SQL directo — van por la Admin API de Auth.

Convención de nombres que espera el script: `vecinoNNNN@load.test` y `prestaNNNN@load.test`, todas con la misma contraseña (`TEST_PW`).

**Importante:** las cuentas de prestador deben quedar con plan `pro` (`propuestas_mes = null`). Con plan base el trigger `chequear_limite_propuestas` corta a las 3–10 propuestas del mes y la prueba termina midiendo el trigger rechazando, no la capacidad del sistema.

### 4. Sembrar volumetría

```bash
psql "$STAGING_DB_URL" -f tests/perf/seed-volumetria.sql
```

Objetivo: 5 000 prestadores · 50 000 pedidos · 200 000 reseñas. El script termina con `ANALYZE` — sin eso Postgres conserva las estimaciones de la tabla vacía y elige planes equivocados.

### 5. Ejecutar

```bash
k6 run -e SUPABASE_URL=https://<ref>.supabase.co -e SUPABASE_ANON_KEY=<anon> tests/perf/e1-contratacion.js
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
