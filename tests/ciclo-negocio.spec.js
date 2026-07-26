// @ts-check
const { test, expect } = require('@playwright/test');

// ─── Credenciales ────────────────────────────────────────────────────────────
const VECINO    = { email: 'vecino_test@pronet.test',    pw: 'Test1234!' };
const PRESTADOR = { email: 'prestador_test@pronet.test', pw: 'Test1234!' };

// Título único por ejecución para encontrar el pedido entre runs
const TITULO_PEDIDO = `Test E2E – Revisión eléctrica ${Date.now()}`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function esperarLoginScreen(page) {
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

  await page.locator('button.btn-p[onclick*="loginWith"]').click();
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

    // Clicar la categoría "Electricistas" para filtrar y forzar recarga del feed
    const btnElectricistas = page.locator('#s-home .rubro, #s-home button')
      .filter({ hasText: /electricista/i }).first();
    if (await btnElectricistas.isVisible({ timeout: 5000 }).catch(() => false)) {
      await btnElectricistas.click();
      await page.waitForTimeout(2000);
    }

    // Buscar el pedido Test E2E en el feed filtrado
    await expect(page.locator('#home-feed-container .card').first()).toBeVisible({ timeout: 15000 });
    const cards = page.locator('#home-feed-container .card');
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
    expect(found, 'No se encontró el pedido Test E2E en el feed de Electricistas').toBe(true);

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

    // Esperar que la lista de pedidos cargue
    await page.waitForTimeout(2000);
    await cerrarOverlays(page);

    // Buscar el botón "propuesta" del pedido más reciente con nuestro título
    // Los pedidos están en el feed de #s-pedidos, cada uno con un botón "Ver y comparar"
    const timestamp = TITULO_PEDIDO.split(' ').pop();
    const btnPropuesta = page.locator('#s-pedidos button')
      .filter({ hasText: /propuesta/i }).first();
    await expect(btnPropuesta).toBeVisible({ timeout: 10000 });
    await btnPropuesta.click();

    // Detalle con propuestas recibidas
    await expect(page.locator('#s-detalle-pedido')).toHaveClass(/active/, { timeout: 8000 });
    await expect(page.locator('#pd-propuestas')).toBeVisible({ timeout: 5000 });

    // Registrar handler de diálogos ANTES del click (confirm + alert)
    page.on('dialog', dialog => dialog.accept());

    // Cerrar zona modal si está abierto (bloquea interacciones)
    await cerrarOverlays(page);

    // Esperar que las propuestas carguen (async) antes de buscar botones
    const anyPropBtn = page.locator('.prop-select-btn').filter({ hasText: /elegir|chatear/i }).first();
    await expect(anyPropBtn).toBeVisible({ timeout: 10000 });

    const btnElegir = page.locator('.prop-select-btn').filter({ hasText: /elegir/i });
    const btnChatear = page.locator('.prop-select-btn').filter({ hasText: /chatear/i });

    if (await btnElegir.count() > 0) {
      await btnElegir.first().click();
      await expect(page.locator('#s-chat')).toHaveClass(/active/, { timeout: 15000 });
    } else {
      await btnChatear.first().click();
      await expect(page.locator('#s-chat')).toHaveClass(/active/, { timeout: 15000 });
    }
  });

});
