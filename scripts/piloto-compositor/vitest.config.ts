import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
export default defineConfig({ test: { environment: 'node', include: ['scripts/piloto-compositor/*.test.ts'], testTimeout: 180000 }, resolve: { alias: { '@': resolve('src') } } })
