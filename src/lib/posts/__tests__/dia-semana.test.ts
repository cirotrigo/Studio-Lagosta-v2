/**
 * "quinta" está dentro de "Quintal": com `includes`, todo template de
 * "O Quintal Parrilla — …" era de quinta, e `escolher-modelo("funcionamento")`
 * devolveu "Celebrações Especiais" (01/09/2026). O casamento é por TOKEN.
 */
import { describe, expect, it } from 'vitest'

import { casaComDia, diasDoModelo, ehCuringaDeDia } from '../dia-semana'

describe('casaComDia', () => {
  it('não confunde Quintal com quinta', () => {
    expect(casaComDia(['O Quintal Parrilla — Celebrações Especiais (3 layouts)'], 4)).toBe(false)
    expect(ehCuringaDeDia(['O Quintal Parrilla — Happy Hour (3 layouts)', '2 · Topo', 'happy-hour'])).toBe(true)
  })
  it('continua casando as formas reais', () => {
    expect(casaComDia(['Quinta-feira'], 4)).toBe(true)
    expect(casaComDia(['By Rock — Quinta'], 4)).toBe(true)
    expect(casaComDia(['Pag.01', 'Segunda-feira'], 1)).toBe(true)
    expect(casaComDia(['sabado'], 6)).toBe(true)
    expect(diasDoModelo(['Sexta é dia de churrasco'])).toEqual(['sexta'])
  })
})
