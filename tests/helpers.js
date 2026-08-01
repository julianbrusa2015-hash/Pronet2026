// @ts-check
// Helpers compartidos de sesión para los specs.
//
// Los specs viejos (circuito-principal, ciclo-negocio, nuevos-circuitos)
// tienen su propia copia de estas funciones. No se refactorizaron para no
// tocar suites que hoy pasan; los specs nuevos usan este módulo.

const CUENTAS = {
  vecino:    { email: process.env.TEST_VECINO_EMAIL    || 'vecino_test@pronet.test',    pw: process.env.TEST_VECINO_PW    || 'Test1234!' },
  prestador: { email: process.env.TEST_PRESTADOR_EMAIL || 'prestador_test@pronet.test', pw: process.env.TEST_PRESTADOR_PW  || '12345678' },
  // Sin default: los tests de doble perfil se saltean si no está configurada,
  // en vez de fallar por una cuenta que puede no existir en cada entorno.
  doble:     { email: process.env.TEST_DOBLE_EMAIL     || null,                          pw: process.env.TEST_DOBLE_PW     || 'Test1234!' },
};

async function esperarDOM(page) {
  await page.waitForFunction(() =>
    document.querySelector('#s-home') !== null &&
    !document.querySelector('#anti-flash-login'),
    { timeout: 20000 }
  );
}

/** Borra la sesión de Supabase del localStorage sin tocar el resto. */
async function limpiarSesion(page) {
  await page.evaluate(() => {
    Object.keys(localStorage).forEach(k => {
      if (k.includes('supabase') || k.includes('sb-')) localStorage.removeItem(k);
    });
  });
}

async function entrarComoInvitado(page) {
  await page.goto('/');
  await limpiarSesion(page);
  await page.reload();
  await esperarDOM(page);
  await page.waitForSelector('#login-screen:not(.hidden)', { timeout: 20000 });
  await page.locator('button[onclick*="entrarInvitado"]').click();
  await page.waitForFunction(() => {
    const ls = document.getElementById('login-screen');
    return ls && ls.classList.contains('hidden');
  }, { timeout: 10000 });
  await page.waitForTimeout(500);
}

/** Inicia sesión con una de las cuentas de CUENTAS.
 *  `preparar` corre después de limpiar la sesión y antes de recargar — sirve
 *  para dejar estado en localStorage y verificar cómo lo trata el login. */
async function login(page, cuenta, preparar) {
  const c = CUENTAS[cuenta];
  if (!c || !c.email) throw new Error(`Cuenta "${cuenta}" sin configurar`);
  await page.goto('/');
  await limpiarSesion(page);
  if (preparar) await page.evaluate(preparar);
  await page.reload();
  await esperarDOM(page);
  await page.waitForSelector('#login-screen:not(.hidden)', { timeout: 20000 });
  await page.locator('#login-email').fill(c.email);
  await page.locator('#login-pw').fill(c.pw);

  const btn = page.locator('#login-screen button').filter({ hasText: /ingresar|entrar|login/i }).first();
  if (await btn.isVisible().catch(() => false)) await btn.click();
  else await page.locator('#login-pw').press('Enter');

  await page.waitForFunction(() => {
    const ls = document.getElementById('login-screen');
    const err = document.getElementById('login-error');
    return (ls && ls.classList.contains('hidden')) ||
           (err && err.style.display !== 'none' && err.textContent.length > 0);
  }, { timeout: 20000 });

  if (await page.locator('#login-screen.hidden').count() === 0) {
    throw new Error(`Login falló con ${c.email} — ¿existe la cuenta y la contraseña es la esperada?`);
  }
  await sesionRestaurada(page);
}

/** Espera a que restaurarSesion() haya asignado usuarioActual.
 *
 *  Dos señales que parecen servir y NO sirven:
 *
 *  · `#login-screen.hidden` — app.js se lo agrega al PARSEAR si detecta un
 *    token en localStorage, para evitar el flash del login al recargar. Con
 *    storageState eso es verdadero desde el primer milisegundo, así que como
 *    señal de "sesión lista" da verde siempre y los tests leen el DOM antes de
 *    que exista usuarioActual.
 *
 *  · `configCargada()` — marca que se leyó config_app, que ocurre ANTES de
 *    resolver la sesión.
 *
 *  Con cualquiera de las dos, irA() le pega a goTo() con usuarioActual en null
 *  y se come el gate de invitado, con la sesión restaurándose bien un instante
 *  después. */
async function sesionRestaurada(page) {
  await page.waitForFunction(() => {
    const api = window._planesAPI;
    if (!api) return false;
    if (typeof api.sesionLista !== 'function') {
      // Falla con mensaje en vez de colgar 30s sin explicación.
      throw new Error('app.js desplegado sin sesionLista(): actualizá el deploy');
    }
    // goTo se define en el IIFE de app.js: si no está, la página todavía está
    // navegando/recargando y cualquier evaluate fallaría con contexto destruido.
    return api.sesionLista() && typeof window.goTo === 'function';
  }, { timeout: 30000 });
  await page.waitForTimeout(300);
}

/** Abre la app con la sesión que ya trae el contexto (storageState) y espera
 *  a que restaurarSesion() termine. No hace login: eso lo hizo auth.setup.js. */
async function abrir(page) {
  await page.goto('/');
  // NO usa esperarDOM(): esa espera a que desaparezca #anti-flash-login, un
  // <style> que oculta el login mientras se restaura la sesión. Con sesión
  // válida la app nunca lo remueve (solo lo hace si el token falla), así que
  // como señal de "listo" sirve para invitados pero cuelga para logueados.
  await sesionRestaurada(page);
}

/** Navega por la API de la app en vez de clickear el nav, que cambia según rol.
 *
 *  Reintenta: goTo() no navega si usuarioActual todavía no está asignado —
 *  muestra el gate de invitado y devuelve. En vez de depender de acertar el
 *  momento exacto en que la sesión termina de resolverse, se verifica que la
 *  pantalla haya quedado activa y se reintenta si no. */
async function irA(page, pantalla) {
  for (let intento = 0; intento < 4; intento++) {
    try {
      // Esperar que goTo esté disponible: puede no estarlo si el contexto
      // de ejecución acaba de ser destruido por una navegación del SPA.
      await page.waitForFunction(() => typeof window.goTo === 'function', { timeout: 3000 });
      await page.evaluate((p) => window.goTo(p), pantalla);
    } catch {
      // Contexto destruido o goTo aún no definido: reintentar.
      await page.waitForTimeout(800);
      continue;
    }
    const llego = await page.waitForFunction(
      (p) => document.getElementById(p)?.classList.contains('active'),
      pantalla, { timeout: 3000 }
    ).then(() => true).catch(() => false);
    if (llego) { await page.waitForTimeout(300); return; }
    // Cerrar el gate si se interpuso, para que el siguiente intento no lo herede.
    await page.evaluate(() => window.cerrarGate && window.cerrarGate()).catch(() => {});
    await page.waitForTimeout(800);
  }
  throw new Error(`No se pudo navegar a ${pantalla}: la app no quedó lista`);
}

/** true si el elemento existe y está visible (no basta con toBeVisible:
 *  varios se ocultan con style.display en vez de removerse del DOM). */
async function visible(page, selector) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    return !!el && el.offsetParent !== null;
  }, selector);
}

module.exports = { CUENTAS, esperarDOM, limpiarSesion, entrarComoInvitado, login, abrir, sesionRestaurada, irA, visible };
