/**
 * Em STORY a logo desenhada nunca fica no canto superior ESQUERDO (O Quintal,
 * 20/08/2026: a marca saiu ali, sob o avatar que o Instagram desenha por cima —
 * "briga com a logomarca que o próprio Instagram tem nos stories"). O superior
 * DIREITO pode — decisão do Ciro no mesmo dia. Mesma regra do `comporLogo`.
 */
import { describe, expect, it } from 'vitest'
import { instrucaoLogoPeloModelo } from '../logo-compositor'

describe('instrucaoLogoPeloModelo em story', () => {
  it('derruba o topo esquerdo vindo do modelo para o mesmo lado embaixo', () => {
    expect(instrucaoLogoPeloModelo('top-left', 'story')).toContain('lower-left corner')
    expect(instrucaoLogoPeloModelo('top-left', 'story')).not.toContain('upper-left corner')
  })

  it('o topo DIREITO vindo do modelo é respeitado', () => {
    expect(instrucaoLogoPeloModelo('top-right', 'story')).toContain('upper-right corner')
  })

  it('mantém canto inferior vindo do modelo', () => {
    expect(instrucaoLogoPeloModelo('bottom-left', 'story')).toContain('lower-left corner')
  })

  it('sem canto, a escolha livre proíbe só o superior esquerdo', () => {
    const bloco = instrucaoLogoPeloModelo(null, 'story')
    expect(bloco).toContain('NUNCA o canto superior esquerdo')
    expect(bloco).toContain('superior ESQUERDO é proibido')
  })

  it('fora do story o canto superior esquerdo do modelo é respeitado', () => {
    expect(instrucaoLogoPeloModelo('top-left', 'feed')).toContain('upper-left corner')
    expect(instrucaoLogoPeloModelo('top-left')).toContain('upper-left corner')
  })

  it('a precedência sobre o DNA está escrita em todos os formatos', () => {
    for (const bloco of [instrucaoLogoPeloModelo(null, 'story'), instrucaoLogoPeloModelo(null, 'feed'), instrucaoLogoPeloModelo('bottom-right')]) {
      expect(bloco).toContain('VENCE qualquer descrição de logo')
    }
  })
})
