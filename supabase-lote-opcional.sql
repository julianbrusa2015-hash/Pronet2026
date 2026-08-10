-- ═══════════════════════════════════════════════════════════════════════
-- Entre Vecinos · Lote opcional, visible sólo dentro de la comunidad
-- ═══════════════════════════════════════════════════════════════════════
--
-- El lote es la dirección del vendedor. Hoy `publicaciones.lote` tiene
-- SELECT para `authenticated` (grant de tabla completo), así que cualquiera
-- con cuenta puede cosecharlos con un select directo: el feed no lo pide,
-- pero eso es cosmético. Está vacío en las 9 publicaciones actuales, o sea
-- que la fuga es latente y no hay datos comprometidos todavía.
--
-- Un checkbox "mostrar mi lote" filtrado en el cliente sería una promesa
-- falsa. Acá se cierra de verdad:
--   1. `mostrar_lote`: el vendedor decide (default false — nadie queda
--      expuesto por una migración).
--   2. Se revoca el SELECT de `lote` a nivel de columna.
--   3. Dos RPC SECURITY DEFINER lo devuelven a quien corresponde.
--
-- OJO con el orden del punto 2: un GRANT de TABLA completo le gana a un
-- REVOKE de columna, así que primero se revoca la tabla y después se
-- re-otorgan las columnas una por una. Es la misma trampa que costó un
-- intento en la auditoría del 2026-08-03 con `perfiles.roles`.

begin;

-- ── 1 · Opt-in del vendedor ──────────────────────────────────────────
alter table public.publicaciones
  add column if not exists mostrar_lote boolean not null default false;

comment on column public.publicaciones.mostrar_lote is
  'El autor eligió mostrar su lote a los vecinos de su misma comunidad.';

-- ── 2 · Sacar `lote` del alcance de un select directo ────────────────
-- `anon` y `authenticated` tenían arwdDxtm sobre la tabla. Se revoca sólo
-- el SELECT (INSERT/UPDATE siguen igual: el autor tiene que poder escribir
-- su lote, y eso ya lo acota la RLS a su propia fila).
revoke select on public.publicaciones from anon, authenticated;

grant select (
  id, autor_id, categoria, titulo, descripcion, precio, foto_url, zona,
  activa, creado, likes_count, comentarios_count, precio_convenir,
  detalles, disponible, barrio, mostrar_lote
) on public.publicaciones to anon, authenticated;

-- ── 3 · La comunidad de un nombre de zona ────────────────────────────
-- Nivel 2 es la comunidad misma; nivel 3 devuelve su comunidad madre;
-- nivel 1 (la zona entera) no es una comunidad y devuelve null.
create or replace function public.comunidad_de(p_nombre text)
returns text language sql stable as $$
  select case when z.nivel = 2 then z.nombre
              when z.nivel = 3 then z.comunidad
              else null end
    from public.zonas_arbol z
   where z.nombre = p_nombre
   limit 1;
$$;

-- ── 4 · Los lotes que el que llama puede ver ─────────────────────────
-- Batch y no uno por tarjeta: una consulta por publicación serían diez por
-- scroll (mismo criterio que listarRecomendaciones).
--
-- Devuelve el lote sólo si el autor lo habilitó Y el que mira vive en la
-- misma comunidad. El autor siempre ve el suyo.
create or replace function public.lotes_visibles(p_ids uuid[])
returns table (id uuid, lote text)
language sql stable security definer set search_path = public as $$
  select p.id, p.lote
    from public.publicaciones p
   where p.id = any(p_ids)
     and p.activa = true
     and p.lote is not null
     and (
       -- el dueño siempre ve el suyo
       p.autor_id = auth.uid()
       or (
         p.mostrar_lote = true
         and exists (
           select 1
             from public.perfiles yo
            where yo.id = auth.uid()
              and public.comunidad_de(yo.zona) is not null
              -- EXISTS y no una comparación contra subselect escalar: sin
              -- sesión el escalar da NULL, y `false or NULL` es NULL, que en
              -- plpgsql no entra al IF. Misma trampa documentada el 2026-08-03.
              and public.comunidad_de(yo.zona) = public.comunidad_de(p.barrio)
         )
       )
     );
$$;

revoke all on function public.lotes_visibles(uuid[]) from public, anon;
grant execute on function public.lotes_visibles(uuid[]) to authenticated;

-- ── 5 · Las publicaciones propias, con su lote ───────────────────────
-- Hace falta porque el REVOKE del punto 2 es por ROL, no por fila: sin
-- esto el propio autor dejaría de poder leer su lote para editarlo.
create or replace function public.mis_publicaciones()
returns setof public.publicaciones
language sql stable security definer set search_path = public as $$
  select * from public.publicaciones
   where autor_id = auth.uid()
   order by creado desc;
$$;

revoke all on function public.mis_publicaciones() from public, anon;
grant execute on function public.mis_publicaciones() to authenticated;

commit;
