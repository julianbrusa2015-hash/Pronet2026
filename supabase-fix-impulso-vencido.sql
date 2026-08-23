-- ═══ FIX · El impulso vencido seguía ordenando para siempre ═══
--
-- 2026-08-22.
--
-- ── El problema ────────────────────────────────────────────────────────
-- El feed de Servicios ordena así (datos.js, listarPubsPrestadorActivas):
--
--     .order('impulso_hasta', { ascending: false, nullsFirst: false })
--
-- Ordena por la FECHA CRUDA, sin mirar si el impulso sigue vigente. Y nadie
-- limpia `impulso_hasta` al vencer.
--
-- Resultado: un aviso con el impulso vencido hace ocho meses sigue apareciendo
-- por encima de uno que nunca se impulsó. Se vende "7 días arriba" y se entrega
-- ranking privilegiado permanente.
--
-- El badge de la UI SÍ estaba bien (app.js usa `impulso_hasta > now()`), así
-- que el sello desaparecía a los 7 días y el ranking no. La inconsistencia
-- entre las dos lecturas de la misma columna es lo que lo hizo invisible.
--
-- ── Por qué importa aunque hoy el feed sea chico ───────────────────────
-- Mata la recompra: si el impulso viejo te sigue posicionando, no hay razón
-- para comprar otro. Y es injusto con el que se suma nuevo, que no tiene nada
-- que hacer para subir. A medida que más gente compra, el tope del feed pasa a
-- ser "todos los que alguna vez pagaron", y el producto deja de significar
-- algo justo por haberlo vendido bien.
--
-- ── La métrica se conserva ─────────────────────────────────────────────
-- Limpiar la fecha, sin más, perdería el dato de cuántos impulsos se vendieron
-- por aviso. Se agrega un contador —mismo patrón que `renovaciones`— y la
-- fecha del último, así el dato comercial sobrevive al reseteo.
--
-- ── Nota de seguridad ──────────────────────────────────────────────────
-- Las columnas nuevas NO quedan escribibles por el prestador: los permisos de
-- `publicaciones_prestador` se otorgan columna por columna
-- (supabase-publicaciones-prestador.sql) y estas no están en esa lista. El
-- test C18 lo verifica.

begin;

alter table public.publicaciones_prestador
  add column if not exists impulsos_comprados integer not null default 0,
  add column if not exists ultimo_impulso_en  timestamptz;

comment on column public.publicaciones_prestador.impulsos_comprados is
  'Cuántos impulsos se pagaron sobre este aviso. Sobrevive al reseteo de impulso_hasta: es la métrica comercial.';

-- ── 1 · Al activar el impulso, contarlo ──────────────────────────────
create or replace function public.activar_impulso_pagado(
  p_pub_id uuid, p_usuario_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dias  integer;
  v_filas integer;
begin
  select coalesce(nullif(valor, '')::int, 7) into v_dias
    from config_app where clave = 'impulso_dias';
  v_dias := coalesce(v_dias, 7);

  -- El impulso se ACUMULA sobre uno vigente en vez de pisarlo: si alguien
  -- paga dos veces seguidas, la segunda compra suma días. Pisar sería
  -- quedarse con la plata.
  update publicaciones_prestador p
     set impulso_hasta      = greatest(coalesce(p.impulso_hasta, now()), now())
                              + make_interval(days => v_dias),
         impulsos_comprados = p.impulsos_comprados + 1,
         ultimo_impulso_en  = now()
   where p.id = p_pub_id
     and p.estado = 'activa'
     and p.vigencia_hasta > now()
     and exists (
       select 1 from perfiles pf
       where pf.id = p_usuario_id and pf.prestador_id = p.prestador_id
     );

  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    return jsonb_build_object('ok', false,
      'error', 'El aviso no es de quien pagó, o ya no está publicado');
  end if;

  return jsonb_build_object('ok', true, 'dias', v_dias);
end;
$$;

revoke execute on function public.activar_impulso_pagado(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.activar_impulso_pagado(uuid, uuid) to service_role;

-- ── 2 · Al vencer, limpiar la fecha ──────────────────────────────────
-- Se hace acá, en el cron que ya corre cada hora, y no cambiando la consulta
-- del feed: así se arregla para CUALQUIER consumidor de esa columna, no sólo
-- para el feed que hoy conocemos.
create or replace function public.vencer_pubs_prestador()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  update publicaciones_prestador p
     set estado = 'vencida'
   where p.estado = 'activa'
     and p.vigencia_hasta < now();
  get diagnostics v_n = row_count;

  -- El impulso vencido deja de ordenar. Independiente del estado del aviso:
  -- un impulso puede vencer con el aviso todavía al aire.
  update publicaciones_prestador p
     set impulso_hasta = null
   where p.impulso_hasta is not null
     and p.impulso_hasta < now();

  return v_n;
end;
$$;

revoke execute on function public.vencer_pubs_prestador() from public, anon, authenticated;
grant  execute on function public.vencer_pubs_prestador() to service_role;

-- ── 3 · Limpiar lo que ya está vencido ───────────────────────────────
-- El cron sólo arregla de acá en adelante; esto salda lo acumulado.
--
-- El contador arranca en 0 para todos, a propósito. No hay forma de saber
-- cuántos impulsos se compraron antes de hoy —nadie lo guardaba—, y poner un 1
-- a los que tienen impulso vigente sería inventar: sabríamos que compraron AL
-- MENOS uno, no que compraron exactamente uno. Un contador exacto desde hoy
-- vale más que uno que arranca con un número que nadie sabe interpretar.
update public.publicaciones_prestador
   set impulso_hasta = null
 where impulso_hasta is not null
   and impulso_hasta < now();

commit;

notify pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────
-- 1. Las columnas existen:
--      select column_name from information_schema.columns
--       where table_name = 'publicaciones_prestador'
--         and column_name in ('impulsos_comprados', 'ultimo_impulso_en');
--
-- 2. No quedan impulsos vencidos ordenando:
--      select count(*) from publicaciones_prestador
--       where impulso_hasta is not null and impulso_hasta < now();
--      -- tiene que dar 0
--
-- 3. El prestador NO puede escribir las columnas nuevas:
--      npx playwright test publicaciones-escrituras.spec.js --project=msedge
