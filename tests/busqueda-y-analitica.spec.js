// @ts-check
// C3  · Búsqueda de prestadores
// C10 · Panel admin — gating para no-admins
// C4/C9 · Analítica — secciones por tier de plan
// Portfolio — contrato de API
//
// Corre contra: https://pronetprueba.netlify.app
// Todos los tests son de solo-lectura o ejercitan paths que no mutan datos de producción.
const { test, expect } = require('@playwright/test');
const path = require('path');
const { abrir, irA, CUENTAS } = require('./helpers');

const sesion = (rol) => path.join(__dirname, '.auth', `${rol}.json`);

// ══════════════════════════════════════════════════════════════════════════════
// C3 · Búsqueda de prestadores
// ══════════════════════════════════════════════════════════════════════════════
test.describe('C3 · Búsqueda — pantalla y controles', () => {
  test.use({ storageState: sesion('vecino') });

  test('s-buscar carga con input de búsqueda y chips de filtro', async ({ page }) => {
    await abrir(page);
    await irA(page, 's-buscar');
    await expect(page.locator('#search-main')).toBeVisible();
    // Al menos un chip de filtro visible
    await expect(page.locator('.filter-row .chip').first()).toBeVisible();
  });

  test('chip "Todos" empieza activo; al clicar otro chip cambia la selección', async ({ page }) => {
    await abrir(page);
    await irA(page, 's-buscar');
    // Escopar a #s-buscar: varias pantallas tienen .filter-row .chip
    const chipTodos   = page.locator('#s-buscar .filter-row .chip').filter({ hasText: /^Todos$/i });
    const chipPremium = page.locator('#s-buscar .filter-row .chip').filter({ hasText: /premium/i });
    await expect(chipTodos).toHaveClass(/on/);

    await chipPremium.click();
    await page.waitForTimeout(400);
    await expect(chipPremium).toHaveClass(/on/);
    await expect(chipTodos).not.toHaveClass(/on/);

    // Volver a Todos también funciona
    await page.locator('#s-buscar .filter-row .chip').filter({ hasText: /^Todos$/i }).click();
    await page.waitForTimeout(400);
    await expect(page.locator('#s-buscar .filter-row .chip').filter({ hasText: /^Todos$/i })).toHaveClass(/on/);
    await expect(chipPremium).not.toHaveClass(/on/);
  });

  test('#search-results se popula (o muestra empty state) al abrir', async ({ page }) => {
    await abrir(page);
    await irA(page, 's-buscar');
    // Esperar que renderBusqueda() termine: el spinner inicial desaparece
    await page.waitForFunction(() => {
      const r = document.getElementById('search-results');
      if (!r) return false;
      // Mientras carga dice "⏳ Buscando…" en un solo div hijo
      const esSpinner = r.children.length === 1 && r.textContent.includes('⏳');
      return !esSpinner;
    }, { timeout: 15000 });
    // Al menos hay algo en el contenedor (cards) o el empty state aparece
    const ok = await page.evaluate(() => {
      const r = document.getElementById('search-results');
      return r && r.children.length > 0;
    });
    expect(ok).toBe(true);
  });

  test('el meta de resultados se actualiza con el filtro activo', async ({ page }) => {
    await abrir(page);
    await irA(page, 's-buscar');
    // Esperar que el meta muestre algo distinto al texto inicial
    await page.waitForFunction(() => {
      const meta = document.getElementById('search-meta');
      return meta && !meta.textContent.includes('electricistas en Escobar');
    }, { timeout: 15000 });
    const meta = await page.locator('#search-meta').textContent();
    // Debe decir "N resultado(s) en …"
    expect(meta).toMatch(/resultado/i);
  });

  test('tipear texto muy raro vacía los resultados o muestra estado vacío', async ({ page }) => {
    await abrir(page);
    await irA(page, 's-buscar');
    // Esperar carga inicial
    await page.waitForFunction(() => {
      const r = document.getElementById('search-results');
      return r && !r.textContent.includes('⏳');
    }, { timeout: 15000 });

    await page.locator('#search-main').fill('zzzzzznoexistexxx');
    await page.waitForTimeout(600); // debounce 400 ms + margen

    // "Sin resultados" en el contenedor (texto inline, no el empty-state panel)
    const texto = await page.locator('#search-results').textContent();
    expect(texto).toMatch(/no encontramos|sin resultado|0 resultado/i);
  });

  test('clicar una card de prestador navega a s-prof', async ({ page }) => {
    await abrir(page);
    await irA(page, 's-buscar');
    // Esperar que haya al menos una card
    const card = page.locator('#search-results .card').first();
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.click();
    // abrirPerfilPrestador() llama goTo('s-prof')
    await expect(page.locator('#s-prof')).toHaveClass(/active/, { timeout: 8000 });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// C10 · Panel admin — gating
// ══════════════════════════════════════════════════════════════════════════════
test.describe('C10 · Moderación — no accesible para vecino', () => {
  test.use({ storageState: sesion('vecino') });

  test('goTo("s-moderacion") para vecino no activa la pantalla', async ({ page }) => {
    await abrir(page);
    await page.evaluate(() => window.goTo('s-moderacion'));
    await page.waitForTimeout(500);
    // El guard en goTo() hace return early → s-moderacion no queda active
    await expect(page.locator('#s-moderacion')).not.toHaveClass(/active/);
  });

  test('version-tap para vecino no abre el modal de PIN', async ({ page }) => {
    await abrir(page);
    await irA(page, 's-miperfil');
    const versionTap = page.locator('#version-tap');
    if (await versionTap.isVisible().catch(() => false)) {
      await versionTap.click();
      await page.waitForTimeout(400);
      // El listener hace `if (!esAdmin()) return` antes de abrir el modal
      const display = await page.locator('#admin-pin-modal').evaluate(
        el => getComputedStyle(el).display
      );
      expect(display).toBe('none');
    }
  });
});

test.describe('C10 · Moderación — no accesible para prestador', () => {
  test.use({ storageState: sesion('prestador') });

  test('goTo("s-moderacion") para prestador no activa la pantalla', async ({ page }) => {
    await abrir(page);
    // Asegurar que goTo esté disponible antes de llamarlo
    await page.waitForFunction(() => typeof window.goTo === 'function', { timeout: 5000 });
    await page.evaluate(() => window.goTo('s-moderacion'));
    await page.waitForTimeout(500);
    await expect(page.locator('#s-moderacion')).not.toHaveClass(/active/);
  });

  test('otras pantallas admin tampoco son accesibles', async ({ page }) => {
    await abrir(page);
    for (const pantalla of ['s-loyalty-admin', 's-catalogo']) {
      // El guard va DENTRO del loop: el Service Worker puede recargar la
      // página entre iteraciones y ahí window.goTo desaparece hasta que
      // app.js vuelve a evaluarse. Era la causa del flake.
      await page.waitForFunction(() => typeof window.goTo === 'function', { timeout: 8000 });
      await page.evaluate((p) => window.goTo(p), pantalla);
      await page.waitForTimeout(400);
      await expect(
        page.locator(`#${pantalla}`),
        `${pantalla} no debería activarse para prestador`
      ).not.toHaveClass(/active/);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// C4/C9 · Analítica — secciones por tier de plan
// ══════════════════════════════════════════════════════════════════════════════
test.describe('C4/C9 · Analítica — tiers de plan', () => {
  test.use({ storageState: sesion('prestador') });

  test('el tier efectivo se deriva del plan del usuario', async ({ page }) => {
    await abrir(page);
    // Reproducir la fórmula de tierEstadisticas() con la API expuesta
    const tier = await page.evaluate(() => {
      const api = window._planesAPI;
      const planEfectivo = api.planParaLimites(api.planActual());
      return api.getPlanConfig(planEfectivo)?.estadisticas ?? false;
    });
    // Valores válidos: false | 'basicas' | 'completas' | 'export'
    expect([false, 'basicas', 'completas', 'export']).toContain(tier);
  });

  test('las secciones visibles son coherentes con el tier del plan', async ({ page }) => {
    await abrir(page);
    await irA(page, 's-analytics');

    const r = await page.evaluate(() => {
      const api = window._planesAPI;
      const TIERS = { false: 0, basicas: 1, completas: 2, export: 3 };
      const planEfectivo  = api.planParaLimites(api.planActual());
      const tierActual    = api.getPlanConfig(planEfectivo)?.estadisticas ?? false;
      const nivelActual   = TIERS[tierActual] ?? 0;

      return [...document.querySelectorAll('#s-analytics .an-section[data-tier]')].map(sec => ({
        tier:     sec.dataset.tier,
        visible:  sec.style.display !== 'none',
        // ¿Debería estar visible según el nivel?
        deberia:  nivelActual >= (TIERS[sec.dataset.tier] ?? 0),
      }));
    });

    for (const sec of r) {
      expect(sec.visible, `sección data-tier="${sec.tier}" — visible=${sec.visible}, debería=${sec.deberia}`).toBe(sec.deberia);
    }
  });

  test('#an-upsell es coherente: visible ↔ hay secciones bloqueadas', async ({ page }) => {
    await abrir(page);
    await irA(page, 's-analytics');

    const { upsellVisible, hayBloqueadas } = await page.evaluate(() => {
      const secciones = [...document.querySelectorAll('#s-analytics .an-section[data-tier]')];
      const aviso = document.getElementById('an-upsell');
      return {
        upsellVisible: aviso ? aviso.style.display !== 'none' : false,
        hayBloqueadas: secciones.some(s => s.style.display === 'none'),
      };
    });
    // La app solo muestra el aviso cuando hay algo que no se puede ver
    expect(upsellVisible).toBe(hayBloqueadas);
  });

  test('#an-upsell nombra un plan superior cuando está visible', async ({ page }) => {
    await abrir(page);
    await irA(page, 's-analytics');

    const { visible, texto } = await page.evaluate(() => ({
      visible: document.getElementById('an-upsell')?.style.display !== 'none',
      texto:   document.getElementById('an-upsell-txt')?.textContent || '',
    }));

    if (visible) {
      expect(texto.length).toBeGreaterThan(0);
      // El texto debe mencionar un plan superior (Plus o Pro)
      expect(texto).toMatch(/plus|pro/i);
    }
  });

  test('la sección de exportar CSV está oculta si el plan no llega al tier export', async ({ page }) => {
    await abrir(page);
    await irA(page, 's-analytics');

    const { tier, exportVisible } = await page.evaluate(() => {
      const api = window._planesAPI;
      const planEfectivo = api.planParaLimites(api.planActual());
      const tier = api.getPlanConfig(planEfectivo)?.estadisticas ?? false;
      const exportEl = document.getElementById('an-export');
      return {
        tier,
        exportVisible: exportEl ? exportEl.style.display !== 'none' : false,
      };
    });

    if (tier !== 'export') {
      expect(exportVisible).toBe(false);
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Portfolio — contrato de API
// ══════════════════════════════════════════════════════════════════════════════
test.describe('Portfolio — contrato de PronetDB', () => {

  test('las tres funciones de portfolio están expuestas en PronetDB', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => document.querySelector('#s-home') !== null && !document.querySelector('#anti-flash-login'),
      { timeout: 20000 }
    );
    const tipos = await page.evaluate(() => ({
      listar:   typeof window.PronetDB?.listarPortfolio,
      subir:    typeof window.PronetDB?.subirFotoPortfolio,
      eliminar: typeof window.PronetDB?.eliminarFotoPortfolio,
    }));
    expect(tipos.listar).toBe('function');
    expect(tipos.subir).toBe('function');
    expect(tipos.eliminar).toBe('function');
  });

  test('listarPlanesLimites está expuesto en PronetDB', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => document.querySelector('#s-home') !== null && !document.querySelector('#anti-flash-login'),
      { timeout: 20000 }
    );
    const tipo = await page.evaluate(() => typeof window.PronetDB?.listarPlanesLimites);
    expect(tipo).toBe('function');
  });

  test('eliminarFotoPortfolio(null) devuelve false sin lanzar excepción', async ({ page }) => {
    // fotoId=null → el guard `if (!remoto || !fotoId) return false` actúa antes de
    // tocar la DB, así que es seguro correrlo sin autenticación.
    await page.goto('/');
    await page.waitForFunction(
      () => document.querySelector('#s-home') !== null && !document.querySelector('#anti-flash-login'),
      { timeout: 20000 }
    );
    const result = await page.evaluate(async () => {
      return window.PronetDB.eliminarFotoPortfolio(null);
    });
    expect(result).toBe(false);
  });
});
