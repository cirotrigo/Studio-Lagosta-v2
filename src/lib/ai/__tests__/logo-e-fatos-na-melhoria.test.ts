/**
 * Duas travas que nasceram do teste do Ciro em 05/09/2026, melhorando artes da
 * Wine Vix: a logo composta caindo sobre a copy, e os fatos do cliente entrando
 * numa peça que não tem endereço.
 */
import { describe, expect, it } from 'vitest'

import { temEndereco } from '../blocos-de-servico'
import { melhoriaCompoeLogo } from '../logo-na-melhoria'
import { logoModePadraoPara } from '../logo-compositor'
import { fatosDoClienteNaMelhoria } from '../regras-da-melhoria'

describe('a MELHORIA não compõe a logo onde a diagramação é preservada', () => {
  /**
   * 🔴 Medido na Programação de Feriado da Wine Vix: a logo foi colada sobre
   * "Happy Hour - 16h às 19h", cobrindo a palavra "Happy". `comporLogo` escolhe
   * o canto por calma e contraste — medidas que não distinguem área escura
   * vazia de área escura com uma linha de texto.
   */
  it('Wine Vix sai do compor na melhoria, e continua composta na geração', () => {
    expect(melhoriaCompoeLogo(11)).toBe(false)
    // a GERAÇÃO segue compondo: lá o prompt reserva o canto antes de existir layout
    expect(logoModePadraoPara(11)).toBe('compor')
  })

  it('os outros projetos em compor não são afetados', () => {
    expect(melhoriaCompoeLogo(3)).toBe(true) // TERO — ligadura E+R, 4 rodadas erradas
    expect(melhoriaCompoeLogo(8)).toBe(true) // Lagosta — co-branding, duas marcas
  })

  it('projeto fora do mapa continua deixando a logo com o modelo', () => {
    expect(melhoriaCompoeLogo(7)).toBe(false)
  })
})

describe('os fatos do cliente exigem endereço DE VERDADE na copy', () => {
  const FATOS = [
    'Real Praia do Canto, loja principal, Rua João da Cruz, 151, Loja 1.',
    'A fábrica fica no Polo Industrial de Piúma/ES e NÃO atende ao consumidor. Nunca divulgar esse endereço.',
  ]

  /**
   * 🔴 O falso positivo que abria a porta: `LOCALIDADE` casa a palavra "praia",
   * então o NOME de uma unidade contava como endereço e os fatos entravam —
   * inclusive o endereço da fábrica, que o DNA do cliente proíbe publicar.
   */
  it('nome de unidade com bairro NÃO é endereço', () => {
    expect(temEndereco(['Real Praia do Canto, loja principal'])).toBe(false)
    expect(temEndereco(['Unidade Praia do Canto'])).toBe(false)
    expect(temEndereco(['Centro de Vitória'])).toBe(false)
  })

  /**
   * 🔴 O que separa os dois casos é o HORÁRIO colado. Na linha mista dos
   * modelos do Studio o bairro é a localização da casa, dita junto do
   * funcionamento — caso deliberado de 01/09/2026, que a primeira versão deste
   * conserto derrubou junto. Num NOME de unidade, não.
   */
  it('bairro colado a uma linha de serviço continua contando', () => {
    expect(temEndereco(['Quinta, das 11h às 00h · Praia do Canto, Vitória-ES'])).toBe(true)
  })

  it('logradouro e CEP continuam sendo endereço, em qualquer posição', () => {
    expect(temEndereco(['R. Aleixo Netto, 1158 - Praia do Canto'])).toBe(true)
    expect(temEndereco(['Rua João da Cruz, 151, Loja 1'])).toBe(true)
    expect(temEndereco(['Endereço: Avenida Nossa Senhora, 300'])).toBe(true)
    expect(temEndereco(['CEP 29055-260'])).toBe(true)
  })

  it('a peça sem endereço na copy não recebe os fatos', () => {
    const semEndereco = fatosDoClienteNaMelhoria({
      expectedTexts: ['Real Praia do Canto', 'Funcionamento - 12h às 22h'],
      userRequest: '',
      fatosDoCliente: FATOS,
    })
    expect(semEndereco).toBeNull()
  })

  it('a peça COM endereço recebe os fatos, só para conferir', () => {
    const comEndereco = fatosDoClienteNaMelhoria({
      expectedTexts: ['Rua João da Cruz, 151, Loja 1'],
      userRequest: '',
      fatosDoCliente: FATOS,
    })
    expect(comEndereco).toMatch(/só para conferir, nunca para acrescentar/)
  })
})
