/**
 * Konva Alignment & Distribution Utilities
 *
 * Inspired by Figma/Canva alignment tools for professional design alignment.
 * All functions use Konva's getClientRect() which considers transformations (rotation, scale).
 */

import type Konva from 'konva'
import type { Layer } from '@/types/template'
import { marginsForAxis } from './canvas-margin'

export interface AlignmentNode {
  node: Konva.Node
  layer: Layer
}

/**
 * HORIZONTAL ALIGNMENT
 */

export function alignLeft(nodes: AlignmentNode[], layerInstance: Konva.Layer) {
  if (nodes.length < 2) return

  // Find leftmost edge
  let minX = Infinity
  nodes.forEach(({ node }) => {
    const box = node.getClientRect()
    minX = Math.min(minX, box.x)
  })

  // Align all nodes to this edge
  nodes.forEach(({ node }) => {
    const box = node.getClientRect()
    const absPos = node.absolutePosition()
    const offsetX = absPos.x - box.x

    node.absolutePosition({
      x: minX + offsetX,
      y: absPos.y,
    })
  })

  layerInstance.batchDraw()
}

export function alignCenterH(nodes: AlignmentNode[], layerInstance: Konva.Layer) {
  if (nodes.length < 2) return

  // Calculate average center
  let totalCenterX = 0
  nodes.forEach(({ node }) => {
    const box = node.getClientRect()
    totalCenterX += box.x + box.width / 2
  })
  const avgCenterX = totalCenterX / nodes.length

  nodes.forEach(({ node }) => {
    const box = node.getClientRect()
    const absPos = node.absolutePosition()
    const offsetX = absPos.x - box.x

    const newBoxX = avgCenterX - box.width / 2
    node.absolutePosition({
      x: newBoxX + offsetX,
      y: absPos.y,
    })
  })

  layerInstance.batchDraw()
}

export function alignRight(nodes: AlignmentNode[], layerInstance: Konva.Layer) {
  if (nodes.length < 2) return

  let maxX = -Infinity
  nodes.forEach(({ node }) => {
    const box = node.getClientRect()
    maxX = Math.max(maxX, box.x + box.width)
  })

  nodes.forEach(({ node }) => {
    const box = node.getClientRect()
    const absPos = node.absolutePosition()
    const offsetX = absPos.x - box.x

    const newBoxX = maxX - box.width
    node.absolutePosition({
      x: newBoxX + offsetX,
      y: absPos.y,
    })
  })

  layerInstance.batchDraw()
}

/**
 * VERTICAL ALIGNMENT
 */

export function alignTop(nodes: AlignmentNode[], layerInstance: Konva.Layer) {
  if (nodes.length < 2) return

  let minY = Infinity
  nodes.forEach(({ node }) => {
    const box = node.getClientRect()
    minY = Math.min(minY, box.y)
  })

  nodes.forEach(({ node }) => {
    const box = node.getClientRect()
    const absPos = node.absolutePosition()
    const offsetY = absPos.y - box.y

    node.absolutePosition({
      x: absPos.x,
      y: minY + offsetY,
    })
  })

  layerInstance.batchDraw()
}

export function alignMiddleV(nodes: AlignmentNode[], layerInstance: Konva.Layer) {
  if (nodes.length < 2) return

  let totalCenterY = 0
  nodes.forEach(({ node }) => {
    const box = node.getClientRect()
    totalCenterY += box.y + box.height / 2
  })
  const avgCenterY = totalCenterY / nodes.length

  nodes.forEach(({ node }) => {
    const box = node.getClientRect()
    const absPos = node.absolutePosition()
    const offsetY = absPos.y - box.y

    const newBoxY = avgCenterY - box.height / 2
    node.absolutePosition({
      x: absPos.x,
      y: newBoxY + offsetY,
    })
  })

  layerInstance.batchDraw()
}

export function alignBottom(nodes: AlignmentNode[], layerInstance: Konva.Layer) {
  if (nodes.length < 2) return

  let maxY = -Infinity
  nodes.forEach(({ node }) => {
    const box = node.getClientRect()
    maxY = Math.max(maxY, box.y + box.height)
  })

  nodes.forEach(({ node }) => {
    const box = node.getClientRect()
    const absPos = node.absolutePosition()
    const offsetY = absPos.y - box.y

    const newBoxY = maxY - box.height
    node.absolutePosition({
      x: absPos.x,
      y: newBoxY + offsetY,
    })
  })

  layerInstance.batchDraw()
}

/**
 * DISTRIBUTION
 */

export function distributeHorizontal(nodes: AlignmentNode[], layerInstance: Konva.Layer) {
  if (nodes.length < 3) return

  // Get boxes and sort left to right
  const boxes = nodes.map(({ node }) => ({
    node,
    box: node.getClientRect(),
    absPos: node.absolutePosition(),
  }))

  boxes.sort((a, b) => a.box.x - b.box.x)

  const minX = boxes[0].box.x
  const maxX = boxes[boxes.length - 1].box.x + boxes[boxes.length - 1].box.width
  const totalWidth = boxes.reduce((sum, item) => sum + item.box.width, 0)

  // Calculate gap between shapes
  const totalSpace = maxX - minX - totalWidth
  const gap = totalSpace / (boxes.length - 1)

  // Distribute shapes (keep first and last in place)
  let currentX = minX
  boxes.forEach((item, index) => {
    if (index === 0 || index === boxes.length - 1) return

    currentX += boxes[index - 1].box.width + gap
    const offsetX = item.absPos.x - item.box.x

    item.node.absolutePosition({
      x: currentX + offsetX,
      y: item.absPos.y,
    })
  })

  layerInstance.batchDraw()
}

export function distributeVertical(nodes: AlignmentNode[], layerInstance: Konva.Layer) {
  if (nodes.length < 3) return

  const boxes = nodes.map(({ node }) => ({
    node,
    box: node.getClientRect(),
    absPos: node.absolutePosition(),
  }))

  // Sort top to bottom
  boxes.sort((a, b) => a.box.y - b.box.y)

  const minY = boxes[0].box.y
  const maxY = boxes[boxes.length - 1].box.y + boxes[boxes.length - 1].box.height
  const totalHeight = boxes.reduce((sum, item) => sum + item.box.height, 0)

  const totalSpace = maxY - minY - totalHeight
  const gap = totalSpace / (boxes.length - 1)

  let currentY = minY
  boxes.forEach((item, index) => {
    if (index === 0 || index === boxes.length - 1) return

    currentY += boxes[index - 1].box.height + gap
    const offsetY = item.absPos.y - item.box.y

    item.node.absolutePosition({
      x: item.absPos.x,
      y: currentY + offsetY,
    })
  })

  layerInstance.batchDraw()
}

/**
 * CANVAS ALIGNMENT (Align to canvas center/edges)
 */

export type AlignAxis = 'x' | 'y'
/** Início (esquerda/topo), centro ou fim (direita/base) */
export type AlignMode = 'start' | 'center' | 'end'

/**
 * Alinha a seleção às margens de segurança ou ao centro do canvas, num eixo.
 *
 * As bordas são as **guias azuis** (`CANVAS_MARGIN`), não a borda da página:
 * é onde o conteúdo deve parar para não ser cortado pela interface do
 * Instagram. No eixo vertical as margens são assimétricas (120 no topo, 100 na
 * base), então `start` e `end` usam valores diferentes — já `center` continua
 * sendo o centro da PÁGINA, não o centro da área útil: centralizar é uma
 * relação com a arte inteira, e deslocar por causa da margem surpreenderia.
 *
 * A seleção é tratada como um bloco só: calcula-se a bounding box combinada e
 * aplica-se o mesmo deslocamento a todos os nodes, preservando as posições
 * relativas. Com um elemento só, a bounding box é a dele — é o mesmo caminho,
 * sem caso especial.
 *
 * `getClientRect({ relativeTo })` é obrigatório: sem isso a caixa vem em
 * coordenadas de tela (afetadas pelo zoom) e o alinhamento erra proporcional
 * ao nível de zoom.
 */
export function alignToCanvas(
  nodes: AlignmentNode[],
  layerInstance: Konva.Layer,
  axis: AlignAxis,
  mode: AlignMode,
  canvasSize: number,
) {
  if (nodes.length === 0) return

  const dimension = axis === 'x' ? 'width' : 'height'

  let min = Infinity
  let max = -Infinity
  nodes.forEach(({ node }) => {
    const box = node.getClientRect({ relativeTo: layerInstance })
    min = Math.min(min, box[axis])
    max = Math.max(max, box[axis] + box[dimension])
  })

  const size = max - min
  // Um bloco maior que a área útil não tem para onde encostar sem estourar a
  // margem oposta; nesse caso encosta na borda da página, que é o menor dos males
  const { start, end } = marginsForAxis(axis)
  const cabe = size <= canvasSize - start - end
  const target =
    mode === 'start'
      ? cabe
        ? start
        : 0
      : mode === 'end'
        ? canvasSize - (cabe ? end : 0) - size
        : (canvasSize - size) / 2
  const delta = target - min
  if (delta === 0) return

  nodes.forEach(({ node }) => {
    node[axis](node[axis]() + delta)
  })

  layerInstance.batchDraw()
}

/**
 * LAYER ORDERING (z-index management)
 */

export function bringToFront(nodes: AlignmentNode[], allLayers: Layer[]): Layer[] {
  if (nodes.length === 0) return allLayers

  const selectedIds = new Set(nodes.map(({ layer }) => layer.id))
  const notSelected = allLayers.filter((l) => !selectedIds.has(l.id))
  const selected = nodes.map(({ layer }) => layer)

  // Move selected to end (top of stack)
  return [...notSelected, ...selected]
}

export function sendToBack(nodes: AlignmentNode[], allLayers: Layer[]): Layer[] {
  if (nodes.length === 0) return allLayers

  const selectedIds = new Set(nodes.map(({ layer }) => layer.id))
  const notSelected = allLayers.filter((l) => !selectedIds.has(l.id))
  const selected = nodes.map(({ layer }) => layer)

  // Move selected to beginning (bottom of stack)
  // Reverse to maintain relative order
  return [...selected.reverse(), ...notSelected]
}

export function moveForward(nodes: AlignmentNode[], allLayers: Layer[]): Layer[] {
  if (nodes.length === 0) return allLayers

  const _selectedIds = new Set(nodes.map(({ layer }) => layer.id))
  const result = [...allLayers]

  // Sort by current index (highest first) to avoid conflicts
  const sorted = nodes
    .map(({ layer }) => ({
      layer,
      index: result.findIndex((l) => l.id === layer.id),
    }))
    .filter((item) => item.index !== -1)
    .sort((a, b) => b.index - a.index)

  sorted.forEach(({ layer, index }) => {
    const newIndex = Math.min(index + 1, result.length - 1)
    if (newIndex !== index) {
      result.splice(index, 1)
      result.splice(newIndex, 0, layer)
    }
  })

  return result
}

export function moveBackward(nodes: AlignmentNode[], allLayers: Layer[]): Layer[] {
  if (nodes.length === 0) return allLayers

  const _selectedIds = new Set(nodes.map(({ layer }) => layer.id))
  const result = [...allLayers]

  // Sort by current index (lowest first)
  const sorted = nodes
    .map(({ layer }) => ({
      layer,
      index: result.findIndex((l) => l.id === layer.id),
    }))
    .filter((item) => item.index !== -1)
    .sort((a, b) => a.index - b.index)

  sorted.forEach(({ layer, index }) => {
    const newIndex = Math.max(index - 1, 0)
    if (newIndex !== index) {
      result.splice(index, 1)
      result.splice(newIndex, 0, layer)
    }
  })

  return result
}
