/**
 * Fixture comum SINTÉTICA do CP-V0 (sem dado de cliente, sem banco): camadas `svg-path`
 * desenhadas pelo servidor (RenderEngine) e pelo adaptador do editor (Konva).
 * Também traz a réplica do editor de antes do CP-V0 (base edb46935). Sem dependência de Node:
 * serve também à prova no navegador. A réplica do servidor de antes está em konva-no-node.ts.
 */
import type { ShapeConfig } from 'konva/lib/Shape'
import type { Layer, LayerStyle } from '@/types/template'
import { pinturaDoSvgPath, shapeKonvaDoSvgPath } from '../../desenhar'
import { tracarSvgPathNaCaixa, type CtxDeTraco, type ViewBox } from '../../tracar'

export const FUNDO = '#ffffff'

export interface Caso {
  id: string
  descricao: string
  canvas: { largura: number; altura: number }
  caixa: { x: number; y: number; largura: number; altura: number }
  pathData: string
  viewBox?: ViewBox
  fill: string
  stroke?: string
  strokeWidth: number
  fillRule?: 'nonzero' | 'evenodd'
  tracoPontas?: 'butt' | 'round'
}

// os dois subpaths no MESMO sentido: só o evenodd vaza o furo (com sentidos opostos o nonzero também vazaria)
const ANEL = 'M50 0 A50 50 0 1 1 50 100 A50 50 0 1 1 50 0 Z M50 25 A25 25 0 1 1 50 75 A25 25 0 1 1 50 25 Z'
const PENTAGRAMA = 'M50 5 L79 95 L2 40 L98 40 L21 95 Z'
const QUADRO = 'M10 10 L90 10 L90 90 L10 90 Z'
const GOTA = 'M50 5 C80 35 95 55 95 70 Q95 95 50 95 A45 45 0 0 1 5 70 C5 55 20 35 50 5 Z'

export const CASOS: Caso[] = [
  { id: 'anel-evenodd', descricao: 'anel com furo (evenodd), só preenchimento', canvas: { largura: 240, altura: 240 }, caixa: { x: 20, y: 20, largura: 200, altura: 200 }, pathData: ANEL, fill: '#1a3987', strokeWidth: 0, fillRule: 'evenodd' },
  { id: 'anel-nonzero', descricao: 'o mesmo anel com nonzero (subpaths no mesmo sentido: furo preenchido)', canvas: { largura: 240, altura: 240 }, caixa: { x: 20, y: 20, largura: 200, altura: 200 }, pathData: ANEL, fill: '#1a3987', strokeWidth: 0 },
  { id: 'estrela-evenodd', descricao: 'pentagrama evenodd (centro vazado)', canvas: { largura: 240, altura: 240 }, caixa: { x: 20, y: 20, largura: 200, altura: 200 }, pathData: PENTAGRAMA, fill: '#c0392b', strokeWidth: 0, fillRule: 'evenodd' },
  { id: 'estrela-nonzero-contorno', descricao: 'pentagrama nonzero com contorno 3 px', canvas: { largura: 240, altura: 240 }, caixa: { x: 20, y: 20, largura: 200, altura: 200 }, pathData: PENTAGRAMA, fill: '#f1c40f', stroke: '#000000', strokeWidth: 3 },
  { id: 'contorno-8px-300x100', descricao: 'quadro só de contorno 8 px em caixa 300×100', canvas: { largura: 340, altura: 140 }, caixa: { x: 20, y: 20, largura: 300, altura: 100 }, pathData: QUADRO, fill: 'transparent', stroke: '#000000', strokeWidth: 8 },
  { id: 'contorno-8px-100x300', descricao: 'quadro só de contorno 8 px em caixa 100×300', canvas: { largura: 140, altura: 340 }, caixa: { x: 20, y: 20, largura: 100, altura: 300 }, pathData: QUADRO, fill: 'transparent', stroke: '#000000', strokeWidth: 8 },
  { id: 'fio-pontas-redondas', descricao: 'fio aberto 10 px com pontas redondas', canvas: { largura: 340, altura: 100 }, caixa: { x: 20, y: 20, largura: 300, altura: 60 }, pathData: 'M5 50 L95 50', fill: 'transparent', stroke: '#000000', strokeWidth: 10, tracoPontas: 'round' },
  { id: 'gota-so-preenchimento', descricao: 'curvas C, Q e A, preenchimento sem contorno', canvas: { largura: 240, altura: 240 }, caixa: { x: 20, y: 20, largura: 200, altura: 200 }, pathData: GOTA, fill: '#16a085', strokeWidth: 0 },
  { id: 'quadro-so-preenchimento', descricao: 'retângulo, preenchimento sem contorno (sem curvas)', canvas: { largura: 240, altura: 140 }, caixa: { x: 20, y: 20, largura: 200, altura: 100 }, pathData: QUADRO, fill: '#8e44ad', strokeWidth: 0 },
  { id: 'relativo-apos-z', descricao: 'l relativo depois de Z sem M (o parser do Konva diverge do SVG; o validador recusa)', canvas: { largura: 240, altura: 240 }, caixa: { x: 20, y: 20, largura: 200, altura: 200 }, pathData: 'M10 10 L50 10 L50 50 Z l20 20', fill: 'transparent', stroke: '#000000', strokeWidth: 4 },
  { id: 'comando-invalido-no-meio', descricao: 'comando inválido (X) no meio do path: o Skia de antes parava; o parser do Konva segue', canvas: { largura: 240, altura: 240 }, caixa: { x: 20, y: 20, largura: 200, altura: 200 }, pathData: 'M10 10 L90 10 X 5 5 L90 90 Z', fill: 'transparent', stroke: '#000000', strokeWidth: 4 },
  { id: 'lixo', descricao: 'path inválido ("hello")', canvas: { largura: 120, altura: 120 }, caixa: { x: 10, y: 10, largura: 100, altura: 100 }, pathData: 'hello', fill: '#000000', strokeWidth: 0 },
]

export function estiloDo(c: Caso): LayerStyle {
  return {
    shapeType: 'svg-path',
    pathData: c.pathData,
    pathViewBox: c.viewBox,
    pathFillRule: c.fillRule,
    tracoPontas: c.tracoPontas,
    fill: c.fill,
    strokeColor: c.stroke,
    strokeWidth: c.strokeWidth,
  }
}

export function camadaDo(c: Caso): Layer {
  return {
    id: c.id, type: 'shape', name: c.id, visible: true, locked: false, order: 0,
    position: { x: c.caixa.x, y: c.caixa.y }, size: { width: c.caixa.largura, height: c.caixa.altura },
    style: estiloDo(c),
  }
}

/** O Konva.Shape que o ShapeNode do editor monta hoje (cores opacas: o editor não as altera). */
export function configKonvaDepois(c: Caso): ShapeConfig {
  return {
    x: c.caixa.x, y: c.caixa.y, width: c.caixa.largura, height: c.caixa.altura,
    ...shapeKonvaDoSvgPath(c.pathData, c.viewBox, pinturaDoSvgPath(estiloDo(c), { fill: c.fill, stroke: c.stroke, strokeWidth: c.strokeWidth })),
  }
}

/** Réplica do ShapeNode ANTES do CP-V0 (konva-layer-factory.tsx em edb46935): sem fillRule, sem lineCap. */
export function configKonvaAntes(c: Caso): ShapeConfig {
  return {
    x: c.caixa.x, y: c.caixa.y, width: c.caixa.largura, height: c.caixa.altura,
    fill: c.fill, stroke: c.stroke, strokeWidth: c.strokeWidth, lineJoin: 'round',
    sceneFunc: (ctx, shape) => {
      // o traçado de antes era o mesmo traceSvgPath (Konva.Path.parsePathData) na mesma ordem
      tracarSvgPathNaCaixa(ctx as unknown as CtxDeTraco, c.pathData, c.viewBox, shape.width(), shape.height())
      ctx.fillStrokeShape(shape)
    },
  }
}

/**
 * Inventário sintético da biblioteca: cada `svg-path` de SHAPES_LIBRARY como o painel o insere
 * (cor de vitrine, regra do item) numa caixa 200×200, e de novo com contorno de 4 px numa caixa
 * 300×100 (onde o contorno antigo do servidor divergia).
 */
export function casosDaBiblioteca(biblioteca: Array<{ id: string; shapeType: string; pathData?: string; pathFillRule?: 'nonzero' | 'evenodd'; fill: string; strokeColor?: string; strokeWidth?: number }>): Caso[] {
  return biblioteca
    .filter((s) => s.shapeType === 'svg-path' && s.pathData)
    .flatMap((s) => [
      { id: `lib-${s.id}`, descricao: `biblioteca ${s.id} (vitrine)`, canvas: { largura: 240, altura: 240 }, caixa: { x: 20, y: 20, largura: 200, altura: 200 }, pathData: s.pathData as string, fill: s.fill, stroke: s.strokeColor, strokeWidth: s.strokeWidth ?? 0, fillRule: s.pathFillRule },
      { id: `lib-${s.id}-contorno`, descricao: `biblioteca ${s.id} com contorno 4 px em 300×100`, canvas: { largura: 340, altura: 140 }, caixa: { x: 20, y: 20, largura: 300, altura: 100 }, pathData: s.pathData as string, fill: s.fill, stroke: '#000000', strokeWidth: 4, fillRule: s.pathFillRule },
    ])
}
