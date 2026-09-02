/**
 * O caso real de 01/09/2026: happy hour do Quintal, régua de 6 blocos,
 * conferência VERDE, e "Rua Fernandes Tourinho, 133 · Savassi, Belo Horizonte"
 * no rodapé de um cliente de Vitória. `passed` confere o que falta; isto
 * confere o que sobra.
 */
import { describe, expect, it } from 'vitest'

import { blocosAMais, pareceDado } from '../text-comparison'

const REGUA_HH = [
  'Happy hour',
  'Chope e Drinks',
  'em Dobro',
  'Chope e drinks selecionados em dobro no fim de tarde.',
  'Ter a Sex, das 16h às 19h',
  'Junta a galera',
]

describe('blocosAMais', () => {
  it('acusa o endereço inventado com a régua inteira presente', () => {
    const transcricao = [
      'Happy hour',
      'Chope e Drinks',
      'em Dobro',
      'Chope e drinks selecionados em dobro no fim de tarde.',
      'Junta a galera',
      'Ter a Sex, das 16h às 19h',
      'Rua Fernandes Tourinho, 133',
      'Savassi, Belo Horizonte',
      'O Quintal',
      'Parrilla Bar',
    ]
    const r = blocosAMais(transcricao, REGUA_HH, 'O Quintal Parrilla')
    expect(r.comDado).toEqual(['Rua Fernandes Tourinho, 133', 'Savassi, Belo Horizonte'])
    expect(r.semDado).toEqual([])
  })

  it('não acusa quebra de linha da visão nem a assinatura da marca', () => {
    const transcricao = ['HAPPY HOUR', 'Chope e', 'Drinks', 'em Dobro', 'Chope e drinks selecionados', 'em dobro no fim de tarde.', 'Ter a Sex,', 'das 16h às 19h', 'Junta a galera', 'O QUINTAL PARRILLA BAR']
    const r = blocosAMais(transcricao, REGUA_HH, 'O Quintal Parrilla')
    expect(r.comDado).toEqual([])
    expect(r.semDado).toEqual([])
  })

  it('separa decoração de dado', () => {
    const r = blocosAMais(['Happy hour', 'Chope e Drinks', 'em Dobro', 'Vem hoje', 'Reservas pelo Direct', '4,8 no Google'], REGUA_HH.slice(0, 3), null)
    expect(r.semDado).toEqual(['Vem hoje'])
    expect(r.comDado).toEqual(['Reservas pelo Direct', '4,8 no Google'])
  })

  it('com régua vazia nada é "a mais" de propósito', () => {
    // Sem régua não há contra o que comparar: tudo seria a mais, e alarme que
    // toca sempre é alarme que ninguém lê.
    const r = blocosAMais(['Qualquer coisa 123'], [], null)
    expect(r.comDado).toEqual(['Qualquer coisa 123'])
  })
})

describe('pareceDado', () => {
  it('reconhece endereço, cidade, hora e preço', () => {
    expect(pareceDado('Rua Aleixo Netto, 1158')).toBe(true)
    expect(pareceDado('Savassi, Belo Horizonte')).toBe(true)
    expect(pareceDado('Praia do Canto, Vitória-ES')).toBe(true)
    expect(pareceDado('das 11h às 00h')).toBe(true)
    expect(pareceDado('R$ 49,90')).toBe(true)
  })
  it('não confunde CTA com dado', () => {
    expect(pareceDado('Junta a galera')).toBe(false)
    expect(pareceDado('Bora pro quintal?')).toBe(false)
  })
})
