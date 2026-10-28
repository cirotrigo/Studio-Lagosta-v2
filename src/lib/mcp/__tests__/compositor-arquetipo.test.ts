/**
 * T1a — o `arquetipo` nas três portas que constroem a peça (compor-arte,
 * compor-leva e medir-copy) e a vitrine de leitura do ver-assinatura, sem tool
 * nova. O schema público é o da SPEC (paridade), a chave a mais é recusada, e
 * os handlers levam o pedido até o compositor, a fila e a medição — o zod que
 * descarta chave desconhecida faria o arquétipo sumir em silêncio.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ comporPeca: vi.fn(), enfileirarPeca: vi.fn(), medirCopyDoProjeto: vi.fn() }))
vi.mock('@/lib/compositor/compor', () => ({
  comporPeca: mocks.comporPeca,
  carregarAssinatura: vi.fn(async () => ({
    origem: { pageId: 'pag-1', formatoDaPagina: 'story', variante: 'Clássica', versao: 'assinatura-v3' },
    papeis: {},
    numeros: { destaque: {}, gradiente: {} },
    gradienteDaPagina: null,
    logo: null,
  })),
}))
vi.mock('@/lib/compositor/fila', () => ({ enfileirarPeca: mocks.enfileirarPeca }))
vi.mock('@/lib/compositor/medir-copy-service', () => ({ medirCopyDoProjeto: mocks.medirCopyDoProjeto, descreverVariantes: vi.fn(async () => ({ templateId: 3, variantes: [] })) }))
vi.mock('@/lib/creatives/persist', () => ({ getPublicAppUrl: () => 'https://studio.test' }))
vi.mock('@/lib/mcp/tools', () => ({ quemDecidiu: vi.fn(async () => 'u1'), canalDoPrincipal: vi.fn(() => 'claude-ai') }))

import { zodToJsonSchema } from 'zod-to-json-schema'
import { specSchema } from '@/lib/compositor/spec'
import { toolsDoCompositor } from '../catalogo/compositor'

const tool = (nome: string) => toolsDoCompositor.find((t) => t.nome === nome)!
const blocos = [
  { papel: 'headline', linhas: ['Almoço de domingo'] },
  { papel: 'servico', linhas: ['Dom · 12h às 16h'] },
]
const ARQ = { id: 'minimal-fb-topo-esquerda' }
const RESOLVIDO = { id: 'minimal-fb-topo-esquerda', versao: 1, impressao: 'arq1-1f4ab8c4a215f2' }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.comporPeca.mockResolvedValue({
    prova: null,
    persistido: { generationId: 'g', pageId: 'p', url: 'u', editUrl: 'e', galleryUrl: 'gl' },
    diagnostico: { posicao: { ancora: 'topo', alinha: 'esquerda', crop: 'center-middle' }, logo: null, blocos: [], avisos: [], arquetipo: { ...RESOLVIDO, modo: 'referencia' } },
  })
  mocks.enfileirarPeca.mockResolvedValue({ generationId: 'g1' })
  mocks.medirCopyDoProjeto.mockResolvedValue({
    variante: { id: 'v', nome: 'v', formatoDaPagina: 'story', motivo: null },
    escolhaProvisoria: false,
    motivosDaProvisoriedade: [],
    fixacao: { variante: 'v', arranjos: [], arquetipo: RESOLVIDO },
    medicao: { areaUtil: {}, cabeTudo: true, naoMedido: false, aproximado: false, papeisAusentes: [], fontesNaoCarregadas: [], arranjos: [], alturaDosBlocos: 0, segundaVoz: null, avisos: [], blocos: [], arquetipo: { ...RESOLVIDO, formato: 'story', papeis: {}, problemas: [], excessosDeLinhas: [] } },
    outrasVariantes: [],
  })
})

describe('T1a · arquetipo nas portas MCP', () => {
  it('paridade: o schema público do arquetipo é o da spec, nas três portas', () => {
    const daSpec = zodToJsonSchema(specSchema.shape.arquetipo.unwrap(), { $refStrategy: 'none' }) as Record<string, unknown>
    const semDescricao = ({ description: _d, $schema: _s, ...resto }: Record<string, unknown>) => resto
    const publicos = [
      (tool('compor-arte').schemaJson as any).properties.arquetipo,
      (tool('compor-leva').schemaJson as any).properties.itens.items.properties.arquetipo,
      (tool('medir-copy').schemaJson as any).properties.arquetipo,
    ]
    for (const p of publicos) expect(semDescricao(p)).toEqual(semDescricao(daSpec as Record<string, unknown>))
  })

  it('chave a mais dentro do arquetipo é recusada na porta (strict), não descartada', () => {
    expect(tool('compor-arte').schema.safeParse({ projectId: 8, formato: 'story', blocos, arquetipo: { ...ARQ, zona: 'topo' } }).success).toBe(false)
    expect(tool('compor-arte').schema.safeParse({ projectId: 8, formato: 'story', blocos, arquetipo: ARQ }).success).toBe(true)
  })

  it('compor-arte leva o arquetipo até o compositor e devolve a procedência', async () => {
    const r = (await tool('compor-arte').handler({ projectId: 8, formato: 'story', blocos, arquetipo: ARQ }, { kind: 'user' } as never)) as Record<string, unknown>
    expect(mocks.comporPeca.mock.calls[0][0]).toMatchObject({ arquetipo: ARQ })
    expect(r.arquetipo).toMatchObject(RESOLVIDO)
  })

  it('CP2B: o resumo do compor-arte leva a busca espacial COMPACTA (corte, deslocamentos, motivo, recusas) — o detalhe fica gravado', async () => {
    const buscaEspacial = {
      versao: 'busca-espacial-v1',
      id: 'be1-abc',
      escolha: { modo: 'busca-espacial-v1', foto: 'foto-0123456789abcdef', corte: 'center-middle', deslocamentos: { servico: -86, logo: -86 } },
      cortesAvaliados: ['center-middle'],
      combinacoesAvaliadas: 20,
      limite: 75,
      faixas: [],
      vencedor: { crop: 'center-middle', escolhas: [], pontuacao: 0.9, componentes: null, tratamento: [{ borda: 'rodape', estado: 'sem-necessidade' }], textos: [{ camada: 'servico' }], eliminada: [] },
      alternativas: [{ crop: 'center-middle', escolhas: [], pontuacao: 0.8, componentes: null, tratamento: [], textos: [{ camada: 'x' }], eliminada: [] }],
      recusas: { INVADE_REGIAO_PROTEGIDA: 2 },
      exemplosDeRecusa: [],
      motivo: 'a referência precisava de véu (rodape 0,76); aqui lê sem tratamento',
    }
    mocks.comporPeca.mockResolvedValueOnce({
      prova: null,
      persistido: { generationId: 'g', pageId: 'p', url: 'u', editUrl: 'e', galleryUrl: 'gl' },
      diagnostico: { posicao: { ancora: 'topo', alinha: 'esquerda', crop: 'center-middle' }, logo: null, blocos: [], avisos: [], arquetipo: { ...RESOLVIDO, modo: 'busca-espacial-v1', buscaEspacial } },
    })
    const r = (await tool('compor-arte').handler({ projectId: 8, formato: 'story', blocos, arquetipo: ARQ }, { kind: 'user' } as never)) as { arquetipo: Record<string, unknown> }
    expect(r.arquetipo).toMatchObject({ ...RESOLVIDO, modo: 'busca-espacial-v1' })
    expect(r.arquetipo.buscaEspacial).toEqual({
      corte: 'center-middle',
      deslocamentos: { servico: -86, logo: -86 },
      motivo: buscaEspacial.motivo,
      combinacoesAvaliadas: 20,
      recusas: { INVADE_REGIAO_PROTEGIDA: 2 },
      tratamentoEstimado: [{ borda: 'rodape', estado: 'sem-necessidade' }],
    })
  })

  it('compor-arte sem arquetipo: a spec não ganha a chave', async () => {
    await tool('compor-arte').handler({ projectId: 8, formato: 'story', blocos }, { kind: 'user' } as never)
    expect('arquetipo' in mocks.comporPeca.mock.calls[0][0]).toBe(false)
  })

  it('compor-leva: o item com arquetipo sobrevive ao parse e chega à fila', async () => {
    const r = tool('compor-leva').schema.safeParse({ projectId: 8, itens: [{ formato: 'story', blocos, arquetipo: ARQ }] })
    expect(r.success).toBe(true)
    expect((r.success ? (r.data as any).itens[0].arquetipo : null)).toEqual(ARQ)
    await tool('compor-leva').handler({ projectId: 8, itens: [{ formato: 'story', blocos, arquetipo: ARQ }] }, { kind: 'user' } as never)
    expect(mocks.enfileirarPeca.mock.calls[0][0]).toMatchObject({ arquetipo: ARQ })
  })

  it('21. medir-copy leva o arquetipo à medição e devolve a fixação com id + versão + impressão', async () => {
    const r = (await tool('medir-copy').handler({ projectId: 8, formato: 'story', blocos, arquetipo: ARQ }, { kind: 'user' } as never)) as Record<string, any>
    expect(mocks.medirCopyDoProjeto.mock.calls[0][0]).toMatchObject({ arquetipo: ARQ })
    expect(r.fixacao.arquetipo).toEqual(RESOLVIDO)
    expect(r.arquetipo).toMatchObject(RESOLVIDO)
  })

  it('ver-assinatura expõe os arquétipos (só leitura), com a disponibilidade de cada um', async () => {
    const r = (await tool('ver-assinatura').handler({ projectId: 8 }, { kind: 'user' } as never)) as Record<string, any>
    const porId = Object.fromEntries(r.arquetipos.map((a: Record<string, unknown>) => [a.id, a]))
    expect(porId['minimal-fb-topo-esquerda']).toMatchObject({ versao: 1, codigoTaxonomico: 'MIN-01', formatos: ['story', 'feed'], disponibilidade: 'disponivel' })
    // O #3 guardado fora da vitrine (26/10): sem texto central sobre foto nas próximas provas (segue resolvível pelo id).
    expect(porId['minimal-fb-centro-optico']).toBeUndefined()
    // T1b: o modelo da moldura compõe, e cada arquétipo diz os acentos que a peça ganha.
    expect(porId['minimal-fb-base-esquerda']).toMatchObject({ disponibilidade: 'disponivel', elementos: [{ id: 'moldura', tipo: 'moldura-aberta', opcional: false, corPorPapel: 'texto', presoA: 'headline' }] })
    // H9: o #9 publicado, com a máscara da caixa (o topo em arco) por formato.
    expect(porId['minimal-divisao-cor-topo-arco']).toMatchObject({ versao: 1, codigoTaxonomico: 'MIN-04', fundo: 'foto-em-caixa', disponibilidade: 'disponivel', mascaraDaFoto: { story: { tipo: 'arco-janela', raio: 0.62 }, feed: { tipo: 'arco-janela', raio: 0.62 } } })
    // O #4 guardado fora da vitrine (25/10): o agente não o lê no ver-assinatura (segue resolvível pelo id).
    expect(porId['minimal-fb-base-centro']).toBeUndefined()
  })
})
