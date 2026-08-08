-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · pedidos.estado deja de convivir en dos capitalizaciones
--
-- Había 31 filas 'Cerrado' y 5 'cerrado'. No es cosmético: el cliente
-- decidía si un pedido estaba abierto con
--
--   !['cerrado','calificado','terminado','cancelado'].includes(p.estado)
--
-- comparando contra minúsculas, mientras el RPC `elegir_propuesta` escribe
-- 'Cerrado' con mayúscula. Resultado: los 31 pedidos cerrados se trataban
-- como ABIERTOS — el vecino veía "N propuestas recibidas · Ver y comparar"
-- y hasta el botón Renovar sobre un pedido que ya había cerrado.
--
-- Se arregla en los dos lados: acá los datos y el trigger, y en app.js la
-- comparación pasa a ser insensible a mayúsculas (defensa en profundidad —
-- las sesiones que ya tienen el JS viejo en caché siguen andando bien
-- porque el dato queda uniforme).
--
-- Trigger normalizador y NO un CHECK: un CHECK rechaza, y si quedara algún
-- camino de escritura que no encontré, empezaría a fallar en producción.
-- Éste sólo corrige la capitalización, nunca bloquea.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Los datos viejos ─────────────────────────────────────────────────
update public.pedidos
   set estado = initcap(estado)
 where estado is not null
   and estado <> initcap(estado)
   and lower(estado) in ('publicado','cerrado','vencido');

-- ── 2. Que no vuelva a pasar ────────────────────────────────────────────
create or replace function public.normalizar_estado_pedido()
returns trigger
language plpgsql
as $function$
begin
  if new.estado is not null and lower(new.estado) in ('publicado','cerrado','vencido') then
    new.estado := initcap(new.estado);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_normalizar_estado_pedido on public.pedidos;
create trigger trg_normalizar_estado_pedido
  before insert or update of estado on public.pedidos
  for each row execute function public.normalizar_estado_pedido();

-- ── Verificación ────────────────────────────────────────────────────────
select estado, count(*) as n from public.pedidos group by estado order by estado;
