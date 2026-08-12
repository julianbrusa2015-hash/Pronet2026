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
async function aceptarTycSiAparece(page, timeout = 5000) {
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
    await modal.waitFor({ state: 'visible', timeout });
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

/** Scrollea al fondo la hoja de un modal tipo bottom-sheet y toca un control.
 *
 *  `.zona-modal` tiene `max-height:90%` y `overflow-y:auto`, y el botón de
 *  acción es siempre el ÚLTIMO elemento: con la lista llena arranca fuera de
 *  la parte visible del contenedor. Un usuario scrollea y llega.
 *
 *  `scrollIntoViewIfNeeded()` de Playwright NO alcanza acá: reporta "done
 *  scrolling" sin mover el contenedor, y el click se pasa el timeout entero
 *  reintentando contra `.phone`. Medido: con la hoja sin scrollear el botón
 *  queda en y=895 y `elementFromPoint` no lo encuentra; con `scrollTop` a
 *  mano queda en y=636 y devuelve el BUTTON.
 *
 *  No alcanza con scrollear y después usar `locator.click()`: click() hace su
 *  PROPIO scrollIntoViewIfNeeded y revierte el scroll antes de hit-testear.
 *  Por eso el click se dispara desde el DOM. Acá no tapa nada —está medido
 *  que el control es alcanzable de verdad una vez scrolleado— y el onclick
 *  del HTML se ejecuta igual. */
async function tocarEnLaHoja(page, selectorModal, selectorBoton) {
  await page.evaluate(([sm, sb]) => {
    const hoja = document.querySelector(sm + ' .zona-modal');
    if (hoja) hoja.scrollTop = hoja.scrollHeight;
    const btn = document.querySelector(sb);
    if (!btn) throw new Error('no se encontró ' + sb);
    btn.click();
  }, [selectorModal, selectorBoton]);
}

/** Atraviesa el modal "¿En qué comunidad vivís?" eligiendo "Ahora no".
 *
 *  `entrarAVecinos()` lo interpone cuando `perfiles.zona` no es una comunidad
 *  (nivel 2) — las cuentas de prueba tienen zona='Escobar', que es nivel 1.
 *  Se usa "Ahora no" y no una comunidad concreta a propósito: omitir no toca
 *  la cuenta, así el test es repetible y no le cambia el mercado a una cuenta
 *  que otros specs usan. */
async function omitirComunidadSiAparece(page, timeout = 3000) {
  // Se espera por la clase `.show`, NO por state:'visible'. Estos overlays se
  // ocultan con opacity:0 + pointer-events:none, no con display:none, y la
  // clase base ya trae display:flex e inset:0. Playwright ignora la opacidad
  // al decidir visibilidad: mientras tenga caja lo considera visible, así que
  // `state:'visible'` da verde con el modal CERRADO. El helper creía
  // encontrarlo siempre, tocaba un botón de un modal que nadie abrió y después
  // se colgaba esperando que "se ocultara" algo que nunca se mostró.
  const modal = page.locator('#modal-comunidad.show');
  try { await modal.waitFor({ state: 'attached', timeout }); } catch { return; }
  // abrirModalComunidad() muestra la hoja ANTES de terminar de cargar las
  // comunidades (hace classList.add('show') y recién después await
  // listarComunidades()). Tocar "Ahora no" en esa ventana dispara el
  // callback de continuación con el modal a medio armar y la navegación
  // queda en un estado raro. Esperar a que la lista esté cierra la carrera.
  await page.locator('#comunidad-list .zona-option').first()
    .waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});
  await tocarEnLaHoja(page, '#modal-comunidad', '#modal-comunidad button[onclick*="omitirComunidad"]');
  // Cerrarse acá es perder la clase `.show`, no volverse display:none.
  await modal.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
}

/** Completa el modal "Necesitamos tu teléfono" que `npFinalizar()` interpone
 *  antes de publicar un pedido si la cuenta no tiene teléfono cargado.
 *
 *  El número tiene que ser único: hay un índice sobre los últimos 10 dígitos
 *  (una cuenta por teléfono). Por eso se pasa uno distinto por cuenta en vez
 *  de un fijo compartido, que haría fallar al segundo test que lo use. */
async function pasarGateTelefono(page, numero, timeout = 3000) {
  // Por `.show` y no por state:'visible' — ver la nota en
  // omitirComunidadSiAparece: estos overlays se ocultan con opacity, y para
  // Playwright están "visibles" incluso cerrados.
  const modal = page.locator('#modal-telefono.show');
  try { await modal.waitFor({ state: 'attached', timeout }); } catch { return false; }
  await page.locator('#tel-gate-input').fill(numero);
  await tocarEnLaHoja(page, '#modal-telefono', '#tel-gate-btn');
  await modal.waitFor({ state: 'detached', timeout: 10000 });
  return true;
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
  // sesionLista() es `!!usuarioActual`, y restaurarSesion() asigna
  // usuarioActual ANTES de decidir si muestra el modal de T&C. Para una
  // cuenta con `perfiles.tyc_aceptado_en` en null el modal se interpone, y
  // todo el post-login (reflejarUsuario, obtenerSuscripcion, realtime) queda
  // esperando en `_tycPostLoginCallback` sin ejecutarse.
  //
  // Con storageState no hay click en "Ingresar", así que el aceptarTyc de
  // login() nunca corre y nadie descarta ese modal: los specs leían el DOM
  // de un prestador todavía pintado como vecino. Va acá y no en login()
  // porque es el único punto por el que pasan las dos rutas.
  //
  // 1500ms y no los 5000 por defecto: acá el modal, si va a aparecer, ya
  // apareció (usuarioActual está asignado). Esperar 5s en cada llamada le
  // sumaría minutos a la suite entera para el caso normal de "no aparece".
  await aceptarTycSiAparece(page, 1500);
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

module.exports = { CUENTAS, esperarDOM, esperarSWListo, cerrarTutorialSiAparece, limpiarSesion, entrarComoInvitado, login, abrir, sesionRestaurada, irA, visible, aceptarTycSiAparece, omitirComunidadSiAparece, pasarGateTelefono };
