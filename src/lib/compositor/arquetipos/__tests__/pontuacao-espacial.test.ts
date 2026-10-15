import { describe, expect, it } from 'vitest'

import type { Rect } from '@/lib/creatives/halo/halo'
import type { FotoCinza } from '@/lib/creatives/halo/halo-medicao'
import type { CropPosition } from '@/lib/image-crop-utils'
import { alturaDaFaixa, CURVA_DE_LEITURA, GRADIENTE_PADRAO, type Borda } from '../../gradiente-de-leitura'
import { coberturaDaRegiao, mapaDeCalma, pontuarCandidatos, TETO_DE_COBERTURA_DO_ASSUNTO, TETO_DE_COBERTURA_DO_ASSUNTO_ESTIMADO } from '../../mapa-de-calma'
import { candidatasDistintas, planejarTratamentoDaBorda } from '../../tratamento-de-leitura'
import { LIMITES_DA_REVISAO } from '@/lib/creatives/revisao/regras'
import {
  MOTIVOS_DE_ELIMINACAO,
  PESOS_DA_PONTUACAO,
  type AvaliacaoDaCombinacao,
  type ComponentesDaPontuacao,
  type FaixaDeBusca,
  type LeituraDoCorte,
  type PlanejamentoDoTratamento,
  type UnidadeDaCombinacao,
} from '../busca-espacial-tipos'
import { avaliarCombinacao, motivoDaVitoria, ordenarAvaliacoes, regioesProtegidas, resumirAvaliacao } from '../pontuacao-espacial'
import type { PapelDeTexto } from '../tipos'

const W = 1080
const H = 1920
const ESCALA = 0.1

/** Foto sintética do story (raster 108×192): a luz de cada ponto da peça. */
function foto(luz: (x: number, y: number) => number): FotoCinza {
  const width = W * ESCALA
  const height = H * ESCALA
  const data = Buffer.alloc(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[y * width + x] = Math.max(0, Math.min(255, Math.round(luz(x / ESCALA, y / ESCALA))))
  }
  return { data, width, height, stride: 1, escala: ESCALA, canvas: { width: W, height: H } }
}

/** Ruído determinístico 0..1 (a textura que a calma tem de enxergar). */
function ruido(seed = 7): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return (s % 100) / 100
  }
}

function leituraDoCorte(f: FotoCinza, extra: Partial<LeituraDoCorte> = {}): LeituraDoCorte {
  return { crop: 'center-middle', raster: f, mapa: mapaDeCalma(f), regioes: [], assuntoVisivel: null, ...extra }
}

/** O planejamento com a função REAL do CP2A: véu escuro e véu claro da marca, a curva e a faixa padrão. */
function planejamento(bordasExplicitas: Borda[] = [], cores = ['#1A1A1A', '#F2F2F2']): PlanejamentoDoTratamento {
  const candidatas = candidatasDistintas(cores.map((cor) => ({ cor, origem: 'pagina' as const })))
  return {
    bordasExplicitas,
    planejar: ({ borda, textos, vizinhos, alcance }) =>
      planejarTratamentoDaBorda({ borda, textos, vizinhos, candidatas, curva: CURVA_DE_LEITURA, forcaMinima: 0.45, forcaMaxima: 0.9, altura: alturaDaFaixa(alcance, H, GRADIENTE_PADRAO), H }),
  }
}

function unidade(
  papel: PapelDeTexto,
  o: { y: number; dy?: number; x?: number; w?: number; h?: number; faixa?: number; ordem?: number; borda?: Borda; cor?: string; ornamentos?: Rect; texto?: Rect },
): UnidadeDaCombinacao {
  const ref = { x: o.x ?? 100, y: o.y, width: o.w ?? 800, height: o.h ?? 100 }
  const rect = { ...ref, y: ref.y + (o.dy ?? 0) }
  return {
    papel,
    ordemDeLeitura: o.ordem ?? 1,
    faixa: o.faixa ?? 0,
    rect,
    rectComOrnamentos: o.ornamentos ?? rect,
    rectNaReferencia: ref,
    borda: o.borda ?? (ref.y + ref.height / 2 < H / 2 ? 'topo' : 'rodape'),
    textos: [{ camada: `${papel}-1`, grupo: `grupo-arq-${papel}`, cor: o.cor ?? '#FFFFFF', rect: o.texto ?? rect, caixaDeFundo: false }],
  }
}

function avaliar(corte: LeituraDoCorte, unidades: UnidadeDaCombinacao[], o: { indice?: number; explicitas?: Borda[]; cores?: string[]; intervalo?: { min: number; max: number } } = {}) {
  const dyDa = (u: UnidadeDaCombinacao) => u.rect.y - u.rectNaReferencia.y
  const indicesDasFaixas = [...new Set(unidades.map((u) => u.faixa))]
  const faixas: FaixaDeBusca[] = indicesDasFaixas.map((indice) => ({
    indice,
    membros: unidades.filter((u) => u.faixa === indice).map((u) => u.papel),
    intervalo: o.intervalo ?? { min: -800, max: 800 },
    referenciaValida: true,
    candidatos: [{ rotulo: 'referencia', dy: 0 }],
  }))
  const escolhas = indicesDasFaixas.map((faixa) => {
    const dy = dyDa(unidades.find((u) => u.faixa === faixa)!)
    return { faixa, rotulo: dy === 0 ? ('referencia' as const) : dy < 0 ? ('acima' as const) : ('abaixo' as const), dy }
  })
  return avaliarCombinacao({
    corte,
    energiaDeReferencia: corte.mapa.energiaMaxima,
    materializada: { combinacao: { indice: o.indice ?? 0, escolhas, deslocamentos: Object.fromEntries(unidades.map((u) => [u.papel, dyDa(u)])) }, unidades },
    faixas,
    planejamento: planejamento(o.explicitas, o.cores),
    canvas: { width: W, height: H },
  })
}

const motivos = (a: AvaliacaoDaCombinacao) => a.eliminada.map((e) => e.motivo)

describe('avaliarCombinacao — tratamento e componentes', () => {
  it('topo claro e base escura, texto escuro em cima e claro embaixo: as duas bordas sem necessidade, custo 0', () => {
    const c = leituraDoCorte(foto((_x, y) => (y < 960 ? 230 : 30)))
    const a = avaliar(c, [unidade('headline', { y: 200, h: 150, cor: '#1A1A1A' }), unidade('servico', { y: 1600, faixa: 1, ordem: 2 })])
    expect(a.eliminada).toEqual([])
    expect(a.tratamento).toEqual([
      { borda: 'topo', estado: 'sem-necessidade' },
      { borda: 'rodape', estado: 'sem-necessidade' },
    ])
    expect(a.componentes).toEqual({ custoDoTratamento: 0, calma: 1, contrasteNatural: 1, assunto: 1, referencia: 1, corte: 1 })
    expect(a.pontuacao).toBe(1)
    expect(a.textos).toEqual([
      { camada: 'headline-1', borda: 'topo', p02: 230, p98: 230, polaridade: 'escura', alvo: expect.any(Number), jaLe: true, precisaDeTratamento: false, alcancaAlvo: null, forcaEstimada: null },
      { camada: 'servico-1', borda: 'rodape', p02: 30, p98: 30, polaridade: 'clara', alvo: 149, jaLe: true, precisaDeTratamento: false, alcancaAlvo: null, forcaEstimada: null },
    ])
  })

  it('a sem véu vence a que precisa de véu mesmo sendo menos calma e mais longe da referência', () => {
    const r = ruido()
    const c = leituraDoCorte(foto((_x, y) => (y < 1000 ? 200 : r() * 80)))
    const naReferencia = avaliar(c, [unidade('headline', { y: 700 })], { indice: 0 })
    const abaixo = avaliar(c, [unidade('headline', { y: 700, dy: 700 })], { indice: 1 })
    expect(naReferencia.eliminada).toEqual([])
    expect(naReferencia.tratamento![0]).toMatchObject({ borda: 'topo', estado: 'tratado', cor: '#1A1A1A' })
    expect(naReferencia.componentes!.custoDoTratamento).toBeGreaterThan(0)
    expect(naReferencia.textos![0]).toMatchObject({ precisaDeTratamento: true, forcaEstimada: naReferencia.tratamento![0].forca })
    expect(abaixo.componentes!.custoDoTratamento).toBe(0)
    expect(abaixo.componentes!.calma).toBeLessThan(naReferencia.componentes!.calma)
    expect(abaixo.pontuacao!).toBeLessThan(naReferencia.pontuacao!)

    const [vencedora, segunda] = ordenarAvaliacoes([naReferencia, abaixo])
    expect(vencedora).toBe(abaixo)
    expect(motivoDaVitoria(vencedora, segunda)).toMatch(/^lê sem véu; a segunda pedia véu no (topo|rodapé) \d,\d\d/)
  })

  it('empate de custo: a mais calma vence, mesmo longe da referência', () => {
    const r = ruido()
    const c = leituraDoCorte(foto((_x, y) => (y < 960 ? 30 : r() * 80)))
    const naReferencia = avaliar(c, [unidade('headline', { y: 1400 })], { indice: 0 })
    const acima = avaliar(c, [unidade('headline', { y: 1400, dy: -700 })], { indice: 1 })
    expect(naReferencia.componentes!.custoDoTratamento).toBe(0)
    expect(acima.componentes!.custoDoTratamento).toBe(0)
    expect(acima.componentes!.calma).toBeGreaterThan(0.95)
    expect(acima.componentes!.referencia).toBeCloseTo(0.125, 4)

    const [vencedora, segunda] = ordenarAvaliacoes([naReferencia, acima])
    expect(vencedora).toBe(acima)
    expect(motivoDaVitoria(vencedora, segunda)).toMatch(/^mesmo custo de tratamento e mais calma \(0,9\d contra 0,\d\d\)$/)
  })

  it('texto fora do raster: registrado sem leitura e fora do plano', () => {
    const c = leituraDoCorte(foto(() => 30))
    const a = avaliar(c, [unidade('headline', { y: 300, texto: { x: 100, y: -400, width: 200, height: 100 } })])
    expect(a.eliminada).toEqual([])
    expect(a.textos![0]).toMatchObject({ polaridade: null, alvo: null, jaLe: false, precisaDeTratamento: false })
    expect(a.componentes!.contrasteNatural).toBe(1)
  })
})

describe('avaliarCombinacao — eliminação (todos os motivos, na ordem)', () => {
  const escura = () => leituraDoCorte(foto(() => 30))

  it('regioesProtegidas: o catálogo sozinho, senão o estimado, com o teto de cada um', () => {
    const cat = { x: 0, y: 0, width: 10, height: 10 }
    const est = { x: 5, y: 5, width: 10, height: 10 }
    expect(regioesProtegidas({ catalogo: cat, estimado: est })).toEqual([{ rect: cat, origem: 'catalogo', teto: 0.25 }])
    expect(regioesProtegidas({ catalogo: null, estimado: est })).toEqual([{ rect: est, origem: 'estimado', teto: 0.4 }])
    expect(regioesProtegidas({ catalogo: null, estimado: null })).toEqual([])
  })

  it('região protegida coberta pela unidade elimina', () => {
    const c = leituraDoCorte(foto(() => 30), { regioes: regioesProtegidas({ catalogo: { x: 100, y: 150, width: 500, height: 300 }, estimado: null }) })
    const a = avaliar(c, [unidade('headline', { y: 200, h: 150 })])
    expect(motivos(a)).toContain(MOTIVOS_DE_ELIMINACAO.invadeRegiaoProtegida)
    expect(a.eliminada[0]).toMatchObject({ papel: 'headline', detalhe: 'headline (com ornamentos) cobre 63% da região protegida do catálogo (teto 25%)' })
    expect(a.componentes).toBeUndefined()
    expect(a.tratamento).toEqual([{ borda: 'topo', estado: 'sem-necessidade' }])
  })

  it('região protegida do catálogo coberta pelo texto elimina (cada texto conta, além da unidade)', () => {
    const c = leituraDoCorte(foto(() => 30), { regioes: regioesProtegidas({ catalogo: { x: 0, y: 500, width: 1080, height: 1400 }, estimado: null }) })
    const u = unidade('headline', { y: 550, x: 150, w: 400, ornamentos: { x: 100, y: 100, width: 900, height: 600 } })
    const a = avaliar(c, [u])
    expect(a.eliminada).toContainEqual({ motivo: MOTIVOS_DE_ELIMINACAO.invadeRegiaoProtegida, papel: 'headline', detalhe: 'headline-1 cobre 100% da região protegida do catálogo (teto 25%)' })
  })

  it('a região ESTIMADA pela energia nunca elimina: entra só como custo no componente assunto', () => {
    const c = leituraDoCorte(foto(() => 30), { regioes: regioesProtegidas({ catalogo: null, estimado: { x: 0, y: 500, width: 1080, height: 1400 } }) })
    const a = avaliar(c, [unidade('headline', { y: 550, x: 150, w: 400 })])
    expect(a.eliminada).toEqual([])
    expect(a.componentes!.assunto).toBe(0)
    const longe = avaliar(c, [unidade('headline', { y: 200, x: 150, w: 400 })])
    expect(longe.componentes!.assunto).toBe(1)
  })

  it('corte que mostra menos de 75% do assunto do catálogo elimina', () => {
    expect(motivos(avaliar(leituraDoCorte(foto(() => 30), { assuntoVisivel: 0.6 }), [unidade('headline', { y: 200 })]))).toEqual([MOTIVOS_DE_ELIMINACAO.corteSemOAssunto])
    expect(avaliar(leituraDoCorte(foto(() => 30), { assuntoVisivel: 0.8 }), [unidade('headline', { y: 200 })]).eliminada).toEqual([])
  })

  it('colisão entre faixas elimina; encostar não', () => {
    const headline = unidade('headline', { y: 200, h: 150 })
    const sobre = avaliar(escura(), [headline, unidade('servico', { y: 1600, dy: -1300, faixa: 1, ordem: 2 })])
    expect(motivos(sobre)).toEqual([MOTIVOS_DE_ELIMINACAO.colisao, MOTIVOS_DE_ELIMINACAO.ordemDeLeitura])
    const encosta = avaliar(escura(), [headline, unidade('servico', { y: 1600, dy: -1250, faixa: 1, ordem: 2 })])
    expect(encosta.eliminada).toEqual([])
  })

  it('ordem de leitura: a seguinte começa antes de a anterior terminar (folga de 2 px)', () => {
    const fora = avaliar(escura(), [unidade('headline', { y: 500 }), unidade('apoio', { y: 590, h: 80, ordem: 2 })])
    expect(motivos(fora)).toEqual([MOTIVOS_DE_ELIMINACAO.ordemDeLeitura])
    const naFolga = avaliar(escura(), [unidade('headline', { y: 500 }), unidade('apoio', { y: 598, h: 80, ordem: 2 })])
    expect(naFolga.eliminada).toEqual([])
  })

  it('hierarquia: quem estava acima na referência passa para baixo — junto com a ordem, ou sozinha', () => {
    const trocadas = avaliar(escura(), [unidade('headline', { y: 200, dy: 1400, h: 150 }), unidade('servico', { y: 1600, dy: -1400, faixa: 1, ordem: 2 })])
    expect(motivos(trocadas)).toEqual([MOTIVOS_DE_ELIMINACAO.ordemDeLeitura, MOTIVOS_DE_ELIMINACAO.hierarquia])
    // Referência em que a ordem de leitura não segue a vertical: só a hierarquia acusa.
    const so = avaliar(escura(), [unidade('headline', { y: 1600, dy: -1500, h: 150 }), unidade('servico', { y: 200, dy: 1400, faixa: 1, ordem: 2 })])
    expect(so.eliminada).toEqual([{ motivo: MOTIVOS_DE_ELIMINACAO.hierarquia, papel: 'servico', detalhe: 'servico ficava acima de headline na referência e passou para baixo' }])
  })

  it('plano inviável: polaridade incompatível na mesma borda (e a borda explícita não elimina)', () => {
    const c = leituraDoCorte(foto((x, y) => (y < 960 && x < 540 ? 220 : 30)))
    const unidades = () => [unidade('headline', { y: 300, h: 120, w: 350 }), unidade('apoio', { y: 450, h: 120, x: 640, w: 350, ordem: 2, cor: '#1A1A1A' })]
    const a = avaliar(c, unidades())
    expect(a.eliminada).toEqual([
      { motivo: MOTIVOS_DE_ELIMINACAO.polaridadeIncompativel, detalhe: expect.stringContaining('topo'), motivoDoTratamento: 'POLARIDADE_INCOMPATIVEL_NA_MESMA_BORDA' },
    ])
    expect(a.tratamento).toEqual([{ borda: 'topo', estado: 'inviavel', motivo: 'POLARIDADE_INCOMPATIVEL_NA_MESMA_BORDA' }])
    expect(a.textos!.map((t) => [t.polaridade, t.precisaDeTratamento])).toEqual([
      ['clara', true],
      ['escura', true],
    ])
    expect(a.componentes).toBeUndefined()

    const explicita = avaliar(c, unidades(), { explicitas: ['topo'] })
    expect(explicita.eliminada).toEqual([])
    expect(explicita.tratamento).toEqual([{ borda: 'topo', estado: 'explicito' }])
    expect(explicita.componentes).toMatchObject({ custoDoTratamento: 0, contrasteNatural: 0 })
  })

  it('plano inviável: o véu que o topo pede piora o texto do rodapé; sem cor no sentido certo', () => {
    const c = leituraDoCorte(foto((_x, y) => (y < 710 ? 200 : 5)))
    const unidades = [unidade('headline', { y: 600 }), unidade('servico', { y: 720, h: 80, faixa: 1, ordem: 2, borda: 'rodape' })]
    const piora = avaliar(c, unidades)
    expect(piora.eliminada).toEqual([
      { motivo: MOTIVOS_DE_ELIMINACAO.tratamentoPiora, detalhe: expect.stringContaining('TRATAMENTO_PIOROU_LEITURA'), motivoDoTratamento: 'TRATAMENTO_PIOROU_LEITURA' },
    ])
    expect(piora.tratamento).toEqual([
      { borda: 'topo', estado: 'inviavel', motivo: 'TRATAMENTO_PIOROU_LEITURA' },
      { borda: 'rodape', estado: 'sem-necessidade' },
    ])
    // Só o véu claro aprovado: não leva o texto claro ao alvo.
    const semCor = avaliar(c, unidades, { cores: ['#F2F2F2'] })
    expect(semCor.eliminada).toEqual([
      { motivo: MOTIVOS_DE_ELIMINACAO.semCorAprovada, detalhe: expect.any(String), motivoDoTratamento: 'SEM_COR_APROVADA_PARA_A_POLARIDADE' },
    ])
  })
})

describe('ordenarAvaliacoes — filtro sequencial', () => {
  const COMPONENTES: ComponentesDaPontuacao = { custoDoTratamento: 0, calma: 0.8, contrasteNatural: 1, assunto: 1, referencia: 1, corte: 1 }
  function aval(indice: number, c: Partial<ComponentesDaPontuacao> = {}, crop: CropPosition = 'center-middle', eliminada: AvaliacaoDaCombinacao['eliminada'] = []): AvaliacaoDaCombinacao {
    const componentes = { ...COMPONENTES, corte: crop === 'center-middle' ? 1 : 0, ...c }
    const pontuacao = (Object.keys(PESOS_DA_PONTUACAO) as Array<keyof typeof PESOS_DA_PONTUACAO>).reduce((s, k) => s + PESOS_DA_PONTUACAO[k] * componentes[k], 0)
    const base = { crop, combinacao: { indice, escolhas: [{ faixa: 0, rotulo: 'referencia' as const, dy: 0 }], deslocamentos: {} }, eliminada }
    return eliminada.length > 0 ? base : { ...base, componentes, pontuacao }
  }

  it('empate dentro da tolerância: a referência vence a de pontuação um pouco maior', () => {
    const referencia = aval(0)
    const ao_lado = aval(1, { calma: 0.86, referencia: 0.9 })
    expect(ao_lado.pontuacao! - referencia.pontuacao!).toBeGreaterThan(0)
    const [v, s] = ordenarAvaliacoes([ao_lado, referencia])
    expect(v).toBe(referencia)
    expect(motivoDaVitoria(v, s)).toBe('a foto não distingue: ficou a mais perto da referência (1,00 contra 0,90)')
  })

  it('empate de tudo: o corte central; depois a ordem fixa; depois a entrada', () => {
    const central = aval(3, { calma: 0.5 })
    const lateral = aval(0, { calma: 0.775 }, 'left-middle')
    const [v, s] = ordenarAvaliacoes([lateral, central])
    expect(v).toBe(central)
    expect(motivoDaVitoria(v, s)).toBe('a foto não distingue: ficou a referência no corte central')

    const primeira = aval(2)
    const segunda = aval(5)
    expect(ordenarAvaliacoes([segunda, primeira])[0]).toBe(primeira)
    expect(motivoDaVitoria(primeira, segunda)).toBe('a foto não distingue: ficou a primeira na ordem fixa (combinação 2 contra 5)')
    const gemea = aval(2)
    expect(ordenarAvaliacoes([gemea, primeira])[0]).toBe(gemea)
  })

  it('o custo filtra contra o MÍNIMO (não em cadeia): 0,08 fica fora mesmo a 0,04 da do meio', () => {
    const zero = aval(0, { calma: 0.2 })
    const meio = aval(1, { custoDoTratamento: 0.04, calma: 0.6 })
    const longe = aval(2, { custoDoTratamento: 0.08, calma: 1 })
    const fora = aval(3, {}, 'center-middle', [{ motivo: MOTIVOS_DE_ELIMINACAO.colisao, detalhe: 'x' }])
    expect(ordenarAvaliacoes([fora, longe, zero, meio])).toEqual([meio, zero, longe, fora])
    expect(motivoDaVitoria(meio, zero)).toBe('mesmo custo de tratamento e mais calma (0,60 contra 0,20)')
    expect(motivoDaVitoria(zero, longe)).toBe('lê sem véu; a segunda pedia véu (custo 0,08)')
    expect(motivoDaVitoria(aval(4, { custoDoTratamento: 0.45 }), aval(5, { custoDoTratamento: 0.9 }))).toBe('tratamento mais leve (véu (custo 0,45), contra véu (custo 0,90))')
  })

  it('sem válidas: só as eliminadas, na ordem de entrada; sem segunda: única válida', () => {
    const e1 = aval(1, {}, 'center-middle', [{ motivo: MOTIVOS_DE_ELIMINACAO.colisao, detalhe: 'x' }])
    const e2 = aval(0, {}, 'center-middle', [{ motivo: MOTIVOS_DE_ELIMINACAO.hierarquia, detalhe: 'y' }])
    expect(ordenarAvaliacoes([e1, e2])).toEqual([e1, e2])
    const unica = aval(0)
    expect(motivoDaVitoria(unica)).toBe('única combinação válida')
    expect(motivoDaVitoria(unica, e1)).toBe('única combinação válida')
    expect(resumirAvaliacao(e1)).toEqual({ crop: 'center-middle', escolhas: e1.combinacao.escolhas, pontuacao: null, componentes: null, tratamento: [], textos: [], eliminada: e1.eliminada })
  })
})

describe('mapa de calma — cobertura numa fonte só', () => {
  /** A conta que `pontuarCandidatos` fazia em linha antes do CP2B. */
  function contaAntiga(rect: Rect, assunto: Rect | null): number {
    const inter = (a: Rect, b: Rect) =>
      Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
    const areaAssunto = assunto ? assunto.width * assunto.height : 0
    const areaBloco = rect.width * rect.height
    const i = assunto ? inter(rect, assunto) : 0
    return areaAssunto > 0 && areaBloco > 0 ? Math.max(i / areaAssunto, i / areaBloco) : 0
  }

  it('coberturaDaRegiao é a conta antiga, inclusive com área zero', () => {
    const rects: Rect[] = [
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 50, y: 50, width: 100, height: 100 },
      { x: 100, y: 0, width: 50, height: 400 },
      { x: 10, y: 10, width: 0, height: 50 },
      { x: 300, y: 300, width: 10, height: 10 },
      { x: -20, y: 20, width: 500, height: 30 },
    ]
    for (const a of rects) {
      for (const b of rects) expect(coberturaDaRegiao(a, b)).toBe(contaAntiga(a, b))
    }
  })

  it('pontuarCandidatos usa a cobertura nova sem mudar o descarte', () => {
    const r = ruido()
    const mapa = mapaDeCalma(foto((x) => (x < 540 ? 30 : 150 + r() * 100)))
    const assunto = { x: 580, y: 200, width: 400, height: 500 }
    const candidatos = [
      { rect: { x: 92, y: 200, width: 400, height: 500 }, preferencia: 0, rotulo: 'esq' },
      { rect: { x: 600, y: 200, width: 400, height: 500 }, preferencia: 1, rotulo: 'dir' },
    ]
    const p = pontuarCandidatos({ mapa, candidatos, coresDoTexto: ['#FFFFFF'], corDaMancha: '#0B0B0B', assunto })
    for (const c of p) expect(c.cobreAssunto).toBe(contaAntiga(c.rect, assunto))
    expect(p.map((c) => [c.rotulo, c.descartado])).toEqual([
      ['esq', false],
      ['dir', true],
    ])
  })

  it('o revisor lê os tetos do mapa de calma', () => {
    expect(LIMITES_DA_REVISAO.coberturaDoAssunto).toBe(TETO_DE_COBERTURA_DO_ASSUNTO)
    expect(LIMITES_DA_REVISAO.coberturaDoAssuntoEstimado).toBe(TETO_DE_COBERTURA_DO_ASSUNTO_ESTIMADO)
  })
})
