/**
 * As copies reais da leva do O Quintal Parrilla (17/08/2026) — as mesmas cinco
 * que o cliente reprovou. É contra elas que o classificador foi calibrado.
 */
import { describe, expect, it } from 'vitest'

import { blocosDeServico, elementosQueFazemSentido, instrucaoDeServico } from '../blocos-de-servico'

describe('blocosDeServico', () => {
  it('acha horário e endereço na peça de funcionamento', () => {
    const copy = [
      'Domingou no quintal',
      'Hoje das 11h às 17h',
      'Rua Aleixo Netto, 1158, Praia do Canto, Vitória/ES',
      'Chega mais',
    ]

    expect(blocosDeServico(copy)).toEqual([
      { indice: 1, texto: 'Hoje das 11h às 17h', papel: 'horário' },
      { indice: 2, texto: 'Rua Aleixo Netto, 1158, Praia do Canto, Vitória/ES', papel: 'endereço' },
    ])
  })

  it('trata a janela do happy hour como serviço', () => {
    const copy = [
      'Chope em dobro',
      'Torresmo crocante e queijo coalho pra dividir',
      'Happy hour das 17h às 19h',
      'Junta a galera',
    ]

    expect(blocosDeServico(copy).map((b) => b.indice)).toEqual([2])
  })

  it('e "Funcionamento - 11h às 00h" também, apesar do rótulo na frente', () => {
    expect(blocosDeServico(['Funcionamento - 11h às 00h'])).toHaveLength(1)
  })

  it('🔴 NÃO rebaixa a promessa da peça só porque ela cita uma hora', () => {
    // Esta é a linha de apoio do almoço de domingo. Mandá-la para o rodapé em
    // letra miúda seria trocar o recado da peça pelo dado.
    const copy = ['Domingo de parrilla e resenha', 'Almoço com a família e amigos, a partir das 11h']

    expect(blocosDeServico(copy)).toEqual([])
  })

  it('cala nas peças que não têm serviço nenhum', () => {
    expect(blocosDeServico(['Pra fechar o fim de semana', 'Brownie com sorvete'])).toEqual([])
    expect(
      blocosDeServico([
        'Drinks do quintal',
        'Dez criações autorais da casa',
        'Tem linha sem álcool completa também',
        'Chega mais',
      ]),
    ).toEqual([])
  })

  it('reconhece as abreviações de logradouro e o CEP', () => {
    expect(blocosDeServico(['R. Aleixo Netto, 1158'])[0]?.papel).toBe('endereço')
    expect(blocosDeServico(['Av. Nossa Senhora dos Navegantes, 100'])[0]?.papel).toBe('endereço')
    expect(blocosDeServico(['Praia do Canto, Vitória, 29055-260'])[0]?.papel).toBe('endereço')
  })
})

describe('instrucaoDeServico', () => {
  it('não inventa zona de rodapé quando a copy não tem serviço', () => {
    expect(instrucaoDeServico(['Drinks do quintal', 'Chega mais'])).toBeNull()
  })

  it('manda criar a zona mesmo quando o modelo não tem — a regra do pedido', () => {
    const texto = instrucaoDeServico(['Domingou no quintal', 'Hoje das 11h às 17h'])!

    expect(texto).toContain('RODAPÉ')
    expect(texto).toContain('Hoje das 11h às 17h')
    expect(texto).toContain('crie a zona de rodapé')
    // Dizer só ONDE eles vão deixou a peça com o horário nos DOIS lugares.
    expect(texto).toContain('SAEM DA SEQUÊNCIA DE CIMA')
    expect(texto).toContain('~7/8 da altura')
  })
})

describe('elementosQueFazemSentido', () => {
  const DO_MODELO = [
    'ícone de relógio antes da linha de serviço',
    'ícone de localização antes da linha de endereço',
    'filete fino abaixo da manchete',
  ]

  it('🔴 tira o ícone de serviço quando a peça não tem serviço — ele ficaria órfão', () => {
    const { manter, descartados } = elementosQueFazemSentido(DO_MODELO, [
      'Pra fechar o fim de semana',
      'Brownie com sorvete',
    ])

    expect(manter).toEqual(['filete fino abaixo da manchete'])
    expect(descartados).toHaveLength(2)
  })

  it('mantém tudo quando a copy tem horário — aí o ícone acompanha alguém', () => {
    const copy = ['Domingou no quintal', 'Hoje das 11h às 17h']

    expect(elementosQueFazemSentido(DO_MODELO, copy).manter).toEqual(DO_MODELO)
    expect(elementosQueFazemSentido(DO_MODELO, copy).descartados).toEqual([])
  })

  it('preserva a distinção entre "não li" (null) e "não há" ([])', () => {
    expect(elementosQueFazemSentido(null, ['Brownie com sorvete']).manter).toBeNull()
    expect(elementosQueFazemSentido([], ['Brownie com sorvete']).manter).toEqual([])
  })
})
