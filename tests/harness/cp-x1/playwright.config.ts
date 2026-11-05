/**
 * Config SÓ do harness do CP-X1: sem o `webServer` do playwright.config.ts da raiz (que sobe
 * o Next com Clerk). O bundle é aberto por arquivo local; a rede externa é bloqueada no spec.
 *
 *   npx playwright test -c tests/harness/cp-x1/playwright.config.ts
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: /previa-real\.spec\.ts$/,
  timeout: 180_000,
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], deviceScaleFactor: 1, viewport: { width: 1280, height: 900 } },
    },
  ],
})
