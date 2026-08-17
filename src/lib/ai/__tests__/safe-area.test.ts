/**
 * A margem que o cliente cobrou duas vezes: "é preciso respeitar as margens do
 * Instagram de topo e rodapé". A regra em fração ainda deixou logo e CTA
 * terminando entre 93% e 95% da altura — contra a IMAGEM do modelo, que tem a
 * marca quase colada na borda, só um número confere.
 */
import { describe, expect, it } from 'vitest'

import { regraDeSafeArea } from '../image-prompt-builder'
import { cantoDaAssinatura } from '../logo-compositor'

describe('regraDeSafeArea', () => {
  it('dá o limite em PIXEL da peça real quando sabe a altura', () => {
    // 1936 é a altura do story que o gpt-image devolve.
    const texto = regraDeSafeArea('story', 1936)

    expect(texto).toContain('1936px de altura')
    expect(texto).toContain('242px') // 1/8 do topo
    expect(texto).toContain('1694px') // 7/8, onde a arte tem de terminar
    expect(texto).toContain('sobe, nunca desce')
  })

  it('sem a altura, continua valendo em fração — a regra não some', () => {
    const texto = regraDeSafeArea('story')

    expect(texto).toContain('~1/8')
    expect(texto).toContain('~7/8')
    expect(texto).not.toContain('px')
  })

  it('🔴 feed e quadrado NÃO têm faixa reservada — ali seria margem inventada', () => {
    for (const formato of ['feed', 'quadrado'] as const) {
      const texto = regraDeSafeArea(formato, 1360)
      expect(texto).toContain('MARGENS DO FEED')
      expect(texto).toContain('não há faixa reservada')
      // Nenhum limite de altura é imposto: o quadro é usável inteiro.
      expect(texto).not.toContain('px')
      expect(texto).not.toContain('7/8')
    }
  })

  it('vence a margem do modelo, e diz por quê', () => {
    expect(regraDeSafeArea('story', 1936)).toContain('a safe area VENCE a margem dela')
  })
})

/**
 * A marca no canto da REFERÊNCIA, e não onde o gerador achar melhor —
 * "a logomarca ficou posicionada no topo e não posicionou como na referência".
 */
describe('cantoDaAssinatura', () => {
  it('traduz banda e lado no canto da peça', () => {
    expect(cantoDaAssinatura({ banda: 8, lado: 'esquerda' })).toBe('bottom-left')
    expect(cantoDaAssinatura({ banda: 6, lado: 'direita' })).toBe('bottom-right')
    expect(cantoDaAssinatura({ banda: 1, lado: 'direita' })).toBe('top-right')
    expect(cantoDaAssinatura({ banda: 4, lado: 'esquerda' })).toBe('top-left')
  })

  it('🔴 marca centralizada NÃO vira canto — chutar lado seria inventar', () => {
    expect(cantoDaAssinatura({ banda: 8, lado: 'centro' })).toBeNull()
    expect(cantoDaAssinatura({ lado: 'esquerda' })).toBeNull()
    expect(cantoDaAssinatura(null)).toBeNull()
    expect(cantoDaAssinatura(undefined)).toBeNull()
  })
})
