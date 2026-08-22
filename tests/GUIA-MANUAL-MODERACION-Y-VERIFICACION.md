# Guía manual: moderación y verificación de DNI

Para hacer a mano, en el celular o en el navegador, contra
`https://pronetprueba.netlify.app`.

Necesitás **tres sesiones distintas**. Lo más cómodo es:
- Chrome normal → cuenta **vecino**
- Chrome incógnito → cuenta **prestador**
- Otro navegador (Edge/Firefox) → cuenta **admin**

Si usás la misma ventana y vas cerrando sesión, también funciona, pero es más
lento y es fácil confundirse de rol.

---

## Circuito A · Moderación (denuncia)

### A1. El vecino denuncia

1. Entrar como **vecino**.
2. Ir a un pedido que tenga un prestador asignado, o a un chat de trabajo.
3. Buscar la opción de **denunciar** (🚩 / "Reportar").
4. Elegir un motivo y escribir un detalle **reconocible**, por ejemplo:
   `Prueba manual <tu nombre> <fecha> — desestimar`.
5. Enviar.

**Qué tenés que ver:** confirmación de que la denuncia se envió.

**Qué NO tenés que ver:** que el prestador denunciado reciba aviso de quién lo
denunció. La denuncia es hacia el equipo, no hacia la otra parte.

### A2. El admin la ve

6. Entrar como **admin** → Panel → **🛡️ Moderación**.
7. Verificar en los contadores de arriba que **Pendientes** subió en 1.
8. Buscar tu denuncia por el texto que escribiste.

**Qué tenés que ver en la tarjeta:**
- El motivo y el detalle completos
- **Quién denunció** y **a quién** (los dos nombres, no solo uno)
- La antigüedad ("Hace X min")
- Estado `Pendiente`

> Esto último es lo que ya falló una vez: por una FK rota el panel mostraba a
> quién denunciaron pero no quién. Si ves un nombre vacío o un "—", es una
> regresión de ese bug.

### A3. El admin resuelve

9. Tocar **Desestimar** (o la acción que corresponda).
10. La tarjeta tiene que pasar a `Desestimada` y salir de Pendientes.
11. Recargar la pantalla y confirmar que el estado quedó guardado, no solo
    pintado en pantalla.

### A4. Verificar que no hay fuga

12. Volver a la sesión del **vecino**: la denuncia no debería ser editable ni
    volver a aparecer como pendiente.
13. Entrar como **prestador** denunciado: no debería poder ver la denuncia ni
    quién la hizo.

### A5. Limpiar

14. Como admin, borrar la denuncia de prueba si el panel lo permite.

> **Ojo:** hoy hay denuncias de prueba acumuladas en producción de corridas
> automáticas anteriores (el test C10 no limpia lo que crea). Conviene
> revisarlas y borrar las que digan "Test E2E".

---

## Circuito B · Verificación por DNI

Lo que se está probando de verdad: **que el badge "verificado" no se pueda
encender sin que un admin haya mirado.** El badge es una promesa al vecino.

### B1. El prestador declara sus datos

1. Entrar como **prestador**.
2. Ir a **Perfil → Editar perfil**.
3. Bajar hasta el bloque de **verificación**.
4. Completar: nombre completo, DNI, dirección.
5. Guardar.

**Qué tenés que ver:** el chip de estado pasa a **"En revisión"** (amarillo).

**Qué NO tenés que ver:** el badge ✓ Verificado encendido en tu perfil público.
Completar el formulario no verifica nada.

6. **Comprobalo**: abrí tu propio perfil como lo ve un vecino (o desde otra
   sesión). No tiene que aparecer el sello.

### B2. El admin lo ve en la cola

7. Entrar como **admin** → Panel → **Verificaciones**.
8. El badge con el número de pendientes tiene que haber subido.
9. Buscar la solicitud.

**Qué tenés que ver en la tarjeta:** nombre del prestador, rubro, zona, y los
tres datos declarados (nombre completo, DNI, dirección).

### B3. Probar el rechazo primero

10. Tocar **Rechazar**. Escribir un motivo, por ejemplo `Prueba de rechazo`.
11. Volver a la sesión del **prestador** y recargar el perfil.

**Qué tenés que ver:** chip **"Rechazado"** (rojo) y el motivo que escribiste.
El prestador tiene que poder leer por qué se lo rechazaron.

12. Confirmar que el badge público sigue apagado.

### B4. Probar la aprobación

13. Como **admin**, filtrar por `pendiente` — ya no está.
14. Para volver a probar el alta hay que borrar la solicitud resuelta desde el
    panel de admin (el prestador ya no puede editarla; ver B5).
15. Repetir B1, y esta vez tocar **✓ Verificar**.

**Qué tenés que ver:**
- Chip **"✓ Verificado"** (verde) en el perfil del prestador
- El **sello visible en el perfil público**, el que ve el vecino
- En el panel admin, la solicitud con el filtro `verificado`

### B5. El límite importante

16. Como **prestador** con la solicitud ya resuelta, intentar cambiar el DNI y
    guardar de nuevo.

**Qué tenés que ver:** un error que diga que ya fue revisada y que escriba a
soporte. **No** tiene que dejarte cambiarlo.

> Esto es a propósito: si un prestador pudiera reeditar después de aprobado,
> podría pasar la revisión con un DNI y después cambiarlo por otro.

### B6. DNI duplicado

17. Con **otra cuenta de prestador**, cargar el **mismo DNI**.

**Qué tenés que ver:** `Ese DNI ya está registrado en otra cuenta.`

Un DNI = una cuenta. Es la misma lógica que el antifraude por teléfono.

---

## Qué reportar si algo falla

Anotá para cada problema:
- En qué paso (A3, B5, etc.)
- Con qué rol estabas
- Qué esperabas y qué pasó
- Si hay error en la consola del navegador (F12 → Console)

Los que más importan, en orden:
1. El badge ✓ se enciende sin que un admin apruebe → **crítico**, el sello miente
2. Un prestador puede reeditar una solicitud ya aprobada → **crítico**
3. El admin no ve quién denunció → **grave**, moderación a ciegas
4. Un DNI repetido entra igual → **grave**, rompe el antifraude
5. Un rechazo no muestra el motivo al prestador → **UX**, no es de seguridad
