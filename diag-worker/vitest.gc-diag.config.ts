/** Targeted diagnostic only; the original PR238 test is copied byte-for-byte. */
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import oficial from '../vitest.config'

export default defineConfig({
  ...oficial,
  root: resolve(__dirname, '..'),
  test: {
    ...oficial.test,
    include: ['diag-worker/canvas-encode-sobrevive-ao-gc.test.ts'],
    setupFiles: ['./vitest.setup.ts', resolve(__dirname, 'rastro-v3.ts')],
  },
})
