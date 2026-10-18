import { defineConfig } from 'vitest/config'
import oficial from '../vitest.config'
export default defineConfig({ ...oficial, test: { ...oficial.test, include: ['diag-worker/review238/*.test.ts'] } })
