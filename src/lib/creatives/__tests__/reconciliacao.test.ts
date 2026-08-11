import { describe, it, expect } from 'vitest'
import {
  CATALOGO_MINIMO_PARA_PODA,
  MAX_NOVAS_POR_PROJETO_POR_DIA,
  aplicarTeto,
  diffDeIds,
  haTempo,
  podaSuspeita,
  rotacionarPorDia,
} from '../reconciliacao'

describe('diffDeIds', () => {
  it('separa órfãs (no catálogo, fora do Drive) de novas (no Drive, fora do catálogo)', () => {
    const { orfas, novas } = diffDeIds(['a', 'b', 'c'], ['b', 'c', 'x', 'y'])
    expect(orfas.sort()).toEqual(['x', 'y'])
    expect(novas).toEqual(['a'])
  })

  it('não acusa nada quando os dois lados batem — o caso normal do dia a dia', () => {
    const ids = ['a', 'b', 'c']
    expect(diffDeIds(ids, ids)).toEqual({ orfas: [], novas: [] })
  })

  it('id repetido no catálogo não vira duas órfãs', () => {
    const { orfas } = diffDeIds([], ['x', 'x'])
    expect(orfas).toEqual(['x'])
  })

  it('Drive vazio torna TODO o catálogo órfão — é por isso que existe o guard de varredura vazia', () => {
    const { orfas, novas } = diffDeIds([], ['a', 'b'])
    expect(orfas).toEqual(['a', 'b'])
    expect(novas).toEqual([])
  })

  it('catálogo vazio torna todo o Drive novidade', () => {
    const { orfas, novas } = diffDeIds(['a', 'b'], [])
    expect(orfas).toEqual([])
    expect(novas).toEqual(['a', 'b'])
  })
})

describe('aplicarTeto', () => {
  it('corta a leva no teto e conta o que fica para amanhã', () => {
    const novas = Array.from({ length: 150 }, (_, i) => i)
    const { paraAnalisar, restantes } = aplicarTeto(novas, MAX_NOVAS_POR_PROJETO_POR_DIA)
    expect(paraAnalisar).toHaveLength(120)
    expect(restantes).toBe(30)
    expect(paraAnalisar[0]).toBe(0)
  })

  it('leva menor que o teto passa inteira, sem restante', () => {
    const { paraAnalisar, restantes } = aplicarTeto([1, 2, 3], 120)
    expect(paraAnalisar).toEqual([1, 2, 3])
    expect(restantes).toBe(0)
  })

  it('teto zero não analisa nada e devolve tudo como restante', () => {
    expect(aplicarTeto([1, 2], 0)).toEqual({ paraAnalisar: [], restantes: 2 })
  })
})

describe('podaSuspeita', () => {
  it('drift normal passa — 214 órfãs num acervo de 1.100 é o caso real do TERO', () => {
    expect(podaSuspeita(1100, 214)).toBe(false)
  })

  it('mais da metade do catálogo é tratado como varredura quebrada, não como curadoria', () => {
    expect(podaSuspeita(1000, 501)).toBe(true)
  })

  it('exatamente metade ainda passa', () => {
    expect(podaSuspeita(1000, 500)).toBe(false)
  })

  it('catálogo pequeno não é julgado por fração', () => {
    expect(podaSuspeita(CATALOGO_MINIMO_PARA_PODA - 1, CATALOGO_MINIMO_PARA_PODA - 1)).toBe(false)
  })
})

describe('haTempo', () => {
  it('deixa pegar trabalho antes do prazo e recusa depois', () => {
    const prazo = 1_000_000
    expect(haTempo(prazo, prazo - 1)).toBe(true)
    expect(haTempo(prazo, prazo)).toBe(false)
    expect(haTempo(prazo, prazo + 1)).toBe(false)
  })
})

describe('rotacionarPorDia', () => {
  const projetos = ['a', 'b', 'c']

  it('muda quem começa a cada dia', () => {
    const dia0 = new Date('2026-08-11T05:00:00Z')
    const dia1 = new Date('2026-08-12T05:00:00Z')
    expect(rotacionarPorDia(projetos, dia0)[0]).not.toBe(rotacionarPorDia(projetos, dia1)[0])
  })

  it('é estável dentro do mesmo dia (duas execuções da mesma madrugada)', () => {
    const cedo = new Date('2026-08-11T05:00:00Z')
    const tarde = new Date('2026-08-11T05:59:00Z')
    expect(rotacionarPorDia(projetos, cedo)).toEqual(rotacionarPorDia(projetos, tarde))
  })

  it('em N dias todo projeto é o primeiro pelo menos uma vez', () => {
    const primeiros = new Set(
      Array.from({ length: projetos.length }, (_, i) =>
        rotacionarPorDia(projetos, new Date(Date.UTC(2026, 7, 11 + i)))[0],
      ),
    )
    expect(primeiros).toEqual(new Set(projetos))
  })

  it('preserva todos os itens e não muta a lista original', () => {
    const original = [...projetos]
    const girado = rotacionarPorDia(projetos, new Date('2026-08-12T05:00:00Z'))
    expect(girado.sort()).toEqual([...projetos].sort())
    expect(projetos).toEqual(original)
  })

  it('lista de um item ou vazia passa direto', () => {
    expect(rotacionarPorDia(['unico'])).toEqual(['unico'])
    expect(rotacionarPorDia([])).toEqual([])
  })
})
