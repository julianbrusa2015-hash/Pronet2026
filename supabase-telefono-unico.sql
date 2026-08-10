-- ═══════════════════════════════════════════════════════════════════════
-- Un teléfono, una cuenta
-- ═══════════════════════════════════════════════════════════════════════
--
-- Sube el costo de armarse una segunda cuenta para autorreseñarse o para
-- pedir presupuestos y ver qué cotiza la competencia. No verifica que el
-- número sea tuyo —para eso hace falta un OTP, que cuesta plata— pero
-- impide reusar el mismo en dos cuentas, que es el 80% del beneficio a
-- costo cero.
--
-- Se normaliza antes de comparar: sin eso, "+54 9 11 4554-6665" y
-- "1145546665" son dos valores distintos para Postgres y la restricción no
-- serviría de nada.
--
-- Y no alcanza con sacar los símbolos: probado contra la base, quitar sólo
-- los no-dígitos deja pasar el duplicado, porque "5491145546665" y
-- "1145546665" siguen siendo distintos. Se toman los **últimos 10 dígitos**,
-- que es el número nacional argentino (código de área + abonado). Eso
-- absorbe el +54, el 9 de celular y el 0 de larga distancia.
--
-- Limitación conocida: el viejo prefijo "15" (011 15 4554-6665) queda como
-- un número distinto. Es cada vez más raro y desambiguarlo exige saber el
-- largo del código de área, que varía entre 2 y 4 dígitos.
--
-- Índice PARCIAL: los nulos y los strings vacíos quedan afuera a propósito.
-- El teléfono es opcional (hay un banner que lo pide, no un campo
-- obligatorio) y 5 de 12 perfiles no lo tienen. Un índice total trataría a
-- todos los vacíos como el mismo valor y dejaría entrar sólo a uno.
--
-- Antes de correr esto se limpió el número repetido en 4 cuentas de prueba
-- que compartían el del titular; sin eso la creación del índice falla.

begin;

-- Un '' es un teléfono ausente disfrazado. Se normaliza para que el índice
-- parcial no tenga que distinguir dos formas de "no hay dato".
update public.perfiles
   set telefono = null
 where btrim(coalesce(telefono, '')) = '';

drop index if exists public.idx_perfiles_telefono_unico;

create unique index idx_perfiles_telefono_unico
    on public.perfiles (right(regexp_replace(telefono, '\D', '', 'g'), 10))
 where btrim(coalesce(telefono, '')) <> '';

comment on index public.idx_perfiles_telefono_unico is
  'Un teléfono no puede estar en dos cuentas. Compara los últimos 10 dígitos: ignora +54, el 9 de celular, el 0 y los separadores.';

commit;
