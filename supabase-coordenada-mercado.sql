-- ═══════════════════════════════════════════════════════════════════════
-- Entre Vecinos · La coordenada de entrega en el mapa, con la misma
-- gobernanza que el lote (mostrar_lote)
-- ═══════════════════════════════════════════════════════════════════════
--
-- CIERRA UNA FUGA introducida por supabase-coordenada-perfil.sql: ese
-- migration le dio a `authenticated` un GRANT de columna liso y llano sobre
-- perfiles.lat/lng, así que cualquier cuenta podía leer la coordenada
-- EXACTA de cualquier vecino con un select directo — sin pasar por
-- mostrar_lote, sin filtro de comunidad, nada. Mismo patrón de fuga que
-- documentó supabase-lote-opcional.sql para el lote (columna con SELECT
-- de tabla completo, cosechable aunque el feed no la pida).
--
-- El cliente ya usaba mi_perfil() (SECURITY DEFINER, `select * from
-- perfiles where id = auth.uid()`) para leer el perfil propio en Editar
-- Perfil, así que revocar el SELECT de columna no rompe nada del dueño:
-- sigue viendo su propia coordenada igual. Lo único que se corta es el
-- acceso cruzado sin gobernanza.
--
-- Requiere: supabase-coordenada-perfil.sql (perfiles.lat/lng) y
-- supabase-lote-opcional.sql (publicaciones.mostrar_lote, comunidad_de()).

begin;

-- ── 1 · Sacar lat/lng del alcance de un select directo ───────────────────
revoke select (lat, lng) on public.perfiles from authenticated;

-- ── 2 · Las coordenadas que el que llama puede ver, por publicación ──────
-- Mismo criterio que lotes_visibles(): sólo si el autor mostró el lote de
-- ESA publicación y el que mira vive en la misma comunidad. El autor
-- siempre ve la propia. Nula si el vendedor nunca cargó una coordenada.
create or replace function public.coordenadas_visibles(p_ids uuid[])
returns table (id uuid, lat double precision, lng double precision)
language sql stable security definer set search_path = public as $$
  select p.id, pf.lat, pf.lng
    from public.publicaciones p
    join public.perfiles pf on pf.id = p.autor_id
   where p.id = any(p_ids)
     and p.activa = true
     and pf.lat is not null
     and pf.lng is not null
     and (
       p.autor_id = auth.uid()
       or (
         p.mostrar_lote = true
         and exists (
           select 1
             from public.perfiles yo
            where yo.id = auth.uid()
              and public.comunidad_de(yo.zona) is not null
              and public.comunidad_de(yo.zona) = public.comunidad_de(p.barrio)
         )
       )
     );
$$;

revoke all on function public.coordenadas_visibles(uuid[]) from public, anon;
grant execute on function public.coordenadas_visibles(uuid[]) to authenticated;

commit;

-- ── Verificación ────────────────────────────────────────────────────────
select grantee, column_name, privilege_type from information_schema.column_privileges
 where table_name = 'perfiles' and column_name in ('lat', 'lng');
select routine_name from information_schema.routines
 where routine_name = 'coordenadas_visibles';
