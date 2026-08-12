-- ═══════════════════════════════════════════════════════════════════════
-- Cobertura: los pedidos SIN comunidad los ve todo el mundo
-- ═══════════════════════════════════════════════════════════════════════
--
-- Encontrado al verificar la cobertura en vivo: acotar la cobertura a dos
-- comunidades dejaba el feed en CERO. No era un caso de borde — los 63
-- pedidos de la base tienen `zona = 'Escobar'`, la zona raíz, porque el alta
-- guardaba la zona de NAVEGACIÓN del dispositivo y su default es la ciudad
-- entera. Ninguno tiene comunidad ni barrio.
--
-- `zonas_cubiertas` expande hacia ABAJO: quien cubre "Puertos del Lago"
-- recibe los de sus barrios. Pero un pedido en la RAÍZ no está debajo de
-- ninguna comunidad, así que no lo cubría nadie que se hubiera acotado.
--
-- ── La decisión ──
-- Un pedido en la raíz no significa "es de toda la ciudad": significa QUE EL
-- VECINO NO DIJO DÓNDE. Esconderlo es castigar al prestador por un dato que
-- el otro no completó, y con el 100% de los pedidos así el efecto es vaciar
-- el feed. Se muestran a todos.
--
-- Es asimétrico a propósito: la cobertura acota lo que está clasificado, y
-- deja pasar lo que no. El día que los pedidos traigan comunidad —lo que
-- recién ahora es posible, porque el vecino puede elegirla— el filtro va a
-- ajustar solo, sin tocar esto.

begin;

-- Ojo con la raíz: hay DOS zonas de nivel 1, Escobar y Garín, que son
-- ciudades distintas. Sumarlas todas le mostraría a un prestador de Escobar
-- los pedidos sin clasificar de Garín. Se suma únicamente la raíz de las
-- zonas que el prestador declaró cubrir — la columna `zona` de zonas_arbol
-- ya trae resuelto ese ancestro.
create or replace function public.mi_cobertura()
returns text[] language sql stable security definer set search_path = public as $$
  with mias as (
    select coalesce(nullif(pr.zonas, '{}'), array_remove(array[pr.zona], null)) as z
      from public.perfiles pf
      join public.prestadores pr on pr.id = pf.prestador_id
     where pf.id = auth.uid()
  )
  select public.zonas_cubiertas(m.z)
         || array(select distinct za.zona
                    from public.zonas_arbol za
                   where za.nombre = any(m.z) and za.zona is not null)
    from mias m;
$$;

revoke all on function public.mi_cobertura() from public, anon;
grant execute on function public.mi_cobertura() to authenticated;

commit;

notify pgrst, 'reload schema';

-- Verificación: cada raíz tiene que quedar con sus propios pedidos.
select z.nombre as raiz,
       (select count(*) from public.pedidos p where p.zona = z.nombre) as pedidos_sin_clasificar,
       (select count(*) from public.prestadores pr where z.nombre = any(pr.zonas)) as prestadores
  from public.zonas_arbol z where z.nivel = 1 order by z.nombre;
