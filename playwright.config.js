// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
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
    {
      name: 'msedge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
  ],
});
