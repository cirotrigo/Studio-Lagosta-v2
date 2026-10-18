/**
 * Desde o @napi-rs/canvas 1.0.x, `sans-serif`, `serif` e família que não está no registro caem numa fonte padrão
 * SEM os glifos acentuados — "ALMOÇO às" saía "ALMO▯O ▯s" (medido no macOS em 15/10/2026, idêntico da 1.0.5 à
 * 1.0.11; na 0.1.84 o padrão era Arial/Helvetica, com os glifos). Os cartões de referência, o manual de marca e o
 * revisor desenham com `sans-serif` direto. `garantirFontesPadrao` registra cada peso da Montserrat também como
 * `sans-serif`, e esse fallback passa a ser a Montserrat (o peso: `fontes-padrao-processo-isolado.test.ts`).
 *
 * O teste mede o que o render vê: se a largura de "Ç" é a mesma de um código não atribuído (U+0378), o glifo é o
 * .notdef (tofu). Hermético, sem rede.
 */
import { createCanvas } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { garantirFontesPadrao } from '@/lib/canvas-renderer'

const tofu = (font: string): boolean => {
  const ctx = createCanvas(8, 8).getContext('2d')
  ctx.font = font
  return ctx.measureText('Ç').width === ctx.measureText('͸').width
}

describe('família genérica ou desconhecida tem os glifos acentuados depois do registro padrão', () => {
  it('sans-serif, serif e uma família que não existe medem Ç como glifo, não como tofu', () => {
    garantirFontesPadrao()
    for (const font of ['bold 40px sans-serif', '40px serif', '600 16px sans-serif', '40px FamiliaQueNaoExiste']) {
      expect({ font, tofu: tofu(font) }).toEqual({ font, tofu: false })
    }
  })
  it('a Montserrat empacotada responde pela família e pelo fallback', () => {
    garantirFontesPadrao()
    const ctx = createCanvas(8, 8).getContext('2d')
    ctx.font = '40px Montserrat'
    const montserrat = ctx.measureText('Ç').width
    ctx.font = '40px FamiliaQueNaoExiste'
    expect(ctx.measureText('Ç').width).toBe(montserrat)
  })
})
