/**
 * Konva Alignment & Distribution Utilities
 *
 * Inspired by Figma/Canva alignment tools for professional design alignment.
 * All functions use Konva's getClientRect() which considers transformations (rotation, scale).
 */

import type Konva from 'konva'
import type { Layer } from '@/types/template'

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

/**
 * Alinha elemento(s) ao centro horizontal do canvas
 *
 * PROBLEMA IDENTIFICADO E CORRIGIDO:
 * - O cálculo anterior não considerava corretamente o anchor point dos elementos
 * - getClientRect() retorna a bounding box VISUAL (após transformações)
 * - absolutePosition() retorna o ponto de ANCORAGEM do elemento (origin)
 * - Para centralizar corretamente, precisamos mover a BOUNDING BOX para o centro
 *
 * Cenário 1 - Elemento Único:
 * - Centraliza o bounding box visual horizontalmente no canvas
 * - Mantém posição vertical (Y) inalterada
 *
 * Cenário 2 - Múltiplos Elementos:
 * - Calcula bounding box combinado de todos os elementos
 * - Centraliza o grupo inteiro mantendo posições relativas
 * - Preserva posições verticais de todos os elementos
 *
 * @param nodes - Array de nodes com suas layers correspondentes
 * @param layerInstance - Layer do Konva para batchDraw
 * @param canvasWidth - Largura do canvas para calcular centro
 */
export function alignToCanvasCenterH(
  nodes: AlignmentNode[],
  layerInstance: Konva.Layer,
  canvasWidth: number
) {
  if (nodes.length === 0) return

  const centerX = canvasWidth / 2

  if (nodes.length === 1) {
    // Cenário 1: Elemento único - centralizar diretamente
    const { node } = nodes[0]

    // CORREÇÃO CRÍTICA: Usar getClientRect com relativeTo para ignorar transformações do Stage
    const box = node.getClientRect({ relativeTo: layerInstance })
    const nodeX = node.x()
    const _nodeY = node.y()

    // Calcular onde o bounding box DEVE estar
    const targetBoxX = centerX - box.width / 2

    // Aplicar o delta à posição do node
    const deltaX = targetBoxX - box.x
    const newX = nodeX + deltaX

    node.x(newX)
  } else {
    // Cenário 2: Múltiplos elementos - centralizar grupo
    // CORREÇÃO CRÍTICA: Usar getClientRect com relativeTo para ignorar transformações do Stage
    // Calcular bounding box combinado do grupo
    let minX = Infinity
    let maxX = -Infinity

    const nodeData = nodes.map(({ node }) => {
      const box = node.getClientRect({ relativeTo: layerInstance })
      const nodeX = node.x()
      const nodeY = node.y()

      minX = Math.min(minX, box.x)
      maxX = Math.max(maxX, box.x + box.width)

      return {
        node,
        nodeX,
        nodeY,
      }
    })

    const groupCenterX = (minX + maxX) / 2
    const deltaX = centerX - groupCenterX

    // Aplicar deslocamento a todos os elementos mantendo posições relativas
    nodeData.forEach(({ node, nodeX, nodeY }) => {
      node.position({
        x: nodeX + deltaX,
        y: nodeY, // Mantém Y inalterado
      })
    })
  }

  layerInstance.batchDraw()
}

/**
 * Alinha elemento(s) ao centro vertical do canvas
 *
 * Cenário 1 - Elemento Único:
 * - Centraliza o elemento verticalmente em relação ao canvas
 * - Mantém posição horizontal (X) inalterada
 *
 * Cenário 2 - Múltiplos Elementos:
 * - Trata o grupo como uma entidade única
 * - Calcula bounding box combinado de todos os elementos
 * - Centraliza o grupo inteiro mantendo posições relativas
 * - Preserva posições horizontais de todos os elementos
 *
 * @param nodes - Array de nodes com suas layers correspondentes
 * @param layerInstance - Layer do Konva para batchDraw
 * @param canvasHeight - Altura do canvas para calcular centro
 */
export function alignToCanvasCenterV(
  nodes: AlignmentNode[],
  layerInstance: Konva.Layer,
  canvasHeight: number
) {
  if (nodes.length === 0) return

  const centerY = canvasHeight / 2

  if (nodes.length === 1) {
    // Cenário 1: Elemento único - centralizar diretamente
    const { node } = nodes[0]

    // CORREÇÃO CRÍTICA: Usar getClientRect com relativeTo para ignorar transformações do Stage
    const box = node.getClientRect({ relativeTo: layerInstance })
    const _nodeX = node.x()
    const nodeY = node.y()

    // Calcular onde o bounding box DEVE estar
    const targetBoxY = centerY - box.height / 2

    // Aplicar o delta à posição do node
    const deltaY = targetBoxY - box.y
    const newY = nodeY + deltaY

    node.y(newY)
  } else {
    // Cenário 2: Múltiplos elementos - centralizar grupo
    // CORREÇÃO CRÍTICA: Usar getClientRect com relativeTo para ignorar transformações do Stage
    // Calcular bounding box combinado do grupo
    let minY = Infinity
    let maxY = -Infinity

    const nodeData = nodes.map(({ node }) => {
      const box = node.getClientRect({ relativeTo: layerInstance })
      const nodeX = node.x()
      const nodeY = node.y()

      minY = Math.min(minY, box.y)
      maxY = Math.max(maxY, box.y + box.height)

      return {
        node,
        nodeX,
        nodeY,
      }
    })

    const groupCenterY = (minY + maxY) / 2
    const deltaY = centerY - groupCenterY

    // Aplicar deslocamento a todos os elementos mantendo posições relativas
    nodeData.forEach(({ node, nodeX, nodeY }) => {
      node.position({
        x: nodeX, // Mantém X inalterado
        y: nodeY + deltaY,
      })
    })
  }

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
