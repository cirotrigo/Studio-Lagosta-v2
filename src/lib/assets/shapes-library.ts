/**
 * Biblioteca de formas do editor.
 *
 * Formas novas entram como `shapeType: 'svg-path'` com `pathData` normalizado
 * em viewBox 0 0 100 100 — uma forma nova é UMA entrada de dados, sem case
 * novo no editor nem no render (os dois lados desenham o path escalado para a
 * caixa da camada; ver ShapeNode e RenderEngine.renderShape).
 *
 * Os sete tipos legados (rectangle/circle/…) continuam existindo para as
 * camadas antigas já persistidas.
 */

export interface ShapeDefinition {
  id: string
  label: string
  shapeType: 'rectangle' | 'rounded-rectangle' | 'circle' | 'triangle' | 'star' | 'arrow' | 'line' | 'svg-path'
  category: 'basicas' | 'setas' | 'linhas' | 'decorativas'
  keywords?: string[]
  fill: string
  strokeColor?: string
  strokeWidth?: number
  /** SVG path d em viewBox 0 0 100 100 (apenas shapeType 'svg-path') */
  pathData?: string
  pathFillRule?: 'nonzero' | 'evenodd'
  /** Apenas shapeType 'line' */
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  lineStartCap?: 'none' | 'arrow'
  lineEndCap?: 'none' | 'arrow'
  /** Proporção sugerida ao inserir (largura/altura). Default 1. */
  aspect?: number
}

const AZUL = '#2563eb'
const CINZA = '#374151'

export const SHAPES_LIBRARY: ShapeDefinition[] = [
  // ── Básicas (legadas + novas) ───────────────────────────────────────────
  { id: 'rectangle', label: 'Retângulo', shapeType: 'rectangle', category: 'basicas', keywords: ['quadrado', 'caixa'], fill: AZUL },
  { id: 'rounded', label: 'Retângulo Arredondado', shapeType: 'rounded-rectangle', category: 'basicas', keywords: ['caixa', 'cartao'], fill: AZUL },
  { id: 'circle', label: 'Círculo', shapeType: 'circle', category: 'basicas', keywords: ['bola', 'redondo'], fill: AZUL },
  { id: 'triangle', label: 'Triângulo', shapeType: 'triangle', category: 'basicas', fill: AZUL },
  { id: 'star', label: 'Estrela', shapeType: 'star', category: 'basicas', keywords: ['favorito'], fill: AZUL },
  { id: 'diamond', label: 'Losango', shapeType: 'svg-path', category: 'basicas', keywords: ['diamante'], fill: AZUL, pathData: 'M50 0 L100 50 L50 100 L0 50 Z' },
  { id: 'pentagon', label: 'Pentágono', shapeType: 'svg-path', category: 'basicas', fill: AZUL, pathData: 'M50 0 L97.6 34.5 L79.4 90.5 L20.6 90.5 L2.4 34.5 Z' },
  { id: 'hexagon', label: 'Hexágono', shapeType: 'svg-path', category: 'basicas', fill: AZUL, pathData: 'M50 0 L93.3 25 L93.3 75 L50 100 L6.7 75 L6.7 25 Z' },
  { id: 'octagon', label: 'Octógono', shapeType: 'svg-path', category: 'basicas', fill: AZUL, pathData: 'M29 0 H71 L100 29 V71 L71 100 H29 L0 71 V29 Z' },
  { id: 'trapezoid', label: 'Trapézio', shapeType: 'svg-path', category: 'basicas', fill: AZUL, pathData: 'M20 0 H80 L100 100 H0 Z' },
  { id: 'parallelogram', label: 'Paralelogramo', shapeType: 'svg-path', category: 'basicas', fill: AZUL, pathData: 'M25 0 H100 L75 100 H0 Z' },
  { id: 'semicircle', label: 'Semicírculo', shapeType: 'svg-path', category: 'basicas', keywords: ['meia lua', 'arco'], fill: AZUL, pathData: 'M0 100 A50 50 0 0 1 100 100 Z', aspect: 2 },
  { id: 'ring', label: 'Anel', shapeType: 'svg-path', category: 'basicas', keywords: ['circulo vazado', 'donut'], fill: AZUL, pathFillRule: 'evenodd', pathData: 'M50 0 A50 50 0 1 0 50 100 A50 50 0 1 0 50 0 Z M50 25 A25 25 0 1 1 50 75 A25 25 0 1 1 50 25 Z' },
  { id: 'cross', label: 'Cruz', shapeType: 'svg-path', category: 'basicas', keywords: ['mais', 'soma'], fill: AZUL, pathData: 'M35 0 H65 V35 H100 V65 H65 V100 H35 V65 H0 V35 H35 Z' },

  // ── Setas ───────────────────────────────────────────────────────────────
  { id: 'arrow', label: 'Seta (fina)', shapeType: 'arrow', category: 'setas', fill: CINZA, aspect: 1.8 },
  { id: 'arrow-right', label: 'Seta direita', shapeType: 'svg-path', category: 'setas', fill: CINZA, pathData: 'M0 35 H60 V15 L100 50 L60 85 V65 H0 Z', aspect: 1.6 },
  { id: 'arrow-left', label: 'Seta esquerda', shapeType: 'svg-path', category: 'setas', fill: CINZA, pathData: 'M100 35 H40 V15 L0 50 L40 85 V65 H100 Z', aspect: 1.6 },
  { id: 'arrow-up', label: 'Seta cima', shapeType: 'svg-path', category: 'setas', fill: CINZA, pathData: 'M35 100 V40 H15 L50 0 L85 40 H65 V100 Z', aspect: 0.7 },
  { id: 'arrow-down', label: 'Seta baixo', shapeType: 'svg-path', category: 'setas', fill: CINZA, pathData: 'M35 0 V60 H15 L50 100 L85 60 H65 V0 Z', aspect: 0.7 },
  { id: 'chevron-right', label: 'Chevron', shapeType: 'svg-path', category: 'setas', fill: CINZA, pathData: 'M0 0 H60 L100 50 L60 100 H0 L40 50 Z', aspect: 1.4 },

  // ── Linhas ──────────────────────────────────────────────────────────────
  { id: 'line', label: 'Linha', shapeType: 'line', category: 'linhas', fill: '#111827', strokeWidth: 6, aspect: 6 },
  { id: 'line-dashed', label: 'Linha tracejada', shapeType: 'line', category: 'linhas', fill: '#111827', strokeWidth: 6, lineStyle: 'dashed', aspect: 6 },
  { id: 'line-dotted', label: 'Linha pontilhada', shapeType: 'line', category: 'linhas', fill: '#111827', strokeWidth: 6, lineStyle: 'dotted', aspect: 6 },
  { id: 'line-arrow', label: 'Linha com seta', shapeType: 'line', category: 'linhas', fill: '#111827', strokeWidth: 6, lineEndCap: 'arrow', aspect: 6 },
  { id: 'line-arrow-both', label: 'Linha com 2 setas', shapeType: 'line', category: 'linhas', fill: '#111827', strokeWidth: 6, lineStartCap: 'arrow', lineEndCap: 'arrow', aspect: 6 },

  // ── Decorativas ─────────────────────────────────────────────────────────
  { id: 'heart', label: 'Coração', shapeType: 'svg-path', category: 'decorativas', keywords: ['amor', 'like'], fill: '#e11d48', pathData: 'M50 92 L15 57 A22 22 0 1 1 50 26 A22 22 0 1 1 85 57 Z' },
  { id: 'sparkle', label: 'Brilho', shapeType: 'svg-path', category: 'decorativas', keywords: ['estrela 4', 'shine'], fill: '#f59e0b', pathData: 'M50 0 L61 39 L100 50 L61 61 L50 100 L39 61 L0 50 L39 39 Z' },
  { id: 'burst', label: 'Explosão', shapeType: 'svg-path', category: 'decorativas', keywords: ['selo', 'promo', 'splash'], fill: '#f59e0b', pathData: 'M50 0 L59 32 L85 15 L68 41 L100 50 L68 59 L85 85 L59 68 L50 100 L41 68 L15 85 L32 59 L0 50 L32 41 L15 15 L41 32 Z' },
  { id: 'bolt', label: 'Raio', shapeType: 'svg-path', category: 'decorativas', keywords: ['energia', 'flash'], fill: '#f59e0b', pathData: 'M60 0 L15 55 H40 L35 100 L85 40 H55 Z' },
  { id: 'drop', label: 'Gota', shapeType: 'svg-path', category: 'decorativas', keywords: ['agua', 'pingo'], fill: '#0ea5e9', pathData: 'M50 0 Q85 45 85 65 A35 35 0 1 1 15 65 Q15 45 50 0 Z' },
  { id: 'pin', label: 'Pin de local', shapeType: 'svg-path', category: 'decorativas', keywords: ['mapa', 'endereco', 'localizacao'], fill: '#e11d48', pathData: 'M50 0 A35 35 0 0 1 85 35 Q85 60 50 100 Q15 60 15 35 A35 35 0 0 1 50 0 Z', aspect: 0.75 },
  { id: 'speech', label: 'Balão de fala', shapeType: 'svg-path', category: 'decorativas', keywords: ['comentario', 'chat'], fill: AZUL, pathData: 'M15 5 H85 Q95 5 95 15 V60 Q95 70 85 70 H45 L25 90 V70 H15 Q5 70 5 60 V15 Q5 5 15 5 Z', aspect: 1.2 },
  { id: 'cloud', label: 'Nuvem', shapeType: 'svg-path', category: 'decorativas', fill: '#94a3b8', pathData: 'M25 80 A18 18 0 0 1 20 45 A22 22 0 0 1 60 30 A18 18 0 0 1 92 55 A15 15 0 0 1 80 80 Z', aspect: 1.5 },
  { id: 'blob', label: 'Blob orgânico', shapeType: 'svg-path', category: 'decorativas', keywords: ['organico', 'mancha'], fill: '#a855f7', pathData: 'M83 20 Q100 40 92 63 Q84 86 58 93 Q32 100 16 80 Q0 60 10 37 Q20 14 47 8 Q70 3 83 20 Z' },
  { id: 'shield', label: 'Escudo', shapeType: 'svg-path', category: 'decorativas', keywords: ['seguro', 'protecao'], fill: '#10b981', pathData: 'M50 0 L95 15 V45 Q95 80 50 100 Q5 80 5 45 V15 Z' },
  { id: 'tag', label: 'Etiqueta', shapeType: 'svg-path', category: 'decorativas', keywords: ['preco', 'oferta'], fill: '#f97316', pathData: 'M0 0 H55 L100 45 L55 100 L0 55 Z M22 22 A8 8 0 1 0 22 38 A8 8 0 1 0 22 22 Z', pathFillRule: 'evenodd' },
  { id: 'banner', label: 'Faixa', shapeType: 'svg-path', category: 'decorativas', keywords: ['fita', 'ribbon'], fill: '#e11d48', pathData: 'M0 20 H100 V80 H0 L15 50 Z', aspect: 2.2 },
]

export const SHAPE_CATEGORIES: Array<{ id: ShapeDefinition['category']; label: string }> = [
  { id: 'basicas', label: 'Básicas' },
  { id: 'setas', label: 'Setas' },
  { id: 'linhas', label: 'Linhas' },
  { id: 'decorativas', label: 'Decorativas' },
]
