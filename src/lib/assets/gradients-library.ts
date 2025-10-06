import type { GradientStop } from '@/types/template'

export interface GradientDefinition {
  id: string
  label: string
  gradientType: 'linear' | 'radial'
  gradientAngle: number
  gradientStops: GradientStop[]
}

/**
 * Biblioteca de gradientes pré-definidos
 * - Foco inicial em gradientes preto para transparente
 */
export const GRADIENTS_LIBRARY: GradientDefinition[] = [
  {
    id: 'black-to-transparent-top',
    label: 'Preto para Transparente (Cima)',
    gradientType: 'linear',
    gradientAngle: 180, // De cima para baixo
    gradientStops: [
      { id: '1', position: 0, color: '#000000', opacity: 1 },
      { id: '2', position: 1, color: '#000000', opacity: 0 },
    ],
  },
  {
    id: 'black-to-transparent-bottom',
    label: 'Preto para Transparente (Baixo)',
    gradientType: 'linear',
    gradientAngle: 0, // De baixo para cima
    gradientStops: [
      { id: '1', position: 0, color: '#000000', opacity: 1 },
      { id: '2', position: 1, color: '#000000', opacity: 0 },
    ],
  },
]
