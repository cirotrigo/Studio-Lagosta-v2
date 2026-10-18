/**
 * Config SÓ DE DIAGNÓSTICO para o job Linux (`.github/workflows/diag-worker.yml`): é o `vitest.config.ts` OFICIAL sem
 * alteração (include, exclude, timeout, pool e nº de workers padrão) + o `rastro-v3.ts` acrescentado aos setupFiles.
 */
import { mergeConfig } from 'vitest/config'
import { resolve } from 'path'
import oficial from '../vitest.config'
export default mergeConfig(oficial, { root: resolve(__dirname, '..'), test: { setupFiles: [resolve(__dirname, 'rastro-v3.ts')] } })
