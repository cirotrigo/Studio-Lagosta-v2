/**
 * #16 `minimal-tipografico-convite@2` (C2 + margens, 24/10/2026), no módulo puro: a derivação do path das cantoneiras com
 * braço IGUAL (130 px nos dois eixos, Story e Feed), a ocupação dos quatro Ls, as zonas fora deles, o `@1` intacto, o
 * contrato do `braco`, a leitura da `derivacao` gravada, a GUARDA do desenho congelado (o path, não só a flag) e as três
 * faixas sem foto (zona do serviço do Story em .61).
 */
import { describe, expect, it } from 'vitest'
import { SHAPES_LIBRARY } from '@/lib/assets/shapes-library'
import { NUMEROS_PADRAO } from '../../assinatura'
import { listarArquetipos, verArquetipo } from '../catalogo'
import { caixaDaPecaEmPx, lerAcentosGravados, ocupacaoDoAcento, pathDasCantoneiras, posicionarAcentos, receitasDoArquetipo, type ReceitaDoAcento } from '../acentos'
import { LIMITES_DA_BUSCA } from '../busca-espacial-tipos'
import { faixasDoArquetipo } from '../candidatos-espaciais'
import { impressaoDoArquetipo } from '../impressao'
import type { RetanguloPx } from '../materializar'
import { validarArquetipo, validarCatalogo } from '../validar'
import type { ArquetipoDeLayout, FormatoDoArquetipo } from '../tipos'

const ID = 'minimal-tipografico-convite'
const V1 = verArquetipo(ID, 1)!
const V2 = verArquetipo(ID, 2)!
const CANVAS = { story: { width: 1080, height: 1920 }, feed: { width: 1080, height: 1350 } } as const
const ASSET = SHAPES_LIBRARY.find((a) => a.id === 'cantoneiras')!.pathData!
const PATH = {
  story: 'M0 8.6782 L0 0 L14.5089 0 M85.4911 0 L100 0 L100 8.6782 M100 91.3218 L100 100 L85.4911 100 M14.5089 100 L0 100 L0 91.3218',
  feed: 'M0 11.5968 L0 0 L14.5089 0 M85.4911 0 L100 0 L100 11.5968 M100 88.4032 L100 100 L85.4911 100 M14.5089 100 L0 100 L0 88.4032',
}
const FORMATOS = ['story', 'feed'] as const
const toca = (a: RetanguloPx, b: RetanguloPx) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
const caixa = (a: ArquetipoDeLayout, f: FormatoDoArquetipo) => caixaDaPecaEmPx(a.formatos[f].elementos!.cantoneiras, CANVAS[f])
const receita = (a: ArquetipoDeLayout, f?: FormatoDoArquetipo): ReceitaDoAcento =>
  receitasDoArquetipo(a, f ? { formato: f, canvas: CANVAS[f] } : undefined).receitas.find((r) => r.elemento === 'cantoneiras')!
const posicionar = (a: ArquetipoDeLayout, f: FormatoDoArquetipo, r: ReceitaDoAcento) =>
  posicionarAcentos({ arquetipo: a, formato: f, canvas: CANVAS[f], geometria: NUMEROS_PADRAO.geometria[f], receitas: [r], papeis: {}, obstaculos: [] })
const comPath = (r: ReceitaDoAcento, pathData: string): ReceitaDoAcento => ({ ...r, desenho: { ...r.desenho, pathData } })

/** Os braços de cada L em px, lidos do path por conta PRÓPRIA (regex), no retângulo dado: [H, V] por subpath. */
function bracosEmPx(path: string, rect: RetanguloPx): Array<[number, number]> {
  return path
    .split('M')
    .filter(Boolean)
    .map((s) => {
      const pts = s.replace(/L/g, ' ').trim().split(/\s+/).map(Number)
      const p = [0, 2, 4].map((i) => [rect.x + (pts[i] / 100) * rect.width, rect.y + (pts[i + 1] / 100) * rect.height])
      const c = p[1]
      const outros = [p[0], p[2]]
      const h = outros.find((o) => Math.abs(o[1] - c[1]) < 0.01)!
      const v = outros.find((o) => o !== h)!
      return [Math.abs(h[0] - c[0]), Math.abs(v[1] - c[1])] as [number, number]
    })
}

describe('#16@2 · derivação do desenho', () => {
  it('P-1: a derivação com 25/25 reproduz o asset cantoneiras@1 byte a byte', () => {
    expect(pathDasCantoneiras(25, 25)).toBe(ASSET)
  })

  for (const f of FORMATOS) {
    it(`P-2/P-3 ${f}: o path congelado é o literal; os 4 Ls têm braço H = V = 130 ± 0,5 px; derivação 130`, () => {
      const r = receita(V2, f)
      expect(r.desenho.pathData).toBe(PATH[f])
      // 30/10/2026: a derivação grava a CAIXA em que o path vale (sem geometria no `onde`, a do catálogo: 896 × 1498 / 1121).
      expect(r.derivacao).toEqual({ regra: 'bracos-iguais', bracoPx: 130, caixa: f === 'story' ? { width: 896, height: 1498 } : { width: 896, height: 1121 } })
      expect([r.asset, r.desenho.strokeWidth, r.desenho.shapeType]).toEqual([{ id: 'cantoneiras', versao: 1 }, 2, 'svg-path'])
      const bracos = bracosEmPx(r.desenho.pathData!, caixa(V2, f))
      expect(bracos).toHaveLength(4)
      for (const [h, v] of bracos) {
        expect(Math.abs(h - 130)).toBeLessThanOrEqual(0.5)
        expect(Math.abs(v - 130)).toBeLessThanOrEqual(0.5)
        expect(Math.abs(h - v)).toBeLessThanOrEqual(0.5)
      }
    })
  }

  it('P-4: a ocupação do @2 são 4 caixas 132 × 132 nos cantos da moldura', () => {
    const esperado = {
      story: [[91, 191], [857, 191], [857, 1559], [91, 1559]],
      feed: [[91, 121], [857, 121], [857, 1112], [91, 1112]],
    }
    for (const f of FORMATOS) {
      const o = ocupacaoDoAcento(receita(V2, f), caixa(V2, f))
      expect(o.map((c) => [c.x, c.y, c.width, c.height].map((v) => Math.round(v * 100) / 100))).toEqual(esperado[f].map(([x, y]) => [x, y, 132, 132]))
    }
    // A caixa da moldura é a do @1: x 92–988; y 192–1690 (Story) e 122–1243 (Feed).
    expect([caixa(V2, 'story'), caixa(V2, 'feed')]).toEqual([{ x: 92, y: 192, width: 896, height: 1498 }, { x: 92, y: 122, width: 896, height: 1121 }])
    expect([caixa(V2, 'story'), caixa(V2, 'feed')]).toEqual([caixa(V1, 'story'), caixa(V1, 'feed')])
  })

  it('P-5: toda zona de papel do @2 (recortada pelo HARD) fica fora da ocupação; no @1 o pré, o serviço e o cta tocam', () => {
    const tocados = (a: ArquetipoDeLayout, f: FormatoDoArquetipo) => {
      const { width: W, height: H } = CANVAS[f]
      const g = NUMEROS_PADRAO.geometria[f]
      const ocupa = ocupacaoDoAcento(receita(a, f), caixa(a, f))
      return Object.entries(a.formatos[f].papeis).filter(([, p]) => {
        const z = (p as { zona: { xMin: number; xMax: number; yMin: number; yMax: number } }).zona
        const x0 = Math.max(z.xMin * W, g.margemH)
        const x1 = Math.min(z.xMax * W, W - g.margemH)
        const y0 = Math.max(z.yMin * H, g.safeTopo)
        const y1 = Math.min(z.yMax * H, H - g.safeRodape)
        return ocupa.some((o) => toca(o, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }))
      }).map(([papel]) => papel)
    }
    for (const f of FORMATOS) {
      expect(tocados(V2, f), f).toEqual([])
      expect(tocados(V1, f).sort(), `controle @1 ${f}`).toEqual(['cta', 'pre', 'servico'])
    }
  })

  it('P-6: @1 intacto — impressão, receita sem derivação com o path do asset (mesmo com contexto), ocupação 226 × 376,5', () => {
    expect(impressaoDoArquetipo(V1)).toBe('arq1-1cdd408f7eeb8d')
    for (const r of [receita(V1), receita(V1, 'story'), receita(V1, 'feed')]) {
      expect(r.derivacao).toBeUndefined()
      expect(r.desenho.pathData).toBe(ASSET)
    }
    const o = ocupacaoDoAcento(receita(V1, 'story'), caixa(V1, 'story'))
    expect(o.map((c) => [c.width, c.height])).toEqual(Array(4).fill([226, 376.5]))
  })
})

describe('#16@2 · contrato do braço', () => {
  it('P-7: o validador aceita o catálogo inteiro com o @2', () => {
    expect(validarCatalogo(listarArquetipos())).toEqual([])
    expect(validarArquetipo(V2)).toEqual([])
  })

  it('P-8: braco em fio-fino, 0, −0,1 e 0,5 → CAMPO_INVALIDO em elementos[i].braco', () => {
    const casos: Array<[number, number]> = [[1, 0.12], [0, 0], [0, -0.1], [0, 0.5]]
    for (const [i, braco] of casos) {
      const a: any = JSON.parse(JSON.stringify(V2))
      a.elementos[i].braco = braco
      const p = validarArquetipo(a)
      expect(p.length, `${i} ${braco}`).toBeGreaterThan(0)
      expect(p.every((x) => x.codigo === 'CAMPO_INVALIDO' && x.campo === `elementos[${i}].braco`), `${i} ${braco}: ${JSON.stringify(p)}`).toBe(true)
    }
  })
})

describe('#16@2 · leitura da receita gravada', () => {
  const gravado = (derivacao?: unknown) => [{ ...receita(V2, 'story'), cor: '#B08D57', fonteDaCor: 'destaque-da-manchete (cantoneiras)', ...(derivacao !== undefined ? { derivacao } : { derivacao: undefined }) }]

  it('P-9: derivação ausente ou válida → lida; regra "x", bracoPx 1,5 ou 0 (e campo a mais) → problema', () => {
    const ok = lerAcentosGravados(gravado({ regra: 'bracos-iguais', bracoPx: 130 }))
    expect('problema' in ok).toBe(false)
    expect((ok as any)[0].derivacao).toEqual({ regra: 'bracos-iguais', bracoPx: 130 })
    const semDerivacao = lerAcentosGravados(JSON.parse(JSON.stringify(gravado())))
    expect('problema' in semDerivacao).toBe(false)
    expect((semDerivacao as any)[0].derivacao).toBeUndefined()
    for (const ruim of [{ regra: 'x', bracoPx: 130 }, { regra: 'bracos-iguais', bracoPx: 1.5 }, { regra: 'bracos-iguais', bracoPx: 0 }, { regra: 'bracos-iguais', bracoPx: 1081 }, { regra: 'bracos-iguais', bracoPx: 130, extra: 1 }, 'bracos-iguais']) {
      expect(lerAcentosGravados(gravado(ruim)), JSON.stringify(ruim)).toEqual({ problema: 'acentos[0]: derivação do desenho ilegível' })
    }
  })
})

describe('#16@2 · guarda do desenho congelado (posicionarAcentos)', () => {
  it('controle: os paths de P-2 e P-3 passam e pousam na caixa', () => {
    for (const f of FORMATOS) {
      const p = posicionar(V2, f, receita(V2, f))
      expect([p.recusas, p.omitidos]).toEqual([[], []])
      expect(p.acentos.map((a) => [a.rect, a.receita.desenho.pathData])).toEqual([[caixa(V2, f), PATH[f]]])
    }
  })

  it('P-10: sem derivação, ou com bracoPx 131 → recusa (ARQUETIPO_ELEMENTO_NAO_CABE no compor), nada desenhado', () => {
    const { derivacao: _d, ...sem } = receita(V2, 'story')
    for (const r of [sem, { ...receita(V2, 'story'), derivacao: { regra: 'bracos-iguais' as const, bracoPx: 131 } }]) {
      const p = posicionar(V2, 'story', r)
      expect(p.acentos).toEqual([])
      expect(p.recusas).toHaveLength(1)
      expect(p.recusas[0].motivo).toMatch(/derivação/)
    }
  })

  it('P-11: derivação 130 com o path C1 do asset → recusa pelo braço 224 × 374,5', () => {
    const p = posicionar(V2, 'story', comPath(receita(V2, 'story'), ASSET))
    expect(p.acentos).toEqual([])
    expect(p.recusas[0].motivo).toMatch(/braço 224 × 374,5 px, não 130 × 130/)
  })

  it('P-12: um L com braço H 130 e V 140 → recusa nomeando o canto', () => {
    const vy140 = Number(((140 / 1498) * 100).toFixed(4))
    const p = posicionar(V2, 'story', comPath(receita(V2, 'story'), PATH.story.replace('M0 8.6782 L0 0', `M0 ${vy140} L0 0`)))
    expect(p.acentos).toEqual([])
    expect(p.recusas[0].motivo).toMatch(/canto superior-esquerdo tem braço 130 × 140/)
  })

  it('P-13: canto deslocado (L de cima à direita em x 850), 3 subpaths e subpath de 4 pontos → cada um recusa', () => {
    const u = (850 - 92) / 896 * 100
    const deslocado = PATH.story.replace('M85.4911 0 L100 0 L100 8.6782', `M${(u - 14.5089).toFixed(4)} 0 L${u.toFixed(4)} 0 L${u.toFixed(4)} 8.6782`)
    const tres = PATH.story.slice(0, PATH.story.lastIndexOf(' M'))
    const quatroPontos = PATH.story.replace('L14.5089 0 M', 'L14.5089 0 L20 0 M')
    const motivos = [deslocado, tres, quatroPontos].map((path) => {
      const p = posicionar(V2, 'story', comPath(receita(V2, 'story'), path))
      expect(p.acentos).toEqual([])
      return p.recusas[0].motivo
    })
    expect(motivos[0]).toMatch(/o L 2 não dobra num canto da moldura \(dobra em 850,192\)/)
    expect(motivos[1]).toMatch(/3 subpaths, não os 4 Ls/)
    expect(motivos[2]).toMatch(/o L 1 do path congelado tem 4 pontos, não 3/)
  })

  it('P-14: C1 legado no @1 aceito (desenho e cor iguais); derivação num @1 recusa; receita do @2 SEM contexto recusa', () => {
    const lidos = lerAcentosGravados(JSON.parse(JSON.stringify([{ ...receita(V1, 'story'), cor: '#B08D57', fonteDaCor: 'destaque-da-manchete (cantoneiras)' }])))
    if ('problema' in lidos) throw new Error(lidos.problema)
    const legado = posicionar(V1, 'story', lidos[0])
    expect(legado.recusas).toEqual([])
    expect(legado.acentos[0].receita).toEqual(lidos[0])
    expect([(legado.acentos[0].receita as any).cor, legado.acentos[0].receita.desenho.pathData]).toEqual(['#B08D57', ASSET])

    const adulterado = posicionar(V1, 'story', { ...receita(V1, 'story'), derivacao: { regra: 'bracos-iguais', bracoPx: 130 } })
    expect(adulterado.acentos).toEqual([])
    expect(adulterado.recusas[0].motivo).toMatch(/o elemento não declara braço/)

    const semContexto = receita(V2)
    expect([semContexto.derivacao, semContexto.desenho.pathData]).toEqual([undefined, ASSET])
    for (const f of FORMATOS) {
      const p = posicionar(V2, f, semContexto)
      expect(p.acentos, f).toEqual([])
      expect(p.recusas[0].motivo).toMatch(/não há desenho de reserva/)
    }
  })
})

describe('#16@2 · faixas sem foto', () => {
  it('F-1: 3 faixas no Story e no Feed; controle — serviço do Story em .62 dá 4; o teto continua 3', () => {
    for (const f of FORMATOS) expect(faixasDoArquetipo(V2, f), f).toEqual([['logo'], ['pre', 'headline', 'apoio', 'servico'], ['cta']])
    const controle: any = JSON.parse(JSON.stringify(V2))
    controle.formatos.story.papeis.servico.zona.yMin = 0.62
    expect(faixasDoArquetipo(controle, 'story')).toEqual([['logo'], ['pre', 'headline', 'apoio'], ['servico'], ['cta']])
    expect(LIMITES_DA_BUSCA.faixasSemFoto).toBe(3)
  })
})
