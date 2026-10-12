/**
 * B1c: `criar-arte-de-modelo` não casa mais a copy com os campos da página PEDIDA (a criação pode
 * trocar de página pela foto). Repassa contrato e slotValues como vieram; os avisos vêm da arte.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: { page: { findUnique: vi.fn() } } }))
vi.mock('@prisma/client', () => ({ KnowledgeCategory: {}, Prisma: {} }))
vi.mock('@/lib/mcp/tools', () => ({ quemDecidiu: vi.fn(async () => 'u1'), canalDoPrincipal: vi.fn(() => null), projetosVisiveis: vi.fn(async () => null) }))
vi.mock('@/lib/creatives/arte-rapida', () => ({
  createArteRapida: vi.fn(async () => ({ generationId: 'g1', avisos: ['da arte'] })),
}))

import { toolsDeModelos } from '../catalogo/modelos'
import { createArteRapida } from '@/lib/creatives/arte-rapida'
import { db } from '@/lib/db'

const contrato = {
  versao: 'copy-autoral-v1',
  origem: { autor: 'claude', superficie: 'chat' },
  blocos: [{ id: 'h', funcao: 'headline', ordem: 0, linhas: ['Noite do vinho'] }],
  revisoes: [],
}

describe('criar-arte-de-modelo repassa a copy crua', () => {
  it('contrato e slotValues chegam como vieram, sem ler o modelo; o retorno é o da arte', async () => {
    const tool = toolsDeModelos.find((t) => t.nome === 'criar-arte-de-modelo')!
    const slotValues = { _driveImageId: 'd1', _slots: { 'foto-principal': { fileUrl: 'https://f' } } }
    const r = await (tool as any).handler({ projectId: 8, sourcePageId: 'p-a', slotValues, copyAutoral: contrato }, { kind: 'service' })
    const arg = (createArteRapida as any).mock.calls[0][0]
    expect(arg.slotValues).toBe(slotValues)
    expect(arg.copyAutoral).toBe(contrato)
    expect(db.page.findUnique).not.toHaveBeenCalled()
    expect(r).toEqual({ generationId: 'g1', avisos: ['da arte'] })
  })
})
