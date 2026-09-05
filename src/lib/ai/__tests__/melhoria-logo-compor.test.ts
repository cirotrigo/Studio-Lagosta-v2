import { describe, expect, it } from 'vitest'
import { melhoriaCompoeLogo, instrucaoLogoNaMelhoria } from '../logo-na-melhoria'

describe('logo na melhoria', () => {
  /**
   * 🔴 A Wine Vix SAIU do compor na melhoria em 05/09/2026 — este teste dizia
   * `melhoriaCompoeLogo(11) === true` e foi atualizado junto com a decisão, de
   * propósito. Motivo: a logo composta caiu sobre "Happy Hour - 16h às 19h" numa
   * peça real. `comporLogo` escolhe o canto por calma e contraste, e não tem
   * como saber onde está a copy — na melhoria a diagramação é preservada, então
   * não existe canto reservado. Ver `MELHORIA_NAO_COMPOE`.
   */
  it('TERO compõe; Wine Vix saiu do compor na melhoria; Quintal deixa o modelo desenhar', () => {
    expect(melhoriaCompoeLogo(3)).toBe(true)
    expect(melhoriaCompoeLogo(11)).toBe(false)
    expect(melhoriaCompoeLogo(2)).toBe(false)
  })
  it('o prompt manda não desenhar e reserva o canto', () => {
    const s = instrucaoLogoNaMelhoria()
    expect(s).toMatch(/DO NOT DRAW/)
    expect(s).toMatch(/lower-right corner/)
    expect(s).toMatch(/NO brand mark at all/)
  })
})
