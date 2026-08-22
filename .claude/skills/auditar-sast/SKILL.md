---
name: auditar-sast
description: Análisis estático de seguridad del código buscando inyección, XSS, autenticación rota y secretos hardcodeados, bajo OWASP Top 10. Usar cuando el usuario pida auditar el código en busca de vulnerabilidades, revisar una ruta o archivo por seguridad, o hacer un SAST.
version: 1.0.0
---

# Análisis Estático de Seguridad (SAST)

Analiza la ruta o los archivos indicados. Si no se indica ninguno, auditá los
archivos principales del proyecto.

## Qué buscar

1. **Inyección** — SQL, comandos, plantillas. En PRONET la base se toca por
   PostgREST y RPCs, así que el vector real no es SQL crudo sino qué **columnas
   y filas** deja escribir el servidor.
2. **XSS** — `innerHTML` con datos que vengan del usuario o de la base sin pasar
   por `escHTML()`. Prestar atención especial a datos interpolados **dentro de
   atributos** (`onclick="fn('${x}')"`): escapar comillas simples no alcanza si
   el atributo va entre comillas dobles.
3. **Autenticación y autorización** — bypass, escalada de privilegios, sesiones.
4. **Secretos hardcodeados** — con la salvedad de abajo.
5. **Fugas de información** — errores crudos del servidor mostrados al usuario
   final (en pantallas de admin es UX, no seguridad).

## Entregable

Por cada hallazgo: **Vulnerabilidad · Archivo:línea · Impacto · Código de
remediación**. Ordenado por severidad real, no por categoría.

## Reglas de calidad — leer antes de reportar

**Medir, no suponer.** Un hallazgo sin verificar es una hipótesis. Si se puede
comprobar contra la base o el navegador, comprobalo antes de reportarlo. En la
auditoría del 2026-08-22, tres "hallazgos" leídos del código resultaron falsos
y dos problemas reales sólo aparecieron al ejecutar.

**Un GRANT permisivo no es un agujero si RLS lo cubre**, y al revés: RLS filtra
FILAS, no COLUMNAS. Una policy prolija sobre la fila propia no impide escribir
una columna que sólo debería tocar el servidor.

**Distinguir severidad de gravedad aparente.** Self-XSS ≠ XSS reflejado. Un
error crudo mostrado a un admin ≠ fuga de datos.

**No reportar como remediable lo que exige rediseñar la arquitectura.** Decirlo
igual, pero nombrado como lo que es.

## Salvedades específicas de PRONET

- **No existe `./src`.** Los archivos están en la raíz: `app.js`, `datos.js`,
  `config.js`, `sw.js`, `index.html`, `netlify.toml`, y los `.sql` de Supabase.
- **La anon key de `config.js` NO es un secreto filtrado.** Va en el cliente por
  diseño; lo que protege los datos es RLS. Reportarla es ruido.
- **Los tokens en `localStorage` no son un hallazgo accionable.** Es cómo
  funciona el SDK de Supabase y PRONET no tiene servidor propio que emita
  cookies `HttpOnly`. Lo accionable es reducir el daño de un XSS, no exigir otro
  modelo de auth.
- **Buena parte de la superficie de seguridad vive en la base, no en el JS.**
  Revisar los `.sql`: policies, `grant`/`revoke` por columna, y funciones
  `security definer`. Ahí estuvieron los problemas graves.
- **Los tests C14 a C18 (`tests/`) ya cubren** verificación de prestador,
  columnas de `prestadores` y `perfiles`, escrituras de loyalty y publicaciones.
  Correrlos antes de auditar a mano esas áreas.
