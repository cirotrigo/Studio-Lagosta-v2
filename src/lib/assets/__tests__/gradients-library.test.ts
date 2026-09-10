import { describe, expect, it } from 'vitest'
import { GRADIENTS_LIBRARY, GRADIENTES_POR_PROJETO, gradientesDoProjeto } from '../gradients-library'

describe('gradientes da marca', () => {
  it('a Real vê os quatro gradientes dela; outro projeto não vê nenhum', () => {
    expect(gradientesDoProjeto(1).daMarca.map((g) => g.id)).toEqual([
      'real-verde-rodape',
      'real-verde-topo',
      'real-creme-rodape',
      'real-creme-topo',
    ])
    expect(gradientesDoProjeto(6).daMarca).toEqual([])
    expect(gradientesDoProjeto(null).daMarca).toEqual([])
    expect(gradientesDoProjeto(undefined).gerais).toBe(GRADIENTS_LIBRARY)
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

  it('o topo é o espelho vertical do rodapé, com a mesma curva', () => {
    const [verdeRodape, verdeTopo, cremeRodape, cremeTopo] = gradientesDoProjeto(1).daMarca
    expect(verdeTopo.gradientAngle).toBe(180 - verdeRodape.gradientAngle)
    expect(cremeTopo.gradientAngle).toBe(180 - cremeRodape.gradientAngle)
    expect(verdeTopo.gradientStops).toEqual(verdeRodape.gradientStops)
    expect(cremeRodape.gradientStops.map((s) => s.opacity)).toEqual(verdeRodape.gradientStops.map((s) => s.opacity))
  })
})
