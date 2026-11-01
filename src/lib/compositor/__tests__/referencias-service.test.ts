/**
 * F1 da direção por referência — a camada de serviço com o banco FINGIDO: aprovação (piso do projeto, versão
 * esperada, idempotência depois da validação, concorrência), o gate por cliente/formato (`resolucaoParaASpec`) e a
 * revogação que só vale para pedido novo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Layer } from '@/types/template'
import { CreativeError } from '@/lib/creatives/errors'
import { versaoDaPagina } from '@/lib/creatives/revisao/versao'
import brunch from '../arquetipos/__tests__/suporte/emporio-ref02-brunch.json'

const db = {
  page: { findUnique: vi.fn() },
  project: { findUnique: vi.fn() },
  referenciaDeLayout: { findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
}
vi.mock('@/lib/db', () => ({ db }))

const { aprovarReferencia, resolucaoParaASpec, referenciasDoProjeto } = await import('../referencias')
const { impressaoDoArquetipo } = await import('../arquetipos/impressao')
const { compilarReferencia } = await import('../arquetipos/referencia')

type Pagina = { id: string; name: string; width: number; height: number; tags: string[]; layers: Layer[]; background?: string }
const PAGINA = brunch as unknown as Pagina
const pagina = { ...PAGINA, layers: JSON.stringify(PAGINA.layers), Template: { projectId: 12 } }
const pageVersion = versaoDaPagina({ width: PAGINA.width, height: PAGINA.height, background: PAGINA.background, layers: PAGINA.layers })!
const definicaoV1 = (() => {
  const r = compilarReferencia(PAGINA, { pageVersion, versao: 1 })
  if (!r.ok) throw new Error('fixture não compila')
  return r.definicao
})()
const linha = (definicao: typeof definicaoV1, extra: Record<string, unknown> = {}) => ({
  id: `r${definicao.versao}`, pageId: PAGINA.id, arquetipoId: definicao.id, versao: definicao.versao, formato: 'story', impressao: impressaoDoArquetipo(definicao), pageVersion, definicao, aprovadaEm: new Date('2026-11-01'), revogadaEm: null, ...extra,
})
const erro = async (f: () => Promise<unknown>) => {
  try {
    await f()
  } catch (e) {
    return e as CreativeError
  }
  throw new Error('não recusou')
}

beforeEach(() => {
  vi.clearAllMocks()
  db.page.findUnique.mockResolvedValue(pagina)
  db.project.findUnique.mockResolvedValue({ id: 12, assinatura: null })
  db.referenciaDeLayout.findMany.mockResolvedValue([])
  db.referenciaDeLayout.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'nova', pageId: data.pageId, arquetipoId: data.arquetipoId, versao: data.versao, formato: data.formato, impressao: data.impressao, pageVersion: data.pageVersion, aprovadaEm: new Date(), revogadaEm: null }))
})

describe('aprovarReferencia', () => {
  it('compila a página do Brunch contra o piso do projeto e grava a revisão 1 (definição inteira, impressão, versão da página)', async () => {
    const r = await aprovarReferencia({ projectId: 12, pageId: PAGINA.id, aprovadaPor: 'u1' })
    expect(r.reaproveitada).toBe(false)
    expect(r.arquetipo).toEqual({ id: definicaoV1.id, versao: 1, impressao: impressaoDoArquetipo(definicaoV1) })
    const data = db.referenciaDeLayout.create.mock.calls[0][0].data
    expect(data).toMatchObject({ projectId: 12, pageId: PAGINA.id, formato: 'story', arquetipoId: definicaoV1.id, versao: 1, pageVersion, aprovadaPor: 'u1' })
    expect(data.definicao).toEqual(definicaoV1)
  })

  it('página de outro cliente é 404; o piso do PROJETO recusa a caixa que o invade (base 180 → apoio 18 px)', async () => {
    db.page.findUnique.mockResolvedValue({ ...pagina, Template: { projectId: 99 } })
    expect((await erro(() => aprovarReferencia({ projectId: 12, pageId: PAGINA.id, aprovadaPor: null }))).code).toBe('PAGE_NOT_FOUND')
    db.page.findUnique.mockResolvedValue(pagina)
    db.project.findUnique.mockResolvedValue({ id: 12, assinatura: { geometria: { story: { safeRodape: 180 } } } })
    const e = await erro(() => aprovarReferencia({ projectId: 12, pageId: PAGINA.id, aprovadaPor: null }))
    expect(e.code).toBe('REFERENCIA_FORA_DO_PISO')
    expect(e.message).toContain('apoio passa base 18 px')
    expect(db.referenciaDeLayout.create).not.toHaveBeenCalled()
  })

  it('versaoEsperada diferente da página atual recusa (409) — aprova-se o que foi conferido', async () => {
    const e = await erro(() => aprovarReferencia({ projectId: 12, pageId: PAGINA.id, aprovadaPor: null, versaoEsperada: 'v1:outra' }))
    expect(e.code).toBe('REFERENCIA_PAGINA_MUDOU')
    expect(e.status).toBe(409)
    expect((await aprovarReferencia({ projectId: 12, pageId: PAGINA.id, aprovadaPor: null, versaoEsperada: pageVersion })).arquetipo.versao).toBe(1)
  })

  it('idempotente: a mesma página já vigente não grava; página mudada (ou revisão revogada) grava a versão seguinte', async () => {
    db.referenciaDeLayout.findMany.mockResolvedValue([linha(definicaoV1)])
    const r = await aprovarReferencia({ projectId: 12, pageId: PAGINA.id, aprovadaPor: null })
    expect(r.reaproveitada).toBe(true)
    expect(r.arquetipo.versao).toBe(1)
    expect(db.referenciaDeLayout.create).not.toHaveBeenCalled()
    db.referenciaDeLayout.findMany.mockResolvedValue([linha(definicaoV1, { revogadaEm: new Date() })])
    expect((await aprovarReferencia({ projectId: 12, pageId: PAGINA.id, aprovadaPor: null })).arquetipo.versao).toBe(2)
  })

  it('a idempotência vem DEPOIS da validação: com o piso mudado, a mesma página é recusada em vez de reaproveitada', async () => {
    db.referenciaDeLayout.findMany.mockResolvedValue([linha(definicaoV1)])
    db.project.findUnique.mockResolvedValue({ id: 12, assinatura: { geometria: { story: { safeRodape: 180 } } } })
    expect((await erro(() => aprovarReferencia({ projectId: 12, pageId: PAGINA.id, aprovadaPor: null }))).code).toBe('REFERENCIA_FORA_DO_PISO')
  })

  it('concorrência: perde o índice único, relê e reaproveita a equivalente; diferente é REFERENCIA_CONCORRENTE', async () => {
    db.referenciaDeLayout.create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))
    db.referenciaDeLayout.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([linha(definicaoV1)])
    expect((await aprovarReferencia({ projectId: 12, pageId: PAGINA.id, aprovadaPor: null })).reaproveitada).toBe(true)
    db.referenciaDeLayout.create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))
    db.referenciaDeLayout.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([linha(definicaoV1, { pageVersion: 'v1:outra-pagina' })])
    expect((await erro(() => aprovarReferencia({ projectId: 12, pageId: PAGINA.id, aprovadaPor: null }))).code).toBe('REFERENCIA_CONCORRENTE')
  })
})

describe('resolucaoParaASpec — o gate por cliente/formato no servidor', () => {
  const v2 = { ...definicaoV1, versao: 2 }
  it('sem arquétipo na spec, não vai ao banco', async () => {
    expect(await resolucaoParaASpec({ projectId: 12, formato: 'story' })).toEqual({})
    expect(db.referenciaDeLayout.findMany).not.toHaveBeenCalled()
  })

  it('pedido novo: só as vigentes do cliente no formato; com referência, o catálogo fica bloqueado; sem, aberto', async () => {
    db.referenciaDeLayout.findMany.mockResolvedValue([linha(definicaoV1)])
    const r = await resolucaoParaASpec({ projectId: 12, formato: 'story', arquetipo: { id: 'minimal-fb-topo-esquerda' } })
    expect(r.definicoes).toEqual([definicaoV1])
    expect(r.catalogoBloqueado?.motivo).toContain(`${definicaoV1.id}@1`)
    expect(db.referenciaDeLayout.findMany.mock.calls[0][0].where).toEqual({ projectId: 12, formato: 'story', revogadaEm: null })
    db.referenciaDeLayout.findMany.mockResolvedValue([])
    expect(await resolucaoParaASpec({ projectId: 12, formato: 'story', arquetipo: { id: 'minimal-fb-topo-esquerda' } })).toEqual({ definicoes: [] })
  })

  it('reprodução (worker, recomposição): com as revogadas e o catálogo aberto; id de catálogo não consulta o banco', async () => {
    db.referenciaDeLayout.findMany.mockResolvedValue([linha(definicaoV1, { revogadaEm: new Date() }), linha(v2)])
    const r = await resolucaoParaASpec({ projectId: 12, formato: 'story', arquetipo: { id: definicaoV1.id, versao: 1 } }, { reproducao: true })
    expect(r.definicoes?.map((d) => d.versao)).toEqual([1, 2])
    expect(r.catalogoBloqueado).toBeUndefined()
    expect(db.referenciaDeLayout.findMany.mock.calls[0][0].where).toEqual({ projectId: 12 })
    expect(await resolucaoParaASpec({ projectId: 12, formato: 'story', arquetipo: { id: 'minimal-fb-topo-esquerda' } }, { reproducao: true })).toEqual({})
  })

  it('linha cuja impressão não bate com a definição gravada é REFERENCIA_CORROMPIDA, nunca pulada', async () => {
    db.referenciaDeLayout.findMany.mockResolvedValue([linha(definicaoV1, { impressao: 'arq1-00000000000000' })])
    expect((await erro(() => referenciasDoProjeto(12))).code).toBe('REFERENCIA_CORROMPIDA')
  })
})
