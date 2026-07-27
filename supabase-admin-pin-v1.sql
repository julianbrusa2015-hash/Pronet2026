-- ═══ PRONET · PIN de admin — verificación server-side ═══
-- Ejecutar en Supabase → SQL Editor. Idempotente.
--
-- Mueve el PIN de admin de app.js (visible en DevTools) a la tabla config_app.
-- La verificación ocurre en Postgres: el cliente solo envía el PIN ingresado
-- y recibe true/false — nunca el valor real.

-- ── 1. Guardar el PIN en config_app ─────────────────────────────────────────
insert into public.config_app (clave, valor, descripcion)
values ('admin_pin', '847291', 'PIN de acceso al panel de administración')
on conflict (clave) do update set valor = excluded.valor;

-- ── 2. Función de verificación server-side ───────────────────────────────────
create or replace function public.fn_verificar_pin_admin(p_pin text)
returns boolean language plpgsql security definer as $$
declare
  v_pin_guardado text;
  v_es_admin     boolean;
begin
  -- Verificar que el usuario autenticado es admin
  select exists(
    select 1 from public.perfiles
    where id = auth.uid() and 'admin' = any(roles)
  ) into v_es_admin;

  if not v_es_admin then
    return false;
  end if;

  -- Comparar PIN contra config_app — el cliente nunca ve el valor
  select valor into v_pin_guardado from public.config_app where clave = 'admin_pin';

  return v_pin_guardado is not null and v_pin_guardado = p_pin;
end;
$$;

-- ── 3. Verificación ──────────────────────────────────────────────────────────
select clave, descripcion from public.config_app where clave = 'admin_pin';
