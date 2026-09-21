/**
 * PR4-01..03 da revisão FINAL do Codex sobre f919f159 (18/09/2026), pelo
 * caminho real do compositor (`comporPeca` com o banco simulado).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Layer } from '@/types/template'
const mocks = vi.hoisted(() => ({ regua: vi.fn(), paginas: vi.fn(), projeto: vi.fn(), semFonte: vi.fn(), medir: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: {
  project: { findUnique: mocks.projeto },
  template: { findFirst: vi.fn(async () => ({ id: 1 })) },
  page: { findMany: mocks.paginas },
  customFont: { findMany: vi.fn(async () => []) },
} }))
vi.mock('@/lib/creatives/persist', () => ({ persistAndRenderCreative: vi.fn(), resolveImageUrl: vi.fn() }))
vi.mock('../pastas', () => ({ garantirPasta: vi.fn(), ordemNaPasta: async () => ({ ordem: 1, repeticao: 0 }) }))
vi.mock('@/lib/creatives/uso-de-foto', () => ({ registrarUsoDeFoto: vi.fn() }))
vi.mock('@/lib/posts/register-project-fonts', () => ({ registerProjectFonts: vi.fn(), fetchBuffer: vi.fn(), familiasNaoCarregadas: mocks.semFonte }))
vi.mock('@/lib/creatives/server-text-measurer', () => ({ createServerTextBoxMeasurer: async () => mocks.medir }))
vi.mock('@/lib/creatives/text-autofix', () => ({ aplicarAutofixOuFalhar: async (args: { layers: Layer[] }) => ({ layers: args.layers, avisos: [] }) }))
vi.mock('../regua', async (original) => ({ ...await original<typeof import('../regua')>(), medirContrasteDaPeca: mocks.regua }))
import { comporPeca } from '../compor'
import { aplicarAjustes } from '@/lib/creatives/revisao/aplicar-ajustes'
import { vaoEntre } from '../blocos'
import { escolherVariante } from '../assinatura'
import { specComAPosicaoOriginal } from '../defasagem'
import { validarSpec, type SpecDePeca } from '../spec'
import type { CreativeError } from '@/lib/creatives/errors'
import { VERSAO_DO_CONTRATO, copyEfetivaDasCamadas, validarCopyAutoral, type CopyAutoral } from '@/lib/copy-autoral'

const texto = (id: string, name: string, y: number, extra: Partial<Layer> = {}): Layer => ({ id, name, type: 'text', content: 'Teste', visible: true, locked: false, order: 1, position: { x: 80, y }, size: { width: 700, height: 100 }, style: { fontFamily: 'Arial', fontSize: 80, color: '#ffffff' }, ...extra })
const pagina = (id: string, layers: Layer[], dims = { width: 1080, height: 1920 }) => ({ id, name: id, ...dims, layers, tags: [], background: '#000000' })
const contrato = (blocos: CopyAutoral['blocos']): CopyAutoral => ({ versao: VERSAO_DO_CONTRATO, origem: { autor: 'claude' }, blocos, revisoes: [] })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.regua.mockImplementation(async (args) => ({ layers: args.layers, medidas: [], avisos: [] }))
  mocks.projeto.mockImplementation(async () => ({ id: 3, name: 'TERO', userId: 'user', assinatura: {}, Logo: [] }))
  mocks.semFonte.mockImplementation(async () => new Set<string>())
  mocks.medir.mockImplementation((l: Layer) => ({ width: l.size.width, height: Number(l.style?.fontSize ?? 48), maxLineWidth: 100, lineCount: 1 }))
})

describe('PR4-01 — manchete espalhada por várias caixas do mesmo papel', () => {
  it('duas caixas de voz 2: a efetiva devolve UM bloco headline (id preservado), sem revisão, e a spec da recomposição é aceita', async () => {
    mocks.paginas.mockResolvedValue([pagina('pg', [texto('headline', 'headline', 230), texto('h2a', 'headline2', 400), texto('h2b', 'headline2', 520)])])
    const copy = contrato([{ id: 'manchete', funcao: 'headline', ordem: 0, linhas: ['Título', 'inteiro'], estilo: { linhasNaVoz2: [0, 1] } }])
    const r = await comporPeca({ projectId: 3, formato: 'story', copyAutoral: copy }, { somenteAvaliar: true })
    const textos = r.layers.filter((l) => l.type === 'text')
    expect(textos.map((l) => l.content)).toEqual(['Título', 'inteiro'])
    const e = copyEfetivaDasCamadas(copy, r.layers, { superficie: 'compositor' })
    expect(e.efetiva.blocos.map((b) => b.id)).toEqual(['manchete'])
    expect(e.efetiva.blocos[0].linhas).toEqual(['Título', 'inteiro'])
    expect(e.efetiva.blocos[0].estilo?.linhasNaVoz2).toEqual([0, 1])
    expect(e.mudancas).toEqual([])
    expect(e.efetiva.revisoes).toEqual([])
    expect(validarCopyAutoral(e.efetiva).problemas).toEqual([])
    expect(validarSpec({ projectId: 3, formato: 'story', copyAutoral: e.efetiva }).problemas).toEqual([])
  })
  it('voz 1 + duas caixas de voz 2: a voz 1 e as duas caixas voltam ao mesmo bloco, com os índices da voz 2', async () => {
    mocks.paginas.mockResolvedValue([pagina('pg', [texto('headline', 'headline', 230), texto('h2a', 'headline2', 400), texto('h2b', 'headline2', 520)])])
    const copy = contrato([{ id: 'manchete', funcao: 'headline', ordem: 0, linhas: ['Almoço', 'de', 'domingo'], estilo: { linhasNaVoz2: [1, 2] } }])
    const r = await comporPeca({ projectId: 3, formato: 'story', copyAutoral: copy }, { somenteAvaliar: true })
    const e = copyEfetivaDasCamadas(copy, r.layers, { superficie: 'compositor' })
    expect(e.efetiva.blocos.map((b) => [b.id, b.linhas, b.estilo?.linhasNaVoz2])).toEqual([['manchete', ['Almoço', 'de', 'domingo'], [1, 2]]])
    expect(e.mudancas).toEqual([])
  })
  it('um bloco de serviço em duas caixas (Local + Horário) volta inteiro ao mesmo bloco', async () => {
    const g = { metadata: { groupId: 'rodape' } } as Partial<Layer>
    mocks.paginas.mockResolvedValue([pagina('pg', [texto('headline', 'headline', 230), texto('servico', 'servico', 1500, { ...g, content: 'das 11h às 15h' }), texto('servico-2', 'servico', 1600, { ...g, content: 'Rua Aleixo Netto, 1158' })])])
    const copy = contrato([
      { id: 'manchete', funcao: 'headline', ordem: 0, linhas: ['Almoço'] },
      { id: 'servico', funcao: 'servico', ordem: 1, linhas: ['das 11h às 15h', 'Rua Aleixo Netto, 1158'] },
    ])
    const r = await comporPeca({ projectId: 3, formato: 'story', copyAutoral: copy }, { somenteAvaliar: true })
    expect(r.layers.filter((l) => (l.metadata as { compositor?: { papel?: string } })?.compositor?.papel === 'servico')).toHaveLength(2)
    const e = copyEfetivaDasCamadas(copy, r.layers, { superficie: 'compositor' })
    expect(e.efetiva.blocos.map((b) => b.id)).toEqual(['manchete', 'servico'])
    expect(e.mudancas).toEqual([])
    expect(e.lacunas).toEqual([])
  })
  it('camada SEM a declaração (posta à mão no editor) continua lida como antes: vira bloco próprio', () => {
    const copy = contrato([{ id: 'servico', funcao: 'servico', ordem: 0, linhas: ['a'] }])
    const camadas = [texto('servico', 'servico', 100, { content: 'a', metadata: { compositor: { papel: 'servico', bloco: 'servico', linhas: [0] } } } as Partial<Layer>), texto('outra', 'servico', 200, { content: 'b', metadata: { compositor: { papel: 'servico' } } } as Partial<Layer>)]
    const e = copyEfetivaDasCamadas(copy, camadas, { superficie: 'editor' })
    expect(e.efetiva.blocos.map((b) => b.id)).toEqual(['servico', 'extra-outra'])
  })
})

describe('PR4-02 — manchete inteira na voz 2 continua sendo o grupo principal', () => {
  it('pré-título em grupo separado, antes da manchete: a posição pedida vai para a manchete', async () => {
    mocks.paginas.mockResolvedValue([pagina('pg', [
      texto('pre', 'pre', 200, { metadata: { groupId: 'g-pre' } } as Partial<Layer>),
      texto('headline', 'headline', 1400, { metadata: { groupId: 'g-man' } } as Partial<Layer>),
      texto('headline2', 'headline2', 1520, { metadata: { groupId: 'g-man' } } as Partial<Layer>),
    ])])
    const copy = contrato([
      { id: 'pre', funcao: 'pre', ordem: 0, linhas: ['Hoje'] },
      { id: 'manchete', funcao: 'headline', ordem: 1, linhas: ['Tudo', 'junto'], estilo: { linhasNaVoz2: [0, 1] } },
    ])
    const r = await comporPeca({ projectId: 3, formato: 'story', copyAutoral: copy, preferencias: { ancora: 'topo' } }, { somenteAvaliar: true })
    const y = (conteudo: string) => r.layers.find((l) => String(l.content ?? '').startsWith(conteudo))!.position.y
    expect(y('Tudo')).toBeLessThan(960)
    expect(y('Hoje')).toBeLessThan(y('Tudo'))
  })
  it('o vão antes da manchete que começa na voz 2 é o de manchete, não o de lockup', () => {
    expect(vaoEntre('pre', 'headline2', 40)).toBe(20)
    expect(vaoEntre('headline', 'headline2', 40)).toBe(0)
    expect(vaoEntre('headline2', 'headline2', 40)).toBe(0)
    expect(vaoEntre('pre', 'headline', 40)).toBe(20)
  })
})

describe('PR4-03 — a variante com que a peça nasceu é resolvida antes do filtro por formato', () => {
  const story = pagina('pg-story', [texto('headline', 'headline', 230)])
  const feed = pagina('pg-feed', [texto('headline', 'headline', 230)], { width: 1080, height: 1350 })
  const base = { projectId: 3, formato: 'feed', blocos: [{ papel: 'headline', linhas: ['Quintal'] }] } as unknown as SpecDePeca
  it('feed nascido na assinatura de story, e o projeto ganhou a de feed: a recomposição mantém a de story', async () => {
    mocks.paginas.mockResolvedValue([story, feed])
    const spec = specComAPosicaoOriginal(base, { composicao: { assinatura: { pageId: 'pg-story' } } })
    expect(spec.preferencias?.varianteOriginal).toBe('pg-story')
    expect(validarSpec(spec).problemas).toEqual([])
    const r = await comporPeca(spec, { somenteAvaliar: true })
    expect(r.diagnostico.assinatura.pageId).toBe('pg-story')
    expect(r.diagnostico.assinatura.motivoDaVariante).toBe('fixada por id')
  })
  it('a página original foi arquivada: a recomposição escolhe outra em vez de recusar a peça', async () => {
    mocks.paginas.mockResolvedValue([feed])
    const r = await comporPeca(specComAPosicaoOriginal(base, { composicao: { assinatura: { pageId: 'pg-arquivada' } } }), { somenteAvaliar: true })
    expect(r.diagnostico.assinatura.pageId).toBe('pg-feed')
    expect(r.diagnostico.assinatura.motivoDaVariante).toMatch(/não existe mais/)
  })
  it('o id pedido explicitamente também alcança a de story; ausente continua sendo recusa', () => {
    expect(escolherVariante([story, feed] as never[], { formato: 'feed', variante: 'pg-story' }).pagina).toMatchObject({ id: 'pg-story' })
    expect(escolherVariante([story, feed] as never[], { formato: 'feed', variante: 'pg-x' }).pagina).toBeNull()
  })
})

describe('ids de camada únicos na peça inteira (varredura do PR 3, 18/09/2026)', () => {
  it('serviço repartido entre dois grupos: duas camadas de ids distintos, e o ajuste por id toca uma só', async () => {
    mocks.paginas.mockResolvedValue([pagina('pg', [
      texto('headline', 'headline', 230, { metadata: { groupId: 'oferta' } } as Partial<Layer>),
      texto('servico', 'servico', 400, { content: 'das 11h às 15h', metadata: { groupId: 'oferta' } } as Partial<Layer>),
      texto('servico-2', 'servico', 1600, { content: 'Rua Aleixo Netto, 1158', metadata: { groupId: 'pe' } } as Partial<Layer>),
    ])])
    const r = await comporPeca({ projectId: 3, formato: 'story', blocos: [{ papel: 'headline', linhas: ['Almoço'] }, { papel: 'servico', linhas: ['das 11h às 15h', 'Rua Aleixo Netto, 1158'] }] }, { somenteAvaliar: true })
    const servicos = r.layers.filter((l) => (l.metadata as { compositor?: { papel?: string } })?.compositor?.papel === 'servico')
    expect(servicos.map((l) => l.content).sort()).toEqual(['Rua Aleixo Netto, 1158', 'das 11h às 15h'])
    expect(new Set(r.layers.map((l) => l.id)).size).toBe(r.layers.length)
    const alvo = servicos[0].id
    const ajuste = aplicarAjustes(r.layers, [{ tipo: 'visibilidade', camadas: [alvo], visivel: false } as never], { canvas: { width: 1080, height: 1920 }, medir: () => 100 } as never)
    expect(ajuste.camadas.filter((l) => l.visible === false).map((l) => l.id)).toEqual([alvo])
  })
  it('a logo presa a DOIS grupos sai com ids distintos', async () => {
    const logo = (y: number, grupo: string) => ({ id: `logo-${grupo}`, name: 'Logo', type: 'logo', visible: true, locked: false, order: 1, position: { x: 800, y }, size: { width: 150, height: 100 }, style: {}, fileUrl: 'https://example.com/logo.png', metadata: { groupId: grupo } }) as unknown as Layer
    mocks.paginas.mockResolvedValue([pagina('pg', [
      texto('headline', 'headline', 230, { metadata: { groupId: 'oferta' } } as Partial<Layer>), logo(230, 'oferta'),
      texto('servico', 'servico', 1600, { content: 'Rua Aleixo Netto, 1158', metadata: { groupId: 'pe' } } as Partial<Layer>), logo(1600, 'pe'),
    ])])
    const r = await comporPeca({ projectId: 3, formato: 'story', blocos: [{ papel: 'headline', linhas: ['Almoço'] }, { papel: 'servico', linhas: ['Rua Aleixo Netto, 1158'] }] }, { somenteAvaliar: true })
    const logos = r.layers.filter((l) => l.type === 'logo' || String(l.id).startsWith('logo'))
    expect(logos.length).toBe(2)
    expect(new Set(r.layers.map((l) => l.id)).size).toBe(r.layers.length)
  })
})

const comp = (l: Layer | undefined) => (l?.metadata as { compositor?: { papel?: string; bloco?: string } } | undefined)?.compositor
const doPapel = (layers: Layer[], papel: string) => layers.find((l) => comp(l)?.papel === papel)

describe('PR4-FINAL-01 — a declaração de voz 2 vem do bloco que ORIGINOU a manchete', () => {
  // O contrato aceita um `headline` VAZIO ao lado do preenchido: a conversão
  // para a spec omite o vazio, então `validarSpec` não vê papel repetido.
  const copyComVazio = () => contrato([
    { id: 'manchete-vazia', funcao: 'headline', ordem: 0, linhas: [] },
    { id: 'manchete', funcao: 'headline', ordem: 1, linhas: ['Almoço', 'de domingo'], estilo: { linhasNaVoz2: [1] } },
  ])
  it('a entrada é permitida: contrato e spec aceitam o bloco vazio ao lado do preenchido', () => {
    const copy = copyComVazio()
    expect(validarCopyAutoral(copy).problemas).toEqual([])
    expect(validarSpec({ projectId: 3, formato: 'story', copyAutoral: copy }).problemas).toEqual([])
  })
  it('com headline2 na assinatura: a voz 2 declarada é honrada, e o vínculo das DUAS camadas aponta o bloco PREENCHIDO', async () => {
    mocks.paginas.mockResolvedValue([pagina('pg', [texto('headline', 'headline', 230), texto('headline2', 'headline2', 400)])])
    const copy = copyComVazio()
    const r = await comporPeca({ projectId: 3, formato: 'story', copyAutoral: copy }, { somenteAvaliar: true })
    expect(doPapel(r.layers, 'headline')?.content).toBe('Almoço')
    expect(doPapel(r.layers, 'headline2')?.content).toBe('de domingo')
    expect(comp(doPapel(r.layers, 'headline'))?.bloco).toBe('manchete')
    expect(comp(doPapel(r.layers, 'headline2'))?.bloco).toBe('manchete')
    expect(r.diagnostico.segundaVoz).toBe('contrato')
    const e = copyEfetivaDasCamadas(copy, r.layers, { superficie: 'compositor' })
    expect(e.mudancas).toEqual([])
    expect(e.efetiva.blocos.map((b) => [b.id, b.linhas])).toEqual([['manchete-vazia', []], ['manchete', ['Almoço', 'de domingo']]])
    expect(e.efetiva.blocos[1].estilo?.linhasNaVoz2).toEqual([1])
  })
  it('SEM headline2 na assinatura: a declaração é lida e vira AVISO — nunca some em silêncio', async () => {
    mocks.paginas.mockResolvedValue([pagina('pg', [texto('headline', 'headline', 230)])])
    const r = await comporPeca({ projectId: 3, formato: 'story', copyAutoral: copyComVazio() }, { somenteAvaliar: true })
    expect(r.diagnostico.avisos!.join(' ')).toMatch(/headline: a copy declarou a linha 2 .* não tem "headline2"/)
    expect(doPapel(r.layers, 'headline')?.content).toBe('Almoço\nde domingo')
  })
  it('controle — sem bloco vazio, o desfecho é o mesmo (a correção não muda o caminho normal)', async () => {
    mocks.paginas.mockResolvedValue([pagina('pg', [texto('headline', 'headline', 230), texto('headline2', 'headline2', 400)])])
    const copy = contrato([{ id: 'manchete', funcao: 'headline', ordem: 0, linhas: ['Almoço', 'de domingo'], estilo: { linhasNaVoz2: [1] } }])
    const r = await comporPeca({ projectId: 3, formato: 'story', copyAutoral: copy }, { somenteAvaliar: true })
    expect(doPapel(r.layers, 'headline2')?.content).toBe('de domingo')
    expect(comp(doPapel(r.layers, 'headline2'))?.bloco).toBe('manchete')
  })
})

describe('PR4-FINAL-02 — fonte ausente não vira orçamento de caracteres', () => {
  // O medidor devolve uma linha maior que a coluna em QUALQUER corpo: a escada
  // de encolhimento chega ao piso e o bloco é recusado.
  const naoCabeNemNoPiso = (l: Layer) => ({ width: l.size.width, height: Number(l.style?.fontSize ?? 48), maxLineWidth: 99999, lineCount: 1 })
  const compor = (copy: CopyAutoral) => comporPeca({ projectId: 3, formato: 'story', copyAutoral: copy }, { somenteAvaliar: true }).then(() => null, (e) => e as CreativeError)
  const simples = () => contrato([{ id: 'manchete', funcao: 'headline', ordem: 0, linhas: ['Almoço executivo do dia'] }])

  beforeEach(() => {
    mocks.paginas.mockResolvedValue([pagina('pg', [texto('headline', 'headline', 230)])])
    mocks.medir.mockImplementation(naoCabeNemNoPiso)
  })

  it('a família do PAPEL não carregou: a recusa DIZ que não deu para medir e não devolve orçamento', async () => {
    mocks.semFonte.mockImplementation(async () => new Set(['Arial']))
    const erro = await compor(simples())
    expect(erro?.code).toBe('TEXTO_NAO_CABE_NA_COLUNA')
    expect(erro?.message).toMatch(/"Arial" não está carregada no servidor/)
    expect(erro?.message).toMatch(/NÃO há orçamento de caracteres/)
    expect(erro?.message).not.toMatch(/Reescreva com o orçamento/)
    expect(erro?.details?.orcamento).toEqual([{ papel: 'headline', naoMedido: true, fontesNaoCarregadas: ['Arial'] }])
    expect(erro?.details?.fontesNaoCarregadas).toEqual(['Arial'])
    expect(JSON.stringify(erro?.details)).not.toMatch(/caracteresQueCabem/)
  })

  it('a família do TRECHO destacado não carregou (a base carregou): idem — a medida da largura extra é do fallback', async () => {
    mocks.projeto.mockImplementation(async () => ({ id: 3, name: 'TERO', userId: 'user', assinatura: { destaque: { fontFamily: 'Lato Bold', pesado: false } }, Logo: [] }))
    mocks.semFonte.mockImplementation(async () => new Set(['Lato Bold']))
    const erro = await compor(contrato([{ id: 'manchete', funcao: 'headline', ordem: 0, linhas: ['Almoço [executivo] do dia'] }]))
    expect(erro?.code).toBe('TEXTO_NAO_CABE_NA_COLUNA')
    expect(erro?.details?.orcamento).toEqual([{ papel: 'headline', naoMedido: true, fontesNaoCarregadas: ['Lato Bold'] }])
    expect(JSON.stringify(erro?.details)).not.toMatch(/caracteresQueCabem/)
  })

  // O par do caso acima, e a razão de os dois viverem no mesmo arquivo: a mesma
  // marca, a mesma fonte de destaque ausente, só que a copy não tem [colchetes].
  // Nada foi medido na fonte que falta — o orçamento é da base, que carregou.
  it('a fonte de destaque não carregou mas a copy NÃO tem [colchetes]: o orçamento medido na base VALE (PR4-R2-01)', async () => {
    mocks.projeto.mockImplementation(async () => ({ id: 3, name: 'TERO', userId: 'user', assinatura: { destaque: { fontFamily: 'Lato Bold', pesado: false } }, Logo: [] }))
    mocks.semFonte.mockImplementation(async () => new Set(['Lato Bold']))
    const erro = await compor(simples())
    expect(erro?.code).toBe('TEXTO_NAO_CABE_NA_COLUNA')
    expect(erro?.message).toMatch(/Reescreva com o orçamento devolvido/)
    expect(erro?.message).not.toMatch(/não está carregada/)
    expect(erro?.details?.fontesNaoCarregadas).toBeUndefined()
    expect(JSON.stringify(erro?.details)).toMatch(/caracteresQueCabem/)
    expect(JSON.stringify(erro?.details)).not.toMatch(/naoMedido/)
  })

  it('controle — todas as fontes carregadas: a recusa continua devolvendo o ORÇAMENTO medido', async () => {
    const erro = await compor(simples())
    expect(erro?.code).toBe('TEXTO_NAO_CABE_NA_COLUNA')
    expect(erro?.message).toMatch(/Reescreva com o orçamento devolvido/)
    expect(erro?.message).not.toMatch(/não está carregada/)
    expect(JSON.stringify(erro?.details)).toMatch(/caracteresQueCabem/)
  })

  it('a fonte de um arranjo NÃO escolhido não vira aviso na peça que deu certo', async () => {
    mocks.medir.mockImplementation((l: Layer) => ({ width: l.size.width, height: Number(l.style?.fontSize ?? 48), maxLineWidth: 100, lineCount: 1 }))
    mocks.semFonte.mockImplementation(async () => new Set(['Fonte Que Ninguem Usa']))
    const r = await comporPeca({ projectId: 3, formato: 'story', copyAutoral: simples() }, { somenteAvaliar: true })
    expect(r.diagnostico.fontesNaoCarregadas).toBeUndefined()
    expect(r.diagnostico.avisos!.join(' ')).not.toMatch(/Fonte Que Ninguem Usa/)
  })
})
