/**
 * O caso real que originou a conferência: O Quintal Parrilla, 17/08/2026.
 *
 * A arte de referência ("Sabadouu") tem funcionamento, endereço e assinatura.
 * Cinco peças novas saíram com essas linhas letradas, e o cliente reprovou uma
 * a uma. Os textos abaixo são os que a visão transcreveu de verdade — da arte
 * de referência (`modeloDecodificado`) e das peças geradas.
 */
import { describe, expect, it } from 'vitest'

import { textosVazadosDoModelo } from '../text-comparison'

/** Os níveis lidos na arte de referência, como o decodificador os devolveu. */
const MODELO = [
  'Sabadouuu',
  'sua resenha é aqui!',
  'Funcionamento - 11h às 00h',
  'R. Aleixo Netto, 1158 - Praia do Canto, Vitória',
  'O Quintal',
]

describe('textosVazadosDoModelo', () => {
  it('acusa o horário e o endereço do post antigo na arte de sobremesas', () => {
    // A copy pedida tinha DOIS blocos; a arte saiu com cinco.
    const copy = ['Pra fechar o fim de semana', 'Brownie com sorvete']
    const arte = [
      'Pra fechar o fim de semana',
      'Brownie com sorvete',
      'Funcionamento - 11h às 00h',
      'R. Aleixo Netto, 1158 - Praia do Canto, Vitória',
      'O Quintal',
    ]

    expect(textosVazadosDoModelo(arte, copy, MODELO)).toEqual([
      'Funcionamento - 11h às 00h',
      'R. Aleixo Netto, 1158 - Praia do Canto, Vitória',
    ])
  })

  it('cala quando a copy PEDIU o endereço — foi o caso do post de funcionamento', () => {
    const copy = [
      'Domingou no quintal',
      'Hoje das 11h às 17h',
      'Rua Aleixo Netto, 1158, Praia do Canto, Vitória/ES',
      'Chega mais',
    ]
    // A peça desenhou exatamente a copy. Nada a dizer, mesmo com o modelo
    // trazendo um endereço parecido: reclamar aqui seria alarme falso.
    expect(textosVazadosDoModelo(copy, copy, MODELO)).toEqual([])
  })

  it('não acusa a assinatura da marca, que aparece em toda peça por desenho', () => {
    const copy = ['Drinks do quintal']
    // "O Quintal" tem 9 caracteres normalizados: abaixo do piso de alarme.
    expect(textosVazadosDoModelo(['Drinks do quintal', 'O Quintal'], copy, MODELO)).toEqual([])
  })

  it('não acusa a assinatura por extenso quando o nome da marca é informado', () => {
    // Caso REAL da peça de 17/08: a visão transcreve o wordmark da logo, e o
    // decodificador lê o nome como um nível do modelo. Sem a marca na mão, o
    // alerta tocaria em quase toda geração.
    const copy = ['Domingo de parrilla e resenha']
    const arte = ['Domingo de parrilla e resenha', 'O Quintal Parrilla Bar']
    const modelo = [...MODELO, 'O Quintal Parrilla Bar']

    expect(textosVazadosDoModelo(arte, copy, modelo)).toEqual(['O Quintal Parrilla Bar'])
    expect(textosVazadosDoModelo(arte, copy, modelo, 'O Quintal Parrilla')).toEqual([])
  })

  it('mas o endereço continua acusado mesmo citando a marca', () => {
    const copy = ['Chope em dobro']
    const arte = ['Chope em dobro', 'O Quintal Parrilla Bar - R. Aleixo Netto, 1158']
    const modelo = ['O Quintal Parrilla Bar - R. Aleixo Netto, 1158']

    expect(textosVazadosDoModelo(arte, copy, modelo, 'O Quintal Parrilla')).toEqual([
      'O Quintal Parrilla Bar - R. Aleixo Netto, 1158',
    ])
  })

  it('sobrevive à pontuação e ao espaçamento que a visão inventa', () => {
    const copy = ['Chope em dobro']
    // A transcrição real costuma vir com espaço em volta do hífen e da vírgula.
    const arte = ['Chope em dobro', 'Funcionamento  -  11h às 00h']
    expect(textosVazadosDoModelo(arte, copy, MODELO)).toEqual(['Funcionamento - 11h às 00h'])
  })

  it('sem modelo decodificado não há régua — e nada é afirmado', () => {
    expect(textosVazadosDoModelo(['Funcionamento - 11h às 00h'], ['Chope em dobro'], [])).toEqual([])
  })
})
