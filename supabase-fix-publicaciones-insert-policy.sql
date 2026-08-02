-- La policy INSERT de publicaciones seguía exigiendo es_pro_marketplace=true
-- (el gate de la vieja suscripción flat de $10.000/mes). Al reemplazarla por
-- el sistema de cupos (supabase-promarket-cupos.sql) se armó el trigger
-- trg_cupo_publicacion_mercado como enforcement real, pero esta policy vieja
-- nunca se actualizó — seguía bloqueando a cualquiera que no tuviera la
-- suscripción legacy, con "row-level security policy" en vez del mensaje
-- claro del trigger (sin_creditos_publicacion / limite_publicaciones_mes).
--
-- Ahora la policy solo verifica ownership; el cupo real lo aplica el trigger.

drop policy if exists "publicaciones_crear_pro" on public.publicaciones;
create policy "publicaciones_crear_propia"
  on public.publicaciones for insert
  to authenticated
  with check (autor_id = auth.uid());
