import { describe, expect, it } from 'vitest'
import { mesmaEntradaDeDesfazer } from '../historico-do-editor'

describe('mesmaEntradaDeDesfazer', () => {
  it('sem gesto, a mesma chave funde só dentro de 800 ms', () => {
    expect(mesmaEntradaDeDesfazer({ key: 'k', time: 0 }, { coalesceKey: 'k' }, 500)).toBe(true)
    expect(mesmaEntradaDeDesfazer({ key: 'k', time: 0 }, { coalesceKey: 'k' }, 900)).toBe(false)
  })
  it('no gesto, a pausa longa não abre entrada nova', () => {
    expect(mesmaEntradaDeDesfazer({ key: 'g', time: 0 }, { coalesceKey: 'g', gesto: true }, 60_000)).toBe(true)
  })
  it('desfazer no meio do gesto (chave zerada) reabre a entrada', () => {
    expect(mesmaEntradaDeDesfazer({ key: null, time: 0 }, { coalesceKey: 'g', gesto: true }, 10)).toBe(false)
  })
  it('outra edição no meio do gesto também reabre', () => {
    expect(mesmaEntradaDeDesfazer({ key: 'layer:x', time: 0 }, { coalesceKey: 'g', gesto: true }, 10)).toBe(false)
  })
  it('sem chave nunca funde', () => {
    expect(mesmaEntradaDeDesfazer({ key: null, time: 0 }, undefined, 10)).toBe(false)
  })
})
