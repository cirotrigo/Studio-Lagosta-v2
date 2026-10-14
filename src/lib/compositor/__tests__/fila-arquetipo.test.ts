/**
 * T1a — a fila recebe o arquétipo RESOLVIDO: o payload do job, a Generation
 * PROCESSING e (por eles) o hash do lote levam id + versão + impressão; as
 * recusas que não dependem da medida saem na hora, não no worker. Sem
 * arquétipo, a spec não ganha a chave.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({ generations: [] as Array<Record<string, any>>, jobs: [] as Array<Record<string, any>> }))

vi.mock('@/lib/db', () => ({
  db: {
    project: { findUnique: async () => ({ id: 6, name: 'Projeto', userId: 'dono-interno' }) },
    generation: {
      create: async ({ data }: { data: Record<string, any> }) => {
        banco.generations.push(data)
        return { id: `gen-${banco.generations.length}` }
      },
    },
  },
}))
vi.mock('../pastas', () => ({ garantirPasta: async () => ({ id: 77, name: 'Semana' }) }))
vi.mock('@/lib/ai/generation-queue', () => ({
  enfileirarComposicao: async (args: Record<string, any>) => {
    banco.jobs.push(JSON.parse(JSON.stringify(args)))
    return `job-${banco.jobs.length}`
  },
  pedirNovaTentativa: vi.fn(),
}))

import { enfileirarPeca } from '../fila'
import { verArquetipo } from '../arquetipos/catalogo'
import { impressaoDoArquetipo } from '../arquetipos/impressao'
import { CreativeError } from '@/lib/creatives/errors'

const TOPO = 'minimal-fb-topo-esquerda'
const spec = (extra: Record<string, unknown> = {}) => ({
  projectId: 6,
  formato: 'story',
  blocos: [
    { papel: 'headline', linhas: ['Almoço de domingo'] },
    { papel: 'servico', linhas: ['Dom · 12h às 16h'] },
  ],
  ...extra,
})

beforeEach(() => {
  banco.generations = []
  banco.jobs = []
})

describe('T1a · a fila', () => {
  it('2. id sem versão entra RESOLVIDO no payload e na Generation (a peça não depende mais de "a mais recente")', async () => {
    const r = await enfileirarPeca(spec({ arquetipo: { id: TOPO } }))
    const esperado = { id: TOPO, versao: 1, impressao: impressaoDoArquetipo(verArquetipo(TOPO, 1)!) }
    expect(r.spec.arquetipo).toEqual(esperado)
    expect(banco.jobs[0].spec.arquetipo).toEqual(esperado)
    expect(banco.generations[0].fieldValues.spec.arquetipo).toEqual(esperado)
  })

  it('sem arquétipo, a spec não ganha a chave (payload e hash como antes)', async () => {
    const r = await enfileirarPeca(spec())
    expect('arquetipo' in r.spec).toBe(false)
    expect('arquetipo' in banco.jobs[0].spec).toBe(false)
  })

  it('as recusas do arquétipo saem na hora, sem criar Generation nem job', async () => {
    for (const [extra, codigo] of [
      [{ arquetipo: { id: 'minimal-fb-base-esquerda' }, blocos: [{ papel: 'headline', linhas: ['x'] }, { papel: 'apoio', linhas: ['y'] }, { papel: 'servico', linhas: ['z'] }] }, 'ARQUETIPO_INDISPONIVEL'],
      [{ arquetipo: { id: TOPO }, formato: 'quadrado' }, 'ARQUETIPO_FORMATO_NAO_SUPORTADO'],
      [{ arquetipo: { id: TOPO }, blocos: [{ papel: 'headline', linhas: ['um', 'dois', 'três'] }, { papel: 'servico', linhas: ['z'] }] }, 'ARQUETIPO_LINHAS_EXCEDIDAS'],
      [{ arquetipo: { id: TOPO, versao: 1, impressao: 'arq1-00000000000000' } }, 'ARQUETIPO_IMPRESSAO_DIVERGENTE'],
    ] as const) {
      const erro = await enfileirarPeca(spec(extra as Record<string, unknown>)).then(
        () => null,
        (e) => e,
      )
      expect(erro).toBeInstanceOf(CreativeError)
      expect((erro as CreativeError).code).toBe(codigo)
    }
    expect(banco.generations).toEqual([])
    expect(banco.jobs).toEqual([])
  })
})
