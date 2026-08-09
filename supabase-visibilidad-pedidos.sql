-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Quién puede leer un pedido
--
-- Hasta hoy la policy era `using (true)`: cualquier usuario logueado leía
-- TODOS los pedidos — título, descripción, zona, presupuesto, urgencia,
-- fotos y el usuario_id del dueño.
--
-- Nunca se decidió así; quedó abierto de la primera versión. Y no hay una
-- sola función de la app que necesite que un vecino vea el pedido de otro:
-- no existe un feed de pedidos para vecinos ni forma de navegarlos. Es
-- acceso que sobra.
--
-- Lo que expone no es menor: un pedido es "necesito que alguien entre a mi
-- casa a arreglar esto", con descripción libre —donde la gente escribe
-- referencias de dirección— y fotos del interior. Alcanzaba con registrarse
-- con cualquier mail para leer eso de todo Escobar.
--
-- El vecino que QUIERE ver los pedidos es, funcionalmente, un prestador:
-- ese camino ya existe y es gratis (CTA "convertite en prestador").
--
-- De paso esto hace REAL el dirigido_a de la recontratación, que hasta
-- ahora se filtraba sólo en datos.js — o sea, en la interfaz. Un prestador
-- que pegara contra la API veía igual el pedido dirigido a otro.
-- ═══════════════════════════════════════════════════════════════════════

drop policy if exists "pedidos_leer_autenticados" on public.pedidos;

create policy "pedidos_leer" on public.pedidos
  for select to authenticated
  using (
    -- El dueño, siempre y en cualquier estado.
    usuario_id = auth.uid()
    or public.es_admin()
    or (
      -- Prestador: ve los pedidos abiertos, y los dirigidos a él.
      -- El doble perfil entra por acá, que es lo correcto.
      exists (select 1 from public.prestadores where usuario_id = auth.uid())
      and (
        dirigido_a is null
        or dirigido_a in (select id from public.prestadores where usuario_id = auth.uid())
      )
    )
  );

-- ── Contador público de actividad ──────────────────────────────────────
-- Un usuario nuevo necesita ver que esto tiene movimiento. Eso se resuelve
-- con un agregado, no exponiendo los pedidos de a uno.
--
-- SECURITY DEFINER porque justamente tiene que contar por encima de la
-- policy de arriba. Devuelve un número, nada más: no filtra ni el rubro,
-- que con pocos pedidos por zona podría volverse identificatorio.
create or replace function public.contar_pedidos_activos(p_zona text default null)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer
    from public.pedidos
   where estado = 'Publicado'
     and dirigido_a is null
     and (expira_en is null or expira_en > now())
     and (p_zona is null or zona = p_zona);
$$;

revoke all on function public.contar_pedidos_activos(text) from public;
grant execute on function public.contar_pedidos_activos(text) to anon, authenticated;

comment on function public.contar_pedidos_activos(text) is
  'Cuántos pedidos abiertos hay. Agregado público: reemplaza el exponer los pedidos uno por uno para mostrar actividad.';

notify pgrst, 'reload schema';

-- Verificación: la policy quedó, y el contador responde.
select (select count(*) from pg_policy p join pg_class c on c.oid = p.polrelid
         where c.relname = 'pedidos' and p.polcmd = 'r')      as policies_select,
       public.contar_pedidos_activos()                        as pedidos_activos,
       public.contar_pedidos_activos('Escobar')               as activos_escobar;
