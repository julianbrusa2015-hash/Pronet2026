-- ═══ PRONET · Bugs de rol: upgrade a prestador + normalizar `tipo` ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
-- CORRER ESTE SQL ANTES de desplegar el código que lo acompaña (ver abajo).
--
-- Arregla dos bugs relacionados:
--
--   BUG 1 — El upgrade a prestador destruía el perfil de vecino.
--   quieroSerPrestador() hacía `update perfiles set tipo='prestador'`, y como
--   tieneDoblePerfil() exige `tipo <> 'prestador'`, el usuario perdía la vista
--   de vecino PARA SIEMPRE: no podía volver a publicar pedidos ni le aparecía
--   el toggle. Un vecino que se suma como prestador debería quedar con doble
--   perfil, que es lo natural — ya era vecino.
--   Fix: el upgrade no toca `tipo`; el rol de prestador lo habilita
--   `prestador_id`, que es lo que esPrestador() ya mira.
--
--   BUG 2 — `tipo` usaba 'cliente' y 'vecino' como sinónimos.
--   Convivían los dos valores para el mismo rol. Funcionaba por accidente:
--   todos los chequeos del código son `tipo = 'prestador'` o su negación, así
--   que ambos caían del mismo lado. Cualquier código nuevo que preguntara por
--   'vecino' habría ignorado a la mitad de los usuarios.
--   Se normaliza a 'cliente': es el valor de la mayoría de las filas y el
--   único que el código escribe/compara (verificado — nada lee 'vecino' de
--   `perfiles`; los 'vecino' del código son de `modoRol`, que es otra cosa).

-- ── 1. Normalizar `tipo` y blindarlo con un CHECK ───────────────────────
update public.perfiles set tipo = 'cliente' where tipo = 'vecino';

-- Se agrega después del update, para que no falle por filas existentes.
alter table public.perfiles drop constraint if exists perfiles_tipo_check;
alter table public.perfiles add constraint perfiles_tipo_check
  check (tipo in ('cliente', 'prestador', 'admin'));

-- 'admin' se conserva como valor válido porque hay una cuenta con ese `tipo`.
-- Ojo: el rol de admin real lo define `roles`, no `tipo` — es_admin() lee
-- `'admin' = any(roles)`. `tipo='admin'` es decorativo.

-- ── 2. El alta de ficha ya no exige tipo='prestador' ────────────────────
-- Crear la propia ficha ES la acción de upgrade, así que no puede requerir
-- ser prestador de antemano — era circular. La protección real es la
-- idempotencia: una ficha por usuario, y solo la del que llama.
create or replace function public.asegurar_ficha_prestador()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_perfil record;
  v_nuevo  uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'sin sesión');
  end if;

  select id, nombre, zona, tipo, prestador_id into v_perfil
    from perfiles where id = v_uid;
  if v_perfil.id is null then
    return jsonb_build_object('ok', false, 'error', 'sin perfil');
  end if;

  -- Idempotente: si ya tiene ficha, devolverla sin crear otra.
  if v_perfil.prestador_id is not null then
    return jsonb_build_object('ok', true, 'prestador_id', v_perfil.prestador_id, 'creada', false);
  end if;

  -- NO se exige tipo='prestador': ofrecer servicios es una acción self-service
  -- del producto ("Quiero ofrecer mis servicios"), y esta función es justamente
  -- la que la ejecuta. Tampoco se modifica `tipo`, para no destruir el perfil
  -- de vecino (BUG 1).
  insert into prestadores (nombre, zona, rubro, activo, plan)
       values (coalesce(v_perfil.nombre, 'Prestador'),
               coalesce(v_perfil.zona, 'Escobar'),
               'General', true, 'base')
    returning id into v_nuevo;

  update perfiles set prestador_id = v_nuevo where id = v_uid;

  return jsonb_build_object('ok', true, 'prestador_id', v_nuevo, 'creada', true);
end;
$$;

-- ── 3. Recuperar a los ya convertidos ───────────────────────────────────
-- Los que pasaron por el upgrade viejo quedaron con tipo='prestador' y ya no
-- pueden volver a ser vecinos. NO se migran automáticamente: no hay forma de
-- distinguir a quien se registró directo como prestador (y debe seguir siendo
-- prestador puro) de quien fue vecino y se upgradeó. `creado` no sirve, y no
-- hay registro de la transición.
--
-- Para devolverle el doble perfil a una cuenta puntual, a mano:
--   update perfiles set tipo = 'cliente'
--    where id = (select id from auth.users where email = 'x@y.com')
--      and prestador_id is not null;
--
-- Conserva la ficha de prestador y le habilita el toggle.

-- ── Verificación ────────────────────────────────────────────────────────
select
  p.nombre, u.email, p.tipo, p.roles, p.prestador_id is not null as tiene_ficha,
  case
    when 'admin' = any(coalesce(p.roles, array[]::text[]))   then 'ADMIN'
    when p.tipo = 'prestador' and p.prestador_id is not null then 'Prestador puro (sin toggle)'
    when p.prestador_id is not null                          then 'Doble perfil (con toggle)'
    else 'Vecino'
  end as rol_efectivo
from perfiles p
left join auth.users u on u.id = p.id
order by rol_efectivo, p.nombre;

-- No debe quedar ningún tipo='vecino'. Los nuevos upgrades quedan como
-- 'Doble perfil'; los 'Prestador puro' son los convertidos por el flujo viejo
-- más los que se registraron directo como prestador.
