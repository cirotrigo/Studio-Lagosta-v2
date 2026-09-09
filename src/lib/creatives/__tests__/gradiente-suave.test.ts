import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { aplicarGradienteSuave, ID_GRADIENTE_SUAVE } from '../gradiente-suave'
const canvas = { width: 1080, height: 1920 }
const texto = (id: string, y: number): Layer => ({ id, name: id, type: 'text', order: 1, visible: true, locked: false, position: { x: 100, y }, size: { width: 500, height: 100 }, content: 'Copy intocada', style: { color: '#fff' }, effects: { background: { enabled: true, opacity: .6 }, shadow: { enabled: true } } } as Layer)
describe('preset de gradiente editável', () => {
  it('substitui só halo do topo, preservando texto, sombra e rodapé', () => {
    const layers = [texto('headline', 100), texto('servico', 1600)]
    const copia = structuredClone(layers)
    const r = aplicarGradienteSuave(layers, canvas)
    expect(layers).toEqual(copia)
    expect(r.find((l) => l.id === 'headline')).toMatchObject({ content: 'Copy intocada', style: copia[0].style, position: copia[0].position, effects: { shadow: { enabled: true } } })
    expect(r.find((l) => l.id === 'headline')?.effects?.background).toBeUndefined()
    expect(r.find((l) => l.id === 'servico')?.effects).toEqual(copia[1].effects)
    const gradient = r.find((l) => l.id === ID_GRADIENTE_SUAVE)!
    expect(gradient.type).toBe('gradient'); expect(gradient.size).toEqual({ width: 1080, height: 1200 })
    expect(gradient.order).toBeLessThan(r.find((l) => l.id === 'headline')!.order)
    expect(aplicarGradienteSuave(r, canvas)).toEqual(r)
  })
  it('não modifica texto oculto/bloqueado, nem aplica sem texto no topo', () => {
    const layers = [{ ...texto('h', 100), locked: true }, { ...texto('invisivel', 100), visible: false }, texto('servico', 1600)]
    expect(aplicarGradienteSuave(layers, canvas)).toBe(layers)
  })
  it('preserva outros gradientes e escala proporcionalmente', () => {
    const other = { ...texto('outro', 0), type: 'gradient' as const, order: 0 }
    const r = aplicarGradienteSuave([other, texto('h', 100)], { width: 720, height: 1280 })
    expect(r.find((l) => l.id === 'outro')).toEqual(other)
    expect(r.find((l) => l.id === ID_GRADIENTE_SUAVE)?.size).toEqual({ width: 720, height: 800 })
  })
})
