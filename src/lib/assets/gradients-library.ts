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

/**
 * Curva medida na arte aprovada da Real Gelateria (10/09/2026): sólida no pé,
 * passa de metade da força perto de 80% da altura e some perto do meio.
 *
 * Todas as paradas levam a MESMA cor e só a opacidade muda. Uma ponta
 * transparente em preto (`#000000` com opacidade 0) faz o editor e o render
 * interpolarem cor e opacidade separados — o meio do gradiente acinzenta. Era
 * isso que impedia refazer o verde da referência a partir do preset preto.
 */
const CURVA_REAL: Array<[number, number]> = [
  [0, 1], [0.0515, 1], [0.1097, 0.95], [0.1679, 0.82], [0.2261, 0.63],
  [0.2843, 0.44], [0.3425, 0.26], [0.4007, 0.12], [0.459, 0.04], [0.5172, 0], [1, 0],
]

function paradasDaCurva(cor: string, curva: Array<[number, number]>): GradientStop[] {
  return curva.map(([position, opacity], i) => ({ id: String(i + 1), position, color: cor, opacity }))
}

/**
 * Gradientes de uma marca só: o painel mostra estes apenas no projeto da chave.
 *
 * Inclinação de 11° (mais alto do lado do texto, à esquerda), como na arte
 * medida; o topo é o espelho vertical do rodapé (180 − 11).
 */
export const GRADIENTES_POR_PROJETO: Record<number, GradientDefinition[]> = {
  // Real Gelateria
  1: [
    { id: 'real-verde-rodape', label: 'Verde Real (rodapé)', gradientType: 'linear', gradientAngle: 11, gradientStops: paradasDaCurva('#283D36', CURVA_REAL) },
    { id: 'real-verde-topo', label: 'Verde Real (topo)', gradientType: 'linear', gradientAngle: 169, gradientStops: paradasDaCurva('#283D36', CURVA_REAL) },
    { id: 'real-creme-rodape', label: 'Creme (rodapé)', gradientType: 'linear', gradientAngle: 11, gradientStops: paradasDaCurva('#F3EADC', CURVA_REAL) },
    { id: 'real-creme-topo', label: 'Creme (topo)', gradientType: 'linear', gradientAngle: 169, gradientStops: paradasDaCurva('#F3EADC', CURVA_REAL) },
  ],
}

/** Os gradientes da marca do projeto e os que servem a todos os projetos. */
export function gradientesDoProjeto(projectId?: number | null): {
  daMarca: GradientDefinition[]
  gerais: GradientDefinition[]
} {
  const daMarca = projectId != null ? (GRADIENTES_POR_PROJETO[projectId] ?? []) : []
  return { daMarca, gerais: GRADIENTS_LIBRARY }
}
