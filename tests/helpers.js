// @ts-check
// Helpers compartidos de sesión para los specs.
//
// Los specs viejos (circuito-principal, ciclo-negocio, nuevos-circuitos)
// tienen su propia copia de estas funciones. No se refactorizaron para no
// tocar suites que hoy pasan; los specs nuevos usan este módulo.

// Una sola fuente de verdad para "¿hay Service Worker en los tests?".
const BLOQUEA_SW = require('../playwright.config.js').use?.serviceWorkers === 'block';

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

/** Espera a que el Service Worker ya esté controlando la página.
 *
 *  app.js llama a location.reload() en el evento 'controllerchange' del SW
 *  (app.js ~9510). Eso ocurre la primera vez que el SW toma control de un
 *  contexto nuevo — o sea, en CADA test de Playwright — y otra vez tras
 *  cada bump de CACHE_VERSION.
 *
 *  Si esa recarga cae en medio de un fill o de un click, el test pierde el
 *  estado y agota su timeout con un error engañoso ("locator.check timeout",
 *  "campos vacíos"). Esperar a que el SW ya controle la página elimina toda
 *  esa clase de fallos de una sola vez, en lugar de parchear cada síntoma.
 *
 *  No falla si el SW no llega: se sigue igual (catch vacío) para no romper
 *  entornos donde no esté registrado. */
async function esperarSWListo(page) {
  // Con serviceWorkers:'block' en playwright.config.js el controller no llega
  // NUNCA, y como el waitForFunction traga su error con el catch, cada llamada
  // se comía 20 s en silencio — la suite entera se volvía lentísima sin que
  // ningún test fallara. Se lee la config en vez de duplicar la decisión acá.
  if (BLOQUEA_SW) return;
  await page.waitForFunction(
    () => !('serviceWorker' in navigator) || !!navigator.serviceWorker.controller,
    { timeout: 20000 }
  ).catch(() => {});
  await page.waitForTimeout(600); // margen para un reload ya disparado
}

/** Cierra el tutorial de bienvenida si está abierto.
 *
 *  Tras un login en un contexto nuevo (cada test de Playwright lo es), la
 *  app abre #tutorial-overlay, que cubre toda la pantalla e intercepta los
 *  clicks. El error de Playwright lo dice literal:
 *  "<div id="tutorial-content"> … intercepts pointer events".
 *
 *  Cualquier test que toque el nav o una pantalla después de loguearse
 *  necesita esto primero. */
async function cerrarTutorialSiAparece(page) {
  const overlay = page.locator('#tutorial-overlay.show');
  if (!(await overlay.isVisible().catch(() => false))) return;
  const saltar = page.locator('#tutorial-overlay .tt-skip');
  if (await saltar.isVisible().catch(() => false)) await saltar.click();
  await overlay.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
}

/** Borra la sesión de Supabase del localStorage sin tocar el resto. */
async function limpiarSesion(page) {
  await page.evaluate(() => {
    Object.keys(localStorage).forEach(k => {
      if (k.includes('supabase') || k.includes('sb-')) localStorage.removeItem(k);
    });
  });
}

/** Marca los checkboxes y confirma el modal "Antes de continuar" (T&C/edad)
 *  si apareció — gateLogin() lo muestra en el PRIMER intento de login de
 *  cada contexto de browser (localStorage limpio, como es cada test de
 *  Playwright), y se interpone entre "Ingresar" y el login real. Sin este
 *  paso el click en Ingresar no dispara loginWith(): solo abre el modal. */
async function aceptarTycSiAparece(page) {
  const modal = page.locator('#modal-tyc-login');
  // El modal aparece de forma ASÍNCRONA tras el click en Ingresar. La
  // versión anterior leía `el.style.display` en el mismo tick: si todavía
  // no se había mostrado daba "no apareció", se salía sin aceptar, y el
  // login quedaba bloqueado detrás del modal hasta agotar el timeout de
  // 60 s. Además comparaba el estilo INLINE, que puede decir 'flex'
  // mientras un ancestro oculto lo mantiene invisible.
  //
  // waitFor({state:'visible'}) resuelve las dos cosas: espera de verdad y
  // evalúa visibilidad real, no el atributo.
  try {
    await modal.waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    return; // no apareció: este contexto ya tenía los T&C aceptados
  }
  await page.locator('#tyc-check-terminos').check();
  await page.locator('#tyc-check-edad').check();
  await page.locator('#tyc-continuar-btn').click();
  // Esperar el cierre antes de seguir: si no, el siguiente paso puede
  // clickear contra el overlay que todavía está desapareciendo.
  await modal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
}

async function entrarComoInvitado(page) {
  await page.goto('/');
  await limpiarSesion(page);
  await page.reload();
  await esperarDOM(page);
  await esperarSWListo(page);
  await page.waitForSelector('#login-screen:not(.hidden)', { timeout: 20000 });
  // Regresión 2026-08-02: el botón de invitado pasó de onclick="entrarInvitado()"
  // a onclick="gateLogin('invitado', event)" (modal de T&C antes del primer
  // login de cada contexto) — el selector viejo por texto del onclick ya no
  // matchea. Se busca por texto visible en su lugar, más resistente a este tipo
  // de cambio interno.
  await page.locator('#login-screen button', { hasText: /explorar sin cuenta/i }).click();
  await aceptarTycSiAparece(page);
  await page.waitForFunction(() => {
    const ls = document.getElementById('login-screen');
    return ls && ls.classList.contains('hidden');
  }, { timeout: 10000 });
  await page.waitForTimeout(500);
}

/** Escribe las credenciales y CONFIRMA que quedaron escritas.
 *
 *  app.js recarga la página en el evento 'controllerchange' del Service
 *  Worker (app.js ~9510). Eso ocurre la primera vez que el SW toma
 *  control de un contexto nuevo — es decir, en cada test de Playwright —
 *  y de nuevo tras cada bump de CACHE_VERSION. Si la recarga cae después
 *  del fill, los inputs se vacían, el click en "Ingresar" no manda nada,
 *  y el test agota los 60 s esperando un login que nunca se disparó.
 *
 *  El síntoma en el snapshot de fallo es delator: formulario de login
 *  visible con email y contraseña EN BLANCO. */
async function completarCredenciales(page, email, pw) {
  for (let intento = 1; intento <= 3; intento++) {
    await page.locator('#login-email').fill(email);
    await page.locator('#login-pw').fill(pw);
    await page.waitForTimeout(800); // ventana donde caería la recarga del SW
    const quedaron = await page.evaluate(() =>
      !!document.getElementById('login-email')?.value &&
      !!document.getElementById('login-pw')?.value
    ).catch(() => false);
    if (quedaron) return;
    // Se perdieron: esperar a que el login vuelva a estar listo y reintentar.
    await page.waitForSelector('#login-screen:not(.hidden)', { timeout: 20000 });
  }
  throw new Error(
    'No se pudieron fijar las credenciales tras 3 intentos: el Service Worker ' +
    'sigue recargando la página. ¿Se bumpeó CACHE_VERSION recién?'
  );
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
  await esperarSWListo(page);
  await page.waitForSelector('#login-screen:not(.hidden)', { timeout: 20000 });
  await completarCredenciales(page, c.email, c.pw);

  const btn = page.locator('#login-screen button').filter({ hasText: /ingresar|entrar|login/i }).first();
  if (await btn.isVisible().catch(() => false)) await btn.click();
  else await page.locator('#login-pw').press('Enter');

  await aceptarTycSiAparece(page);

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
    // window._sb/PronetDB (datos.js) también, por la misma razón: en desarrollo
    // activo el SW puede disparar una recarga automática justo después de que
    // sesionLista() diera true, dejando un instante donde datos.js todavía no
    // terminó de re-ejecutarse tras la recarga.
    return api.sesionLista() && typeof window.goTo === 'function'
      && !!window._sb && !!window.PronetDB;
  }, { timeout: 30000 });
  // Tras sesionLista() todavía corren cadenas async cortas (mostrarZonaAlLogin,
  // tutorial, chequeo de actualización del SW) que pueden interrumpir un
  // evaluate() inmediato. 300ms no alcanzaba — se veía como "window.PronetDB
  // is undefined" al azar en toda la suite.
  await page.waitForTimeout(1200);
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
  // La sesión puede estar restaurada y app.js todavía no haber expuesto sus
  // funciones — o el Service Worker haber recargado la página justo después.
  // Sin esta espera, cualquier page.evaluate(() => window.goTo(...)) que venga
  // a continuación falla con "window.goTo is not a function", de forma
  // intermitente. Es la causa de varios flakes de esta suite.
  await page.waitForFunction(() => typeof window.goTo === 'function', { timeout: 10000 })
    .catch(() => {});   // que no reviente acá: el test dirá qué falló de verdad
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

module.exports = { CUENTAS, esperarDOM, esperarSWListo, cerrarTutorialSiAparece, limpiarSesion, entrarComoInvitado, login, abrir, sesionRestaurada, irA, visible, aceptarTycSiAparece };
