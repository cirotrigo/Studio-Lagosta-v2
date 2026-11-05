/**
 * Modo interno: a interface nunca trava por saldo. Só com a cobrança ligada
 * EXPLICITAMENTE (`true`) vale a comparação de antes — configuração que não
 * chegou ou falhou não pode travar a tela (quem decide a cobrança é o servidor).
 */
import { describe, expect, it } from 'vitest'
import { podeExecutar } from '../use-credits'

describe('podeExecutar', () => {
  it.each([false, undefined])('cobrança desligada ou configuração desconhecida (%s): sempre pode', (aplicados) => {
    expect(podeExecutar({ aplicados, creditsRemaining: 0, cost: 10 })).toBe(true)
    expect(podeExecutar({ aplicados, creditsRemaining: null, cost: 10 })).toBe(true)
  })

  it.each([true])('cobrança ligada (%s): a comparação de antes', (aplicados) => {
    expect(podeExecutar({ aplicados, creditsRemaining: null, cost: 10 })).toBe(false)
    expect(podeExecutar({ aplicados, creditsRemaining: 9, cost: 10 })).toBe(false)
    expect(podeExecutar({ aplicados, creditsRemaining: 10, cost: 10 })).toBe(true)
  })
})
