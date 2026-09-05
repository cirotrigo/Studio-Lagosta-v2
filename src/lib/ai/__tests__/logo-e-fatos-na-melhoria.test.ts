/**
 * Duas travas que nasceram do teste do Ciro em 05/09/2026, melhorando artes da
 * Wine Vix: a logo composta caindo sobre a copy, e os fatos do cliente entrando
 * numa peça que não tem endereço.
 */
import { describe, expect, it } from 'vitest'

import { melhoriaCompoeLogo } from '../logo-na-melhoria'
import { logoModePadraoPara } from '../logo-compositor'
import { regrasDaCasaNaMelhoria } from '../regras-da-melhoria'

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

describe('a melhoria não recebe mais os fatos do cliente', () => {
  /**
   * 🔴 A seção injetava endereço e horário oficiais "só para conferir", e o que
   * produziu foi dado DESENHADO — "Rua Fernandes Tourinho, 133 · Savassi" numa
   * peça de Vitória (Quintal, 01/09) e "São José do Rio Preto - SP" na Wine Vix
   * (04/09). Removida em 05/09: as proibições do DNA valem na criação da COPY,
   * e a arte chega à melhoria já decidida e revisada por quem pede.
   */
  it('nenhuma régua faz a seção [FATOS DO CLIENTE] aparecer', () => {
    const reguas = [
      [],
      ['Rua João da Cruz, 151, Loja 1'],
      ['Real Praia do Canto', 'Funcionamento - 12h às 22h'],
      ['Quinta, das 11h às 00h · Praia do Canto, Vitória-ES'],
    ]
    for (const expectedTexts of reguas) {
      const texto = regrasDaCasaNaMelhoria({ expectedTexts, userRequest: '' })
      expect(texto).not.toContain('[FATOS DO CLIENTE')
      expect(texto).not.toMatch(/só para conferir, nunca para acrescentar/)
    }
  })

  it('e a regra 1 continua proibindo criar linha de endereço', () => {
    const texto = regrasDaCasaNaMelhoria({ expectedTexts: ['Happy hour'], userRequest: '' })
    expect(texto).toMatch(/Se a arte não tem horário, endereço, telefone ou preço, a arte nova também não tem/)
  })
})
