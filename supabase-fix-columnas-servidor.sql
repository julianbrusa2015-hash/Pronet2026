-- ═══ FIX · Columnas de `prestadores` que sólo debe escribir el servidor ═══
--
-- Continuación de supabase-fix-verificado-forjable.sql, que cerró sólo el
-- sello. Medido 2026-08-22 con el test C15 (tests/columnas-servidor.spec.js).
--
-- ── Qué estaba abierto ─────────────────────────────────────────────────
-- La policy `prestador_edita_su_fila` deja escribir la fila propia entera, y
-- RLS filtra FILAS, no COLUMNAS. Con la sesión normal de un prestador, medido
-- escribiendo y restaurando cada valor:
--
--   suspendido              ABIERTA  → se levanta la suspensión que puso un admin
--   premium                 ABIERTA  → plan pago gratis
--   rating                  ABIERTA  → 5 estrellas a mano
--   resenas                 ABIERTA  → cantidad de reseñas falsa
--   denuncias_confirmadas   ABIERTA  → se borra los antecedentes
--   limites_fundador_hasta  ABIERTA  → beneficios de fundador
--   verificado_gracia_hasta ABIERTA  → extiende la gracia del sello
--   plan                    no cambió
--   es_fundador             no cambió
--
-- Las dos últimas se incluyen igual: el test mide que el VALOR no cambió, no
-- que el permiso lo haya bloqueado — pudo ser una constraint rechazando el
-- valor de prueba. Cerrarlas no cuesta nada y saca la duda.
--
-- `suspendido` es la peor: convierte la suspensión en algo voluntario.
--
-- ── El fix ─────────────────────────────────────────────────────────────
-- Mismo mecanismo que el del sello, con la lista de exclusión ampliada. Ojo:
-- un REVOKE por columna NO recorta un GRANT de tabla — hay que quitar el
-- permiso de tabla y devolverlo columna por columna.
--
-- Este bloque REEMPLAZA al de supabase-fix-verificado-forjable.sql (lo
-- incluye: `verificado` y `verificado_en` siguen en la lista de excluidas).
-- Es idempotente, se puede correr las veces que haga falta.

do $$
declare
  cols text;
  vedadas text[] := array[
    -- el sello (ya cerrado, se mantiene)
    'verificado', 'verificado_en', 'verificado_gracia_hasta',
    -- moderación
    'suspendido', 'denuncias_confirmadas',
    -- plan y beneficios
    'plan', 'premium', 'es_fundador', 'limites_fundador_hasta',
    -- reputación: la calculan las reseñas, no el prestador
    'rating', 'resenas',
    -- identidad de la fila
    'id', 'creado'
  ];
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'prestadores'
     and not (column_name = any (vedadas));

  execute 'revoke update on public.prestadores from authenticated';
  execute format('grant update (%s) on public.prestadores to authenticated', cols);
  execute 'revoke update on public.prestadores from anon';

  raise notice 'columnas que el prestador puede editar: %', cols;
end $$;

-- ── Verificación ───────────────────────────────────────────────────────
-- Debe devolver CERO filas.
select grantee, column_name
  from information_schema.column_privileges
 where table_schema = 'public'
   and table_name   = 'prestadores'
   and privilege_type = 'UPDATE'
   and grantee in ('authenticated', 'anon')
   and column_name in (
     'verificado', 'verificado_en', 'verificado_gracia_hasta',
     'suspendido', 'denuncias_confirmadas',
     'plan', 'premium', 'es_fundador', 'limites_fundador_hasta',
     'rating', 'resenas', 'id', 'creado'
   );

-- ── Lo que SÍ tiene que seguir pudiendo editar ─────────────────────────
-- Esta debe listar descripcion, foto_url, medios_pago, precio*, rubro(s),
-- zona(s), lat, lng, radio_cobertura, especialidades, urgencias_24h, etc.
-- Si falta alguno de esos, el prestador perdió algo que sí le corresponde.
select column_name
  from information_schema.column_privileges
 where table_schema = 'public'
   and table_name   = 'prestadores'
   and privilege_type = 'UPDATE'
   and grantee = 'authenticated'
 order by column_name;

-- ── Después de aplicar ─────────────────────────────────────────────────
--     npx playwright test columnas-servidor.spec.js --project=msedge
--     npx playwright test verificacion-dni.spec.js  --project=msedge
--
-- Los dos tienen que pasar. El C15 recorre columna por columna.
--
-- ── Recordatorio de diseño ─────────────────────────────────────────────
-- El revoke alcanza también al ADMIN: en Supabase el admin es el mismo rol
-- de Postgres (`authenticated`), lo que lo distingue es `es_admin()` dentro
-- de las policies. Todo lo que necesite escribir estas columnas tiene que
-- pasar por una función SECURITY DEFINER, como resolver_verificacion().
-- Si el panel de admin hace `update prestadores set suspendido=...` directo,
-- va a dejar de funcionar y hay que moverlo a una RPC. VERIFICAR ESO.
--
-- Una columna NUEVA tampoco queda escribible por el prestador hasta volver a
-- correr este bloque.
