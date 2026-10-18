// Targeted G21 synthetic parity only: historical G24 client fixture is outside authorization.
// Original assertions and official configuration remain unchanged.
import { defineConfig } from 'vitest/config'
import oficial from '../vitest.config'
export default defineConfig({ ...oficial, test: { ...oficial.test, include: ['src/lib/creatives/revisao/__tests__/gate.test.ts'], testNamePattern: 'G21' } })
