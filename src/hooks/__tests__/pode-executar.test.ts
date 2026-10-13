/**
 * Modo interno: a interface nunca trava por saldo. Com a cobrança ligada (ou
 * enquanto a configuração não chegou), a comparação de antes.
 */
import { describe, expect, it } from 'vitest'
import { podeExecutar } from '../use-credits'

describe('podeExecutar', () => {
  it('cobrança desligada: sempre pode, mesmo com saldo 0 ou créditos ainda carregando', () => {
    expect(podeExecutar({ aplicados: false, creditsRemaining: 0, cost: 10 })).toBe(true)
    expect(podeExecutar({ aplicados: false, creditsRemaining: null, cost: 10 })).toBe(true)
  })

  it.each([true, undefined])('cobrança ligada (%s): a comparação de antes', (aplicados) => {
    expect(podeExecutar({ aplicados, creditsRemaining: null, cost: 10 })).toBe(false)
    expect(podeExecutar({ aplicados, creditsRemaining: 9, cost: 10 })).toBe(false)
    expect(podeExecutar({ aplicados, creditsRemaining: 10, cost: 10 })).toBe(true)
  })
})
