/**
 * T5 (24/10/2026) — os consumidores das variantes FORA do `escolherVariante`: a seleção experimental (C1), a união de
 * papéis da copy legada (C3), a aba Marca (C5) e a dica do `ver-assinatura` (C4). Dublados: o compositor (as páginas
 * e a composição), o banco e a URL pública. A marca é a tag literal: os casos rodam contra a fonte de antes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ResultadoDaComposicao } from '../compor'
import type { SpecDePeca } from '../spec'

const MARCA = 'fora-do-rodizio'
const mocks = vi.hoisted(() => ({ compor: vi.fn(), paginas: vi.fn(), catalogo: vi.fn(), carregar: vi.fn(), descrever: vi.fn() }))
vi.mock('@/lib/compositor/compor', () => ({ comporPeca: mocks.compor, paginasDeAssinatura: mocks.paginas, carregarAssinatura: mocks.carregar }))
vi.mock('@/lib/compositor/medir-copy-service', () => ({ descreverVariantes: mocks.descrever }))
vi.mock('@/lib/creatives/acervo', () => ({ lerCatalogoDoProjeto: mocks.catalogo }))
vi.mock('@/lib/creatives/persist', () => ({ getPublicAppUrl: () => 'https://studio.test' }))
vi.mock('@/lib/db', () => ({ db: { page: { findMany: async () => [] } } }))

import { selecionarCombinacao } from '../selecionar-combinacao'
import { montarSpecDoItem } from '@/lib/planos/spec-do-item'
import { assinaturasDaMarca } from '@/lib/brand/aba-marca'
import { toolsDoCompositor } from '@/lib/mcp/catalogo/compositor'

const spec: SpecDePeca = { projectId: 3, formato: 'story', fotosCandidatas: ['clara', 'escura'], blocos: [{ papel: 'headline', linhas: ['Quarta no', 'Quintal'] }, { papel: 'servico', linhas: ['Quarta, 11h à meia-noite'] }] }
const variante = (id: string, tags: string[] = []) => ({ id, name: id, tags, width: 1080, height: 1920, formato: 'story', papeis: ['headline', 'servico'] })
const resultado = (pageId: string): ResultadoDaComposicao => ({ persistido: null, prova: null, fundo: '#0B0B0B', layers: [], diagnostico: {
  formato: 'story', posicao: { ancora: 'topo', alinha: 'esquerda', crop: 'center-middle', pontuacao: 0.8, motivo: '' }, candidatos: [{ ancora: 'topo', alinha: 'esquerda', crop: 'center-middle', pontuacao: 0.8, motivo: '', descartado: false }], assunto: null, assuntoOrigem: 'estimado', halos: [], logo: null, blocos: [{ papel: 'headline', escala: 1, width: 500, height: 180 }], contraste: [{ grupo: 'headline', camadas: ['h'], sentido: 'claro', alvo: 149, p98SemHalo: 160, p98ComHalo: 100, tinta: 0.4, tintaCorrigida: null, ok: true }], intervencaoDeTexto: { alteracaoMedia: 0.1, escurecimentoMedio: 0.1 }, assinatura: { pageId } as ResultadoDaComposicao['diagnostico']['assinatura'], avisos: [],
} } as unknown as ResultadoDaComposicao)
const variantesPedidas = () => mocks.compor.mock.calls.map((c) => (c[0] as SpecDePeca).preferencias?.variante)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.catalogo.mockResolvedValue({ todas: [] })
  mocks.compor.mockImplementation(async (s: SpecDePeca) => resultado(s.preferencias?.variante ?? 'a'))
})

describe('C1 · seleção experimental com variante promovida', () => {
  it('sem pedido, a promovida nunca entra no laço', async () => {
    mocks.paginas.mockResolvedValue({ paginas: [variante('a'), variante('promo', [MARCA, 'story']), variante('b')] })
    await selecionarCombinacao(spec)
    expect(variantesPedidas()).not.toContain('promo')
    expect(variantesPedidas()).toContain('b')
  })

  it('sem pedido e só promovidas → SEM_COMBINACAO, sem compor nada (como sem variante nenhuma)', async () => {
    mocks.paginas.mockResolvedValue({ paginas: [variante('promo', [MARCA, 'story'])] })
    await expect(selecionarCombinacao(spec)).rejects.toMatchObject({ code: 'SEM_COMBINACAO' })
    expect(mocks.compor).not.toHaveBeenCalled()
  })

  it('só promovidas + pedido por id ou nome válido → o baseline roda com o pedido', async () => {
    mocks.paginas.mockResolvedValue({ paginas: [{ ...variante('promo', [MARCA, 'story']), name: 'Convite do chef' }] })
    for (const pedido of ['promo', 'Convite do chef']) {
      mocks.compor.mockClear()
      mocks.compor.mockImplementation(async () => resultado('promo'))
      const r = await selecionarCombinacao({ ...spec, preferencias: { variante: pedido } })
      expect(variantesPedidas()).toEqual([pedido])
      expect(r.diagnostico.decisao).toBe('baseline')
    }
  })

  it('pedido inválido segue recusado pelo compositor, sem trocar a variante', async () => {
    mocks.paginas.mockResolvedValue({ paginas: [variante('promo', [MARCA, 'story'])] })
    mocks.compor.mockRejectedValue(new Error('Variante ausente'))
    await expect(selecionarCombinacao({ ...spec, preferencias: { variante: 'ausente' } })).rejects.toThrow(/Nenhuma escolha/)
    expect(variantesPedidas()).toEqual(['ausente'])
  })

  it('sem promovida, idêntico a hoje (todas as variantes no laço)', async () => {
    mocks.paginas.mockResolvedValue({ paginas: [variante('a'), variante('b')] })
    await selecionarCombinacao(spec)
    expect(variantesPedidas()).toEqual([undefined, 'a', 'b', 'b'])
  })
})

describe('C3 · spec-do-item: a promovida não entra na união de papéis da copy legada', () => {
  const item = { id: 'i1', planoId: 'p1', formato: 'story', copyProposta: ['Quarta no Quintal', 'Feijoada completa', 'Reserve já'] }
  const comum = { formato: 'story' as const, papeis: ['headline', 'apoio'] as never[] }
  const promovida = { formato: 'story' as const, papeis: ['headline', 'apoio', 'cta'] as never[], tags: [MARCA, 'story'] }
  const resultadoDe = (paginas: Array<Record<string, unknown>>) => {
    try {
      return { spec: montarSpecDoItem(item, 3, paginas as never) }
    } catch (e) {
      return { erro: (e as { code?: string }).code }
    }
  }

  it('com e sem a promovida, a spec (ou a recusa) é a mesma', () => {
    expect(resultadoDe([comum, promovida])).toEqual(resultadoDe([comum]))
    expect(resultadoDe([comum])).toEqual({ erro: 'PAPEIS_INCOMPATIVEIS' })
  })

  it('só a promovida no formato: como se não houvesse página (papéis padrão)', () => {
    expect(resultadoDe([promovida])).toEqual(resultadoDe([]))
  })
})

describe('C5 · aba Marca e C4 · ver-assinatura', () => {
  it('aba Marca: a promovida aparece com foraDoRodizio e sem a marca nas tags', async () => {
    mocks.paginas.mockResolvedValue({ templateId: 10, paginas: [{ ...variante('a', ['assinatura', 'clara']) }, { ...variante('promo', [MARCA, 'story']) }] })
    const r = await assinaturasDaMarca(3)
    expect(r.variantes.map((v) => [v.id, v.tags, (v as { foraDoRodizio?: boolean }).foraDoRodizio])).toEqual([
      ['a', ['clara'], false],
      ['promo', ['story'], true],
    ])
  })

  it('ver-assinatura: a dica diz que a variante fora do rodízio só entra quando pedida', async () => {
    mocks.carregar.mockResolvedValue({ origem: { pageId: 'a', formatoDaPagina: 'story', variante: 'a', versao: 'assinatura-v3' }, papeis: {}, numeros: { destaque: {}, gradiente: {} }, gradienteDaPagina: null, logo: null })
    mocks.descrever.mockResolvedValue({ templateId: 10, variantes: [{ id: 'a', foraDoRodizio: false }, { id: 'promo', foraDoRodizio: true }] })
    const tool = toolsDoCompositor.find((t) => t.nome === 'ver-assinatura')!
    const r = (await tool.handler({ projectId: 3 }, { kind: 'user' } as never)) as { dica: string; variantes: unknown[] }
    expect(r.variantes).toHaveLength(2)
    expect(r.dica).toMatch(/fora do rodízio/)
  })
})
