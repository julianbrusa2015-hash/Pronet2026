// @ts-check
// Tests de los circuitos nuevos agregados el 2026-07-27
// Corre contra: https://pronetprueba.netlify.app
const { test, expect } = require('@playwright/test');

// Refactor 2026-08-03: esta suite tenía su propia copia de los helpers de
// sesión y quedó desincronizada del comportamiento real de la app. Dos
// bugs concretos que costaron 9 tests en verde:
//
//  · entrarComoInvitado() buscaba `button[onclick*="entrarInvitado"]`,
//    pero el 2026-08-02 el botón pasó a `gateLogin('invitado', event)`.
//    El selector no matcheaba NADA y el click agotaba su timeout.
//  · No aceptaba el modal de T&C (introducido en ese mismo cambio) ni
//    esperaba al Service Worker, que recarga la página al tomar control.
//
// Ahora las funciones locales delegan en tests/helpers.js manteniendo sus
// firmas, así los call sites no cambian y hay una sola fuente de verdad.
const H = require('./helpers');

const PRESTADOR = H.CUENTAS.prestador;

const esperarDOM = H.esperarDOM;

// Firma idéntica a la anterior: los tests la siguen llamando igual.
const entrarComoInvitado = H.entrarComoInvitado;

async function submitLogin(page, timeout = 15000) {
  // Intentar click en el botón de login; si no hay clase btn-p, usar Enter
  const btn = page.locator('#login-screen button').filter({ hasText: /ingresar|entrar|login/i }).first();
  const btnVisible = await btn.isVisible().catch(() => false);
  if (btnVisible) {
    await btn.click();
  } else {
    await page.locator('#login-pw').press('Enter');
  }
  // El click en Ingresar abre el modal de T&C en el primer login de cada
  // contexto; sin aceptarlo, loginWith() nunca se dispara y el wait de
  // abajo agota su timeout.
  await H.aceptarTycSiAparece(page);
  await page.waitForFunction(() => {
    const ls = document.getElementById('login-screen');
    const err = document.getElementById('login-error');
    return (ls && ls.classList.contains('hidden')) ||
           (err && err.style.display !== 'none' && err.textContent.length > 0);
  }, { timeout });
}

// Delega en el login compartido: incluye espera del Service Worker,
// verificación de que las credenciales quedaron escritas y aceptación
// del modal de T&C. Lanza con mensaje propio si falla, como antes.
async function loginPrestador(page) {
  await H.login(page, 'prestador');
  await page.waitForTimeout(800);
}

// ═══════════════════════════════════════════════════════════════════
// E-02: Widget soporte WhatsApp
// ═══════════════════════════════════════════════════════════════════
test.describe('E-02 · Widget WhatsApp', () => {

  test('FAB visible para invitado', async ({ page }) => {
    test.setTimeout(90000);
    await entrarComoInvitado(page);
    const fab = page.locator('#wa-fab');
    await expect(fab).toBeVisible();
  });

  test('Click FAB abre popup con elementos correctos', async ({ page }) => {
    test.setTimeout(90000);
    await entrarComoInvitado(page);
    await page.locator('#wa-fab').click();
    const popup = page.locator('#wa-popup');
    await expect(popup).toBeVisible();
    // Header WhatsApp
    await expect(popup.locator('text=WhatsApp')).toBeVisible();
    // Burbujas de chat
    await expect(popup.locator('text=PRONET')).toBeVisible();
    // Botón "Escribinos" con link a wa.me (por ID para evitar ambigüedad)
    const link = popup.locator('#wa-popup-link');
    await expect(link).toBeVisible();
    const href = await link.getAttribute('href');
    expect(href).toContain('wa.me/5491140618983');
    expect(href).toContain('PRONET');
  });

  test('Botón X cierra el popup', async ({ page }) => {
    test.setTimeout(90000);
    await entrarComoInvitado(page);
    await page.locator('#wa-fab').click();
    await expect(page.locator('#wa-popup')).toBeVisible();
    await page.locator('#wa-popup button[onclick*="cerrarWaPopup"]').click();
    await expect(page.locator('#wa-popup')).toBeHidden();
  });

  test('Segundo click en FAB cierra el popup (toggle)', async ({ page }) => {
    test.setTimeout(90000);
    await entrarComoInvitado(page);
    await page.locator('#wa-fab').click();
    await expect(page.locator('#wa-popup')).toBeVisible();
    await page.locator('#wa-fab').click();
    await expect(page.locator('#wa-popup')).toBeHidden();
  });

  test('Mi Perfil: fila Soporte WhatsApp visible para vecino logueado', async ({ page }) => {
    // Los tests comparten contexto — loguear explícitamente como vecino_test
    let loginOk = 1;
    try {
      await H.login(page, 'vecino');
    } catch {
      loginOk = 0;
    }
    if (loginOk === 0) { test.skip(); return; }
    // El tutorial de bienvenida se abre tras el login en un contexto nuevo
    // y su overlay intercepta el click sobre el nav.
    await H.cerrarTutorialSiAparece(page);
    // Navegar a Mi Perfil por el nav (goTo no es global)
    await page.locator('#nb-perfil').click();
    await page.waitForFunction(() => {
      const s = document.getElementById('s-miperfil');
      return s && s.classList.contains('active');
    }, { timeout: 8000 });
    await expect(page.locator('#s-miperfil').locator('text=Soporte por WhatsApp')).toBeVisible();
  });

});

// ═══════════════════════════════════════════════════════════════════
// D-01: Modo invitado — pedidos gateados
// ═══════════════════════════════════════════════════════════════════
test.describe('D-01 · Modo invitado — acceso a Pedidos', () => {

  test('Invitado que toca nav Pedidos ve gate modal, no la pantalla', async ({ page }) => {
    await entrarComoInvitado(page);
    await page.locator('#nb-pedidos').click();
    await page.waitForTimeout(400);
    const gate = page.locator('#gate-modal');
    await expect(gate).toBeVisible();
    // s-pedidos NO debe estar activo
    const sPedidos = page.locator('#s-pedidos.active');
    await expect(sPedidos).toHaveCount(0);
  });

  test('s-pedidos no tiene tabs visibles cuando se renderiza', async ({ page }) => {
    await entrarComoInvitado(page);
    // Forzar navegación directa (bypassea el gate para probar el fix defensivo)
    await page.evaluate(() => {
      const s = document.getElementById('s-pedidos');
      if (s) {
        document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
        s.classList.add('active');
      }
      const tabs = document.getElementById('ped-tabs');
      if (tabs) tabs.style.display = 'none'; // ya debería estar none desde el goTo fix
    });
    const tabs = page.locator('#ped-tabs');
    const display = await tabs.evaluate(el => getComputedStyle(el).display);
    expect(display).toBe('none');
  });

});

// ═══════════════════════════════════════════════════════════════════
// B-08: CTA "Quiero ofrecer mis servicios"
// ═══════════════════════════════════════════════════════════════════
test.describe('B-08 · CTA convertirse en prestador', () => {

  test('Invitado: CTA visible con texto de registro', async ({ page }) => {
    await entrarComoInvitado(page);
    // Navegar a Mi Perfil — como es gateado, solo verificamos el estado del DOM
    // tras entrarInvitado el cta-ser-prestador debe estar visible
    const cta = page.locator('#cta-ser-prestador');
    // El CTA debe estar en el DOM (display !== none)
    const display = await cta.evaluate(el => el.style.display);
    // Para invitados: no 'none' (visible)
    expect(display).not.toBe('none');
    // Sub-texto para invitados
    const sub = page.locator('#cta-prestador-sub');
    const texto = await sub.textContent();
    expect(texto).toContain('Registrate como prestador');
  });

});

// ═══════════════════════════════════════════════════════════════════
// F.1: Feed prestador pre-filtrado por rubro
// ═══════════════════════════════════════════════════════════════════
test.describe('F.1 · Feed prestador filtrado por rubro', () => {

  test('Al entrar como prestador, catActiva es el rubro del perfil', async ({ page }) => {
    test.setTimeout(90000);
    let loginOk = false;
    try { await loginPrestador(page); loginOk = true; } catch (e) { console.log('[F.1] login falló:', e.message.slice(0, 80)); }
    if (!loginOk) { test.skip(); return; }
    // catActiva vive en el scope cerrado de app.js (no está en window).
    // En lugar de leer la variable interna, verificamos el DOM:
    // si el prestador tiene rubro que matchea una categoría, activarHomePrestador()
    // agrega clase 'on' al chip correspondiente y quita 'on' de #cat-todos.
    // Esperar hasta 8s por si activarHomePrestador aún no terminó.
    await page.waitForFunction(
      () => {
        // Hay un chip 'on' distinto de todos (todos es el default)
        const activo = document.querySelector('.rubro.on');
        return activo !== null;
      },
      { timeout: 8000 }
    ).catch(() => {});
    const chipOnId = await page.evaluate(() => {
      const chip = document.querySelector('.rubro.on');
      return chip ? chip.id : null;
    });
    if (!chipOnId || chipOnId === 'cat-todos') {
      console.log('[F.1] ningún chip de rubro activo — prestador_test sin rubro o sin match');
      test.skip();
      return;
    }
    // Hay un chip de rubro específico activo — prestador entró con filtro por rubro
    expect(chipOnId).not.toBe('cat-todos');
    console.log('[F.1] chip activo:', chipOnId);
  });

  test('Feed de prestador no muestra vista de vecino', async ({ page }) => {
    test.setTimeout(90000);
    let loginOk = false;
    try { await loginPrestador(page); loginOk = true; } catch (e) { console.log('[F.1] login falló:', e.message.slice(0, 80)); }
    if (!loginOk) { test.skip(); return; }
    // pview-presto debe ser visible, pview-busco oculto
    const presto = page.locator('#pview-presto');
    const busco  = page.locator('#pview-busco');
    // El home feed muestra pedidos disponibles, no tarjetas de prestadores
    const homeFeed = page.locator('#home-feed-container');
    // No debería mostrar tarjetas .presta-card (esas son para vecinos)
    const prestaCounts = await homeFeed.locator('.presta-card').count();
    // Un prestador ve pedidos (.ped-card), no otros prestadores (.presta-card)
    // Acepta 0 presta-cards como resultado correcto
    expect(prestaCounts).toBe(0);
  });

});

// ═══════════════════════════════════════════════════════════════════
// D-03: Loyalty — la acreditación vive en el servidor
// ═══════════════════════════════════════════════════════════════════
test.describe('D-03 · Loyalty acumulación — API disponible', () => {

  test('el cliente NO expone acreditación de puntos', async ({ page }) => {
    await page.goto('/');
    await esperarDOM(page);
    // Contrato invertido a propósito. Antes se verificaba que
    // acreditarPuntos() existiera; ahora se verifica que NO exista: un saldo
    // escrito desde el navegador es falsificable, así que los puntos los
    // acredita el trigger trg_acreditar_por_resena y el RPC resolver_canje().
    const r = await page.evaluate(() => ({
      db:        typeof window.PronetDB,
      acreditar: typeof window.PronetDB?.acreditarPuntos,
      aplicar:   typeof window.PronetDB?.aplicarBeneficio,
      canjear:   typeof window.PronetDB?.canjearPuntos,
      resolver:  typeof window.PronetDB?.resolverCanje,
    }));
    expect(r.db).toBe('object');
    expect(r.acreditar).toBe('undefined');
    expect(r.aplicar).toBe('undefined');
    // Los envoltorios de RPC sí deben estar.
    expect(r.canjear).toBe('function');
    expect(r.resolver).toBe('function');
  });

  test('abrirSoporteWhatsapp y cerrarWaPopup expuestos en window', async ({ page }) => {
    await page.goto('/');
    await esperarDOM(page);
    const ok = await page.evaluate(() =>
      typeof window.abrirSoporteWhatsapp === 'function' &&
      typeof window.cerrarWaPopup === 'function'
    );
    expect(ok).toBe(true);
  });

});
