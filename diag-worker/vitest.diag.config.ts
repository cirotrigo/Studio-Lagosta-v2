/**
 * Config SÓ DE DIAGNÓSTICO. Mesmo ambiente do `vitest.config.ts` oficial (globals, node, `vitest.setup.ts` hermético, aliases,
 * testTimeout) + o `rastro.ts`; `include` vem de DIAG_INCLUDE. Pool `forks`, 1 worker. Não altera a config oficial.
 */
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
const raiz = resolve(__dirname, '..')
export default defineConfig({
  root: raiz,
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [resolve(raiz, 'vitest.setup.ts'), resolve(__dirname, 'rastro.ts')],
    testTimeout: 20_000,
    include: (process.env.DIAG_INCLUDE ?? '').split(',').filter(Boolean),
    pool: 'forks',
    maxWorkers: Number(process.env.DIAG_WORKERS ?? 1),
  },
  resolve: { alias: { '@': resolve(raiz, './src') } },
})
