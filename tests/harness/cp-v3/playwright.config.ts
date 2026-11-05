/**
 * Config SÓ do harness do CP-V3 (cores por slot): sem o `webServer` do playwright.config.ts da raiz. O bundle é aberto
 * por arquivo local; a rede externa é bloqueada no spec.
 *
 *   npx playwright test -c tests/harness/cp-v3/playwright.config.ts
 *   CP3_VARIANTE=M9 npx playwright test -c tests/harness/cp-v3/playwright.config.ts   # controle negativo
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: /cp-v3\.spec\.ts$/,
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], deviceScaleFactor: 1 } }],
})
