// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  globalSetup: require.resolve('./tests/global-setup.js'),
  timeout: 60000,
  retries: 1,
  reporter: 'list',
  use: {
    baseURL: 'https://pronetprueba.netlify.app',
    headless: false,           // visible para ver qué pasa
    viewport: { width: 390, height: 844 }, // iPhone 14 (diseño mobile-first)
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
    },
    {
      name: 'msedge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
      dependencies: ['setup'],
    },
  ],
});
