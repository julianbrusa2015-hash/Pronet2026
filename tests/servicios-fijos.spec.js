// @ts-check
// Servicios fijos (trabajo periódico: jardinero, piletero, etc.) — agregado
// 2026-08-23/24.
//
// Cubre:
//   SF-1 · el vecino cierra la relación calificando (no el chat, no el
//          prestador) y el registro queda "Finalizado" para las dos partes,
//          en vez de desaparecer.
//   SF-2 · si el prestador da de baja, el vecino recibe una notificación.
//   SF-3 · el banner de "7 días sin actividad → el vecino toma el cierre"
//          (pensado para un trabajo puntual que el prestador dejó sin
//          marcar como terminado) NO debe aparecer en un servicio fijo —
//          ahí la inactividad es normal y el vecino ya tiene su propia
//          salida ("Cerrar y calificar" desde Mis servicios fijos).
//   SF-4 · el prestador no ve nada de la sección "Entre Vecinos" en su
//          perfil — su oficio pasa por "Mis avisos en Servicios".
//   SF-5 · el FAB "nuevo chat" de Mensajes (lleva a buscar un prestador)
//          está oculto para el prestador, visible para el vecino.
//
// Corre contra: https://pronetprueba.netlify.app
const { test, expect } = require('@playwright/test');
const H = require('./helpers');

async function sqlAdmin(sql) {
  const pat = process.env.SUPABASE_PAT, ref = process.env.SUPABASE_PROJECT_REF;
  if (!pat || !ref) return { skip: true };
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0, 300)}`);
  return JSON.parse(txt);
}

/** Arma pedido recurrente + propuesta + la elige (crea servicio fijo + chat),
 *  todo por el camino real: RPCs, no INSERT directo a servicios_fijos. */
async function crearServicioFijo(page, { precio, rubro, prestadorId }) {
  const r = await page.evaluate(async ({ precio, rubro, prestadorId }) => {
    const sb = window._sb;
    const uid = (await sb.auth.getUser()).data.user.id;
    const { data: pedido, error: e1 } = await sb.from('pedidos').insert({
      usuario_id: uid, titulo: 'Test E2E – servicios fijos', rubro,
      modalidad: 'recurrente', frecuencia_veces: 1, frecuencia_periodo: 'semana',
      estado: 'Publicado', urgencia: 'flexible', descripcion: 'test permanente',
    }).select('id').single();
    if (e1) return { error: 'pedido: ' + e1.message };
    return { pedidoId: pedido.id };
  }, { precio, rubro, prestadorId });
  if (r.error) throw new Error(r.error);

  const propRows = await sqlAdmin(`
    insert into public.propuestas (pedido_id, prestador_id, precio, mensaje, estado, plazo)
    values ('${r.pedidoId}', '${prestadorId}', ${precio}, 'test permanente', 'pendiente', 'A convenir')
    returning id;`);
  const propuestaId = propRows[0].id;

  const r2 = await page.evaluate(async (propuestaId) => {
    const sb = window._sb;
    const r1 = await sb.rpc('elegir_propuesta', { p_propuesta_id: propuestaId });
    const r2 = await sb.rpc('abrir_chat_propuesta', { p_propuesta_id: propuestaId });
    return { r1: r1.data, r2: r2.data, e1: r1.error?.message, e2: r2.error?.message };
  }, propuestaId);
  if (r2.e1 || r2.e2) throw new Error('elegir/abrir: ' + (r2.e1 || r2.e2));

  return { pedidoId: r.pedidoId, propuestaId, chatId: r2.r2, servicioFijoId: r2.r1.servicio_fijo_id };
}

/** Lee la fila de "Mis servicios fijos"/"Mis clientes fijos" identificada por
 *  un precio único — las filas ya finalizadas no tienen botón, así que no
 *  hay un id enganchable en el DOM y hace falta un texto distintivo. */
async function leerFilaPorPrecio(page, precioTxt) {
  // renderServiciosFijos() es async (fetch + una consulta extra a
  // perfiles_publicos); irA() sólo espera a que la pantalla quede
  // "active", no a que termine de cargar. Sin esto, una corrida rápida
  // puede leer #sf-lista todavía en "⏳ Cargando…".
  await page.waitForFunction(
    () => !(document.getElementById('sf-lista')?.textContent || '').includes('Cargando'),
    { timeout: 10000 }
  ).catch(() => {});
  return page.evaluate((precioTxt) => {
    const cards = [...document.querySelectorAll('#sf-lista > div')];
    const card = cards.find(c => c.textContent && c.textContent.includes(precioTxt));
    if (!card) return null;
    return {
      finalizado: card.textContent.includes('Finalizado'),
      boton: card.querySelector('button')?.textContent.trim() || null,
    };
  }, precioTxt);
}

test.describe.serial('Servicios fijos', () => {
  test.skip(!process.env.SUPABASE_PAT, 'Necesita SUPABASE_PAT');

  /** @type {string} */ let vecinoId;
  /** @type {string} */ let prestadorId;
  /** @type {{pedidoId:string, propuestaId:string, chatId:string, servicioFijoId:string, precioTxt?:string}} */ let sfA; // lo cierra el vecino
  /** @type {{pedidoId:string, propuestaId:string, chatId:string, servicioFijoId:string, precioTxt?:string}} */ let sfB; // lo da de baja el prestador
  /** @type {{pedidoId:string, propuestaId:string, chatId:string, servicioFijoId:string}} */ let sfC; // para el banner de inactividad

  test('Preparar: resolver ids de las cuentas de prueba', async ({ page }) => {
    await page.goto('/');
    const rows = await sqlAdmin(`
      select u.email, p.id as user_id, p.prestador_id
      from public.perfiles p join auth.users u on u.id = p.id
      where u.email in ('vecino_test@pronet.test','prestador_test@pronet.test');`);
    vecinoId = rows.find(r => r.email === 'vecino_test@pronet.test').user_id;
    prestadorId = rows.find(r => r.email === 'prestador_test@pronet.test').prestador_id;
    expect(vecinoId).toBeTruthy();
    expect(prestadorId).toBeTruthy();
  });

  test('Preparar: crear SF-A, SF-B y SF-C', async ({ page }) => {
    // Precio único por corrida: un pedido borrado no cascadea a
    // servicios_fijos (on delete set null, a propósito — ver
    // supabase-servicios-fijos.sql), así que una corrida anterior puede
    // dejar una fila huérfana con el mismo precio y el test de más abajo
    // encuentra esa en vez de la nueva.
    const base = 91000 + (Date.now() % 8000);
    await H.login(page, 'vecino');
    sfA = await crearServicioFijo(page, { precio: base, rubro: 'Test-SF', prestadorId });
    sfB = await crearServicioFijo(page, { precio: base + 1, rubro: 'Test-SF', prestadorId });
    sfC = await crearServicioFijo(page, { precio: base + 2, rubro: 'Test-SF', prestadorId });
    sfA.precioTxt = base.toLocaleString('es-AR');
    sfB.precioTxt = (base + 1).toLocaleString('es-AR');
    console.log('[SF] SF-A:', sfA.servicioFijoId, 'SF-B:', sfB.servicioFijoId, 'SF-C:', sfC.servicioFijoId);
  });

  test('SF-1a · El chat de un servicio fijo no ofrece "terminar"; muestra la nota', async ({ page }) => {
    await H.login(page, 'prestador');
    await page.evaluate((pid) => window.abrirChat(pid), sfA.propuestaId);
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => ({
      terminar: document.getElementById('chat-terminar-banner')?.offsetParent !== null,
      nota: document.getElementById('chat-servicio-fijo-nota')?.offsetParent !== null,
    }));
    expect(r.terminar).toBe(false);
    expect(r.nota).toBe(true);
  });

  test('SF-1b · El vecino cierra y califica SF-A: la reseña se guarda y el servicio pasa a terminado', async ({ page }) => {
    await H.login(page, 'vecino');
    await H.irA(page, 's-servicios-fijos');
    const boton = page.locator(`button[onclick*="${sfA.servicioFijoId}"]`);
    await expect(boton).toBeVisible({ timeout: 10000 });
    page.once('dialog', d => d.accept());
    await boton.click();
    await page.waitForTimeout(800);
    const abierta = await page.evaluate(() => !document.getElementById('s-resena')?.classList.contains('hidden'));
    expect(abierta).toBe(true);

    await page.locator('#stars-big .star-big').nth(4).click();
    await page.evaluate(() => window.enviarResena());
    await page.waitForTimeout(2500);

    const estado = await sqlAdmin(`select estado from public.servicios_fijos where id='${sfA.servicioFijoId}';`);
    const resena = await sqlAdmin(`select puntos from public.resenas where chat_id in (select id from public.chats_trabajo where propuesta_id='${sfA.propuestaId}') order by creado desc limit 1;`);
    expect(estado[0].estado).toBe('terminado');
    expect(resena[0].puntos).toBe(5);
  });

  test('SF-1c · SF-A aparece "Finalizado" y sin botón para el vecino y para el prestador', async ({ page }) => {
    await H.login(page, 'vecino');
    await H.irA(page, 's-servicios-fijos');
    const filaVecino = await leerFilaPorPrecio(page, sfA.precioTxt);
    expect(filaVecino?.finalizado).toBe(true);
    expect(filaVecino?.boton).toBeNull();

    await H.login(page, 'prestador');
    await H.irA(page, 's-servicios-fijos');
    const filaPrestador = await leerFilaPorPrecio(page, sfA.precioTxt);
    expect(filaPrestador?.finalizado).toBe(true);
    expect(filaPrestador?.boton).toBeNull();
  });

  test('SF-2 · El prestador da de baja SF-B: queda terminado y el vecino recibe la notificación', async ({ page }) => {
    await H.login(page, 'prestador');
    await H.irA(page, 's-servicios-fijos');
    page.once('dialog', d => d.accept());
    const boton = page.locator(`button[onclick*="${sfB.servicioFijoId}"]`);
    await expect(boton).toBeVisible({ timeout: 10000 });
    await boton.click();
    await page.waitForTimeout(2000);

    const estado = await sqlAdmin(`select estado from public.servicios_fijos where id='${sfB.servicioFijoId}';`);
    const notif = await sqlAdmin(`
      select tipo, titulo from public.notificaciones
      where usuario_id='${vecinoId}' and tipo='servicio_fijo_baja'
      order by creado desc limit 1;`);
    expect(estado[0].estado).toBe('terminado');
    expect(notif.length).toBeGreaterThan(0);
    expect(notif[0].titulo).toContain('dio de baja');
  });

  test('SF-3 · El banner de "7 días sin actividad" NO aparece en un chat de servicio fijo', async ({ page }) => {
    // Prove-It del bug del 2026-08-24: el banner pensado para un trabajo
    // puntual que el prestador dejó sin marcar como terminado se disparaba
    // también acá, con un botón que cerraba el chat sin tocar
    // servicios_fijos (quedaba "activo" huérfano). Se fuerza la
    // inactividad por SQL en vez de esperar 7 días de verdad.
    await sqlAdmin(`update public.chats_trabajo set ultimo_evento_at = now() - interval '10 days' where id = '${sfC.chatId}';`);
    await H.login(page, 'vecino');
    await page.evaluate((pid) => window.abrirChat(pid), sfC.propuestaId);
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => ({
      cierreInactividad: document.getElementById('chat-vecino-cierre-banner')?.offsetParent !== null,
      nota: document.getElementById('chat-servicio-fijo-nota')?.offsetParent !== null,
    }));
    expect(r.cierreInactividad).toBe(false);
    expect(r.nota).toBe(true);
  });

  test('SF-4 · El prestador no ve nada de "Entre Vecinos" en su perfil, pero sí "Mis avisos en Servicios"', async ({ page }) => {
    await H.login(page, 'prestador');
    await H.irA(page, 's-miperfil');
    const r = await page.evaluate(() => ({
      seccionEntreVecinos: document.getElementById('seccion-promarket-perfil')?.style.display,
      misAvisosServicios: document.getElementById('menu-pubs-prestador')?.style.display,
    }));
    expect(r.seccionEntreVecinos).toBe('none');
    expect(r.misAvisosServicios).not.toBe('none');
  });

  test('SF-5 · El FAB de Mensajes está oculto para el prestador y visible para el vecino', async ({ page }) => {
    await H.login(page, 'prestador');
    await H.irA(page, 's-chats');
    const fabPrestador = await page.evaluate(() => document.getElementById('chats-fab')?.style.display);
    expect(fabPrestador).toBe('none');

    await H.login(page, 'vecino');
    await H.irA(page, 's-chats');
    const fabVecino = await page.evaluate(() => document.getElementById('chats-fab')?.style.display);
    expect(fabVecino).not.toBe('none');
  });

  test.afterAll(async () => {
    // Orden importa: borrar el pedido primero (deja servicios_fijos.pedido_id
    // en null por el "on delete set null" a propósito de esa tabla) y recién
    // ahí purgar lo que quedó huérfano — si no, sobreviven filas fantasma
    // con el rubro de prueba que confunden a la próxima corrida.
    await sqlAdmin(`delete from public.pedidos where titulo like 'Test E2E – servicios fijos%';`).catch(() => {});
    await sqlAdmin(`delete from public.servicios_fijos where rubro = 'Test-SF' and pedido_id is null;`).catch(() => {});
  });
});
