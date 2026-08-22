---
name: modelar-amenazas
description: Genera una matriz STRIDE a partir de un diseño, arquitectura o feature — identifica flujos de datos, fronteras de confianza y contramedidas. Usar cuando el usuario pida modelar amenazas, analizar riesgos de una arquitectura o evaluar la seguridad de una feature antes de construirla.
version: 1.0.0
---

# Modelado de Amenazas (STRIDE)

A partir del archivo de diseño, la descripción de arquitectura o la feature
indicada.

## Método

1. **Identificar los flujos de datos** — quién manda qué a quién, y por dónde.
2. **Marcar las fronteras de confianza** — dónde un dato deja de ser controlado
   por nosotros. En PRONET las fronteras que importan son: navegador → PostgREST,
   navegador → Edge Function, y webhook de MercadoPago → Edge Function.
3. **Recorrer STRIDE** por cada flujo y frontera:

   | Letra | Amenaza | Pregunta guía |
   |---|---|---|
   | S | Suplantación | ¿Se puede actuar como otro usuario? |
   | T | Alteración | ¿Se puede modificar un dato que no le corresponde? |
   | R | Repudio | ¿Queda registro de quién hizo qué? |
   | I | Revelación | ¿Se ve información de terceros? |
   | D | Denegación | ¿Se puede saturar o bloquear? |
   | E | Elevación | ¿Se puede ganar permisos que no se tienen? |

4. **Contramedida por amenaza**, concreta y aplicable.

## Regla central

**La pregunta no es qué impide la interfaz, sino qué impide el servidor.**

Todo lo que viaja desde el navegador es dato del atacante: parámetros de una
RPC, campos de un update, flags. Si la única barrera es la UI, no hay barrera.

En la auditoría del 2026-08-22, los cinco problemas reales tenían esa forma: la
pantalla se comportaba bien y la base permitía otra cosa. El sello "verificado"
era forjable, `suspendido` se apagaba solo, el denunciado leía quién lo denunció,
y la duración de un banner pago la elegía el cliente.

## Preguntas que en PRONET rinden

- **¿Qué columnas escribe el cliente que debería escribir sólo el servidor?**
  Planes, verificación, moderación, reputación, contadores, vencimientos.
- **¿Qué ve una parte sobre la otra?** El caso testigo es la denuncia: el
  denunciado no puede saber quién lo reportó, porque el vecino ya le dio nombre,
  teléfono y dirección para contratarlo.
- **¿Un producto pago se puede obtener gratis o extender?** Duraciones, cupos,
  créditos e impulsos.
- **¿La función `security definer` valida lo que recibe?** Corre con permisos
  elevados: lo que no valida, lo regala.
- **¿Qué pasa si el usuario abandona la cuenta?** Los mecanismos que dependen de
  que el usuario vuelva fallan justo donde más harían falta.

## Entregable

Matriz con **Amenaza · Categoría STRIDE · Dónde · Impacto · Contramedida**, y una
recomendación de qué atacar primero por riesgo real, no por completitud.

Marcar explícitamente qué está **verificado** y qué es **hipótesis sin
comprobar**. Un modelo de amenazas que no distingue las dos cosas se lee como si
todo fuera igual de cierto.
