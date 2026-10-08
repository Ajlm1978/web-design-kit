import { defineConfig, devices } from '@playwright/test';

/**
 * Pruebas E2E sobre el build estático servido por `astro preview`.
 * Ejecuta `npm run build` antes (o deja que `webServer` lo haga vía `npm run build && …`).
 */
const PORT = 4321;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    // `--ignore-lock`: Astro 7 gestiona un lock de preview en segundo plano; sin el flag,
    // un servidor previo (p. ej. de otro proyecto) hace que el proceso salga al instante.
    command: `npm run build && npx astro preview --port ${PORT} --host localhost --ignore-lock`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
