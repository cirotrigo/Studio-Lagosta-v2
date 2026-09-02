import { describe, expect, it } from 'vitest'
import { melhoriaCompoeLogo, instrucaoLogoNaMelhoria } from '../logo-na-melhoria'

describe('logo na melhoria', () => {
  it('Wine Vix e TERO compõem; Quintal deixa o modelo desenhar', () => {
    expect(melhoriaCompoeLogo(11)).toBe(true)
    expect(melhoriaCompoeLogo(3)).toBe(true)
    expect(melhoriaCompoeLogo(2)).toBe(false)
  })
  it('o prompt manda não desenhar e reserva o canto', () => {
    const s = instrucaoLogoNaMelhoria()
    expect(s).toMatch(/DO NOT DRAW/)
    expect(s).toMatch(/lower-right corner/)
    expect(s).toMatch(/NO brand mark at all/)
  })
})
