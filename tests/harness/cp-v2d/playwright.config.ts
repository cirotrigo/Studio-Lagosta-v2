/**
 * Config SÓ do harness do CP-V2d (e do CP-V2e, `marca.spec.ts`): sem o `webServer` da raiz (a origem é falsa e servida pelo próprio spec), Chromium,
 * um worker, no computador (1280×800) e no celular (375×812).
 *
 *   npx playwright test -c tests/harness/cp-v2d/playwright.config.ts
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  testMatch: /(elementos|marca)\.spec\.ts$/,
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } },
    { name: 'celular', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true } },
  ],
})
