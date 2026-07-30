-- ═══ PRONET · Parte 5: evitar suplantación en analítica de perfil ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- PROBLEMA: perfil_vistas y perfil_contactos aceptan INSERT de anon y
-- authenticated con with_check(true), sin validar `vecino_id`. Ese campo
-- viaja tal cual desde el cliente, así que un usuario logueado podía
-- insertar vecino_id: '<otro usuario>' y hacer figurar que otra persona
-- vio o contactó a un prestador — sin relación con lo que efectivamente pasó.
--
-- ALCANCE DELIBERADAMENTE ACOTADO: esto cierra la suplantación, no la
-- inflación de vistas/contactos por invitados anónimos repitiendo el
-- insert (spam desde la consola). Hoy esas métricas no mueven ranking,
-- badges ni plata — solo alimentan el dashboard de analítica del propio
-- prestador — así que construir infraestructura de rate-limit para
-- sesiones sin identidad estable (anon) sería desproporcionado para el
-- riesgo actual. Revisar si esas métricas empiezan a decidir algo con
-- peso real (ranking, badges, cobros).
--
-- El cliente (datos.js: registrarVista/registrarContacto) ya arma
-- vecino_id a partir de auth.getUser(), que es exactamente auth.uid() del
-- lado del servidor y null para invitados. Esta policy simplemente exige
-- del lado del servidor lo que el cliente ya hacía bien por las suyas.

drop policy if exists "anon registra vistas" on public.perfil_vistas;
create policy "vistas_sin_suplantacion"
  on public.perfil_vistas for insert
  to anon, authenticated
  -- auth.uid() es null para anon: la condición exige vecino_id=null en ese
  -- caso, y vecino_id=auth.uid() (o null) para un usuario logueado.
  with check (vecino_id is null or vecino_id = auth.uid());

drop policy if exists "anon registra contactos" on public.perfil_contactos;
create policy "contactos_sin_suplantacion"
  on public.perfil_contactos for insert
  to anon, authenticated
  with check (vecino_id is null or vecino_id = auth.uid());

-- ── Verificación ────────────────────────────────────────────────────────
select tablename, policyname, cmd, roles, with_check
  from pg_policies
 where tablename in ('perfil_vistas', 'perfil_contactos');
