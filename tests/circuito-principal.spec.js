// @ts-check
const { test, expect } = require('@playwright/test');

// ─── Credenciales de test ────────────────────────────────────────────────────
// Opción A: variables de entorno  TEST_VECINO_EMAIL / TEST_VECINO_PW
// Opción B: crear vecino_test@pronet.test y prestador_test@pronet.test en Supabase
const VECINO = {
  email: process.env.TEST_VECINO_EMAIL    || 'vecino_test@pronet.test',
  pw:    process.env.TEST_VECINO_PW       || 'Test1234!',
};
const PRESTADOR = {
  email: process.env.TEST_PRESTADOR_EMAIL || 'prestador_test@pronet.test',
  pw:    process.env.TEST_PRESTADOR_PW    || 'Test1234!',
};
// Flag: si las cuentas no fueron creadas, los tests de login se saltan
const TIENE_CUENTAS_TEST = process.env.TEST_VECINO_EMAIL != null
  || process.env.TEST_CUENTAS_OK === 'true';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Espera que el DOM de la app esté listo (anti-flash resuelto + s-home existe) */
async function esperarDOM(page) {
  await page.waitForFunction(() =>
    document.querySelector('#s-home') !== null
    && !document.querySelector('#anti-flash-login'),
    { timeout: 20000 }
  );
}

/** El login-screen visible = app lista para login (no hay sesión activa) */
async function esperarLoginScreen(page) {
  await page.waitForSelector('#login-screen:not(.hidden)', { timeout: 20000 });
  await expect(page.locator('#login-screen')).toBeVisible();
  // Pequeña pausa para que los event listeners estén activos
  await page.waitForTimeout(300);
}

/** Login con email/contraseña y espera la pantalla home */
async function login(page, email, pw) {
  await esperarLoginScreen(page);
  await page.locator('#login-email').fill(email);
  await page.locator('#login-pw').fill(pw);
  // Botón de login (usa onclick="loginWith" para no confundir con el de recupero)
  await page.locator('button.btn-p[onclick*="loginWith"]').click();
  // Esperar que el login-screen desaparezca (login ok) o error visible
  await page.waitForFunction(() => {
    const ls = document.getElementById('login-screen');
    const err = document.getElementById('login-error');
    return (ls && ls.classList.contains('hidden')) ||
           (err && err.style.display !== 'none' && err.textContent.length > 0);
  }, { timeout: 20000 });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('PRONET — Circuito principal', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await esperarDOM(page);
  });

  // ── 1. Home carga correctamente ──────────────────────────────────────────
  test('1. Home carga con rubros y feed visible', async ({ page }) => {
    // El home existe y las categorías están en el HTML estático
    await expect(page.locator('#s-home')).toBeAttached();
    await expect(page.locator('.rubro').first()).toBeVisible({ timeout: 5000 });
    // El feed container existe (puede estar detrás del login-screen, que también es correcto)
    await expect(page.locator('#home-feed-container')).toBeAttached();
    // Esperar que el feed cargue cards o mensaje (Supabase responde en ≤20s)
    await expect(
      page.locator('#home-feed-container .card, #home-feed-container div[style*="padding"]').first()
    ).toBeAttached({ timeout: 20000 });
  });

  // ── 2. Validaciones de formulario de login ───────────────────────────────
  test('2. Login: rechaza campos vacíos y email inválido', async ({ page }) => {
    await esperarLoginScreen(page);

    // Intentar login con campos vacíos
    await page.locator('button.btn-p[onclick*="loginWith"]').click();
    await expect(page.locator('#login-error')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#login-error')).toContainText(/completá|email|contraseña/i);

    // Email mal formateado
    await page.locator('#login-email').fill('noesvalido');
    await page.locator('#login-pw').fill('algo');
    await page.locator('button.btn-p[onclick*="loginWith"]').click();
    await expect(page.locator('#login-error')).toContainText(/formato/i);
  });

  // ── 3. Recupero de contraseña ────────────────────────────────────────────
  test('3. Recupero de contraseña: muestra error con email vacío', async ({ page }) => {
    await esperarLoginScreen(page);
    await page.locator('.login-link:has-text("Olvidaste")').click();
    await expect(page.locator('#recover-panel')).toBeVisible({ timeout: 5000 });
    // Enviar sin email
    await page.locator('#recover-panel .btn-p').click();
    await expect(page.locator('#recover-error')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#recover-error')).toContainText(/email/i);
  });

  // ── 4. Login como vecino ─────────────────────────────────────────────────
  test('4. Login vecino exitoso y login-screen desaparece', async ({ page }) => {
    test.skip(!TIENE_CUENTAS_TEST, 'Crear cuentas test en Supabase o definir TEST_VECINO_EMAIL');
    await login(page, VECINO.email, VECINO.pw);
    // Si login fue exitoso, login-screen tiene clase hidden
    await expect(page.locator('#login-screen')).toHaveClass(/hidden/, { timeout: 10000 });
    // El home feed se renderiza
    await expect(page.locator('#s-home')).toBeVisible();
  });

  // ── 5. Buscar prestadores ────────────────────────────────────────────────
  test('5. Buscar prestadores: pantalla de búsqueda accesible', async ({ page }) => {
    test.skip(!TIENE_CUENTAS_TEST, 'Crear cuentas test en Supabase o definir TEST_VECINO_EMAIL');
    await login(page, VECINO.email, VECINO.pw);
    // Esperar que el nav esté interactivo
    await expect(page.locator('#nb-buscar')).toBeVisible({ timeout: 10000 });
    await page.locator('#nb-buscar').click();
    await expect(page.locator('#s-buscar')).toHaveClass(/active/, { timeout: 8000 });
    // La pantalla de búsqueda cargó y tiene contenido
    await expect(page.locator('#s-buscar')).toBeVisible();
  });

  // ── 6. Publicar pedido (vecino) ──────────────────────────────────────────
  test('6. Vecino puede navegar a Nuevo Pedido', async ({ page }) => {
    test.skip(!TIENE_CUENTAS_TEST, 'Crear cuentas test en Supabase o definir TEST_VECINO_EMAIL');
    await login(page, VECINO.email, VECINO.pw);
    await expect(page.locator('#nb-pedidos')).toBeVisible({ timeout: 10000 });
    await page.locator('#nb-pedidos').click();
    await expect(page.locator('#s-pedidos')).toHaveClass(/active/, { timeout: 8000 });
    // Buscar botón de nuevo pedido
    const btnNuevo = page.locator('#s-pedidos button, #s-pedidos [onclick*="nuevo"]')
      .filter({ hasText: /nuevo|publicar/i }).first();
    await expect(btnNuevo).toBeVisible({ timeout: 5000 });
    await btnNuevo.click();
    await expect(page.locator('#s-nuevo-pedido')).toHaveClass(/active/, { timeout: 5000 });
  });

  // ── 7. Panel admin solo accesible para admin ─────────────────────────────
  test('7. Panel admin no se abre para vecino normal', async ({ page }) => {
    test.skip(!TIENE_CUENTAS_TEST, 'Crear cuentas test en Supabase o definir TEST_VECINO_EMAIL');
    await login(page, VECINO.email, VECINO.pw);
    await expect(page.locator('#nb-perfil')).toBeVisible({ timeout: 10000 });
    await page.locator('#nb-perfil').click();
    await expect(page.locator('#s-miperfil')).toHaveClass(/active/, { timeout: 8000 });
    // Tocar "version-tap"
    const versionTap = page.locator('#version-tap');
    if (await versionTap.isVisible()) {
      await versionTap.click();
      // El modal de PIN NO debe aparecer (usuario no es admin)
      await page.waitForTimeout(800);
      const modal = page.locator('#admin-pin-modal');
      const display = await modal.evaluate(el => getComputedStyle(el).display);
      expect(display).toBe('none');
    }
  });

  // ── 8. Validaciones de registro ──────────────────────────────────────────
  test('8. Registro: rechaza nombre sin apellido y contraseña corta', async ({ page }) => {
    await esperarLoginScreen(page);
    // Abrir modal de registro
    await page.locator('.login-register span').click();
    await expect(page.locator('#registro-modal')).toBeVisible({ timeout: 5000 });

    // Solo nombre sin apellido
    await page.locator('#reg-nombre').fill('Juan');
    await page.locator('#reg-email').fill('test@test.com');
    await page.locator('#reg-pw').fill('Test1234!');
    await page.locator('#reg-submit').click();
    await expect(page.locator('#reg-error')).toContainText(/apellido/i);

    // Contraseña corta
    await page.locator('#reg-nombre').fill('Juan Pérez');
    await page.locator('#reg-pw').fill('123');
    await page.locator('#reg-submit').click();
    await expect(page.locator('#reg-error')).toContainText(/8/i);
  });

});
