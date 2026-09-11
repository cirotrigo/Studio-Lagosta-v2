import { describe, expect, it } from 'vitest'
import { GRADIENTS_LIBRARY, GRADIENTES_POR_PROJETO, gradientesDoProjeto } from '../gradients-library'

describe('gradientes da marca', () => {
  it('a Real vê os quatro gradientes dela; projeto sem marca cadastrada não vê nenhum', () => {
    expect(gradientesDoProjeto(1).daMarca.map((g) => g.id)).toEqual([
      'real-verde-rodape',
      'real-verde-topo',
      'real-creme-rodape',
      'real-creme-topo',
    ])
    expect(gradientesDoProjeto(999).daMarca).toEqual([])
    expect(gradientesDoProjeto(null).daMarca).toEqual([])
    expect(gradientesDoProjeto(undefined).gerais).toBe(GRADIENTS_LIBRARY)
  })

  it('cada restaurante tem o escuro e o claro da marca, no rodapé e no topo', () => {
    expect(gradientesDoProjeto(6).daMarca.map((g) => [g.id, g.label, g.gradientStops[0].color])).toEqual([
      ['espeto-escuro-rodape', 'Escuro (rodapé)', '#170E09'],
      ['espeto-escuro-topo', 'Escuro (topo)', '#170E09'],
      ['espeto-branco-rodape', 'Branco (rodapé)', '#FFFFFF'],
      ['espeto-branco-topo', 'Branco (topo)', '#FFFFFF'],
    ])
    expect(gradientesDoProjeto(11).daMarca.map((g) => g.id)).toEqual([
      'wine-vix-escuro-rodape',
      'wine-vix-escuro-topo',
      'wine-vix-off-white-rodape',
      'wine-vix-off-white-topo',
    ])
    for (const projeto of [2, 3, 4, 5, 6, 7, 8, 11, 12]) expect(gradientesDoProjeto(projeto).daMarca).toHaveLength(4)
    const ids = Object.values(GRADIENTES_POR_PROJETO).flat().map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('toda parada de um gradiente de marca tem a mesma cor — nunca a ponta preta que acinzenta o meio', () => {
    for (const lista of Object.values(GRADIENTES_POR_PROJETO)) {
      for (const g of lista) {
        expect(new Set(g.gradientStops.map((s) => s.color)).size).toBe(1)
        const posicoes = g.gradientStops.map((s) => s.position)
        expect(posicoes).toEqual([...posicoes].sort((a, b) => a - b))
        expect(g.gradientStops[0].opacity).toBe(1)
        expect(g.gradientStops[g.gradientStops.length - 1].opacity).toBe(0)
      }
    }
  })

  it('o topo é o espelho vertical do rodapé, com a curva da Real em toda marca', () => {
    const curvaDaReal = gradientesDoProjeto(1).daMarca[0].gradientStops.map((s) => [s.position, s.opacity])
    for (const lista of Object.values(GRADIENTES_POR_PROJETO)) {
      for (let i = 0; i < lista.length; i += 2) {
        const [rodape, topo] = [lista[i], lista[i + 1]]
        expect(rodape.id).toMatch(/-rodape$/)
        expect(topo.id).toMatch(/-topo$/)
        expect(topo.gradientAngle).toBe(180 - rodape.gradientAngle)
        expect(topo.gradientStops).toEqual(rodape.gradientStops)
        expect(rodape.gradientStops.map((s) => [s.position, s.opacity])).toEqual(curvaDaReal)
      }
    }
  })
})
