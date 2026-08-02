-- Líneas de detalle libres para publicaciones de ProMarket (ej: "Sabores:
-- chocolate, vainilla", "Modelos: S, M, L"). Sin estructura forzada —
-- alternativa A entre las evaluadas: texto libre, máximo 5 líneas.
alter table public.publicaciones
  add column if not exists detalles text[] not null default '{}';

alter table public.publicaciones
  drop constraint if exists publicaciones_detalles_max5;
alter table public.publicaciones
  add constraint publicaciones_detalles_max5 check (array_length(detalles, 1) is null or array_length(detalles, 1) <= 5);
