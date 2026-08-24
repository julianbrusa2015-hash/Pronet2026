-- ═══════════════════════════════════════════════════════════════════════
-- PRONET · Dos carruseles de banners: portada y Entre Vecinos
--
-- Hasta ahora `banners` era una sola bolsa y el único carrusel era el de la
-- portada. Al abrir un segundo carrusel dentro de Entre Vecinos hace falta
-- decir A CUÁL va cada banner: sin esta columna, el aviso que un prestador
-- compró para la portada aparecería también en el mercado de los vecinos —
-- exactamente la mezcla que el segundo carrusel viene a evitar.
--
-- ── Por qué inventario separado y no uno compartido ────────────────────
-- Son dos públicos distintos y dos precios potencialmente distintos. Con
-- una sola bolsa de 6, el que compra para la portada le come el lugar al
-- que compra para Entre Vecinos y viceversa, sin que ninguno de los dos
-- entienda por qué se quedó sin espacio.
--
-- Quién compra dónde lo decide el ROL, no una opción del formulario:
--   prestador → 'portada'  (su oficio, lo ve todo el barrio al entrar)
--   vecino    → 'vecinos'  (su mercado, arriba del feed donde ya publica)
-- ═══════════════════════════════════════════════════════════════════════

alter table public.banners
  add column if not exists ubicacion text not null default 'portada';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'banners_ubicacion_check') then
    alter table public.banners
      add constraint banners_ubicacion_check check (ubicacion in ('portada','vecinos'));
  end if;
end $$;

-- Todo lo que ya existe es de la portada: es el único carrusel que hubo
-- hasta hoy. El default de la columna ya lo resuelve para las filas
-- viejas, pero se deja explícito para que no dependa del orden en que se
-- corran las migraciones.
update public.banners set ubicacion = 'portada' where ubicacion is null;

-- El índice del feed filtra por ubicación además de por vigencia: cada
-- carrusel pide sólo los suyos.
create index if not exists idx_banners_ubicacion_vigentes
  on public.banners (ubicacion, estado, activo, orden)
  where estado = 'aprobado' and activo = true;

notify pgrst, 'reload schema';

-- ── Verificación ────────────────────────────────────────────────────────
select ubicacion, count(*) as banners
  from public.banners
 group by ubicacion
 order by ubicacion;
