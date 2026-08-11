// @ts-check
const { test, expect } = require('@playwright/test');

// Refactor 2026-08-03: esta suite tenía copia propia de los helpers de
// sesión y quedó desincronizada: el botón de login pasó a
// onclick="gateLogin(...)" el 2026-08-02 y acá seguía el selector viejo,
// que no matcheaba nada. Se reusan los helpers compartidos para el modal
// de T&C y la espera del Service Worker.
const { aceptarTycSiAparece, esperarSWListo, pasarGateTelefono } = require('./helpers');

// ─── Credenciales ────────────────────────────────────────────────────────────
const VECINO    = { email: 'vecino_test@pronet.test',    pw: 'Test1234!' };
const PRESTADOR = { email: 'prestador_test@pronet.test', pw: '12345678' };
// Números reservados para las cuentas de prueba. Uno por cuenta: hay un
// índice único sobre los últimos 10 dígitos, así que compartirlo haría
// fallar a la segunda cuenta que lo intente.
const TEL_VECINO    = '11 5000-0001';

// Título único por ejecución para encontrar el pedido entre runs
const TITULO_PEDIDO = `Test E2E – Revisión eléctrica ${Date.now()}`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function esperarLoginScreen(page) {
  // Antes de operar, dejar que el SW tome control: si recarga a mitad de
  // camino, vacía los inputs y el login nunca se dispara.
  await esperarSWListo(page);
  await page.waitForSelector('#login-screen:not(.hidden)', { timeout: 20000 });
  await page.waitForTimeout(300);
}

async function cerrarOverlays(page) {
  await page.evaluate(() => {
    // Tutorial overlay
    const tut = document.getElementById('tutorial-overlay');
    if (tut) { tut.classList.remove('show'); tut.style.display = 'none'; }
    // Onboarding/wizard
    document.querySelectorAll('.onboarding-overlay, .wizard-overlay').forEach(el => {
      el.style.display = 'none';
    });
    // Modal de zona (#zona-modal): cerrarlo si está activo
    const zm = document.getElementById('zona-modal');
    if (zm && (zm.classList.contains('active') || zm.style.display === 'flex')) {
      zm.classList.remove('active');
      zm.style.display = 'none';
    }
  });
  await page.waitForTimeout(200);
}

async function login(page, email, pw) {
  await esperarLoginScreen(page);
  const emailInput = page.locator('#login-email');
  const pwInput = page.locator('#login-pw');

  // Llenar con reintentos: a veces el fill no toma en la primera
  for (let attempt = 0; attempt < 3; attempt++) {
    await emailInput.click();
    await emailInput.fill(email);
    await pwInput.click();
    await pwInput.fill(pw);
    await page.waitForTimeout(300);

    // Verificar que los campos tienen valor
    const emailVal = await emailInput.inputValue();
    const pwVal = await pwInput.inputValue();
    if (emailVal && pwVal) break;
    await page.waitForTimeout(500);
  }

  await page.locator('button.btn-p[onclick*="gateLogin"]').click();
  // gateLogin abre el modal de T&C antes de llamar a loginWith().
  await aceptarTycSiAparece(page);
  await expect(page.locator('#login-screen')).toHaveClass(/hidden/, { timeout: 25000 });
  // Esperar que la sesión de Supabase esté lista antes de operar con datos
  await page.waitForFunction(() =>
    window._sb && window._sb.auth && typeof window._sb.auth.getSession === 'function'
  , { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);
  const session = await page.evaluate(async () => {
    if (!window._sb) return null;
    const { data } = await window._sb.auth.getSession();
    return data?.session?.user?.id || null;
  });
  if (!session) throw new Error(`Sesión Supabase no activa para ${email}`);
  await cerrarOverlays(page);
}

// Sin retries: los tests son secuenciales y mutan estado en Supabase
test.describe.configure({ retries: 0 });

// ─── Suite serial: cada test depende del anterior ────────────────────────────
test.describe.serial('PRONET — Ciclo de negocio completo', () => {

  // ── A. Vecino publica un pedido ───────────────────────────────────────────
  test('A. Vecino publica un pedido (3 pasos)', async ({ page }) => {
    // Capturar console.warn para diagnosticar errores de Supabase
    const warnings = [];
    page.on('console', msg => {
      if (msg.type() === 'warn' || msg.type() === 'error') warnings.push(msg.text());
    });

    await page.goto('/');
    await login(page, VECINO.email, VECINO.pw);

    // Ir a pedidos y abrir nuevo pedido
    await expect(page.locator('#nb-pedidos')).toBeVisible({ timeout: 10000 });
    await page.locator('#nb-pedidos').click();
    await expect(page.locator('#s-pedidos')).toHaveClass(/active/, { timeout: 8000 });

    const btnNuevo = page.locator('#s-pedidos button, #s-pedidos [onclick*="nuevo"]')
      .filter({ hasText: /nuevo|publicar/i }).first();
    await expect(btnNuevo).toBeVisible({ timeout: 5000 });
    await btnNuevo.click();
    await expect(page.locator('#s-nuevo-pedido')).toHaveClass(/active/, { timeout: 5000 });

    // ── Paso 1: título, descripción y rubro ──
    await expect(page.locator('#np-1')).toBeVisible({ timeout: 5000 });
    await cerrarOverlays(page);
    await page.locator('#np-titulo').fill(TITULO_PEDIDO);
    await page.locator('#np-desc').fill('Descripción de prueba para test automatizado E2E. El tablero disyuntor se activa al encender el aire.');
    // Seleccionar rubro Electricista explícitamente
    const rubroElec = page.locator('#np-1 .form-opt').filter({ hasText: /electricist/i }).first();
    if (await rubroElec.isVisible({ timeout: 3000 }).catch(() => false)) {
      await rubroElec.click();
    }
    await page.locator('button[onclick="npNext(2)"]').click();

    // ── Paso 2: zona y urgencia ──
    await expect(page.locator('#np-2')).toBeVisible({ timeout: 5000 });
    await cerrarOverlays(page);
    await page.locator('button[onclick="npNext(3)"]').click();

    // ── Paso 3: fotos (opcional) → publicar ──
    await expect(page.locator('#np-3')).toBeVisible({ timeout: 5000 });
    await cerrarOverlays(page);
    await page.locator('button[onclick="npFinalizar()"]').click();

    // Anti-fraude: publicar exige teléfono (una cuenta por número). Si la
    // cuenta todavía no lo tiene, npFinalizar() abre el modal en vez de
    // publicar, y al confirmarlo retoma la publicación sola. La primera
    // corrida lo completa; las siguientes no lo ven.
    await pasarGateTelefono(page, TEL_VECINO);

    // ── Éxito ──
    await expect(page.locator('#np-exito')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#np-exito')).toContainText('¡Pedido publicado!');

    // Verificar que el pedido se guardó remotamente (Supabase), no solo en localStorage
    const guardadoRemoto = await page.evaluate(async (titulo) => {
      if (!window._sb) return false;
      const { data } = await window._sb.from('pedidos').select('id').eq('titulo', titulo).limit(1);
      return !!(data && data.length > 0);
    }, TITULO_PEDIDO);
    if (!guardadoRemoto) {
      throw new Error(
        `El pedido se guardó solo en localStorage (Supabase INSERT bloqueado).\n` +
        `Warnings: ${warnings.join(' | ')}`
      );
    }
  });

  // ── B. Prestador ve el pedido y envía propuesta ───────────────────────────
  test('B. Prestador encuentra el pedido y envía propuesta', async ({ page }) => {
    await page.goto('/');
    await login(page, PRESTADOR.email, PRESTADOR.pw);

    // Esperar que el home del prestador cargue
    await expect(page.locator('#s-home')).toHaveClass(/active/, { timeout: 10000 });

    // El pedido se busca en la pantalla Pedidos, no en Inicio.
    // Inicio es un TABLERO: sólo lista pedidos cuando el prestador no tiene
    // nada pendiente, así que buscarlos ahí fallaba o no según el estado de
    // la cuenta. Los chips de rubro tampoco están en Inicio para el
    // prestador — su filtro fino vive acá.
    await page.locator('#nb-pedidos').click();
    await expect(page.locator('#s-pedidos')).toHaveClass(/active/, { timeout: 10000 });

    // Buscar el pedido Test E2E en la lista del prestador
    await expect(page.locator('#presto-lista .card').first()).toBeVisible({ timeout: 15000 });
    const cards = page.locator('#presto-lista .card');
    const n = await cards.count();
    let found = false;
    for (let i = 0; i < n; i++) {
      const txt = await cards.nth(i).textContent().catch(() => '');
      if (txt.includes('Test E2E')) {
        await cards.nth(i).click();
        found = true;
        break;
      }
    }
    expect(found, 'No se encontró el pedido Test E2E en la lista de Pedidos del prestador').toBe(true);

    // Detalle del pedido
    await expect(page.locator('#s-detalle-pedido')).toHaveClass(/active/, { timeout: 8000 });
    await expect(page.locator('#pd-titulo')).toContainText('Test E2E');

    // Botón "Enviar propuesta" (visible solo para prestadores)
    await expect(page.locator('#pd-cta-prestador')).toBeVisible({ timeout: 5000 });
    await page.locator('#pd-btn-proponer').click();

    // Pantalla de nueva propuesta
    await expect(page.locator('#s-nueva-propuesta')).toHaveClass(/active/, { timeout: 5000 });

    // Completar propuesta: precio fijo
    await page.locator('#np-precio').fill('15000');

    // Seleccionar disponibilidad "Esta semana"
    await page.locator('.form-opt[data-plazo="semana"]').click();

    // Enviar propuesta
    await page.locator('#np-enviar').click();

    // Estado propuesta enviada
    await expect(page.locator('#s-estado-propuesta')).toHaveClass(/active/, { timeout: 10000 });
    await expect(page.locator('#ep-title')).toContainText(/propuesta/i);
  });

  // ── C. Vecino elige al prestador ─────────────────────────────────────────
  test('C. Vecino elige la propuesta del prestador', async ({ page }) => {
    await page.goto('/');
    await login(page, VECINO.email, VECINO.pw);

    // Ir a pedidos
    await expect(page.locator('#nb-pedidos')).toBeVisible({ timeout: 10000 });
    await page.locator('#nb-pedidos').click();
    await expect(page.locator('#s-pedidos')).toHaveClass(/active/, { timeout: 8000 });

    // Esperar que la lista cargue
    await page.waitForTimeout(2000);
    await cerrarOverlays(page);

    // Abrir el pedido de esta ejecución directamente por título.
    // El botón "📬 N propuestas" requiere RLS de vecino sobre propuestas — no
    // es necesario para navegar al detalle. Usamos el top de la card (primer
    // div hijo de .ped-card) que siempre es clickeable → abrirDetallePedido.
    const card = page.locator('#s-pedidos .ped-card').filter({ hasText: /Test E2E/ }).first();
    await expect(card).toBeVisible({ timeout: 10000 });
    // El top es el primer div hijo directo de .ped-card; tiene cursor:pointer
    await card.locator('> div').first().click();

    // Detalle del pedido: esperar que las propuestas carguen
    await expect(page.locator('#s-detalle-pedido')).toHaveClass(/active/, { timeout: 8000 });
    await expect(page.locator('#pd-propuestas')).toBeVisible({ timeout: 5000 });

    // Registrar handler de diálogos ANTES del click (confirm + alert)
    page.on('dialog', dialog => dialog.accept());

    // Cerrar overlays antes de interactuar
    await cerrarOverlays(page);

    // Esperar que carguen los botones de propuesta
    const anyPropBtn = page.locator('.prop-select-btn').filter({ hasText: /elegir|chatear/i }).first();
    await expect(anyPropBtn).toBeVisible({ timeout: 15000 });

    const btnElegir = page.locator('.prop-select-btn').filter({ hasText: /elegir/i });
    const btnChatear = page.locator('.prop-select-btn').filter({ hasText: /chatear/i });

    const eligio = await btnElegir.count() > 0;
    if (eligio) {
      await btnElegir.first().click();
    } else {
      await btnChatear.first().click();
    }
    await expect(page.locator('#s-chat')).toHaveClass(/active/, { timeout: 15000 });

    // ── Que el chat se ABRA no alcanza ──────────────────────────────────────
    // Con el bug de elegir_propuesta la pantalla llegaba hasta acá igual de
    // contenta: propuesta 'elegida', pedido 'Cerrado' y el chat abierto. Lo
    // único que quedaba viejo era `chats_trabajo.estado`, y ese campo es el
    // que maneja TODOS los carteles (actualizarBannersChat hace un switch
    // sobre él). El trabajo quedaba sin forma de avanzar y el test en verde.
    // El log importa: si el flujo cae siempre en "Chatear", la verificación de
    // abajo no corre nunca y el test pasa sin probar el circuito que vino a
    // cubrir. Mejor verlo en la salida que suponerlo.
    console.log('[ciclo C] camino:', eligio ? 'Elegir → se verifica el chat' : 'Chatear (consulta) → no aplica');
    if (!eligio) return; // "Chatear" es una consulta: el chat no pasa a activo

    const estado = await page.evaluate(async () => {
      const { data } = await window._sb
        .from('chats_trabajo')
        .select('estado, propuestas!inner(estado), pedidos!inner(titulo)')
        .eq('propuestas.estado', 'elegida')
        .like('pedidos.titulo', '%Test E2E%')
        .order('ultimo_evento_at', { ascending: false })
        .limit(1);
      return data?.[0]?.estado ?? null;
    });

    expect(estado, 'no se encontró el chat de la propuesta elegida').not.toBeNull();
    expect(estado, 'la propuesta quedó elegida pero el chat no se activó').toBe('activo');
  });

});

// ══════════════════════════════════════════════════════════════════════════════
// D. La reseña le avisa al prestador
// ══════════════════════════════════════════════════════════════════════════════
// Chequeo de contrato, no de comportamiento: ejercitar `dejar_resena` de verdad
// exige un chat terminado y deja atrás una reseña, una notificación y el rating
// del prestador movido. Lo que hay que impedir es que el aviso vuelva a ser un
// paso del cliente — así estuvo, y 6 de 7 reseñas no avisaron nunca.
// El detalle de qué mira está en supabase-test-aviso-resena.sql.
test.describe('D · Reseña — el aviso vive en el RPC', () => {
  test('fn_test_aviso_resena: dejar_resena inserta la campanita y no hay lógica duplicada', async ({ page }) => {
    await page.goto('/');
    await login(page, VECINO.email, VECINO.pw);

    const { data, error } = await page.evaluate(async () => {
      const r = await window._sb.rpc('fn_test_aviso_resena');
      return { data: r.data, error: r.error?.message ?? null };
    });

    if (error) {
      throw new Error('RPC falló: ' + error + ' — ¿se corrió supabase-test-aviso-resena.sql?');
    }
    expect(data.versiones, 'no se encontró public.dejar_resena').toBeGreaterThan(0);
    expect(data.error, JSON.stringify(data)).toBeNull();
    expect(data.pass).toBe(true);
  });
});
