import { describe, expect, it } from 'vitest'
import { lerProcedencia } from '../procedencia-da-copy'

describe('lerProcedencia — o lado "antes" do diff de copy do agendamento (REV-8AD-01)', () => {
  it('copyDeAprendizado vence slotValues: a camada escondida pelo revisor conta na proposta e não vira adição humana', () => {
    const fv = { source: 'ajuste-arte', slotValues: { headline: 'Título' }, copyDeAprendizado: { headline: 'Título', cta: 'Vem pra cá' } }
    expect(lerProcedencia(fv, null).copyProposta).toEqual({ headline: 'Título', cta: 'Vem pra cá' })
  })
  it('sem copyDeAprendizado vale slotValues; sem nenhum, null; lixo não é objeto', () => {
    expect(lerProcedencia({ slotValues: { headline: 'A' } }, null).copyProposta).toEqual({ headline: 'A' })
    expect(lerProcedencia({ slotValues: ['x'], copyDeAprendizado: 'y' }, null).copyProposta).toBeNull()
    expect(lerProcedencia(null, null).copyProposta).toBeNull()
  })
  it('sourcePageId: a coluna vence; o Json só vale fora de ajuste-arte', () => {
    expect(lerProcedencia({ sourcePageId: 'p-json' }, 'p-col').sourcePageId).toBe('p-col')
    expect(lerProcedencia({ sourcePageId: 'p-json' }, null).sourcePageId).toBe('p-json')
    expect(lerProcedencia({ source: 'ajuste-arte', sourcePageId: 'p-json' }, null).sourcePageId).toBeNull()
  })
})
