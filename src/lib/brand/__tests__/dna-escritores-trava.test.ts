import { beforeEach, describe, expect, it, vi } from 'vitest'
const s = vi.hoisted(() => ({
  ordem: [] as string[],
  query: vi.fn(),
  upsert: vi.fn(),
}))
vi.mock('@/lib/knowledge/entries', () => ({ criarEntradaBase: vi.fn() }))
vi.mock('@/lib/db', () => {
  const tx = { $queryRaw: s.query, brandDNA: { upsert: s.upsert } }
  return {
    db: {
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => {
        s.ordem.push('tx')
        return fn(tx)
      }),
      brandDNA: tx.brandDNA,
    },
  }
})
import { updateBrandDNA } from '../brand-context'
beforeEach(() => {
  s.ordem = []
  s.query.mockReset().mockImplementation(async () => {
    s.ordem.push('Project lock')
    return [{ id: 6 }]
  })
  s.upsert.mockReset().mockImplementation(async ({ create }) => {
    s.ordem.push('upsert')
    return create
  })
})
describe('escritor UI/MCP usa mesma trava inclusive DNA ausente', () => {
  it('upsert só ocorre após Project dentro da transação', async () => {
    await updateBrandDNA(6, { toneOfVoice: 'Novo' })
    expect(s.ordem).toEqual(['tx', 'Project lock', 'upsert'])
    expect(s.query.mock.calls[0][0].join('?')).toContain('FOR UPDATE')
    expect(s.upsert.mock.calls[0][0].create).toMatchObject({
      projectId: 6,
      toneOfVoice: 'Novo',
    })
  })
  it('projeto inexistente não permite criar DNA', async () => {
    s.query.mockResolvedValue([])
    await expect(
      updateBrandDNA(6, { toneOfVoice: 'Novo' })
    ).rejects.toMatchObject({ code: 'PROJECT_NOT_FOUND' })
    expect(s.upsert).not.toHaveBeenCalled()
  })
  it('falha na trava não executa upsert', async () => {
    s.query.mockRejectedValue(new Error('lock falhou'))
    await expect(updateBrandDNA(6, { contentRules: 'Novo' })).rejects.toThrow(
      'lock falhou'
    )
    expect(s.upsert).not.toHaveBeenCalled()
  })
})
