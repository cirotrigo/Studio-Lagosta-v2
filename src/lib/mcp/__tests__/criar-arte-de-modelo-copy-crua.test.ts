/**
 * B1c: `criar-arte-de-modelo` não casa mais a copy com os campos da página PEDIDA (a criação pode
 * trocar de página pela foto). Repassa contrato e slotValues como vieram; os avisos vêm da arte.
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: { page: { findUnique: vi.fn() } } }))
vi.mock('@prisma/client', () => ({ KnowledgeCategory: {}, Prisma: {} }))
vi.mock('@/lib/mcp/tools', () => ({ quemDecidiu: vi.fn(async () => 'u1'), canalDoPrincipal: vi.fn(() => null), projetosVisiveis: vi.fn(async () => null) }))
vi.mock('@/lib/creatives/arte-rapida', async () => {
  const { CreativeError } = await import('@/lib/creatives/errors')
  return {
    createArteRapida: vi.fn(async () => ({ generationId: 'g1', avisos: ['da arte'] })),
  }
})

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

describe('CP4.2b — V17: a FASE 1 (formato) roda no HANDLER e chega à porta com código, chave e lista', () => {
  it('{ x: 123 } → CreativeError VALOR_INVALIDO 400 com details.erros; o serviço não é chamado', async () => {
    const tool = toolsDeModelos.find((t) => t.nome === 'criar-arte-de-modelo')!
    const { CreativeError } = await import('@/lib/creatives/errors')
    ;(createArteRapida as any).mockClear()
    await expect((tool as any).handler({ projectId: 8, sourcePageId: 'p-a', slotValues: { x: 123, _slots: { a: 'ok' } } }, { kind: 'service' })).rejects.toMatchObject({
      code: 'VALOR_INVALIDO',
      status: 400,
      details: { erros: [{ codigo: 'VALOR_INVALIDO', origem: { tipo: 'chave', chave: 'x' } }] },
    })
    await expect((tool as any).handler({ projectId: 8, sourcePageId: 'p-a', slotValues: { x: 123 } }, { kind: 'service' })).rejects.toBeInstanceOf(CreativeError)
    expect(createArteRapida).not.toHaveBeenCalled()
  })
})

describe('erroDeValores (CP4.2b, Codex R2)', () => {
  it('a mensagem nomeia a chave e a dica certa por origem: legado aceita hidden/papel/bloco; _slots/_papeis só content/fileUrl', async () => {
    const { erroDeValores } = await import('@/lib/creatives/errors')
    const legado = erroDeValores([{ codigo: 'VALOR_INVALIDO', origem: { tipo: 'chave', chave: 'cta' } }], 400)
    expect(legado.code).toBe('VALOR_INVALIDO')
    expect(legado.status).toBe(400)
    expect(legado.message).toContain('"cta"')
    expect(legado.message).toContain('hidden: true')
    const semantico = erroDeValores([{ codigo: 'VALOR_INVALIDO', origem: { tipo: 'slotId', chave: 'manchete' } }], 400)
    expect(semantico.message).toContain('"manchete"')
    expect(semantico.message).toContain('_slots/_papeis')
    expect(semantico.message).not.toContain('hidden')
    expect((semantico.details as { erros: unknown[] }).erros).toHaveLength(1)
  })
})
