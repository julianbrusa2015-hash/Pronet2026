// @ts-check
// C1 · Acceso y sesión  ·  C12 · Doble perfil y roles
// Corre contra: https://pronetprueba.netlify.app
//
// C12 es el circuito con más regresiones reales del proyecto (dos en una sola
// sesión), así que cada test que cubre una lleva anotada cuál.
const { test, expect } = require('@playwright/test');
const path = require('path');
const { CUENTAS, entrarComoInvitado, login, abrir, irA, visible } = require('./helpers');

const sesion = (rol) => path.join(__dirname, '.auth', `${rol}.json`);

// ═══════════════════════════════════════════════════════════════════
// C1 · Acceso y sesión
// ═══════════════════════════════════════════════════════════════════
test.describe('C1 · Acceso y sesión', () => {

  test('invitado: las pantallas protegidas muestran el gate de registro', async ({ page }) => {
    test.setTimeout(90000);
    await entrarComoInvitado(page);

    // Cada una de estas está en PANTALLA_ACCION (app.js) y debe frenar al invitado.
    for (const pantalla of ['s-miperfil', 's-nuevo-pedido', 's-chats']) {
      await page.evaluate((p) => window.goTo(p), pantalla);
      await page.waitForTimeout(300);
      await expect(page.locator('#gate-modal'),
        `${pantalla} debería mostrar el gate al invitado`).toBeVisible();
      // El gate explica qué acción requiere cuenta, no un texto genérico.
      const msg = await page.locator('#gate-msg').textContent();
      expect(msg?.trim().length, `${pantalla}: el gate no tiene mensaje`).toBeGreaterThan(0);
      await page.evaluate(() => window.cerrarGate && window.cerrarGate());
      await page.waitForTimeout(200);
    }
  });

  test('invitado: el home es navegable sin cuenta', async ({ page }) => {
    test.setTimeout(90000);
    await entrarComoInvitado(page);
    // El modo invitado existe para que se pueda explorar antes de registrarse:
    // si el home también frenara, no habría nada que ver.
    await expect(page.locator('#gate-modal')).toBeHidden();
    await expect(page.locator('#s-home')).toHaveClass(/active/);
  });

});

test.describe('C1 · Acceso y sesión — con cuenta', () => {
  test.use({ storageState: sesion('vecino') });

  test('con sesión, el gate deja de aparecer', async ({ page }) => {
    await abrir(page);
    await irA(page, 's-miperfil');
    await expect(page.locator('#gate-modal')).toBeHidden();
    await expect(page.locator('#s-miperfil')).toHaveClass(/active/);
  });

  test('la sesión sobrevive a un reload', async ({ page }) => {
    await abrir(page);
    await page.reload();
    await page.waitForFunction(() => !!window._planesAPI?.configCargada?.(), { timeout: 20000 });
    await page.waitForTimeout(600);
    // Si la sesión no persistiera, volvería la pantalla de login.
    await expect(page.locator('#login-screen')).toBeHidden();
  });
});

// ═══════════════════════════════════════════════════════════════════
// C12 · Doble perfil y roles
// ═══════════════════════════════════════════════════════════════════
test.describe('C12 · Roles — prestador puro', () => {
  test.use({ storageState: sesion('prestador') });

  test('no ve el toggle de doble perfil', async ({ page }) => {
    // tieneDoblePerfil() exige prestador_id Y tipo !== 'prestador'.
    await abrir(page);
    await irA(page, 's-miperfil');
    await expect(page.locator('#doble-perfil-toggle')).toBeHidden();
  });

  test('no ve el botón de publicar pedido', async ({ page }) => {
    // REGRESIÓN (v65): el botón se ocultaba solo en activarHomePrestador(), así
    // que entrando directo a s-pedidos quedaba visible y un prestador podía
    // publicar pedidos.
    await abrir(page);
    await irA(page, 's-pedidos');
    await expect(page.locator('#btn-publicar-pedido')).toBeHidden();
  });

  test('el nav no ofrece Buscar ni Cerca', async ({ page }) => {
    // Son de la vista de vecino: el prestador oferta, no contrata.
    await abrir(page);
    await expect(page.locator('#nb-buscar')).toBeHidden();
    await expect(page.locator('#nb-mapa')).toBeHidden();
  });

  test('no hereda el modoRol de una sesión anterior', async ({ page }) => {
    // REGRESIÓN (v64): modoRol vive en localStorage y persiste entre cuentas.
    // Si una sesión previa lo dejaba en 'vecino', un prestador puro entraba
    // con la UI de vecino y podía publicar pedidos.
    await abrir(page);
    // Simular que una sesión anterior dejó el modo en 'vecino' y recargar:
    // restaurarSesion() tiene que limpiarlo al ver que no hay doble perfil.
    await page.evaluate(() => localStorage.setItem('pronet-modo-rol', 'vecino'));
    await page.reload();
    await abrir(page);
    const modoRol = await page.evaluate(() => localStorage.getItem('pronet-modo-rol'));
    expect(modoRol, 'restaurarSesion() debe limpiar modoRol si no hay doble perfil').toBeFalsy();
    // Y la consecuencia visible: sigue siendo prestador.
    await irA(page, 's-pedidos');
    await expect(page.locator('#btn-publicar-pedido')).toBeHidden();
  });
});

test.describe('C12 · Roles — vecino', () => {
  test.use({ storageState: sesion('vecino') });

  test('ve el botón de publicar y el nav completo', async ({ page }) => {
    await abrir(page);
    await irA(page, 's-pedidos');
    await expect(page.locator('#btn-publicar-pedido')).toBeVisible();
    await expect(page.locator('#nb-buscar')).toBeVisible();
  });

  test('no ve el toggle de doble perfil si no tiene ficha', async ({ page }) => {
    await abrir(page);
    await irA(page, 's-miperfil');
    await expect(page.locator('#doble-perfil-toggle')).toBeHidden();
  });

  test('ve el CTA para ofrecer servicios', async ({ page }) => {
    // Es la puerta al upgrade: si desaparece, nadie se puede volver prestador.
    await abrir(page);
    await irA(page, 's-miperfil');
    await expect(page.locator('#cta-ser-prestador')).toBeVisible();
  });
});

test.describe('C12 · Roles — doble perfil', () => {
  // Se saltea si no hay cuenta configurada: TEST_DOBLE_EMAIL / TEST_DOBLE_PW.
  test.skip(!CUENTAS.doble.email, 'Sin cuenta de doble perfil configurada (TEST_DOBLE_EMAIL)');
  test.use({ storageState: sesion('doble') });

  test('ve el toggle y alterna entre modos', async ({ page }) => {
    await abrir(page);
    await irA(page, 's-miperfil');
    await expect(page.locator('#doble-perfil-toggle')).toBeVisible();

    const antes = await page.locator('#modo-actual-lbl').textContent();
    await page.locator('#modo-cambiar-btn').click();
    await page.waitForTimeout(500);
    const despues = await page.locator('#modo-actual-lbl').textContent();
    expect(despues, 'el toggle debe cambiar el modo mostrado').not.toBe(antes);
  });

  test('en modo vecino puede publicar; en modo prestador no', async ({ page }) => {
    await abrir(page);
    await irA(page, 's-miperfil');

    // Forzar modo vecino de forma determinista, sin depender del estado previo.
    const enVecino = async () => page.evaluate(() => localStorage.getItem('pronet-modo-rol') === 'vecino');
    if (!await enVecino()) {
      await page.locator('#modo-cambiar-btn').click();
      await page.waitForTimeout(500);
    }
    await irA(page, 's-pedidos');
    await expect(page.locator('#btn-publicar-pedido'), 'modo vecino debería poder publicar').toBeVisible();

    await irA(page, 's-miperfil');
    await page.locator('#modo-cambiar-btn').click();
    await page.waitForTimeout(500);
    await irA(page, 's-pedidos');
    await expect(page.locator('#btn-publicar-pedido'), 'modo prestador no debería publicar').toBeHidden();
  });
});
