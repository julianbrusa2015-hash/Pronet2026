-- ═══════════════════════════════════════════════════════════════════════
-- El panel de moderación no mostraba quién denunció
-- ═══════════════════════════════════════════════════════════════════════
--
-- Es la mitad que quedó sin arreglar del fix del 2026-08-03 ("moderación
-- ciega por FK rota"). Ahí se agregó la clave foránea de `denunciado_id`
-- hacia `perfiles` para poder traer su nombre, pero `denunciante_id` quedó
-- apuntando sólo a `auth.users`.
--
-- PostgREST arma los embeds a partir de las claves foráneas: sin una hacia
-- `perfiles`, no hay forma de pedir el nombre del denunciante en la misma
-- consulta. El panel mostraba a quién denunciaron pero no quién lo hizo —
-- justo el dato que hace falta para detectar a alguien que denuncia en masa a
-- un competidor, y para el botón "Contactar partes", que necesita a los dos.
--
-- La FK a auth.users se conserva: son dos restricciones sobre la misma
-- columna y ninguna estorba a la otra.

begin;

-- Requisito: que todo denunciante tenga perfil. Se cumple desde que se
-- crearon los 3 perfiles faltantes (cuentas de la primera hora del proyecto,
-- anteriores al trigger de alta). El bloque corta con un mensaje claro si
-- apareciera algún huérfano, en vez de fallar con un error de constraint.
do $$
declare v_huerfanos int;
begin
  select count(*) into v_huerfanos
    from public.denuncias d
   where d.denunciante_id is not null
     and not exists (select 1 from public.perfiles p where p.id = d.denunciante_id);
  if v_huerfanos > 0 then
    raise exception 'Hay % denuncias cuyo denunciante no tiene perfil. Crear esos perfiles antes de agregar la FK.', v_huerfanos;
  end if;
end $$;

alter table public.denuncias
  drop constraint if exists denuncias_denunciante_id_perfiles_fkey;

alter table public.denuncias
  add constraint denuncias_denunciante_id_perfiles_fkey
  foreign key (denunciante_id) references public.perfiles(id);

commit;
