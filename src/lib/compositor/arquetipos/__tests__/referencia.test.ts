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
import congelada from './suporte/emporio-ref02-brunch-v1-congelada.json'

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

describe('F2b · o assunto da foto no quadro', () => {
  const FOTO = BRUNCH.layers.find((c) => c.id === 'foto-fundo')!
  const comFoto = (camada: Partial<Layer>, extras: Layer[] = []): Pagina => ({ ...BRUNCH, layers: [...extras, ...BRUNCH.layers.map((c) => (c.id === FOTO.id ? ({ ...c, ...camada } as Layer) : c))] })
  const compilar = (assunto: Parameters<typeof compilarReferencia>[1]['assunto'], pagina: Pagina = BRUNCH) => {
    const r = compilarReferencia(pagina, { pageVersion: 'v1:teste', versao: 1, assunto })
    if (!r.ok) throw new Error((r as Recusa).mensagem)
    return r as Ok
  }
  const CAIXA = { x0: 0.3, y0: 0.2, x1: 0.6, y1: 0.5 }
  const insumo = { caixa: CAIXA, dimensoes: { width: 2000, height: 3000 } }
  const inteira = { x: 0, y: 0, width: 1, height: 1 }
  const estilo = (crop: unknown, resto: Record<string, unknown> = {}) => ({ style: { objectFit: 'cover', crop, ...resto } }) as unknown as Partial<Layer>

  it('Brunch: a caixa no quadro é a conta à mão pelo crop aprovado, e entra na impressão', () => {
    const r = compilar(insumo)
    const { x, y, width, height } = FOTO.style!.crop!
    const assunto = r.definicao.formatos.story.assunto!
    expect(assunto.visivel).toBe(1)
    expect(assunto.caixa.x).toBeCloseTo((0.3 - x) / width, 3)
    expect(assunto.caixa.y).toBeCloseTo((0.2 - y) / height, 3)
    expect(assunto.caixa.w).toBeCloseTo(0.3 / width, 3)
    expect(assunto.caixa.h).toBeCloseTo(0.3 / height, 3)
    expect(r.leitura.assunto).toEqual(assunto)
    expect(impressaoDoArquetipo(r.definicao)).not.toBe(impressaoDoArquetipo(compilada().definicao))
    expect(validarArquetipo(r.definicao, { formatos: ['story'], areaSegura })).toEqual([])
  })

  it('sem o insumo a definição e a leitura são as de sempre (a revisão congelada não muda)', () => {
    expect(compilada().definicao.formatos.story).not.toHaveProperty('assunto')
    expect(compilada().leitura).not.toHaveProperty('assunto')
  })

  it.each(['catalogo-indisponivel', 'foto-sem-id', 'fonte-nao-coerente', 'nao-analisada', 'sem-assunto', 'sem-dimensoes'] as const)('ausente "%s": a referência compila sem o assunto, e a leitura diz', (motivo) => {
    const r = compilar({ ausente: motivo })
    expect(r.definicao.formatos.story).not.toHaveProperty('assunto')
    expect(r.leitura.assunto).toEqual({ ausente: motivo })
  })

  it.each([
    ['sem objectFit', { style: { crop: FOTO.style!.crop } }],
    ['girada', { rotation: 5 }],
    ['espelhada', estilo(inteira, { flipH: true })],
    ['espelhada na vertical', estilo(inteira, { flipV: true })],
  ] as Array<[string, Partial<Layer>]>)('%s → transformacao-nao-representada', (_nome, camada) => {
    expect(compilar(insumo, comFoto(camada)).leitura.assunto).toEqual({ ausente: 'transformacao-nao-representada' })
  })

  it('a âncora vale como janela quando não há crop: a foto larga em cover, pela MESMA conta do desenho', () => {
    const r = compilar({ caixa: { x0: 0.4, y0: 0.2, x1: 0.6, y1: 0.8 }, dimensoes: { width: 3840, height: 1920 } }, comFoto({ style: { objectFit: 'cover', cropPosition: 'center-middle' } } as unknown as Partial<Layer>))
    const assunto = r.leitura.assunto as { caixa: { x: number; y: number; w: number; h: number }; visivel: number }
    // Cover central: janela 1080×1920 em px da foto, x de 1380 a 2460; o assunto (1536–2304) cabe inteiro.
    expect(assunto.visivel).toBe(1)
    expect(assunto.caixa.x).toBeCloseTo((1536 - 1380) / 1080, 3)
    expect(assunto.caixa.w).toBeCloseTo(768 / 1080, 3)
  })

  it('caixa fora do quadro, ou interseção que some ao arredondar → fora-do-quadro', () => {
    const janela = estilo({ x: 0, y: 0, width: 0.5, height: 0.5 })
    expect(compilar({ caixa: { x0: 0.6, y0: 0.6, x1: 0.9, y1: 0.9 }, dimensoes: insumo.dimensoes }, comFoto(janela)).leitura.assunto).toEqual({ ausente: 'fora-do-quadro' })
    expect(compilar({ caixa: { x0: 0.49999, y0: 0.1, x1: 0.9, y1: 0.3 }, dimensoes: insumo.dimensoes }, comFoto(janela)).leitura.assunto).toEqual({ ausente: 'fora-do-quadro' })
  })

  it('o crop da página corta o assunto: `visivel` é o que sobrou', () => {
    const r = compilar({ caixa: { x0: 0.4, y0: 0.1, x1: 0.6, y1: 0.3 }, dimensoes: insumo.dimensoes }, comFoto(estilo({ x: 0, y: 0, width: 0.5, height: 0.5 })))
    expect(r.leitura.assunto).toMatchObject({ visivel: 0.5, caixa: { x: 0.8, y: 0.2, w: 0.2, h: 0.4 } })
  })

  it('camada deslocada: o assunto inteiro na camada e metade na página → visivel 0,5', () => {
    const r = compilar({ caixa: { x0: 0.2, y0: 0.8, x1: 0.4, y1: 1 }, dimensoes: insumo.dimensoes }, comFoto({ ...estilo(inteira), position: { x: 0, y: 192 } }))
    expect(r.leitura.assunto).toEqual({ visivel: 0.5, caixa: { x: 0.2, y: 0.9, w: 0.2, h: 0.1 } })
  })

  it('duas camadas com a mesma URL: vale a camada escolhida (o crop dela), e a outra é dita', () => {
    const copia = { ...FOTO, id: 'copia', name: 'Cópia', size: { width: 200, height: 200 }, style: { objectFit: 'cover', crop: { x: 0.5, y: 0.5, width: 0.5, height: 0.5 } } } as unknown as Layer
    const r = compilar(insumo, comFoto(estilo(inteira), [copia]))
    expect(r.leitura.assunto).toEqual({ visivel: 1, caixa: { x: 0.3, y: 0.2, w: 0.3, h: 0.3 } })
    expect(r.leitura.ignoradas).toContainEqual(expect.objectContaining({ camada: 'copia', motivo: 'foto-extra' }))
  })

  it('o validador: só em referência, com caixa dentro do quadro e visivel em (0, 1]', () => {
    const r = compilar(insumo)
    const codigos = (d: Ok['definicao']) => validarArquetipo(d, { formatos: ['story'], areaSegura }).map((p) => `${p.codigo}:${p.campo}`)
    const comAssunto = (assunto: unknown, referencia: unknown = r.definicao.referencia) => ({ ...r.definicao, referencia, formatos: { ...r.definicao.formatos, story: { ...r.definicao.formatos.story, assunto } } }) as unknown as Ok['definicao']
    const assunto = r.definicao.formatos.story.assunto!
    const { referencia: _semReferencia, ...catalogada } = comAssunto(assunto)
    expect(codigos(catalogada as Ok['definicao'])).toContain('CAMPO_INVALIDO:formatos.story.assunto')
    expect(codigos(comAssunto({ ...assunto, visivel: 0 }))).toContain('CAMPO_INVALIDO:formatos.story.assunto.visivel')
    expect(codigos(comAssunto({ ...assunto, visivel: 1.01 }))).toContain('CAMPO_INVALIDO:formatos.story.assunto.visivel')
    expect(codigos(comAssunto({ ...assunto, caixa: { x: 0.9, y: 0, w: 0.2, h: 0.1 } }))).toContain('COORDENADA_FORA:formatos.story.assunto.caixa')
    expect(codigos(comAssunto({ ...assunto, extra: 1 }))).toContain('CAMPO_DESCONHECIDO:formatos.story.assunto.extra')
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

describe('F2c · o corpo desenhado na referência (02/11/2026)', () => {
  const comCorpos = (corpos: Record<string, unknown>) => {
    const { definicao } = compilada()
    return { ...definicao, formatos: { story: { ...definicao.formatos.story, corpos } } } as unknown as Ok['definicao']
  }
  const campos = (d: Ok['definicao']) => validarArquetipo(d, { formatos: ['story'], areaSegura }).map((p) => p.campo)

  it('a Brunch compila `corpos: { headline: 85, apoio: 39 }` (o fontSize desenhado), a leitura diz o corpo por papel, e o validador aceita', () => {
    const r = compilada()
    expect(r.definicao.formatos.story.corpos).toEqual({ headline: 85, apoio: 39 })
    expect(r.leitura.papeis.map((p) => [p.papel, p.corpo])).toEqual([['headline', 85], ['apoio', 39]])
    expect(validarArquetipo(r.definicao, { formatos: ['story'], areaSegura })).toEqual([])
  })

  it('corpos só em REFERÊNCIA (no catálogo a escala é relação); inteiro de 8 até a altura; todo papel de texto presente tem o seu; papel estranho recusa', () => {
    const { definicao } = compilada()
    const { referencia: _r, ...semReferencia } = definicao as unknown as Record<string, unknown>
    expect(campos(semReferencia as unknown as Ok['definicao'])).toContain('formatos.story.corpos')
    expect(campos(comCorpos({ headline: 85.5, apoio: 39 }))).toContain('formatos.story.corpos.headline')
    expect(campos(comCorpos({ headline: 7, apoio: 39 }))).toContain('formatos.story.corpos.headline')
    expect(campos(comCorpos({ headline: 1921, apoio: 39 }))).toContain('formatos.story.corpos.headline')
    expect(campos(comCorpos({ headline: 85 }))).toContain('formatos.story.corpos.apoio')
    expect(campos(comCorpos({ headline: 85, apoio: 39, servico: 30 }))).toContain('formatos.story.corpos.servico')
    expect(campos(comCorpos({ headline: 8, apoio: 1920 }))).toEqual([])
  })

  it('a camada com corpo fora do domínio recusa REFERENCIA_CORPO_INVALIDO; a página fora do canvas canônico recusa REFERENCIA_DIMENSOES_INCOMPATIVEIS (pixels literais)', () => {
    const quebrada = { ...BRUNCH, layers: BRUNCH.layers.map((l) => (l.id === 'titulo' ? ({ ...l, style: { ...l.style, fontSize: 85.5 } } as Layer) : l)) }
    const r1 = compilarReferencia(quebrada, { pageVersion: 'v', versao: 1 }) as Recusa
    expect([r1.ok, r1.codigo]).toEqual([false, 'REFERENCIA_CORPO_INVALIDO'])
    expect(r1.mensagem).toMatch(/Título.*85\.5/)
    const semCorpo = { ...BRUNCH, layers: BRUNCH.layers.map((l) => (l.id === 'apoio' ? ({ ...l, style: { ...l.style, fontSize: undefined } } as Layer) : l)) }
    expect((compilarReferencia(semCorpo, { pageVersion: 'v', versao: 1 }) as Recusa).codigo).toBe('REFERENCIA_CORPO_INVALIDO')
    // 2160×3840 é story pela proporção (e pela tag), mas o corpo em px não é o do canvas canônico: recusa dita.
    const grande = { ...BRUNCH, width: 2160, height: 3840 }
    const r2 = compilarReferencia(grande, { pageVersion: 'v', versao: 1 }) as Recusa
    expect([r2.ok, r2.codigo]).toEqual([false, 'REFERENCIA_DIMENSOES_INCOMPATIVEIS'])
    expect(r2.mensagem).toMatch(/2160×3840.*1080×1920/)
  })

  it('a revisão F1 CONGELADA (compilada antes da F2c, sem corpos) continua válida com a impressão gravada; a recompilação de hoje é OUTRA impressão com a MESMA geometria', () => {
    const v1 = congelada.definicao as unknown as Ok['definicao']
    expect(v1.formatos.story.corpos).toBeUndefined()
    expect(impressaoDoArquetipo(v1)).toBe(congelada.impressao)
    expect(validarArquetipo(v1, { formatos: ['story'], areaSegura })).toEqual([])
    const hoje = compilada().definicao
    expect(impressaoDoArquetipo(hoje)).not.toBe(congelada.impressao)
    // F2c acrescentou `corpos`; F2d, `estilos` — a geometria por baixo é a mesma.
    const { corpos: _c, estilos: _e, ...geometriaDeHoje } = hoje.formatos.story
    expect(geometriaDeHoje).toEqual(v1.formatos.story)
    // A materialização da congelada é a de sempre (as mesmas caixas): a F2c não toca a definição antiga.
    expect(materializada(v1).papeis.headline!.posicao).toEqual(materializada(hoje).papeis.headline!.posicao)
  })
})

describe('F2d · o estilo desenhado na referência (02/11/2026)', () => {
  const ESTILO_TITULO = { fontFamily: 'TrajanPro Regular', fontWeight: null, lineHeight: 1, letterSpacing: 0, textTransform: 'uppercase', color: '#F8F8F8' }
  const comCamada = (id: string, muda: (l: Layer) => Layer) => ({ ...BRUNCH, layers: BRUNCH.layers.map((l) => (l.id === id ? muda(l) : l)) })
  const recusaDe = (pagina: typeof BRUNCH) => compilarReferencia(pagina, { pageVersion: 'v', versao: 1 }) as Recusa
  const comEstilos = (estilos: Record<string, unknown>) => {
    const { definicao } = compilada()
    return { ...definicao, formatos: { story: { ...definicao.formatos.story, estilos } } } as unknown as Ok['definicao']
  }
  const problemas = (d: Ok['definicao']) => validarArquetipo(d, { formatos: ['story'], areaSegura }).map((p) => `${p.codigo} ${p.campo}`)

  it('a Brunch compila `estilos` (TrajanPro Regular, peso normal, entrelinha 1, caixa alta, #F8F8F8; apoio com espaçamento 3), a leitura diz o estilo, e o validador aceita', () => {
    const r = compilada()
    expect(r.definicao.formatos.story.estilos).toEqual({ headline: ESTILO_TITULO, apoio: { ...ESTILO_TITULO, letterSpacing: 3 } })
    expect(r.leitura.papeis.map((p) => [p.papel, p.estilo.fontFamily, p.estilo.letterSpacing])).toEqual([['headline', 'TrajanPro Regular', 0], ['apoio', 'TrajanPro Regular', 3]])
    expect(validarArquetipo(r.definicao, { formatos: ['story'], areaSegura })).toEqual([])
  })

  it('o leitor é próprio: peso "bold" vira 700, "950" recusa; cor ausente ou fora de #rrggbb recusa (nunca o branco por fallback); caixa desconhecida recusa', () => {
    expect((compilarReferencia(comCamada('titulo', (l) => ({ ...l, style: { ...l.style, fontWeight: 'bold' } } as Layer)), { pageVersion: 'v', versao: 1 }) as Ok).definicao.formatos.story.estilos!.headline!.fontWeight).toBe(700)
    expect(recusaDe(comCamada('titulo', (l) => ({ ...l, style: { ...l.style, fontWeight: '950' } } as Layer))).codigo).toBe('REFERENCIA_ESTILO_INVALIDO')
    expect(recusaDe(comCamada('titulo', (l) => ({ ...l, style: { ...l.style, color: undefined } } as Layer))).codigo).toBe('REFERENCIA_ESTILO_INVALIDO')
    expect(recusaDe(comCamada('apoio', (l) => ({ ...l, style: { ...l.style, color: 'rgba(255,255,255,0.9)' } } as Layer))).codigo).toBe('REFERENCIA_ESTILO_INVALIDO')
    expect(recusaDe(comCamada('titulo', (l) => ({ ...l, style: { ...l.style, textTransform: 'small-caps' } } as unknown as Layer))).codigo).toBe('REFERENCIA_ESTILO_INVALIDO')
  })

  it('o que a F2d não representa é recusado DITO (REFERENCIA_ESTILO_NAO_SUPORTADO): rich-text, itálico, decoração, contorno, sombra com deslocamento horizontal', () => {
    expect(recusaDe(comCamada('titulo', (l) => ({ ...l, type: 'rich-text' } as Layer))).codigo).toBe('REFERENCIA_ESTILO_NAO_SUPORTADO')
    expect(recusaDe(comCamada('titulo', (l) => ({ ...l, style: { ...l.style, fontStyle: 'italic' } } as Layer))).codigo).toBe('REFERENCIA_ESTILO_NAO_SUPORTADO')
    expect(recusaDe(comCamada('titulo', (l) => ({ ...l, style: { ...l.style, textDecoration: 'underline' } } as Layer))).codigo).toBe('REFERENCIA_ESTILO_NAO_SUPORTADO')
    expect(recusaDe(comCamada('apoio', (l) => ({ ...l, effects: { stroke: { enabled: true, strokeColor: '#000000', strokeWidth: 2 } } } as Layer))).codigo).toBe('REFERENCIA_ESTILO_NAO_SUPORTADO')
    expect(recusaDe(comCamada('apoio', (l) => ({ ...l, effects: { shadow: { enabled: true, shadowColor: '#000000', shadowBlur: 4, shadowOffsetX: 2, shadowOffsetY: 2, shadowOpacity: 0.5 } } } as Layer))).codigo).toBe('REFERENCIA_ESTILO_NAO_SUPORTADO')
    // A sombra VERTICAL da página entra no estilo.
    const comSombra = compilarReferencia(comCamada('apoio', (l) => ({ ...l, effects: { shadow: { enabled: true, shadowColor: '#000000', shadowBlur: 4, shadowOffsetX: 0, shadowOffsetY: 2, shadowOpacity: 0.5 } } } as Layer)), { pageVersion: 'v', versao: 1 }) as Ok
    expect(comSombra.definicao.formatos.story.estilos!.apoio!.sombra).toEqual({ color: '#000000', blur: 4, offsetY: 2, opacity: 0.5 })
    expect(validarArquetipo(comSombra.definicao, { formatos: ['story'], areaSegura })).toEqual([])
  })

  it('a cerca do validador abre por CAMINHO EXATO: fontFamily/color só em estilos.<papel>; fontSize, svg ou projectId dentro de estilos recusam; cor fora de estilos recusa; estilos sem referência recusa', () => {
    const { definicao } = compilada()
    const { referencia: _r, ...semReferencia } = definicao as unknown as Record<string, unknown>
    expect(problemas(semReferencia as unknown as Ok['definicao'])).toEqual(expect.arrayContaining([expect.stringContaining('CAMPO_INVALIDO formatos.story.corpos'), expect.stringContaining('formatos.story.estilos')]))
    // Contrabando dentro de estilos: proibido continua proibido (e desconhecido continua desconhecido).
    const contrabando = comEstilos({ headline: { ...ESTILO_TITULO, fontSize: 85 }, apoio: { ...ESTILO_TITULO, svg: '<svg/>', projectId: 12 } })
    expect(problemas(contrabando)).toEqual(expect.arrayContaining(['CAMPO_PROIBIDO formatos.story.estilos.headline.fontSize', 'CAMPO_PROIBIDO formatos.story.estilos.apoio.svg', 'CAMPO_PROIBIDO formatos.story.estilos.apoio.projectId']))
    // Cor literal fora de estilos: recusada como sempre.
    const corFora = { ...definicao, papeis: definicao.papeis.map((p, i) => (i === 0 ? { ...p, color: '#ffffff' } : p)) } as unknown as Ok['definicao']
    expect(problemas(corFora)).toEqual(expect.arrayContaining(['CAMPO_PROIBIDO papeis.0.color']))
    // Forma fechada e domínio.
    expect(problemas(comEstilos({ headline: { ...ESTILO_TITULO, textTransform: 'small-caps' }, apoio: ESTILO_TITULO }))).toEqual(expect.arrayContaining(['CAMPO_INVALIDO formatos.story.estilos.headline.textTransform']))
    expect(problemas(comEstilos({ headline: ESTILO_TITULO }))).toEqual(expect.arrayContaining(['CAMPO_INVALIDO formatos.story.estilos.apoio']))
    expect(problemas(comEstilos({ headline: { ...ESTILO_TITULO, sombra: { color: '#000000', blur: 2, offsetY: 1, opacity: 0.5, offsetX: 1 } }, apoio: ESTILO_TITULO }))).toEqual(expect.arrayContaining(['CAMPO_DESCONHECIDO formatos.story.estilos.headline.sombra.offsetX']))
    expect(problemas(comEstilos({ headline: { ...ESTILO_TITULO, fontWeight: 950 }, apoio: { ...ESTILO_TITULO, color: 'white' } }))).toEqual(expect.arrayContaining(['CAMPO_INVALIDO formatos.story.estilos.headline.fontWeight', 'CAMPO_INVALIDO formatos.story.estilos.apoio.color']))
    // `estilos` sem `corpos` no mesmo formato: o estilo seria ignorado em silêncio — recusa dita.
    const { corpos: _corpos, ...semCorpos } = definicao.formatos.story
    expect(problemas({ ...definicao, formatos: { story: semCorpos } } as unknown as Ok['definicao'])).toEqual(expect.arrayContaining(['CAMPO_INVALIDO formatos.story.corpos']))
  })

  it('as revisões de ANTES (a F1 congelada; uma só com corpos) continuam válidas com a impressão gravada — a F2d não as toca', () => {
    const v1 = congelada.definicao as unknown as Ok['definicao']
    expect(v1.formatos.story.estilos).toBeUndefined()
    expect(impressaoDoArquetipo(v1)).toBe(congelada.impressao)
    expect(validarArquetipo(v1, { formatos: ['story'], areaSegura })).toEqual([])
    const { estilos: _e, ...soCorpos } = compilada().definicao.formatos.story
    const v2 = { ...compilada().definicao, formatos: { story: soCorpos } } as unknown as Ok['definicao']
    expect(validarArquetipo(v2, { formatos: ['story'], areaSegura })).toEqual([])
  })
})
