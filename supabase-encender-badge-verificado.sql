-- ═══ Encender el sello de verificado ═══
--
-- 2026-08-22. Decisión: el badge pasa a Nivel 1 y se enciende.
--
-- ── Qué cambia para el usuario ─────────────────────────────────────────
-- Que el ✓ se VEA. Nada más.
--
-- El circuito completo ya funcionaba con el flag apagado: el prestador declara
-- nombre, DNI y dirección, el admin revisa y aprueba, y `prestadores.verificado`
-- queda en true. Lo único que el flag controla es una regla CSS que oculta las
-- tres clases de badge (.verified-badge, .verified-badge-lg, .b-verified).
--
-- No gatea ninguna pantalla ni ningún elemento con data-feature. Encenderlo no
-- puede romper nada más que mostrar un sello que ya estaba calculado.
--
-- ── Por qué es Nivel 1 y no Nivel 2 ────────────────────────────────────
-- Estaba junto a la monetización, pero no es una feature de crecimiento: es
-- confianza básica en un marketplace donde alguien entra a tu casa.
--
-- ── OJO antes de correr ────────────────────────────────────────────────
-- Al encenderlo, las cuentas que hoy tienen `verificado = true` van a mostrar
-- el sello. Revisar que sean las que corresponden:
--
--   select p.nombre, p.verificado, v.dni, v.estado
--     from prestadores p
--     left join prestadores_verificacion v on v.prestador_id = p.id
--    where p.verificado;
--
-- Si aparece alguna que se verificó probando, apagarla con la RPC —el update
-- directo está revocado desde el fix del badge forjable:
--   select resolver_verificacion('<prestador_id>', false, 'prueba');

update public.config_app
   set valor = (
     select coalesce(
       nullif(array_to_string(array(
         select unnest(string_to_array(valor, ','))
         except select 'badgeVerificado'
       ), ','), ''),
       ''
     )
   )
 where clave = 'features_off';

notify pgrst, 'reload schema';

-- ── Verificación ───────────────────────────────────────────────────────
-- badgeVerificado NO debe aparecer:
select valor as features_apagadas from public.config_app where clave = 'features_off';
