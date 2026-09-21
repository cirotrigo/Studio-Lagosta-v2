import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VozCompacta } from '../voz'

/**
 * PR14-16 — o lado do SERVIÇO: depois de `gravarVoz` a escrita está
 * confirmada, e a releitura que monta o resto da resposta é conveniência.
 * Falhando nela, o PUT devolvia 500 sobre uma voz que JÁ estava no banco (e,
 * em cliente migrado, já mandando na copy): a tela dizia "erro ao salvar", a
 * tentativa seguinte ia com a versão velha e tomava `VOZ_DIVERGENTE` do
 * próprio salvamento.
 *
 * O banco e os vizinhos pesados são dublês (o padrão da casa para serviço que
 * importa Prisma): o que se exercita aqui é só quem sustenta a resposta.
 */
const VOZ: VozCompacta = {
  versao: 'voz-v1',
  descricao: 'Direta e quente.',
  exemplos: ['Sexta é dia de costela.'],
  antesDepois: [],
  termos: ['costela no bafo'],
  proibicoes: [],
  regras: [],
}

const dna = { findUnique: vi.fn(async () => ({ toneOfVoice: 'tom', contentRules: 'regras' })) }
const gravarVoz = vi.fn(async () => ({ versao: 2, voz: VOZ, criada: false }))
const lerRegistroDaVoz = vi.fn(async () => ({ versao: 2, voz: VOZ, problemas: [], migradaEm: null, dnaArquivado: null, updatedAt: new Date('2026-09-21T12:00:00.000Z') }))
const contextoDeVoz = vi.fn(async () => ({ fonte: 'legado', texto: null, regrasDaMarca: null, versao: null, migradaEm: null, vozPendente: true, regrasDeArte: null, vocabulario: null }))

vi.mock('@/lib/db', () => ({ db: { brandDNA: dna, page: { findMany: vi.fn(async () => []) } } }))
vi.mock('../voz-service', () => ({ gravarVoz, lerRegistroDaVoz, contextoDeVoz }))
vi.mock('@/lib/compositor/compor', () => ({ paginasDeAssinatura: vi.fn(async () => ({ templateId: null, paginas: [] })) }))
vi.mock('@/lib/creatives/persist', () => ({ getPublicAppUrl: () => 'https://exemplo.test' }))

beforeEach(() => {
  vi.clearAllMocks()
  dna.findUnique.mockImplementation(async () => ({ toneOfVoice: 'tom', contentRules: 'regras' }))
  lerRegistroDaVoz.mockImplementation(async () => ({ versao: 2, voz: VOZ, problemas: [], migradaEm: null, dnaArquivado: null, updatedAt: new Date('2026-09-21T12:00:00.000Z') }))
  gravarVoz.mockImplementation(async () => ({ versao: 2, voz: VOZ, criada: false }))
})

describe('salvarVozDaMarca — a releitura complementar não decide se a escrita aconteceu (PR14-16)', () => {
  it('releitura OK: o recibo e a leitura vêm juntos', async () => {
    const { salvarVozDaMarca } = await import('../aba-marca')
    const r = await salvarVozDaMarca({ projectId: 8, voz: VOZ, versaoEsperada: 1 })
    expect(r.gravada).toEqual({ versao: 2, criada: false, voz: VOZ })
    expect(r.leitura?.registro).toMatchObject({ versao: 2 })
    expect(r.leituraFalhou).toBeUndefined()
  })

  it('a releitura falha DEPOIS da escrita: devolve o recibo com `leitura: null` em vez de lançar', async () => {
    const { salvarVozDaMarca } = await import('../aba-marca')
    lerRegistroDaVoz.mockImplementation(async () => {
      throw new Error('banco piscou')
    })
    const r = await salvarVozDaMarca({ projectId: 8, voz: VOZ, versaoEsperada: 1 })
    expect(gravarVoz).toHaveBeenCalledTimes(1)
    expect(r.gravada).toEqual({ versao: 2, criada: false, voz: VOZ })
    expect(r.leitura).toBeNull()
    expect(r.leituraFalhou).toContain('banco piscou')
  })

  it('a falha na leitura do DNA legado (o outro braço da releitura) também não derruba a resposta', async () => {
    const { salvarVozDaMarca } = await import('../aba-marca')
    dna.findUnique.mockImplementation(async () => {
      throw new Error('timeout no DNA')
    })
    const r = await salvarVozDaMarca({ projectId: 8, voz: VOZ, versaoEsperada: 1 })
    expect(r.gravada.versao).toBe(2)
    expect(r.leitura).toBeNull()
  })

  it('voz inválida continua sendo recusada ANTES de qualquer escrita', async () => {
    const { salvarVozDaMarca } = await import('../aba-marca')
    await expect(salvarVozDaMarca({ projectId: 8, voz: { descricao: '' }, versaoEsperada: 1 })).rejects.toMatchObject({ code: 'VOZ_INVALIDA', status: 400 })
    expect(gravarVoz).not.toHaveBeenCalled()
  })

  it('o erro de `gravarVoz` (o CAS) continua subindo: aí a escrita NÃO aconteceu', async () => {
    const { salvarVozDaMarca } = await import('../aba-marca')
    gravarVoz.mockImplementation(async () => {
      throw Object.assign(new Error('A voz mudou enquanto você editava'), { code: 'VOZ_DIVERGENTE', status: 409 })
    })
    await expect(salvarVozDaMarca({ projectId: 8, voz: VOZ, versaoEsperada: 1 })).rejects.toMatchObject({ code: 'VOZ_DIVERGENTE' })
  })
})
