export interface ShapeDefinition {
  id: string
  label: string
  shapeType: 'rectangle' | 'rounded-rectangle' | 'circle' | 'triangle' | 'star' | 'arrow' | 'line'
  fill: string
  strokeColor?: string
  strokeWidth?: number
}

export const SHAPES_LIBRARY: ShapeDefinition[] = [
  { id: 'rectangle', label: 'Retângulo', shapeType: 'rectangle', fill: '#2563eb' },
  { id: 'rounded', label: 'Retângulo Arredondado', shapeType: 'rounded-rectangle', fill: '#10b981', strokeColor: '#0f766e' },
  { id: 'circle', label: 'Círculo', shapeType: 'circle', fill: '#f97316' },
  { id: 'triangle', label: 'Triângulo', shapeType: 'triangle', fill: '#a855f7' },
  { id: 'star', label: 'Estrela', shapeType: 'star', fill: '#facc15' },
  { id: 'arrow', label: 'Seta', shapeType: 'arrow', fill: '#ef4444' },
  { id: 'line', label: 'Linha', shapeType: 'line', fill: '#111827', strokeWidth: 6 },
]
