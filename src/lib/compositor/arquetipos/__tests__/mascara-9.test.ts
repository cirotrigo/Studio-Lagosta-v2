/**
 * #9 — a máscara `arco-janela` PURA (`arquetipos/mascara.ts`): o path v1 derivado da caixa em px, o formatador canônico,
 * a segmentação ⌈θ/45°⌉, o erro radial LIDO DA STRING serializada, o golden das amostras Bv3 aceitas, o domínio, a fração
 * visível no arco contra uma integração de referência e a leitura FECHADA da receita gravada (MK-16).
 */
import { describe, expect, it } from 'vitest'
import { flechaDoArcoJanela, fracaoVisivelNoArco, lerReceitaDaMascara, pathDoArcoJanela, problemaDoArcoJanela, receitaDoArcoJanela } from '../mascara'

const STORY = { w: 1080, h: 1114 }
const FEED = { w: 1080, h: 756 }
/** Os paths das peças Bv3 aceitas (receipt ACEITE-VISUAL-OWNER.json, B raio 0,62): `bg-foto.style.mask.path` das amostras. */
const GOLDEN = {
  story: 'M0 100 L0 24.566 C 5.7585 16.952 13.286 10.7601 21.9728 6.4921 C 30.6597 2.2241 40.2613 0 50 0 C 59.7387 0 69.3403 2.2241 78.0272 6.4921 C 86.714 10.7601 94.2415 16.952 100 24.566 L100 100 Z',
  feed: 'M0 100 L0 36.1991 C 5.7585 24.9795 13.286 15.8555 21.9728 9.5664 C 30.6597 3.2773 40.2613 0 50 0 C 59.7387 0 69.3403 3.2773 78.0272 9.5664 C 86.714 15.8555 94.2415 24.9795 100 36.1991 L100 100 Z',
}

/** Lê o path de volta da STRING: o ponto inicial do arco e cada cúbica, em px da caixa. */
function cubicasDoPath(path: string, caixa: { w: number; h: number }) {
  const sx = caixa.w / 100
  const sy = caixa.h / 100
  const m = path.match(/^M0 100 L(\S+) (\S+) (.*) L100 100 Z$/)!
  let atual: [number, number] = [Number(m[1]) * sx, Number(m[2]) * sy]
  return m[3].split(/ ?C /).filter(Boolean).map((s) => {
    const n = s.trim().split(' ').map(Number)
    const c = { p0: atual, p1: [n[0] * sx, n[1] * sy], p2: [n[2] * sx, n[3] * sy], p3: [n[4] * sx, n[5] * sy] as [number, number] }
    atual = c.p3
    return c
  })
}
const bezier = (c: ReturnType<typeof cubicasDoPath>[number], t: number) => {
  const u = 1 - t
  return [0, 1].map((i) => u * u * u * c.p0[i] + 3 * u * u * t * c.p1[i] + 3 * u * t * t * c.p2[i] + t * t * t * c.p3[i])
}
const erroRadial = (path: string, caixa: { w: number; h: number }, raio: number) => {
  const r = raio * caixa.w
  let pior = 0
  for (const c of cubicasDoPath(path, caixa)) {
    for (let i = 0; i <= 64; i++) {
      const [x, y] = bezier(c, i / 64)
      pior = Math.max(pior, Math.abs(Math.hypot(x - caixa.w / 2, y - r) - r))
    }
  }
  return pior
}
const numeros = (path: string) => path.replace(/[MLCZ]/g, ' ').trim().split(/\s+/)

describe('#9 · pathDoArcoJanela (v1)', () => {
  it('IF-11 golden: Story 1080×1114 e Feed 1080×756 com raio 0,62 dão, byte a byte, os paths das Bv3 aceitas', () => {
    expect(pathDoArcoJanela(STORY, 0.62)).toBe(GOLDEN.story)
    expect(pathDoArcoJanela(FEED, 0.62)).toBe(GOLDEN.feed)
  })

  it('MK-01/MK-03: determinístico e canônico — só M L C Z, 4 casas, sem -0 nem zero à direita', () => {
    for (const caixa of [STORY, FEED]) {
      for (const raio of [0.5, 0.62, 0.7, 0.7071, 1, 1.79, 3, 50]) {
        const path = pathDoArcoJanela(caixa, raio)
        expect(pathDoArcoJanela({ ...caixa }, raio)).toBe(path)
        expect(path).toMatch(/^M0 100 L0 \S+( C( \S+){6})+ L100 100 Z$/)
        expect(path.replace(/[0-9. -]/g, '')).toMatch(/^MLC+LZ$/)
        for (const n of numeros(path)) {
          expect(n, `${n} em ${path}`).toMatch(/^(0|[1-9]\d*)(\.\d{0,3}[1-9])?$/)
          expect(n).not.toBe('-0')
        }
      }
    }
  })

  it('MK-02: ⌈θ/45°⌉ cúbicas por metade, simétrico, pico no topo (50 0), laterais verticais (x 0 e 100 até a base)', () => {
    const cubicasPorMetade = (raio: number) => Math.ceil(Math.asin(0.5 / raio) / (Math.PI / 4) - 1e-9)
    for (const [raio, n] of [[0.5, 2], [0.62, 2], [0.7, 2], [0.7072, 1], [1, 1], [1.79, 1], [3, 1]] as const) {
      expect(cubicasPorMetade(raio), `raio ${raio}`).toBe(n)
      for (const caixa of [STORY, FEED]) {
        const path = pathDoArcoJanela(caixa, raio)
        const pontos = path.match(/C ([^C]*?)(?= C| L100)/g)!.map((s) => s.slice(2).trim().split(' ').map(Number))
        expect(pontos).toHaveLength(2 * n)
        // O fim da metade esquerda é o pico.
        expect(pontos[n - 1].slice(4)).toEqual([50, 0])
        // Espelho em x = 50: cada número da metade direita é o reflexo do da esquerda (dentro do arredondamento de 4 casas).
        const inicio = path.match(/^M0 100 L0 (\S+)/)!
        const fim = pontos.at(-1)!
        expect(fim.slice(4)).toEqual([100, Number(inicio[1])])
        for (let i = 0; i < n; i++) {
          const e = pontos[i]
          const d = pontos[2 * n - 1 - i]
          const anterior = i === 0 ? [0, Number(inicio[1])] : pontos[i - 1].slice(4)
          expect(Math.abs(e[0] + d[2] - 100)).toBeLessThanOrEqual(1e-4)
          expect(Math.abs(e[1] - d[3])).toBeLessThanOrEqual(1e-4)
          expect(Math.abs(e[2] + d[0] - 100)).toBeLessThanOrEqual(1e-4)
          expect(Math.abs(anterior[0] + d[4] - 100)).toBeLessThanOrEqual(1e-4)
        }
      }
    }
  })

  it('MK-02: erro radial ≤ 0,01 px lido da STRING, raio 0,50–3,00 (passo 0,01) e 5/10/50, nas duas caixas', () => {
    let pior = { erro: 0, raio: 0, caixa: '' }
    const raios = [...Array.from({ length: 251 }, (_, i) => Number((0.5 + i * 0.01).toFixed(2))), 5, 10, 50]
    for (const [nome, caixa] of [['story', STORY], ['feed', FEED]] as const) {
      for (const raio of raios) {
        const erro = erroRadial(pathDoArcoJanela(caixa, raio), caixa, raio)
        if (erro > pior.erro) pior = { erro, raio, caixa: nome }
      }
    }
    console.info(`[MK-02] pior erro radial no path serializado: ${pior.erro.toFixed(4)} px (raio ${pior.raio}, ${pior.caixa}); ${raios.length * 2} paths`)
    expect(pior.erro).toBeLessThanOrEqual(0.01)
    expect(erroRadial(GOLDEN.story, STORY, 0.62)).toBeLessThanOrEqual(0.01)
  })

  it('MK-06: raio 0,5 (semicírculo) aceito; abaixo, não finito, caixa sem área ou flecha ≥ altura recusam antes de desenhar', () => {
    expect(pathDoArcoJanela(STORY, 0.5)).toMatch(/^M0 100 L0 48\.474 /)
    for (const raio of [0.4999, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => pathDoArcoJanela(STORY, raio), String(raio)).toThrow(RangeError)
    expect(() => pathDoArcoJanela({ w: 1080, h: 540 }, 0.5)).toThrow(/flecha/)
    expect(() => pathDoArcoJanela({ w: 1080, h: 541 }, 0.5)).not.toThrow()
    expect(() => pathDoArcoJanela({ w: 0, h: 100 }, 1)).toThrow(RangeError)
    expect(() => pathDoArcoJanela({ w: 1080, h: Number.NaN }, 1)).toThrow(RangeError)
  })
})

describe('#9 · fracaoVisivelNoArco', () => {
  /** A referência: amostragem 4×4 por px da região {topo(x) ≤ y ≤ h} dentro do retângulo. */
  function referencia(ret: { x: number; y: number; width: number; height: number }, caixa: { w: number; h: number }, raio: number) {
    const r = raio * caixa.w
    let dentro = 0
    let total = 0
    const passo = 0.25
    for (let x = ret.x + passo / 2; x < ret.x + ret.width; x += passo) {
      for (let y = ret.y + passo / 2; y < ret.y + ret.height; y += passo) {
        total++
        if (x < 0 || x > caixa.w || y < 0 || y > caixa.h) continue
        if (y >= r - Math.sqrt(Math.max(0, r * r - (x - caixa.w / 2) ** 2))) dentro++
      }
    }
    return dentro / total
  }
  const casos: Array<[string, { x: number; y: number; width: number; height: number }]> = [
    ['sob o pico', { x: 440, y: 20, width: 200, height: 160 }],
    ['sob o canto esquerdo', { x: 0, y: 0, width: 180, height: 220 }],
    ['cortado pela lateral', { x: -100, y: 400, width: 300, height: 200 }],
    ['inteiro abaixo do toque', { x: 300, y: 500, width: 400, height: 300 }],
    ['fino no canto direito', { x: 1000, y: 0, width: 80, height: 400 }],
  ]
  for (const [nome, caixa] of [['story', STORY], ['feed', FEED]] as const) {
    for (const [caso, ret] of casos) {
      it(`MK-05 ${nome} · ${caso}: a função × a referência dentro de ±0,5%`, () => {
        expect(Math.abs(fracaoVisivelNoArco(ret, caixa, 0.62) - referencia(ret, caixa, 0.62))).toBeLessThanOrEqual(0.005)
      })
    }
  }
  it('fora da caixa = 0; retângulo inteiro abaixo do toque = 1; o canto perde (< 0,75) onde o retângulo daria 1', () => {
    expect(fracaoVisivelNoArco({ x: 1100, y: 0, width: 50, height: 50 }, STORY, 0.62)).toBe(0)
    expect(fracaoVisivelNoArco({ x: 300, y: 500, width: 400, height: 300 }, STORY, 0.62)).toBeCloseTo(1, 9)
    expect(fracaoVisivelNoArco({ x: 0, y: 0, width: 180, height: 220 }, STORY, 0.62)).toBeLessThan(0.75)
    expect(() => fracaoVisivelNoArco({ x: 0, y: 0, width: 10, height: 10 }, STORY, 0.4)).toThrow(RangeError)
  })
})

describe('#9 · lerReceitaDaMascara (MK-16: coerência v1 contra o PRÓPRIO raio/caixa)', () => {
  const valida = receitaDoArcoJanela(STORY, 0.62)
  it('a receita da peça nova é lida igual', () => {
    expect(valida).toEqual({ tipo: 'arco-janela', versao: 1, raio: 0.62, caixa: STORY, path: GOLDEN.story })
    expect(lerReceitaDaMascara(JSON.parse(JSON.stringify(valida)))).toEqual(valida)
    // Ordem das chaves não importa.
    expect(lerReceitaDaMascara({ path: valida.path, caixa: { h: 1114, w: 1080 }, raio: 0.62, versao: 1, tipo: 'arco-janela' })).toEqual(valida)
  })
  const negativos: Array<[string, unknown]> = [
    ['ausente', undefined],
    ['não objeto', 'arco'],
    ['chave a mais', { ...valida, fonte: 'catalogo' }],
    ['chave a menos', { tipo: valida.tipo, versao: 1, raio: 0.62, caixa: STORY }],
    ['tipo desconhecido', { ...valida, tipo: 'circulo' }],
    ['versão 2', { ...valida, versao: 2 }],
    ['raio não finito', { ...valida, raio: null }],
    ['raio abaixo do domínio', { ...valida, raio: 0.4, path: valida.path }],
    ['caixa de outra peça', { ...valida, caixa: { w: 1080, h: 1000 } }],
    ['caixa fracionária', { ...valida, caixa: { w: 1080, h: 1114.4 } }],
    ['caixa com chave a mais', { ...valida, caixa: { ...STORY, x: 0 } }],
    ['path não texto', { ...valida, path: 42 }],
    ['raio alterado sobre o path antigo', { ...valida, raio: 0.7 }],
    ['path de outro raio', { ...valida, path: pathDoArcoJanela(STORY, 0.7) }],
    ['path válido de retângulo', { ...valida, path: 'M0 0 L100 0 L100 100 L0 100 Z' }],
    ['path válido de triângulo', { ...valida, path: 'M0 100 L50 0 L100 100 Z' }],
    ['path com espaço a mais', { ...valida, path: `${valida.path} ` }],
  ]
  for (const [nome, valor] of negativos) {
    it(`recusa: ${nome}`, () => {
      expect(lerReceitaDaMascara(valor)).toHaveProperty('problema')
    })
  }
  it('auto-coerente de OUTRO raio passa AQUI (é o reforço da definição exata, na defasagem, que a recusa — IF-09)', () => {
    expect(lerReceitaDaMascara(receitaDoArcoJanela(STORY, 0.7))).toMatchObject({ raio: 0.7 })
  })
})

describe('#9 · R1: derivação não finita ou degenerada é recusada no domínio (entradas finitas)', () => {
  /** Entradas FINITAS cuja conta não é: r = ∞ (1e308), r² = ∞ com r finito (1e200; e a caixa de 1e200 px), flecha 0 por cancelamento (1e150). */
  const EXTREMOS: Array<[string, { w: number; h: number }, number]> = [
    ['raio 1e308 (r = ∞)', STORY, 1e308],
    ['raio 1e200 (r finito, r² = ∞)', STORY, 1e200],
    ['caixa de 1e200 px com raio 0,62 (r² = ∞)', { w: 1e200, h: 1e200 }, 0.62],
    ['raio 1e150 (flecha 0: arco degenerado)', STORY, 1e150],
    ['caixa subnormal (r e w/2 viram 0)', { w: 5e-324, h: 1 }, 0.5],
  ]
  /** O path que o gerador ANTERIOR emitia para o raio 1e308 (capturado antes da correção): o leitor o aceitava como coerente. */
  const PATH_NAN_ANTERIOR = 'M0 100 LNaN NaN C NaN NaN NaN NaN NaN NaN C NaN NaN NaN NaN NaN NaN L100 100 Z'
  /** E o achatado que ele emitia para 1e200/1e150 (flecha −∞ e 0). */
  const PATH_RASO_ANTERIOR = 'M0 100 L0 0 C 16.6667 0 33.3333 0 50 0 C 66.6667 0 83.3333 0 100 0 L100 100 Z'
  for (const [nome, caixa, raio] of EXTREMOS) {
    it(`R1 ${nome}: domínio recusa, flecha nula, gerador e fração lançam`, () => {
      expect(problemaDoArcoJanela(caixa, raio)).toMatch(/não é representável/)
      expect(flechaDoArcoJanela(caixa.w, raio)).toBeNull()
      expect(() => pathDoArcoJanela(caixa, raio)).toThrow(RangeError)
      expect(() => fracaoVisivelNoArco({ x: 0, y: 0, width: 100, height: 100 }, caixa, raio)).toThrow(RangeError)
    })
  }
  it('R1 leitor: as strings que o gerador anterior emitia nesses raios não são receita coerente', () => {
    expect(lerReceitaDaMascara({ tipo: 'arco-janela', versao: 1, raio: 1e308, caixa: STORY, path: PATH_NAN_ANTERIOR })).toHaveProperty('problema')
    for (const raio of [1e200, 1e150]) expect(lerReceitaDaMascara({ tipo: 'arco-janela', versao: 1, raio, caixa: STORY, path: PATH_RASO_ANTERIOR }), String(raio)).toHaveProperty('problema')
  })
  it('R1 o domínio normal não muda: raio 50 e 0,5 seguem desenháveis, com flecha finita positiva, e o golden segue igual', () => {
    for (const raio of [0.5, 0.62, 3, 50]) expect([raio, problemaDoArcoJanela(STORY, raio)]).toEqual([raio, null])
    expect(flechaDoArcoJanela(1080, 50)).toBeCloseTo(2.7, 3)
    expect(pathDoArcoJanela(STORY, 0.62)).toBe(GOLDEN.story)
    expect(pathDoArcoJanela(FEED, 0.62)).toBe(GOLDEN.feed)
  })
})
