-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Fix de la policy de lectura de pedidos
--
-- La primera versión (supabase-visibilidad-pedidos.sql) tenía un bug que
-- Postgres NO reporta y que dejó a todos los prestadores sin feed:
--
--   exists (select 1 from prestadores where usuario_id = auth.uid())
--
-- `prestadores` no tiene columna `usuario_id` — el vínculo va al revés,
-- `perfiles.prestador_id → prestadores.id`. Ante un nombre que no existe en
-- la tabla del subquery, Postgres lo busca en la consulta EXTERNA y lo
-- encuentra: `pedidos.usuario_id`. La condición se volvió "el pedido es
-- mío", y la policy entera colapsó a `usuario_id = auth.uid() or es_admin()`.
--
-- Sin error, sin warning, y con la única señal siendo un feed vacío.
--
-- La lección para la próxima: dentro de una policy, nunca referenciar una
-- columna a secas en un subquery sobre otra tabla. Acá se resuelve con una
-- función helper, que además elimina la duplicación y es reusable.
-- ═══════════════════════════════════════════════════════════════════════

-- SECURITY DEFINER a propósito: leer `perfiles` desde dentro de una policy
-- quedaría sujeto al RLS de `perfiles`, y si esa policy cambia mañana esta
-- fallaría cerrada — sin feed y sin error, otra vez.
create or replace function public.mi_prestador_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select prestador_id from public.perfiles where id = auth.uid();
$$;

revoke all on function public.mi_prestador_id() from public;
grant execute on function public.mi_prestador_id() to authenticated;

comment on function public.mi_prestador_id() is
  'La ficha de prestador del usuario actual, o null si no es prestador. Para usar dentro de policies sin depender del RLS de perfiles.';

drop policy if exists "pedidos_leer" on public.pedidos;

create policy "pedidos_leer" on public.pedidos
  for select to authenticated
  using (
    pedidos.usuario_id = auth.uid()          -- calificado a propósito
    or public.es_admin()
    or (
      public.mi_prestador_id() is not null
      and (dirigido_a is null or dirigido_a = public.mi_prestador_id())
    )
  );

notify pgrst, 'reload schema';

-- Verificación: cuántas cuentas son prestador según el vínculo real, y
-- cuántos pedidos abiertos deberían ver.
select (select count(*) from public.perfiles where prestador_id is not null) as cuentas_prestador,
       (select count(*) from public.pedidos
         where estado = 'Publicado' and dirigido_a is null)                  as pedidos_abiertos,
       (select count(*) from public.pedidos where dirigido_a is not null)    as pedidos_dirigidos;
