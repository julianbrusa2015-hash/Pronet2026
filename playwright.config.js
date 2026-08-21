// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// Sin dotenv como dependencia: mismo criterio que ya usan los scripts de
// migración de este proyecto (leer .env.local a mano). No pisa una var que
// ya venga del shell — así un `TEST_ADMIN_PW=x npx playwright test` puntual
// sigue ganando sobre el archivo.
(function cargarEnvLocal() {
  const fs = require('fs');
  const path = require('path');
  const envPath = path.join(__dirname, '.env.local');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((linea) => {
    const i = linea.indexOf('=');
    if (i === -1 || linea.trim().startsWith('#')) return;
    const clave = linea.slice(0, i).trim();
    if (clave && !(clave in process.env)) process.env[clave] = linea.slice(i + 1).trim();
  });
})();

module.exports = defineConfig({
  testDir: './tests',
  globalSetup: require.resolve('./tests/global-setup.js'),
  // Esta suite corre contra PRODUCCIÓN por red, con el navegador visible y
  // grabando video de los fallos. Con 60 s el que cortaba era el presupuesto
  // del test y no la espera concreta, así que los rojos decían "Test timeout
  // exceeded" — que no distingue un bug de una corrida lenta. Un caso llegó a
  // agotarse DESMONTANDO el contexto, con todas las aserciones ya en verde.
  // No afloja ninguna verificación: cada espera de helpers.js tiene su propio
  // timeout, más corto y con mensaje propio. Este es sólo el techo.
  timeout: 120000,
  retries: 1,
  reporter: 'list',
  use: {
    baseURL: 'https://pronetprueba.netlify.app',
    headless: false,           // visible para ver qué pasa
    viewport: { width: 390, height: 844 }, // iPhone 14 (diseño mobile-first)
    // Una transición CSS sólo avanza si el navegador compone frames, y una
    // ventana oculta o tapada no compone. Las hojas que suben desde abajo
    // (.zona-modal) se quedaban en translateY(100%), fuera del marco —que es
    // overflow:hidden— y Playwright las veía "visible y estable" pero el
    // click moría contra .phone. Con reduced-motion el estado final se
    // aplica de una: mismo resultado, sin depender del compositor.
    reducedMotion: 'reduce',
    // El Service Worker es la causa raíz de casi todos los flakes de esta
    // suite. app.js llama a location.reload() en 'controllerchange', que
    // ocurre la primera vez que el SW toma control de un contexto — o sea,
    // en CADA test — y otra vez tras cada bump de CACHE_VERSION. Si esa
    // recarga cae en medio de un click o un evaluate, el fallo aparece con
    // tres caras distintas y siempre en un test distinto: "Execution context
    // was destroyed", una sesión que vuelve `sin_sesion`, o un click que se
    // pierde y deja la pantalla de login abierta hasta agotar el timeout.
    //
    // Bloquearlo elimina la clase entera en vez de parchear cada síntoma.
    // No se pierde cobertura: C13 (PWA y offline) está sin implementar y
    // ningún test verifica el SW — todas las menciones en tests/ son
    // workarounds de esta misma recarga. Si algún día se automatiza C13, va
    // en un proyecto aparte que no herede este bloqueo.
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'es-AR',
  },
  projects: [
    // Se loguea una vez por rol y guarda la sesión en tests/.auth/*.json.
    // Los specs que declaran storageState la reusan en vez de autenticarse
    // en cada test.
    // Mismo navegador que el proyecto de tests: sin esto usa el Chromium por
    // defecto, que en esta máquina no está instalado (spawn UNKNOWN).
    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
      // El login real contra producción encadena esperas cuyos timeouts
      // declarados suman bastante más de 60 s (login visible 20 + hasta 3
      // reintentos de credenciales 20 c/u + T&C 10 + login resuelto 20 +
      // sesión restaurada 30). Con el presupuesto global, en cualquier
      // corrida lenta el que cortaba era el test y no el paso: el error
      // quedaba en "Test timeout of 60000ms exceeded", que no dice nada.
      // Con 3 minutos gana siempre la espera concreta, y su mensaje explica
      // qué pasó. Esto era el flake intermitente del setup del prestador,
      // que arrastraba a toda la suite porque los specs dependen de él.
      timeout: 180000,
    },
    {
      name: 'msedge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
      dependencies: ['setup'],
    },
    // WebKit es el motor de Safari, o sea el único que la app usa en iPhone y
    // que desde Windows no se puede probar de ninguna otra forma. msedge es
    // Blink, igual que Chrome del emulador Android: correr ahí sería repetir
    // el mismo motor.
    //
    // Lo que SÍ agarra: diferencias de CSS y de APIs de JS entre motores.
    // Lo que NO: nada específico de iOS —`navigator.standalone`, el modo PWA
    // instalado, el safe area—. Esto es WebKit, no Safari de iPhone. El bug
    // del safe-area de v241 no lo habría detectado; eso sólo lo ve un iPhone.
    //
    // No corre por defecto para no duplicar el tiempo de cada corrida:
    //   npx playwright test --project=webkit
    {
      name: 'webkit',
      use: { ...devices['iPhone 14'], isMobile: false, hasTouch: false },
      dependencies: ['setup'],
    },
  ],
});
