/**
 * Config SÓ do harness do seletor de cor da forma: sem o `webServer` do playwright.config.ts da raiz. O bundle é aberto
 * por arquivo local; a rede externa é bloqueada no spec.
 *
 *   npx playwright test -c tests/harness/seletor-cor/playwright.config.ts
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: /seletor\.spec\.ts$/,
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], deviceScaleFactor: 1 } }],
})
