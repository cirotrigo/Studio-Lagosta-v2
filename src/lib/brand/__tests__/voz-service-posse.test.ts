import { beforeEach, describe, expect, it, vi } from 'vitest'
import { VOZES_PROPOSTAS } from '../../../../scripts/lib/vozes-propostas'

const d = vi.hoisted(() => ({ vozFind: vi.fn(), vozCreate: vi.fn(), vozUpdateMany: vi.fn(), dnaFind: vi.fn(), kbFindMany: vi.fn() }))
vi.mock('@/lib/db', () => {
  const brandVoice = { findUnique: d.vozFind, create: d.vozCreate, updateMany: d.vozUpdateMany }
  const brandDNA = { findUnique: d.dnaFind }
  const knowledgeBaseEntry = { findMany: d.kbFindMany }
  const tx = { brandVoice, brandDNA, knowledgeBaseEntry }
  return { db: { brandVoice, brandDNA, knowledgeBaseEntry, $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) } }
})

// O client do Prisma gerado neste worktree não resolve em teste; o serviço só usa o namespace para a transação e o erro P2034.
vi.mock('@prisma/client', () => ({ Prisma: { TransactionIsolationLevel: { Serializable: 'Serializable' }, PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error { code = '' } } }))

import { gravarVoz, migrarParaVoz } from '../voz-service'

const VOZ = VOZES_PROPOSTAS[6].voz

describe('PR13-38 — a posse de uma trava externa é conferida DENTRO do serviço, depois das leituras e antes de escrever', () => {
  beforeEach(() => { for (const f of Object.values(d)) f.mockReset() })

  it('gravarVoz: `antesDeEscrever` roda depois de `brandVoice.findUnique`; lançando, nem `create` nem `updateMany` acontecem (voz nova e voz existente)', async () => {
    d.vozFind.mockResolvedValue(null)
    const posse = vi.fn(async () => { throw new Error('a posse da trava se perdeu') })
    await expect(gravarVoz({ projectId: 6, voz: VOZ, antesDeEscrever: posse })).rejects.toThrow(/posse da trava/)
    expect(posse.mock.invocationCallOrder[0]).toBeGreaterThan(d.vozFind.mock.invocationCallOrder[0])
    expect(d.vozCreate).not.toHaveBeenCalled()
    d.vozFind.mockResolvedValue({ versao: 3 })
    await expect(gravarVoz({ projectId: 6, voz: VOZ, versaoEsperada: 3, antesDeEscrever: posse })).rejects.toThrow(/posse da trava/)
    expect(d.vozUpdateMany).not.toHaveBeenCalled()
  })

  it('gravarVoz: com a posse íntegra a escrita segue (CAS na versão lida)', async () => {
    d.vozFind.mockResolvedValue({ versao: 3 })
    d.vozUpdateMany.mockResolvedValue({ count: 1 })
    const r = await gravarVoz({ projectId: 6, voz: VOZ, versaoEsperada: 3, antesDeEscrever: async () => undefined })
    expect(r.versao).toBe(4)
    expect(d.vozUpdateMany).toHaveBeenCalledTimes(1)
  })

  it('migrarParaVoz: `antesDeEscrever` roda dentro da transação, DEPOIS das leituras do DNA e dos fatos; lançando, `migradaEm` não é escrito', async () => {
    d.vozFind.mockResolvedValue({ voz: VOZ, versao: 4, migradaEm: null })
    d.dnaFind.mockResolvedValue({ toneOfVoice: 'tom', contentRules: 'regras', updatedAt: new Date() })
    d.kbFindMany.mockResolvedValue([{ id: 'f1', content: 'Aniversário só com bolo próprio.', category: 'ESTABELECIMENTO_INFO', status: 'ACTIVE', expiresAt: null, metadata: { indexadoEm: '2026-09-12T10:00:00.000Z' } }])
    const posse = vi.fn(async () => { throw new Error('a posse da trava se perdeu') })
    await expect(
      migrarParaVoz({
        projectId: 6,
        versaoEsperada: 4,
        dnaEsperado: { toneOfVoice: 'tom', contentRules: 'regras' },
        fatosEsperados: [{ entryId: 'f1', trecho: 'Aniversário só com bolo próprio.', categoria: 'ESTABELECIMENTO_INFO', validaAte: null }] as never,
        antesDeEscrever: posse,
      }),
    ).rejects.toThrow(/posse da trava/)
    expect(posse).toHaveBeenCalledTimes(1)
    expect(posse.mock.invocationCallOrder[0]).toBeGreaterThan(d.kbFindMany.mock.invocationCallOrder[0])
    expect(posse.mock.invocationCallOrder[0]).toBeGreaterThan(d.dnaFind.mock.invocationCallOrder[0])
    expect(d.vozUpdateMany).not.toHaveBeenCalled()
  })
})
