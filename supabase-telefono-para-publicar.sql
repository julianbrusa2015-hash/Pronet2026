-- ═══════════════════════════════════════════════════════════════════════
-- Teléfono obligatorio para publicar un pedido
-- ═══════════════════════════════════════════════════════════════════════
--
-- Complemento de supabase-telefono-unico.sql. Ese índice impide que dos
-- cuentas compartan teléfono, pero el teléfono es OPCIONAL: quien quiera una
-- segunda cuenta simplemente no carga ninguno y pasa por al lado. Éste cierra
-- esa puerta en el punto donde el daño ocurre.
--
-- POR QUÉ SÓLO EN `pedidos` Y NO TAMBIÉN EN `resenas`:
-- toda reseña nace de un `chats_trabajo`, y todo `chats_trabajo` nace de un
-- pedido — tanto por propuesta elegida como por `iniciar_consulta_prestador`,
-- que también recibe un `p_pedido_id`. O sea que para autorreseñarse hay que
-- publicar un pedido primero, y ahí ya se exigió el teléfono. Gatear también
-- la reseña no agregaría seguridad y le pondría fricción a la acción más
-- escasa del producto (2 de 18 prestadores tienen reseñas).
--
-- No se toca la RLS: una policy daría "row violates row-level security", que
-- no le dice nada a nadie. Un trigger puede levantar un error con nombre
-- propio que el cliente traduce a un mensaje accionable.
--
-- Las cuentas que hoy no tienen teléfono NO se tocan: se regularizan solas la
-- primera vez que publican. Sin migración y sin molestar al que sólo mira.

begin;

create or replace function public.exigir_telefono_para_publicar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sin sesión = escritura del backend (service_role: seeds, soporte, Edge
  -- Functions). No se le exige nada; la RLS ya impide que un anónimo llegue
  -- hasta acá con una sesión de usuario.
  if auth.uid() is null then
    return new;
  end if;

  if not exists (
    select 1 from public.perfiles
     where id = auth.uid()
       and btrim(coalesce(telefono, '')) <> ''
  ) then
    raise exception 'TELEFONO_REQUERIDO'
      using hint = 'Cargá tu teléfono para publicar un pedido.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pedidos_exigir_telefono on public.pedidos;
create trigger trg_pedidos_exigir_telefono
  before insert on public.pedidos
  for each row execute function public.exigir_telefono_para_publicar();

commit;
