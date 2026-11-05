/**
 * Fixture comum SINTÉTICA do CP-X1: páginas com uma camada `svg-path` para a prévia do
 * /gerar-criativo. Sem dependência de Node: serve ao vitest (Konva no Node × servidor) e
 * ao harness do navegador (CanvasPreview real × servidor), em tests/harness/cp-x1.
 *
 * `amostras` são pontos em px da página com o que DEVE estar ali (fundo, tinta, furo,
 * meio do contorno) — a conferência que não depende de tolerância de borda.
 */
import type { Layer, LayerStyle } from '@/types/template'

export const FUNDO_X1 = '#ffffff'

export type Esperado = 'fundo' | 'tinta'

export interface AmostraX1 {
  nome: string
  x: number
  y: number
  esperado: Esperado
}

export interface CasoX1 {
  id: string
  descricao: string
  largura: number
  altura: number
  camada: Layer
  amostras: AmostraX1[]
}

const ANEL = 'M50 0 A50 50 0 1 1 50 100 A50 50 0 1 1 50 0 Z M50 25 A25 25 0 1 1 50 75 A25 25 0 1 1 50 25 Z'
const QUADRO = 'M10 10 L90 10 L90 90 L10 90 Z'
// triângulo no canto superior esquerdo da caixa: o espelho o leva para outro canto
const CANTO = 'M10 10 L90 10 L10 90 Z'

function camada(id: string, x: number, y: number, w: number, h: number, style: LayerStyle, extra: Partial<Layer> = {}): Layer {
  return {
    id, type: 'shape', name: id, visible: true, locked: false, order: 0,
    position: { x, y }, size: { width: w, height: h },
    style: { shapeType: 'svg-path', ...style },
    ...extra,
  }
}

export const CASOS_X1: CasoX1[] = [
  {
    id: 'anel-evenodd',
    descricao: 'anel com furo (evenodd) e contorno 4 px',
    largura: 240, altura: 240,
    camada: camada('anel-evenodd', 20, 20, 200, 200, { pathData: ANEL, pathFillRule: 'evenodd', fill: '#1a3987', strokeColor: '#000000', strokeWidth: 4 }),
    amostras: [
      { nome: 'furo', x: 120, y: 120, esperado: 'fundo' },
      { nome: 'tinta do anel', x: 120, y: 57, esperado: 'tinta' },
      { nome: 'fora (canto da caixa)', x: 30, y: 30, esperado: 'fundo' },
      { nome: 'contorno externo', x: 120, y: 21, esperado: 'tinta' },
    ],
  },
  {
    id: 'viewbox-deslocado',
    descricao: 'pathViewBox com origem 100,100 e contorno 6 px',
    largura: 240, altura: 240,
    camada: camada('viewbox-deslocado', 20, 20, 200, 200, { pathData: 'M110 110 L190 110 L190 190 L110 190 Z', pathViewBox: [100, 100, 100, 100], fill: '#8e44ad', strokeColor: '#000000', strokeWidth: 6 }),
    amostras: [
      { nome: 'interior', x: 120, y: 120, esperado: 'tinta' },
      { nome: 'fora (margem da caixa)', x: 25, y: 25, esperado: 'fundo' },
      { nome: 'contorno esquerdo', x: 40, y: 120, esperado: 'tinta' },
    ],
  },
  {
    id: 'contorno-800x200',
    descricao: 'quadro só de contorno 4 px em caixa 800×200 (anisotrópica)',
    largura: 840, altura: 240,
    camada: camada('contorno-800x200', 20, 20, 800, 200, { pathData: QUADRO, fill: 'transparent', strokeColor: '#000000', strokeWidth: 4 }),
    amostras: [
      { nome: 'contorno de cima (y=40)', x: 420, y: 40, esperado: 'tinta' },
      { nome: 'contorno da esquerda (x=100)', x: 100, y: 120, esperado: 'tinta' },
      { nome: 'dentro do quadro', x: 420, y: 120, esperado: 'fundo' },
      { nome: 'acima do contorno (y=36)', x: 420, y: 36, esperado: 'fundo' },
      { nome: 'à esquerda do contorno (x=96)', x: 96, y: 120, esperado: 'fundo' },
    ],
  },
  {
    id: 'espelho-h',
    descricao: 'triângulo de canto com flipH',
    largura: 240, altura: 240,
    camada: camada('espelho-h', 20, 20, 200, 200, { pathData: CANTO, fill: '#c0392b', flipH: true }),
    amostras: [
      { nome: 'canto superior direito', x: 190, y: 50, esperado: 'tinta' },
      // sem o espelho, este ponto seria tinta
      { nome: 'lado esquerdo', x: 45, y: 70, esperado: 'fundo' },
    ],
  },
  {
    id: 'espelho-v',
    descricao: 'triângulo de canto com flipV',
    largura: 240, altura: 240,
    camada: camada('espelho-v', 20, 20, 200, 200, { pathData: CANTO, fill: '#c0392b', flipV: true }),
    amostras: [
      { nome: 'canto inferior esquerdo', x: 50, y: 190, esperado: 'tinta' },
      // sem o espelho, este ponto seria tinta
      { nome: 'topo', x: 70, y: 45, esperado: 'fundo' },
    ],
  },
  {
    id: 'espelho-hv',
    descricao: 'triângulo de canto com flipH e flipV',
    largura: 240, altura: 240,
    camada: camada('espelho-hv', 20, 20, 200, 200, { pathData: CANTO, fill: '#c0392b', flipH: true, flipV: true }),
    amostras: [
      { nome: 'canto inferior direito', x: 190, y: 190, esperado: 'tinta' },
      { nome: 'canto superior esquerdo', x: 50, y: 50, esperado: 'fundo' },
    ],
  },
  {
    id: 'alfa',
    descricao: 'alfa da cor (rgba 0,8), do canal (fillOpacity 0,5; strokeOpacity 0,5) e da camada (opacity 0,6); cor do contorno com espaço',
    largura: 240, altura: 240,
    camada: camada('alfa', 20, 20, 200, 200, {
      pathData: QUADRO, fill: 'rgba(26, 57, 135, 0.8)', fillOpacity: 0.5, opacity: 0.6,
      strokeColor: ' #000000', strokeOpacity: 0.5, strokeWidth: 8,
    }),
    amostras: [
      { nome: 'interior (translúcido)', x: 120, y: 120, esperado: 'tinta' },
      { nome: 'fora', x: 25, y: 25, esperado: 'fundo' },
    ],
  },
  {
    id: 'rotacao',
    descricao: 'quadro com contorno 6 px girado 30° em torno de (x, y)',
    largura: 320, altura: 320,
    camada: camada('rotacao', 120, 40, 150, 100, { pathData: QUADRO, fill: '#16a085', strokeColor: '#000000', strokeWidth: 6 }, { rotation: 30 }),
    amostras: [
      // centro da caixa girada: (120,40) + R(30°)·(75,50) ≈ (160, 121)
      { nome: 'centro da caixa girada', x: 160, y: 121, esperado: 'tinta' },
      { nome: 'onde a caixa estaria sem girar (canto direito)', x: 260, y: 50, esperado: 'fundo' },
    ],
  },
]

/** Camada de texto com contorno (effects.stroke): o export não pode apagá-lo ao selecionar. */
export const TEXTO_COM_CONTORNO: CasoX1 = {
  id: 'texto-contorno',
  descricao: 'texto com effects.stroke (não é vetor: prova a raiz do export para outros tipos)',
  largura: 320, altura: 120,
  camada: {
    id: 'texto-contorno', type: 'text', name: 'texto-contorno', visible: true, locked: false, order: 0,
    position: { x: 10, y: 20 }, size: { width: 300, height: 80 }, content: 'CONTORNO',
    style: { fontSize: 56, fontFamily: 'Arial', color: '#ffffff', fontWeight: 'bold' },
    effects: { stroke: { enabled: true, strokeColor: '#c0392b', strokeWidth: 4 } },
  } as Layer,
  amostras: [],
}
