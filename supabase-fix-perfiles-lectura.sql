-- Corrige dos problemas de RLS en perfiles:
--
-- 1) "leer_propio_perfil" (using auth.uid() = id) solo dejaba ver la PROPIA
--    fila. Cualquier join o consulta pidiendo el perfil de OTRO usuario
--    (nombre en comentarios, en el feed de ProMarket, en "Mis consultas",
--    en el header del chat) devolvía vacío — de ahí el "Vecino" genérico
--    y los "no veo el nombre" repetidos.
-- 2) Al abrir esa lectura a cualquier autenticado, el teléfono quedaría
--    expuesto a cualquiera vía un SELECT genérico (no solo a quien ya
--    comparte un chat). Se cierra a nivel de columna: un SELECT normal
--    ya no puede traer `telefono`, y se agregan dos funciones
--    security definer para los dos casos legítimos que sí lo necesitan.

drop policy if exists "leer_propio_perfil" on public.perfiles;
create policy "perfiles_lectura_autenticados"
  on public.perfiles for select
  to authenticated
  using (true);

-- Restringe qué trae un SELECT genérico: nombre/zona/prestador_id/tipo son
-- las únicas columnas que el código ya lee de perfiles ajenos o propios
-- fuera de estas dos funciones. teléfono queda afuera del grant.
revoke select on public.perfiles from authenticated;
grant select (id, nombre, zona, tipo, prestador_id) on public.perfiles to authenticated;

-- El dueño de la cuenta necesita su fila completa (incluido teléfono) para
-- reflejar su propio estado en la app. security definer ignora el grant
-- de columna de arriba porque corre con los privilegios de quien la creó.
create or replace function public.mi_perfil()
returns setof public.perfiles
language sql security definer stable
set search_path = public
as $$
  select * from public.perfiles where id = auth.uid();
$$;
grant execute on function public.mi_perfil() to authenticated;

-- Teléfono de contacto: solo se expone si el que pregunta ya comparte un
-- chat de ProMarket con ese usuario (es lo que habilita el botón
-- Llamar/WhatsApp en s-chat-mercado).
create or replace function public.obtener_telefono_contacto(p_usuario_id uuid)
returns text
language sql security definer stable
set search_path = public
as $$
  select p.telefono from public.perfiles p
  where p.id = p_usuario_id
    and exists (
      select 1 from public.chats_mercado c
      where (c.autor_id = auth.uid() and c.consultante_id = p_usuario_id)
         or (c.consultante_id = auth.uid() and c.autor_id = p_usuario_id)
    );
$$;
grant execute on function public.obtener_telefono_contacto(uuid) to authenticated;

notify pgrst, 'reload schema';
