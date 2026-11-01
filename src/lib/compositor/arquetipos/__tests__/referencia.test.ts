/**
 * F1 da direção por referência (01/11/2026): a página do Brunch do Empório Fonseca (ajustada pelo Ciro no editor em
 * 01/11) compila numa definição de arquétipo do cliente, passa no validador contra o piso do projeto, resolve pela
 * opção `definicoes` (gate por cliente) e MATERIALIZA onde o Ciro pôs cada caixa — reprodução fiel com os mesmos
 * insumos. A página de 3 fotos (Ref 01) é recusada DITA.
 */
import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { CreativeError } from '@/lib/creatives/errors'
import { GEOMETRIA_PADRAO } from '../../geometria'
import { DIMENSOES } from '../../spec'
import { impressaoDoArquetipo } from '../impressao'
import { materializarArquetipo } from '../materializar'
import { prepararArquetipo, resolverArquetipo } from '../na-spec'
import { candidatosDasFaixas } from '../candidatos-espaciais'
import { faixasDoArquetipo } from '../faixas'
import { compilarReferencia, idDaReferencia } from '../referencia'
import { ehReferencia } from '../tipos'
import { validarArquetipo } from '../validar'
import brunch from './suporte/emporio-ref02-brunch.json'
import restaurantWeek from './suporte/emporio-ref01-restaurant-week.json'

type Pagina = { id: string; name: string; width: number; height: number; tags: string[]; layers: Layer[] }
const BRUNCH = brunch as unknown as Pagina
const REF01 = restaurantWeek as unknown as Pagina
const piso = GEOMETRIA_PADRAO.story
const areaSegura = { story: { largura: 1080, altura: 1920, margemH: piso.margemH, safeTopo: piso.safeTopo, safeRodape: piso.safeRodape } }
type Ok = Extract<ReturnType<typeof compilarReferencia>, { ok: true }>
type Recusa = Extract<ReturnType<typeof compilarReferencia>, { ok: false }>
const compilada = (): Ok => {
  const r = compilarReferencia(BRUNCH, { pageVersion: 'v1:teste', versao: 1 })
  if (!r.ok) throw new Error(`${(r as Recusa).codigo}: ${(r as Recusa).mensagem}`)
  return r as Ok
}
const materializada = (definicao: Ok['definicao']) => {
  const m = materializarArquetipo({ arquetipo: definicao, formato: 'story', canvas: DIMENSOES.story, geometria: piso, medidas: { headline: { width: 952, height: 97 }, apoio: { width: 951, height: 51 } }, logo: { razao: 65 / 200 } })
  if (!m.ok) throw new Error(JSON.stringify((m as Extract<typeof m, { ok: false }>).problemas))
  return m as Extract<typeof m, { ok: true }>
}
const codigo = (f: () => unknown) => {
  try {
    f()
  } catch (e) {
    return (e as CreativeError).code
  }
  throw new Error('não recusou')
}

describe('F1 · compilar a página de referência', () => {
  it('a página do Brunch vira a definição do cliente: manchete e apoio no rodapé, centrados, logo no canto superior direito', () => {
    const { definicao, leitura } = compilada()
    expect(definicao.id).toBe(idDaReferencia(BRUNCH.id))
    expect(definicao.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    expect(definicao.codigoTaxonomico).toBe('REF-01')
    expect(ehReferencia(definicao)).toBe(true)
    expect(definicao.referencia).toEqual({ pageId: BRUNCH.id, pageVersion: 'v1:teste', formato: 'story' })
    expect(definicao.preferencias).toEqual({ ancora: 'rodape', alinha: 'centro', cantoDaMarca: 'superior-direito' })
    expect(definicao.papeis.map((p) => [p.papel, p.obrigatorio])).toEqual([
      ['headline', true],
      ['apoio', false],
      ['logo', true],
    ])
    expect(definicao.formatos.feed).toBeUndefined()
    const story = definicao.formatos.story
    expect(story.limitesDeTexto).toEqual({ headline: { linhasMax: 1 }, apoio: { linhasMax: 1 } })
    // A caixa do Ciro (64, 1618, 952×97) em frações, simetrizada no eixo (já estava).
    const h = (story.papeis.headline as { referencia: { x: number; y: number; w: number; h: number } }).referencia
    expect(Math.round(h.x * 1080)).toBe(64)
    expect(Math.round(h.y * 1920)).toBe(1618)
    expect(Math.round(h.w * 1080)).toBe(952)
    expect(Math.round(h.h * 1920)).toBe(97)
    // O gradiente desenhado à mão fica DITO em ignoradas; nada some em silêncio.
    expect(leitura.ignoradas.map((i) => i.motivo)).toEqual(['gradiente'])
    expect(leitura.foto).toContain('googleusercontent')
  })

  it('passa no validador do contrato com o piso do projeto (story 64/160/160), só no formato da página', () => {
    const { definicao } = compilada()
    expect(validarArquetipo(definicao, { formatos: ['story'], areaSegura })).toEqual([])
    // Sem a opção, o validador exige os dois formatos — a referência não finge ter o feed.
    expect(validarArquetipo(definicao, { areaSegura }).map((p) => p.codigo)).toEqual(['FORMATO_AUSENTE'])
  })

  it('os textos formam UMA faixa (com a logo, duas) e o deslocamento permitido é zero: a posição aprovada é a única', () => {
    const { definicao } = compilada()
    const faixas = faixasDoArquetipo(definicao, 'story')
    expect(faixas).toEqual([['headline', 'apoio'], ['logo']])
    const m = materializada(definicao)
    const f = candidatosDasFaixas({ arquetipo: definicao, formato: 'story', papeis: m.papeis, ornamentos: {} })
    expect(f.map((x) => x.intervalo)).toEqual([{ min: 0, max: 0 }, { min: 0, max: 0 }])
    expect(f.every((x) => x.candidatos.length === 1 && x.candidatos[0].rotulo === 'referencia')).toBe(true)
  })

  it('o deslocamento é zero mesmo com texto menor que a caixa ou sem o apoio (opcional): a posição aprovada é a única', () => {
    const { definicao } = compilada()
    const menor = materializarArquetipo({ arquetipo: definicao, formato: 'story', canvas: DIMENSOES.story, geometria: piso, medidas: { headline: { width: 600, height: 70 }, apoio: { width: 500, height: 25 } }, logo: { razao: 65 / 200 } })
    if (!menor.ok) throw new Error('não materializou')
    const f = candidatosDasFaixas({ arquetipo: definicao, formato: 'story', papeis: (menor as Extract<typeof menor, { ok: true }>).papeis, ornamentos: {} })
    expect(f.map((x) => [x.intervalo, x.candidatos.map((c) => c.dy)])).toEqual([[{ min: 0, max: 0 }, [0]], [{ min: 0, max: 0 }, [0]]])
    const semApoio = materializarArquetipo({ arquetipo: definicao, formato: 'story', canvas: DIMENSOES.story, geometria: piso, medidas: { headline: { width: 600, height: 70 } }, logo: { razao: 65 / 200 } })
    if (!semApoio.ok) throw new Error('não materializou')
    const g = candidatosDasFaixas({ arquetipo: definicao, formato: 'story', papeis: (semApoio as Extract<typeof semApoio, { ok: true }>).papeis, ornamentos: {} })
    expect(g.map((x) => [x.membros, x.intervalo])).toEqual([[['headline'], { min: 0, max: 0 }], [['logo'], { min: 0, max: 0 }]])
  })

  it('MATERIALIZA onde o Ciro pôs cada caixa (fidelidade com os mesmos insumos, ≤ 1 px)', () => {
    const { definicao } = compilada()
    const m = materializada(definicao)
    const perto = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(1)
    perto(m.papeis.headline!.posicao.x, 64)
    perto(m.papeis.headline!.posicao.y, 1618)
    perto(m.papeis.apoio!.posicao.x, 64)
    perto(m.papeis.apoio!.posicao.y, 1707)
    perto(m.papeis.logo!.posicao.x, 816)
    perto(m.papeis.logo!.posicao.y, 160)
    perto(m.papeis.logo!.posicao.width, 200)
  })

  it('a impressão é a mesma dos arquétipos do catálogo e não depende da ordem das chaves', () => {
    const { definicao } = compilada()
    expect(definicao.id).toMatch(/^ref-/)
    expect(impressaoDoArquetipo(definicao)).toMatch(/^arq1-[0-9a-f]{14}$/)
    expect(impressaoDoArquetipo(JSON.parse(JSON.stringify(definicao)))).toBe(impressaoDoArquetipo(definicao))
    expect(impressaoDoArquetipo({ ...definicao, versao: 2 })).not.toBe(impressaoDoArquetipo(definicao))
  })

  it('a página de três fotos (Ref 01) é recusada DITA: a F1 só compila foto inteira', () => {
    const r = compilarReferencia(REF01, { pageVersion: 'v1:x', versao: 1 })
    expect(r.ok).toBe(false)
    const recusa = r as Recusa
    expect(recusa.codigo).toBe('REFERENCIA_SEM_FOTO')
    expect((recusa.detalhes?.imagens as unknown[]).length).toBe(3)
  })

  it('sem manchete ou sem logo, recusa com o motivo', () => {
    const semLogo = { ...BRUNCH, layers: BRUNCH.layers.filter((c) => c.type !== 'logo') }
    expect((compilarReferencia(semLogo, { pageVersion: 'v', versao: 1 }) as { codigo: string }).codigo).toBe('REFERENCIA_SEM_LOGO')
    const semTitulo = { ...BRUNCH, layers: BRUNCH.layers.map((c) => (c.id === 'titulo' ? { ...c, name: 'Texto solto' } : c)) }
    const r = compilarReferencia(semTitulo, { pageVersion: 'v', versao: 1 })
    expect((r as { codigo: string }).codigo).toBe('REFERENCIA_SEM_HEADLINE')
  })

  it('duas camadas do mesmo papel (ou a segunda voz) são recusadas: a F1 compila UMA camada por papel', () => {
    const titulo = BRUNCH.layers.find((c) => c.id === 'titulo')!
    const duas = { ...BRUNCH, layers: [...BRUNCH.layers, { ...titulo, id: 'titulo-2', name: 'Título 2', position: { x: 64, y: 1500 } }] }
    const r = compilarReferencia(duas, { pageVersion: 'v', versao: 1 }) as Recusa
    expect(r.codigo).toBe('REFERENCIA_PAPEL_REPETIDO')
    expect(r.mensagem).toContain('segunda voz')
  })

  it('camada girada é recusada (a caixa não descreve o desenho)', () => {
    const torta = { ...BRUNCH, layers: BRUNCH.layers.map((c) => (c.id === 'titulo' ? { ...c, rotation: 15 } : c)) }
    expect((compilarReferencia(torta, { pageVersion: 'v', versao: 1 }) as Recusa).codigo).toBe('REFERENCIA_CAMADA_GIRADA')
  })

  it('com o piso do projeto, caixa fora dele é recusa DITA com o lado e a medida (base 180 corta o apoio em 18 px)', () => {
    const ok = compilarReferencia(BRUNCH, { pageVersion: 'v', versao: 1, piso: { margemH: 64, safeTopo: 160, safeRodape: 160 } })
    expect(ok.ok).toBe(true)
    const r = compilarReferencia(BRUNCH, { pageVersion: 'v', versao: 1, piso: { margemH: 64, safeTopo: 160, safeRodape: 180 } }) as Recusa
    expect(r.codigo).toBe('REFERENCIA_FORA_DO_PISO')
    expect(r.mensagem).toContain('apoio passa base 18 px')
  })

  it('texto centralizado fora do eixo da peça é incoerente (o validador exige o centro em 0,5)', () => {
    const torta = { ...BRUNCH, layers: BRUNCH.layers.map((c) => (c.id === 'titulo' ? { ...c, position: { x: 100, y: 1618 } } : c)) }
    expect((compilarReferencia(torta, { pageVersion: 'v', versao: 1 }) as { codigo: string }).codigo).toBe('REFERENCIA_ALINHAMENTO_INCOERENTE')
  })
})

describe('F1 · a referência na spec (gate por cliente, versão e impressão)', () => {
  const spec = (extra: Record<string, unknown> = {}) => ({
    formato: 'story' as const,
    arquetipo: { id: idDaReferencia(BRUNCH.id) },
    blocos: [{ papel: 'headline' as const, linhas: ['Café da manhã'] }, { papel: 'apoio' as const, linhas: ['Sabores que acordam a manhã'] }],
    foto: { driveFileId: 'x' },
    ...extra,
  })

  it('resolve pela opção `definicoes` (as revisões do cliente), nunca pelo catálogo', () => {
    const { definicao } = compilada()
    expect(codigo(() => prepararArquetipo(spec()))).toBe('ARQUETIPO_DESCONHECIDO')
    const arq = prepararArquetipo(spec(), { definicoes: [definicao] })!
    expect(arq.resolvido).toEqual({ id: definicao.id, versao: 1, impressao: impressaoDoArquetipo(definicao) })
    expect(arq.definicao).toBe(definicao)
  })

  it('a revisão mais recente vence sem versão; a versão pedida resolve exata; impressão divergente recusa', () => {
    const { definicao: v1 } = compilada()
    const v2 = { ...v1, versao: 2, referencia: { ...v1.referencia!, pageVersion: 'v1:outra' } }
    expect(resolverArquetipo({ id: v1.id }, { definicoes: [v1, v2] }).resolvido.versao).toBe(2)
    expect(resolverArquetipo({ id: v1.id, versao: 1 }, { definicoes: [v1, v2] }).definicao).toBe(v1)
    expect(codigo(() => resolverArquetipo({ id: v1.id, versao: 3 }, { definicoes: [v1, v2] }))).toBe('ARQUETIPO_VERSAO_INEXISTENTE')
    expect(codigo(() => resolverArquetipo({ id: v1.id, versao: 1, impressao: impressaoDoArquetipo(v2) }, { definicoes: [v1, v2] }))).toBe('ARQUETIPO_IMPRESSAO_DIVERGENTE')
    // Persistida: a peça que nasceu da v1 reproduz a v1 com a impressão dela, mesmo com a v2 publicada.
    expect(resolverArquetipo({ id: v1.id, versao: 1, impressao: impressaoDoArquetipo(v1) }, { persistida: true, definicoes: [v1, v2] }).definicao).toBe(v1)
  })

  it('o formato da página é o único: pedir o feed da referência de story é recusa, nunca escala', () => {
    const { definicao } = compilada()
    expect(codigo(() => prepararArquetipo(spec({ formato: 'feed' }), { definicoes: [definicao] }))).toBe('ARQUETIPO_FORMATO_NAO_SUPORTADO')
  })

  it('gate do catálogo: com referência aprovada, o id do catálogo é recusado DITO; a referência resolve', () => {
    const { definicao } = compilada()
    const bloqueio = { catalogoBloqueado: { motivo: 'o cliente tem 1 referência aprovada no story' } }
    expect(codigo(() => prepararArquetipo(spec({ arquetipo: { id: 'minimal-fb-topo-esquerda' } }), { definicoes: [definicao], ...bloqueio }))).toBe('ARQUETIPO_NAO_APROVADO')
    expect(prepararArquetipo(spec(), { definicoes: [definicao], ...bloqueio })!.resolvido.id).toBe(definicao.id)
    // Sem bloqueio (cliente sem referência), o catálogo segue como sempre.
    expect(prepararArquetipo(spec({ arquetipo: { id: 'minimal-fb-topo-esquerda' }, blocos: [{ papel: 'headline', linhas: ['Café'] }, { papel: 'servico', linhas: ['9h'] }] }), { definicoes: [definicao] })!.resolvido.id).toBe('minimal-fb-topo-esquerda')
  })

  it('papel que a referência não tem (serviço) é recusado — a referência decide os papéis', () => {
    const { definicao } = compilada()
    expect(codigo(() => prepararArquetipo(spec({ blocos: [{ papel: 'headline', linhas: ['Café'] }, { papel: 'servico', linhas: ['9h às 12h'] }] }), { definicoes: [definicao] }))).toBe('ARQUETIPO_PAPEIS_INCOMPATIVEIS')
  })
})
