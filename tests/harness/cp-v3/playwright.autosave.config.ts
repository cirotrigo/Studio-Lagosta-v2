/**
 * Config SÓ da prova H11 do CP-V3 (autosave real com API falsa). Separada do `playwright.config.ts` para que os
 * controles negativos M0–M13 não a incluam.
 *
 *   npx playwright test -c tests/harness/cp-v3/playwright.autosave.config.ts
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: /autosave\.spec\.ts$/,
  timeout: 120_000,
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], deviceScaleFactor: 1 } }],
})
