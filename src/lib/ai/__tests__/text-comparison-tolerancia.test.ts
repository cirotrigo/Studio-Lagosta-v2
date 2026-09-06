import { describe, expect, it } from 'vitest'
import {
  casarComTolerancia,
  descontarTextosDaOrigem,
  distanciaComTransposicao,
  mesmaPalavraComTolerancia,
  normalizeForComparison,
  semTextosDaMarca,
} from '../text-comparison'

/**
 * Os casos REAIS da rodada do Espeto Gaúcho de 06/09/2026: duas peças
 * corretas reprovadas pela régua por visão (leitura "PICAHNA" e "ESPACO
 * GAUCHO" na origem), e um traço de diagramação colado à palavra vizinha.
 */
describe('normalizeForComparison — o traço é diagramação', () => {
  it('"frango - a partir" e "frango · a partir" convergem com a copy', () => {
    const copy = normalizeForComparison('e coxinha de frango · a partir das 17h')
    expect(normalizeForComparison('e coxinha de frango - a partir das 17h')).toBe(copy)
    expect(normalizeForComparison('e coxinha de frango a partir das 17h')).toBe(copy)
  })

  it('"meia-noite" e "meia noite" são o mesmo horário; preço e hora seguem exatos', () => {
    expect(normalizeForComparison('DAS 10H À MEIA-NOITE')).toBe(normalizeForComparison('das 10h à meia noite'))
    expect(normalizeForComparison('R$ 64,90')).not.toBe(normalizeForComparison('R$ 84,90'))
  })
})

describe('distância com transposição', () => {
  it('PICAHNA ↔ PICANHA dista 1 (vizinhas trocadas), não 2', () => {
    expect(distanciaComTransposicao('PICAHNA', 'PICANHA')).toBe(1)
    expect(distanciaComTransposicao('ESPACO', 'ESPETO')).toBe(2)
  })

  it('tolera uma edição só em PALAVRA de 5+ letras — nunca em número, preço ou hora', () => {
    expect(mesmaPalavraComTolerancia('PICAHNA', 'PICANHA')).toBe(true)
    expect(mesmaPalavraComTolerancia('LINGUICA', 'LINGUIÇA'.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase())).toBe(true)
    expect(mesmaPalavraComTolerancia('64,90', '84,90')).toBe(false)
    expect(mesmaPalavraComTolerancia('17H', '11H')).toBe(false)
    expect(mesmaPalavraComTolerancia('BOLO', 'BOLA')).toBe(false)
  })
})

describe('casarComTolerancia — a régua avisa, nunca reprova por um erro de leitura', () => {
  const transcricao = normalizeForComparison(
    ['OFERTA DA CASA É O', 'ESPETO MISTO', 'picanha, picanha suina, linguiça', 'e coxinha de frango - a partir das 17h', 'R$ 104,90'].join('\n'),
  )

  it('casa "PICAHNA,PICAHNA SUINA,LINGUICA" com a arte correta e devolve as divergências', () => {
    const r = casarComTolerancia(normalizeForComparison('PICAHNA,PICAHNA SUINA,LINGUICA'), transcricao)
    expect(r.casou).toBe(true)
    expect(r.divergencias).toEqual([
      { esperado: 'PICAHNA', lido: 'PICANHA' },
      { esperado: 'PICAHNA', lido: 'PICANHA' },
    ])
  })

  it('casa o bloco com traço de diagramação sem divergência', () => {
    const r = casarComTolerancia(normalizeForComparison('E COXINHA DE FRANGO A PARTIR DAS 17H'), transcricao)
    expect(r).toEqual({ casou: true, divergencias: [] })
  })

  it('preço trocado continua reprovando', () => {
    expect(casarComTolerancia(normalizeForComparison('R$ 114,90'), transcricao).casou).toBe(false)
  })

  it('palavra realmente diferente continua reprovando', () => {
    expect(casarComTolerancia(normalizeForComparison('ESPETO SUINO'), transcricao).casou).toBe(false)
  })
})

describe('semTextosDaMarca — o arco do selo mal lido é a marca', () => {
  it('"ESPACO GAUCHO" (leitura de "ESPETO GAÚCHO") sai da régua', () => {
    const r = semTextosDaMarca(['PROMOÇÃO DO DIA É A', 'MAMINHA', 'ESPAÇO GAÚCHO', 'CHURRASCARIA'], {
      nomeDaMarca: 'Espeto Gaúcho',
      textosDaLogo: ['CHURRASCARIA', 'ESPETO GAÚCHO'],
    })
    expect(r.regua).toEqual(['PROMOÇÃO DO DIA É A', 'MAMINHA'])
    expect(r.descontados).toEqual(['ESPAÇO GAÚCHO', 'CHURRASCARIA'])
  })

  it('copy que cita a marca com outra palavra fica na régua', () => {
    const r = semTextosDaMarca(['VEM PRO ESPETO'], { nomeDaMarca: 'Espeto Gaúcho', textosDaLogo: [] })
    expect(r.regua).toEqual(['VEM PRO ESPETO'])
  })
})

describe('descontarTextosDaOrigem — a placa da fachada lida de dois jeitos', () => {
  it('"CHURRASCARIA & CIA" já estava na origem lida como "CHURRASCO & CIA"', () => {
    const r = descontarTextosDaOrigem({ comDado: [], semDado: ['CHURRASCARIA & CIA'] }, ['ESPETO GAÚCHO', 'CHURRASCARIA & CIA', 'SEG A SEX'])
    expect(r.semDado).toEqual([])
    const r2 = descontarTextosDaOrigem({ comDado: [], semDado: ['ESPEITO GAÚCHO'] }, ['ESPETO GAÚCHO'])
    expect(r2.semDado).toEqual([])
  })
})
