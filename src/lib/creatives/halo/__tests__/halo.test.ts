/**
 * Os números do `_halo.py`, conferidos no porte: alvo por cor (Quintal),
 * tinta zero em foto escura (TERO), compensação da geometria (marca do TERO).
 */
import { describe, expect, it } from 'vitest'

import {
  agruparEmBlocos,
  ajustarPorGeometria,
  alvoPorContraste,
  atenuacao,
  calibrarHalo,
  luzDeLeitura,
  percentil,
  tintaParaAlvo,
  uniao,
} from '../halo'

describe('alvoPorContraste', () => {
  it('reproduz os alvos medidos no Quintal e no Espeto', () => {
    expect(Math.round(alvoPorContraste('#F5F0E8'))).toBe(139)
    expect(Math.round(alvoPorContraste('#7A9A5C'))).toBe(69)
    expect(Math.round(alvoPorContraste('#FFFFFF'))).toBe(149)
    // O vermelho do Espeto: a conta diz que não dá (≤ 51).
    expect(alvoPorContraste('#F4301A')).toBeLessThan(55)
  })
})

describe('tintaParaAlvo', () => {
  it('é ZERO quando a foto já está escura o bastante', () => {
    expect(tintaParaAlvo(40, 62, 19)).toBe(0)
  })
  it('sobe com a luz e nunca passa do teto', () => {
    expect(tintaParaAlvo(120, 62, 19)).toBeCloseTo(0.574, 2)
    expect(tintaParaAlvo(250, 62, 19)).toBeCloseTo(0.814, 2)
    expect(tintaParaAlvo(255, 20, 19)).toBe(0.95)
  })
})

describe('geometria', () => {
  it('a atenuação no centro cai quando a caixa é menor que o raio', () => {
    expect(atenuacao(300, 300, 100)).toBeGreaterThan(0.99)
    expect(atenuacao(60, 40, 100)).toBeLessThan(0.3)
  })
  it('bloco baixo encolhe o raio e compensa a tinta (marca do TERO)', () => {
    const r = ajustarPorGeometria(0.8, 83, 172, 60, 62, 56)
    expect(r.raio).toBeLessThan(83)
    expect(r.tinta).toBeGreaterThan(0.8)
  })
})

describe('luz e percentil', () => {
  it('metade média, metade p75', () => {
    expect(luzDeLeitura(54, 200)).toBe(127)
  })
  it('percentil sobre histograma', () => {
    const h = new Array(256).fill(0)
    h[10] = 50
    h[200] = 50
    expect(percentil(h, 0.75)).toBe(200)
    expect(percentil(h, 0.25)).toBe(10)
  })
})

describe('calibrarHalo', () => {
  const texto = { x: 96, y: 300, width: 700, height: 260 }
  it('foto escura → sem halo', () => {
    const c = calibrarHalo({ texto, luz: { media: 30, p75: 45 }, coresDoTexto: ['#F5F0E8'], corDaMancha: '#1F1B16' })
    expect(c.tinta).toBe(0)
    expect(c.rect).toEqual(texto)
  })
  it('foto clara → mancha com margem de 1,4 × raio e a cor mais exigente no alvo', () => {
    const c = calibrarHalo({ texto, luz: { media: 180, p75: 220 }, coresDoTexto: ['#F5F0E8', '#7A9A5C'], corDaMancha: '#1F1B16' })
    expect(c.tinta).toBeGreaterThan(0.5)
    expect(Math.round(c.alvo)).toBe(69)
    expect(c.rect.x).toBeLessThan(texto.x)
    expect(c.rect.width - texto.width).toBe(2 * Math.round(1.4 * c.raio))
  })
})

describe('blocos', () => {
  it('agrupa manchete+apoio e separa o rodapé', () => {
    const itens = [
      { id: 'titulo', rect: { x: 0, y: 200, width: 500, height: 100 } },
      { id: 'apoio', rect: { x: 0, y: 320, width: 500, height: 60 } },
      { id: 'servico', rect: { x: 0, y: 1700, width: 500, height: 40 } },
    ]
    const g = agruparEmBlocos(itens)
    expect(g.map((b) => b.map((i) => i.id))).toEqual([['titulo', 'apoio'], ['servico']])
    expect(uniao(g[0].map((i) => i.rect))).toEqual({ x: 0, y: 200, width: 500, height: 180 })
  })
})
