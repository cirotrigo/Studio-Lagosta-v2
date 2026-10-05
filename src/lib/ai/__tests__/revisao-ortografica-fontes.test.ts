import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrandContext } from '@/lib/brand/brand-context'
import { reconciliarSuspeitas } from '@/lib/ai/revisao-ortografica-contrato'

const dubles = vi.hoisted(() => ({
  loadBrandContext: vi.fn(),
  findMany: vi.fn(),
}))
vi.mock('@/lib/db', () => ({ db: { knowledgeBaseEntry: { findMany: dubles.findMany } } }))
vi.mock('@/lib/brand/brand-context', () => ({ loadBrandContext: dubles.loadBrandContext }))

const { carregarMarcaParaRevisao, limparCacheDeRevisao } = await import('../revisao-ortografica')

const base = {
  projectName: 'Espeto Gaúcho',
  cuisineType: null,
  colors: [],
  dna: {
    toneOfVoice: 'Direto e caloroso. Nunca escrever churasco.',
    contentRules: 'Uma oferta por peça. Nunca escrever churasco.',
    composition: null,
    visualStyle: null,
    photoDirection: null,
    approvalChecklist: null,
  },
} as unknown as BrandContext

const vozMigrada = { fonte: 'voz' as const, texto: 'COMO A MARCA FALA: direto.\n\nReescritas aprovadas (antes → depois, por quê):\n- "churasco no bafo" → "churrasco no bafo" (grafia)', regrasDaMarca: null, versao: 2, migradaEm: '2026-09-12T10:00:00.000Z', vozPendente: false, regrasDeArte: null, vocabulario: 'direto\nCostela no Bafo\nchurrasco no bafo' }
const legado = { fonte: 'legado' as const, texto: base.dna.toneOfVoice, regrasDaMarca: base.dna.contentRules, versao: null, migradaEm: null, vozPendente: false, regrasDeArte: null, vocabulario: base.dna.toneOfVoice }

describe('as fontes do vocabulário da revisão ortográfica seguem a precedência (PR7-02 / PR7-02-R)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    limparCacheDeRevisao()
    dubles.findMany.mockResolvedValue([])
  })

  it('cliente MIGRADO: o DNA de texto legado ("Nunca escrever churasco") fica fora do vocabulário e a correção churasco → churrasco sobrevive', async () => {
    dubles.loadBrandContext.mockResolvedValue({ ...base, voz: vozMigrada })
    const marca = await carregarMarcaParaRevisao(1)
    expect(marca).not.toBeNull()
    expect(marca!.vocabulario.termos).toContain('churrasco')
    expect(marca!.vocabulario.termos).not.toContain('churasco')
    expect(marca!.vocabulario.corpus).not.toMatch(/churasco/)
    const suspeitas = reconciliarSuspeitas(['CHURASCO NO BAFO'], [{ trecho: 'churasco', sugestao: 'churrasco', motivo: 'grafia' }], marca!.vocabulario)
    expect(suspeitas).toEqual([{ trecho: 'churasco', sugestao: 'churrasco', motivo: 'grafia' }])
    expect(marca!.tomDeVoz).toBe(vozMigrada.texto)
  })

  it('cliente NÃO migrado: o DNA de texto continua sendo vocabulário (o comportamento de sempre)', async () => {
    dubles.loadBrandContext.mockResolvedValue({ ...base, voz: legado })
    const marca = await carregarMarcaParaRevisao(2)
    expect(marca!.vocabulario.termos).toContain('churasco')
    expect(marca!.vocabulario.termos).toContain('caloroso')
  })
})
