-- Agrega la opción "Precio a convenir" a las publicaciones de ProMarket,
-- distinta de dejar el precio vacío (que hoy se muestra como "Consultar").
alter table public.publicaciones
  add column if not exists precio_convenir boolean not null default false;
