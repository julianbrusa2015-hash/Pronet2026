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
    // Cerrar tutorial overlay
    const tut = document.getElementById('tutorial-overlay');
    if (tut) { tut.classList.remove('show'); tut.style.display = 'none'; }
    // Cerrar onboarding/wizard
    document.querySelectorAll('.onboarding-overlay, .wizard-overlay').forEach(el => {
      el.style.display = 'none';
    });
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
  await cerrarOverlays(page);
}

// Sin retries: los tests son secuenciales y mutan estado en Supabase
test.describe.configure({ retries: 0 });

// ─── Suite serial: cada test depende del anterior ────────────────────────────
test.describe.serial('PRONET — Ciclo de negocio completo', () => {

  // ── A. Vecino publica un pedido ───────────────────────────────────────────
  test('A. Vecino publica un pedido (3 pasos)', async ({ page }) => {
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
    // El rubro "Electricista" ya está seleccionado por defecto (.on)
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
  });

  // ── B. Prestador ve el pedido y envía propuesta ───────────────────────────
  test('B. Prestador encuentra el pedido y envía propuesta', async ({ page }) => {
    await page.goto('/');
    await login(page, PRESTADOR.email, PRESTADOR.pw);

    // Esperar que el feed cargue pedidos
    await expect(page.locator('#home-feed-container .card').first()).toBeVisible({ timeout: 20000 });

    // Tomar el pedido más reciente (primero del feed o el que tiene nuestro título)
    const todasLasCards = page.locator('#home-feed-container .card');
    const count = await todasLasCards.count();
    let targetCard = todasLasCards.first();
    for (let i = 0; i < count; i++) {
      const txt = await todasLasCards.nth(i).textContent();
      if (txt && txt.includes('Test E2E')) { targetCard = todasLasCards.nth(i); break; }
    }
    await targetCard.click();

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

    // Botón "Elegir" (solo aparece si el pedido no fue cerrado aún)
    const btnElegir = page.locator('.prop-select-btn').filter({ hasText: /elegir/i });
    const btnChatear = page.locator('.prop-select-btn').filter({ hasText: /chatear/i });

    if (await btnElegir.count() > 0) {
      await btnElegir.first().click();
      await expect(page.locator('#s-chat')).toHaveClass(/active/, { timeout: 15000 });
    } else {
      await expect(btnChatear.first()).toBeVisible({ timeout: 5000 });
      await btnChatear.first().click();
      await expect(page.locator('#s-chat')).toHaveClass(/active/, { timeout: 15000 });
    }
  });

});
