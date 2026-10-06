import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const fake = vi.hoisted(() => ({ incr: vi.fn(), scan: vi.fn(), del: vi.fn() }))
vi.mock('@upstash/redis', () => ({ Redis: class { incr = fake.incr; scan = fake.scan; del = fake.del } }))
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks()
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://fake.upstash.io'); vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'fake'); vi.stubEnv('RAG_CACHE_HARD_INVALIDATION', '0')
  fake.incr.mockResolvedValue(12)
})
afterEach(() => vi.unstubAllEnvs())
it('confirma bump restrito ao projeto mesmo sem DEL; compatibilidade retorna zero', async () => {
  const cache = await import('../cache')
  expect(await cache.invalidateProjectCacheWithReceipt(6)).toEqual({ projectId: 6, status: 'confirmed', version: 12, deletedCount: 0 })
  expect(fake.incr).toHaveBeenCalledWith('rag:ver:6')
  expect(await cache.invalidateProjectCache(6)).toBe(0); expect(fake.scan).not.toHaveBeenCalled()
})
it('sem credenciais é indisponível e não confirma bump', async () => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', ''); vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
  const cache = await import('../cache')
  expect((await cache.invalidateProjectCacheWithReceipt(6)).status).toBe('unavailable'); expect(fake.incr).not.toHaveBeenCalled()
})
it('falha Redis ou resposta inválida é failed', async () => {
  const cache = await import('../cache')
  fake.incr.mockRejectedValueOnce(new Error('Redis indisponível'))
  expect((await cache.invalidateProjectCacheWithReceipt(6)).status).toBe('failed')
  fake.incr.mockResolvedValueOnce({ error: 'rate limit' })
  expect((await cache.invalidateProjectCacheWithReceipt(6)).status).toBe('failed')
})
it('falha hard cleanup preserva confirmação de bump e explicita pendência', async () => {
  vi.stubEnv('RAG_CACHE_HARD_INVALIDATION', '1'); fake.scan.mockRejectedValueOnce(new Error('SCAN falhou'))
  const cache = await import('../cache'); const receipt = await cache.invalidateProjectCacheWithReceipt(6)
  expect(receipt).toMatchObject({ status: 'confirmed', version: 12, cleanupFailed: true })
  expect(fake.scan).toHaveBeenCalledWith(0, { match: 'rag:6:*', count: 200 })
})
