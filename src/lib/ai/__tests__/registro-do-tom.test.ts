import { beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { createHash } from 'node:crypto'
const { upload } = vi.hoisted(() => ({ upload: vi.fn() }))
vi.mock('@vercel/blob', () => ({ put: upload }))
import { registrarEtapasDoTom } from '../registro-do-tom'

async function foto(cor: string) {
  return sharp({ create: { width: 3, height: 2, channels: 3, background: cor } }).png().toBuffer()
}
beforeEach(() => upload.mockReset().mockImplementation(async (path: string) => ({ url: `https://example.test/${path}` })))
describe('registro das etapas do tom', () => {
  it('guarda os bytes exatos das três etapas e identifica a tentativa', async () => {
    const referencia = await foto('red'), antes = await foto('black'), depois = await foto('white')
    const r = await registrarEtapasDoTom('geracao', { referencia, antes, depois, aplicado: true, tentativa: 2 })
    expect(r.estado).toBe('completo')
    expect(r.tentativa).toBe(2)
    for (const [i, buffer] of [referencia, antes, depois].entries()) {
      const call = upload.mock.calls.find(c => c[0].includes('/' + ['referencia', 'antes', 'depois'][i] + '.'))!
      expect(call[1]).toBe(buffer)
      expect(r.imagens[i].sha256).toBe(createHash('sha256').update(buffer).digest('hex'))
      expect(call[2].abortSignal).toBeInstanceOf(AbortSignal)
    }
  })
  it('falha de um upload mantém os demais e não derruba a geração', async () => {
    upload.mockImplementation(async (path: string) => {
      if (path.includes('/referencia.')) throw new Error('erro privado')
      return { url: `https://example.test/${path}` }
    })
    const buffer = await foto('red')
    const r = await registrarEtapasDoTom('geracao', { referencia: buffer, antes: buffer, depois: buffer, aplicado: false, tentativa: 1 })
    expect(r.estado).toBe('incompleto')
    expect(r.imagens.map(i => i.estado)).toEqual(['falhou', 'salvo', 'salvo'])
    expect(JSON.stringify(r)).not.toContain('erro privado')
    expect(r.aplicado).toBe(false)
    expect(r.imagens[1].sha256).toBe(r.imagens[2].sha256)
  })
})
