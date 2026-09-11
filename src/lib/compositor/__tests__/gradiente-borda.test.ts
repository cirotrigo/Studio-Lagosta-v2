import { describe, expect, it } from 'vitest'
import type { Layer } from '@/types/template'
import { gradientesDoProjeto, GRADIENTS_LIBRARY } from '@/lib/assets/gradients-library'
import { bordaDaCamadaDeGradiente, camadaDeGradiente, CURVA_DE_LEITURA } from '../gradiente-de-leitura'

const camadaDoPainel = (id: string, angulo: number, stops: Array<{ position: number; opacity: number }>): Layer =>
  ({
    id,
    type: 'gradient',
    name: id,
    visible: true,
    locked: false,
    order: 0,
    position: { x: 0, y: 0 },
    size: { width: 1080, height: 1920 },
    style: { gradientType: 'linear', gradientAngle: angulo, gradientStops: stops.map((s, i) => ({ id: String(i), color: '#130D0A', ...s })) },
  }) as Layer

describe('a borda forte de uma camada de gradiente', () => {
  it('lê os gradientes da marca pelo ângulo: 169° é o topo, 11° é o rodapé', () => {
    const [verdeRodape, verdeTopo] = gradientesDoProjeto(1).daMarca
    expect(bordaDaCamadaDeGradiente(camadaDoPainel('r', verdeRodape.gradientAngle, verdeRodape.gradientStops))).toBe('rodape')
    expect(bordaDaCamadaDeGradiente(camadaDoPainel('t', verdeTopo.gradientAngle, verdeTopo.gradientStops))).toBe('topo')
  })

  it('lê os presets gerais: preto para transparente de cima e de baixo', () => {
    const [cima, baixo] = GRADIENTS_LIBRARY
    expect(bordaDaCamadaDeGradiente(camadaDoPainel('c', cima.gradientAngle, cima.gradientStops))).toBe('topo')
    expect(bordaDaCamadaDeGradiente(camadaDoPainel('b', baixo.gradientAngle, baixo.gradientStops))).toBe('rodape')
  })

  it('lê o gradiente de leitura do compositor pelo segmento explícito', () => {
    const base = { W: 1080, H: 1920, altura: 800, cor: '#130D0A', curva: CURVA_DE_LEITURA, forca: 0.8 }
    expect(bordaDaCamadaDeGradiente(camadaDeGradiente({ ...base, borda: 'topo' }))).toBe('topo')
    expect(bordaDaCamadaDeGradiente(camadaDeGradiente({ ...base, borda: 'rodape' }))).toBe('rodape')
  })

  it('camada que não é gradiente ou sem paradas legíveis não tem borda', () => {
    expect(bordaDaCamadaDeGradiente({ id: 'x', type: 'text', visible: true } as Layer)).toBeNull()
    expect(bordaDaCamadaDeGradiente(camadaDoPainel('vazio', 11, []))).toBeNull()
  })
})
