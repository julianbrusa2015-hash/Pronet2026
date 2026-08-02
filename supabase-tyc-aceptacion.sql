-- Registra en la base la fecha en que cada usuario aceptó T&C/privacidad,
-- además del flag local en el dispositivo (localStorage). Sin esto, la
-- única prueba de aceptación vivía en el navegador del usuario y se perdía
-- si borraba datos o cambiaba de dispositivo.

alter table public.perfiles
  add column if not exists tyc_aceptado_en timestamptz;

-- Ya existe policy "usuario_edita_su_perfil" (UPDATE, id = auth.uid()) que
-- cubre esta columna, no hace falta una nueva.
