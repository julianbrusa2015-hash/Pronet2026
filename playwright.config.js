// @ts-check
const { defineConfig, devices } = require('@playwright/test');

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
  ],
});
