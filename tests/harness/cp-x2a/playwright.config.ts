/**
 * Config SÓ do harness do CP-X2a (conferência cruzada do `lerCor` com o Chromium): sem o `webServer` do
 * playwright.config.ts da raiz. O bundle é aberto por arquivo local; a rede externa é bloqueada no spec.
 *
 *   npx playwright test -c tests/harness/cp-x2a/playwright.config.ts
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: /cores\.spec\.ts$/,
  timeout: 120_000,
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], deviceScaleFactor: 1 } }],
})
