import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/db', () => ({ db: { customFont: { findMany: vi.fn(async () => []) } } }))
afterEach(() => { vi.resetModules(); vi.doUnmock('@napi-rs/canvas') })
describe('PR238: recovery contracts, synthetic failure injection', () => {
 it('native addon unavailable still permits familiasNaoCarregadas fail-closed result', async () => {
  vi.resetModules()
  vi.doMock('@napi-rs/canvas', () => { throw new Error('synthetic native addon unavailable') })
  const mod = await import('@/lib/posts/register-project-fonts')
  expect([...await mod.familiasNaoCarregadas(['SyntheticFont'])]).toEqual(['SyntheticFont'])
 })
 it('initialization retries after alias throws, rather than silently claiming success', async () => {
  vi.resetModules()
  const setAlias = vi.fn().mockImplementationOnce(() => { throw new Error('synthetic alias failure') }).mockReturnValue(true)
  vi.doMock('@napi-rs/canvas', () => ({ GlobalFonts: { registerFromPath: vi.fn(() => ({})), setAlias }, createCanvas: vi.fn(), loadImage: vi.fn(), Path2D: class {} }))
  const { garantirFontesPadrao } = await import('@/lib/canvas-renderer')
  expect(() => garantirFontesPadrao()).toThrow('synthetic alias failure')
  garantirFontesPadrao()
  expect(setAlias).toHaveBeenCalledTimes(2)
 })
})
