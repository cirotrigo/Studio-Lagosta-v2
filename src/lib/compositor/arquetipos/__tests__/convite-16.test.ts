/**
 * #16 `minimal-tipografico-convite`, no módulo puro: o contrato (validador, com os negativos de `presoA` e do
 * `superior-centro`), a logo FIXA centrada (materialização e caixa da variante do CP3), as CANTONEIRAS presas à peça
 * (pousam na caixa declarada; ocupam só os quatro braços; braço tocado recusa a obrigatória, miolo livre), a receita sem
 * `presoA` que congela e relê só nesse tipo, a ocupação pelo PATH CONGELADO da receita e as três faixas sem busca.
 */
import { describe, expect, it } from 'vitest'
import { SHAPES_LIBRARY } from '@/lib/assets/shapes-library'
import { NUMEROS_PADRAO } from '../../assinatura'
import { caixaDaVariante } from '../../logo-da-peca'
import { verArquetipo } from '../catalogo'
import { camadaDoAcento, lerAcentosGravados, ocupacaoDoAcento, posicionarAcentos, receitasDoArquetipo, type ReceitaDoAcento } from '../acentos'
import { candidatosDasFaixas, combinacoesDasFaixas, faixasDoArquetipo } from '../candidatos-espaciais'
import { materializarArquetipo, type RetanguloPx } from '../materializar'
import { vitrineDeArquetipos } from '../na-spec'
import { validarArquetipo } from '../validar'
import type { ArquetipoDeLayout, FormatoDoArquetipo } from '../tipos'

const CONVITE = verArquetipo('minimal-tipografico-convite', 1)!
const CANVAS = { story: { width: 1080, height: 1920 }, feed: { width: 1080, height: 1350 } } as const
const copia = (): any => JSON.parse(JSON.stringify(CONVITE))
const codigos = (a: unknown) => validarArquetipo(a as ArquetipoDeLayout).map((p) => `${p.codigo} ${p.campo}`)
const toca = (a: RetanguloPx, b: RetanguloPx) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
const emPx = (f: FormatoDoArquetipo, c: { x: number; y: number; w: number; h: number }): RetanguloPx => ({ x: c.x * CANVAS[f].width, y: c.y * CANVAS[f].height, width: c.w * CANVAS[f].width, height: c.h * CANVAS[f].height })
const ref = (f: FormatoDoArquetipo, papel: string): RetanguloPx => emPx(f, (CONVITE.formatos[f].papeis as any)[papel].referencia)
const receitaDas = (a = CONVITE) => receitasDoArquetipo(a).receitas.find((r) => r.elemento === 'cantoneiras')!
const posicionar = (f: FormatoDoArquetipo, obstaculos: Array<{ id: string; rect: RetanguloPx }>, a: ArquetipoDeLayout = CONVITE, receitas = receitasDoArquetipo(a).receitas) =>
  posicionarAcentos({ arquetipo: a, formato: f, canvas: CANVAS[f], geometria: NUMEROS_PADRAO.geometria[f], receitas: receitas.filter((r) => r.elemento === 'cantoneiras'), papeis: {}, obstaculos })

describe('#16 · contrato', () => {
  it('o validador aceita o convite; Story e Feed são definições próprias; sem foto e sem foto ideal', () => {
    expect(validarArquetipo(CONVITE)).toEqual([])
    expect(CONVITE.formatos.story).not.toEqual(CONVITE.formatos.feed)
    expect([CONVITE.fundo, CONVITE.fotoIdeal, CONVITE.preferencias]).toEqual(['liso-claro', undefined, { ancora: 'meio', alinha: 'centro', cantoDaMarca: 'superior-centro' }])
  })

  it('recusa: cantoneira com presoA; fio sem presoA ou preso à logo; superior-centro fora do eixo, embaixo ou com logo automática', () => {
    const comPresoA = copia()
    comPresoA.elementos[0].presoA = 'headline'
    expect(codigos(comPresoA)).toEqual(['CAMPO_INVALIDO elementos[0].presoA'])
    const fioSolto = copia()
    delete fioSolto.elementos[1].presoA
    expect(codigos(fioSolto)).toEqual(['CAMPO_INVALIDO elementos[1].presoA'])
    const fioNaLogo = copia()
    fioNaLogo.elementos[1].presoA = 'logo'
    expect(codigos(fioNaLogo)).toEqual(['CAMPO_INVALIDO elementos[1].presoA'])
    const foraDoEixo = copia()
    foraDoEixo.formatos.story.papeis.logo = { referencia: { x: 0.45, y: 0.13, w: 0.18, h: 0.04 }, zona: { xMin: 0.3, xMax: 0.7, yMin: 0.098, yMax: 0.2 } }
    expect(codigos(foraDoEixo)).toEqual(['PREFERENCIA_INCOERENTE formatos.story.papeis.logo.zona'])
    const zonaTorta = copia()
    zonaTorta.formatos.feed.papeis.logo.zona.xMax = 0.75
    expect(codigos(zonaTorta)).toEqual(['PREFERENCIA_INCOERENTE formatos.feed.papeis.logo.zona'])
    const embaixo = copia()
    embaixo.formatos.story.papeis.logo = { referencia: { x: 0.41, y: 0.9, w: 0.18, h: 0.03 }, zona: { xMin: 0.3, xMax: 0.7, yMin: 0.86, yMax: 0.94 } }
    expect(codigos(embaixo)).toContain('PREFERENCIA_INCOERENTE formatos.story.papeis.logo.zona')
    const automatica = copia()
    automatica.fundo = undefined
    automatica.formatos.story.papeis.logo = { automatica: 'canto-mais-calmo' }
    expect(codigos(automatica)).toContain('PREFERENCIA_INCOERENTE formatos.story.papeis.logo')
    const cantoDesconhecido = copia()
    cantoDesconhecido.preferencias.cantoDaMarca = 'inferior-centro'
    expect(codigos(cantoDesconhecido)).toContain('CAMPO_INVALIDO preferencias.cantoDaMarca')
  })

  it('três faixas por formato ({logo} · conjunto central · {cta}), uma partida cada, sem busca', () => {
    for (const f of ['story', 'feed'] as const) {
      expect(faixasDoArquetipo(CONVITE, f)).toEqual([['logo'], ['pre', 'headline', 'apoio', 'servico'], ['cta']])
      const { width: W, height: H } = CANVAS[f]
      const papeis = Object.fromEntries(
        ['logo', 'pre', 'headline', 'apoio', 'servico', 'cta'].map((p) => {
          const z = (CONVITE.formatos[f].papeis as any)[p].zona
          return [p, { posicao: ref(f, p), zonaEfetiva: { x: z.xMin * W, y: z.yMin * H, width: (z.xMax - z.xMin) * W, height: (z.yMax - z.yMin) * H } }]
        }),
      )
      const faixas = candidatosDasFaixas({ arquetipo: CONVITE, formato: f, papeis: papeis as never, ornamentos: {} })
      expect(faixas.map((x) => x.candidatos)).toEqual([[{ rotulo: 'referencia', dy: 0 }], [{ rotulo: 'referencia', dy: 0 }], [{ rotulo: 'referencia', dy: 0 }]])
      expect(combinacoesDasFaixas(faixas)).toHaveLength(1)
    }
  })
})

describe('#16 · logo fixa centrada', () => {
  it('materialização: contain na referência, centrada na largura e na altura (nunca rente a um lado)', () => {
    for (const f of ['story', 'feed'] as const) {
      for (const razao of [0.5, 1, 0.2]) {
        const m = materializarArquetipo({ arquetipo: CONVITE, formato: f, canvas: CANVAS[f], geometria: NUMEROS_PADRAO.geometria[f], medidas: {}, logo: { razao } })
        expect(m.ok).toBe(true)
        const p = (m as any).papeis.logo.posicao as RetanguloPx
        expect(Math.abs(p.x + p.width / 2 - CANVAS[f].width / 2), `${f} ${razao}`).toBeLessThanOrEqual(0.5)
        const r = ref(f, 'logo')
        expect(p.width <= r.width + 0.5 && p.height <= r.height + 0.5).toBe(true)
      }
    }
  })

  it('CP3: a caixa de outra variante (outra proporção) também centra no superior-centro; os cantos não mudaram', () => {
    const caixa = { x: 443, y: 250, width: 194, height: 77 }
    expect(caixaDaVariante(caixa, 1, 'superior-centro')).toEqual({ x: 502, y: 250, width: 77, height: 77 })
    expect(caixaDaVariante(caixa, 0.2, 'superior-centro')).toEqual({ x: 443, y: 269, width: 194, height: 39 })
    expect(caixaDaVariante(caixa, 1, 'superior-direito')).toEqual({ x: 560, y: 250, width: 77, height: 77 })
    expect(caixaDaVariante(caixa, 1, 'superior-esquerdo')).toEqual({ x: 443, y: 250, width: 77, height: 77 })
  })
})

describe('#16 · cantoneiras presas à peça', () => {
  it('a receita do catálogo NÃO tem presoA; a vitrine diz ancoradoA peca; o fio continua preso ao apoio', () => {
    const r = receitaDas()
    expect('presoA' in r).toBe(false)
    expect([r.tipo, r.corPorPapel, r.canal, r.desenho.pathData]).toEqual(['cantoneiras', 'destaque', 'contorno', SHAPES_LIBRARY.find((a) => a.id === 'cantoneiras')!.pathData])
    expect(receitasDoArquetipo(CONVITE).semReceita).toEqual([])
    const vitrine = vitrineDeArquetipos().find((a) => a.id === CONVITE.id)!
    expect([vitrine.disponibilidade, vitrine.fundo]).toEqual(['disponivel', 'liso-claro'])
    expect(vitrine.elementos).toEqual([
      { id: 'cantoneiras', tipo: 'cantoneiras', opcional: false, corPorPapel: 'destaque', ancoradoA: 'peca' },
      { id: 'fio', tipo: 'fio-fino', opcional: false, corPorPapel: 'texto', presoA: 'apoio' },
    ])
  })

  for (const f of ['story', 'feed'] as const) {
    it(`${f}: pousa na caixa declarada; ocupa 4 braços; texto e logo no miolo não colidem; texto no braço recusa`, () => {
      const c = CONVITE.formatos[f].elementos!.cantoneiras
      const esperado = { x: Math.round(c.x * 1080), y: Math.round(c.y * CANVAS[f].height), width: Math.round(c.w * 1080), height: Math.round(c.h * CANVAS[f].height) }
      const miolo = ['logo', 'pre', 'headline', 'apoio', 'servico', 'cta'].map((p) => ({ id: p, rect: ref(f, p) }))
      const livre = posicionar(f, miolo)
      expect([livre.recusas, livre.omitidos]).toEqual([[], []])
      expect(livre.acentos.map((a) => a.rect)).toEqual([esperado])
      const bracos = ocupacaoDoAcento(livre.acentos[0].receita, esperado)
      expect(bracos).toHaveLength(4)
      // Cada braço é o L do canto: 25% da caixa em cada eixo, mais meio traço (1 px) de folga.
      expect(bracos[0]).toEqual({ x: esperado.x - 1, y: esperado.y - 1, width: esperado.width * 0.25 + 2, height: esperado.height * 0.25 + 2 })
      for (const o of miolo) for (const b of bracos) expect(toca(o.rect, b), `${o.id}`).toBe(false)
      // O retângulo inteiro conteria tudo: é a ocupação que deixa o miolo livre.
      for (const o of miolo) expect(toca(o.rect, esperado)).toBe(true)
      // Um texto empurrado para dentro de um braço (o de baixo à direita): a obrigatória recusa, nunca empurra.
      const noBraco = { id: 'servico', rect: { x: esperado.x + esperado.width - 60, y: esperado.y + esperado.height - 60, width: 40, height: 30 } }
      const tocada = posicionar(f, [...miolo, noBraco])
      expect([tocada.acentos.length, tocada.recusas.map((p) => [p.elemento, p.opcional])]).toEqual([0, [['cantoneiras', false]]])
      expect(tocada.recusas[0].motivo).toMatch(/um braço do acento .* encosta em servico/)
      // Opcional (definição de teste): o mesmo toque OMITE, dito.
      const opcional = copia()
      opcional.elementos[0].opcional = true
      const omitida = posicionar(f, [...miolo, noBraco], opcional)
      expect([omitida.acentos.length, omitida.omitidos.map((p) => p.elemento), omitida.recusas]).toEqual([0, ['cantoneiras'], []])
    })
  }

  it('fora da área segura do projeto (piso maior que a caixa): a obrigatória recusa', () => {
    const geometria = { ...NUMEROS_PADRAO.geometria.story, safeTopo: 260 }
    const pos = posicionarAcentos({ arquetipo: CONVITE, formato: 'story', canvas: CANVAS.story, geometria, receitas: [receitaDas()], papeis: {}, obstaculos: [] })
    expect(pos.recusas.map((p) => [p.elemento, p.motivo.includes('área segura')])).toEqual([['cantoneiras', true]])
  })

  it('a camada: svg-path do asset, cor no traço, metadata com ancoradoA peca e sem presoA', () => {
    const [a] = posicionar('story', []).acentos
    const l = camadaDoAcento(a, { hex: '#B08D57', fonte: 'destaque-da-manchete (cantoneiras)' }, 'minimal-tipografico-convite@1')
    expect([l.id, l.name, l.type, (l.style as any).shapeType, (l.style as any).pathData]).toEqual(['acento-cantoneiras', 'Acento · Cantoneiras', 'shape', 'svg-path', a.receita.desenho.pathData])
    expect((l.style as any).strokeColor).toBe('rgba(176, 141, 87, 1)')
    expect((l.metadata as any).compositor.acento).toEqual({ elemento: 'cantoneiras', tipo: 'cantoneiras', ancoradoA: 'peca', corPorPapel: 'destaque', fonteDaCor: 'destaque-da-manchete (cantoneiras)', arquetipo: 'minimal-tipografico-convite@1' })
  })
})

describe('#16 · receita congelada', () => {
  const gravada = (extra: Record<string, unknown> = {}) => ({ ...receitaDas(), cor: '#B08D57', fonteDaCor: 'destaque-da-manchete (cantoneiras)', ...extra })

  it('a receita sem presoA congela e relê só nas cantoneiras; com presoA, ou o fio sem ele, é ilegível', () => {
    const lida = lerAcentosGravados([gravada()])
    expect(lida).toEqual([gravada()])
    expect('presoA' in (lida as ReceitaDoAcento[])[0]).toBe(false)
    expect(lerAcentosGravados([gravada({ presoA: 'headline' })])).toEqual({ problema: 'acentos[0]: presoA headline' })
    const fio = receitasDoArquetipo(CONVITE).receitas.find((r) => r.elemento === 'fio')!
    const { presoA: _p, ...fioSemPresoA } = fio
    expect(lerAcentosGravados([{ ...fioSemPresoA, cor: '#1F1F1F', fonteDaCor: 'texto-do-papel' }])).toEqual({ problema: 'acentos[0]: presoA undefined' })
    // A peça de antes (sem o campo) continua sem acento.
    expect(lerAcentosGravados(undefined)).toEqual([])
  })

  it('a ocupação sai do PATH DA RECEITA: o catálogo vivo alterado não muda a ocupação nem o desenho da receita gravada', () => {
    const rect = { x: 92, y: 192, width: 896, height: 1498 }
    const congelada = lerAcentosGravados([gravada()]) as ReceitaDoAcento[]
    const asset = SHAPES_LIBRARY.find((a) => a.id === 'cantoneiras')!
    const original = asset.pathData
    const antes = ocupacaoDoAcento(congelada[0], rect)
    try {
      asset.pathData = 'M0 25 L0 0 L25 0'
      // O catálogo de hoje mudou: uma receita NOVA o segue (1 braço) — a gravada, não (4 braços, o mesmo desenho).
      expect(ocupacaoDoAcento(receitaDas(), rect)).toHaveLength(1)
      expect(ocupacaoDoAcento(congelada[0], rect)).toEqual(antes)
      expect(congelada[0].desenho.pathData).toBe(original)
      const pos = posicionarAcentos({ arquetipo: CONVITE, formato: 'story', canvas: CANVAS.story, geometria: NUMEROS_PADRAO.geometria.story, receitas: congelada, papeis: {}, obstaculos: [] })
      expect(pos.acentos[0].receita.desenho.pathData).toBe(original)
    } finally {
      asset.pathData = original
    }
    expect(antes).toHaveLength(4)
  })

  it('os acentos presos a texto continuam ocupando o retângulo inteiro (a regra de antes)', () => {
    const fio = receitasDoArquetipo(CONVITE).receitas.find((r) => r.elemento === 'fio')!
    const rect = { x: 10, y: 20, width: 300, height: 4 }
    expect(ocupacaoDoAcento(fio, rect)).toEqual([rect])
    const spark = receitasDoArquetipo(verArquetipo('minimal-fb-centro-optico')!).receitas[0]
    expect(ocupacaoDoAcento(spark, rect)).toEqual([rect])
  })
})
