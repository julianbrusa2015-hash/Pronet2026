-- ═══ PRONET · descope de referidos (C24-04): apagar la regla anunciada ═══
--
-- loyalty_reglas es el catálogo que la pantalla "Ganar puntos" muestra como
-- formas de sumar. Tenía la regla id='referido' ("Referido completó su primer
-- trabajo", 800 pts), pero NO existe ninguna acreditación de puntos por
-- referido en el sistema: ni el signup guarda el referido ni hay trigger que
-- lo pague. O sea, se anunciaba un beneficio inexistente.
--
-- Por la decisión de producto de descartar por ahora los referidos-con-puntos
-- (C24-04), se apaga la regla para que deje de anunciarse. Se deja la fila
-- (activo=false) en vez de borrarla: si más adelante se construye la feature,
-- se reactiva con el valor que se defina.
--
-- Idempotente.

update public.loyalty_reglas set activo = false where id = 'referido';
