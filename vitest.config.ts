import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Hermético: sem banco, sem rede (ver o arquivo).
    setupFiles: ['./vitest.setup.ts'],
    // O runner do CI é ~3× mais lento que uma máquina local, e o primeiro teste de cada arquivo paga o import:
    // 5 s (padrão) derrubava o gate por tempo, não por regra. Asserção errada continua falhando igual.
    testTimeout: 20_000,
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['node_modules', '.next', 'tests/e2e', 'desktop-app/**'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
