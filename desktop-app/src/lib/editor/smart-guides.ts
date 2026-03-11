import { resolveLayerAbsoluteFrame } from './text-layout'
import type { KonvaPage } from '@/types/template'

export interface GuideLine {
  orientation: 'horizontal' | 'vertical'
  position: number
}

interface RectBox {
  x: number
  y: number
  width: number
  height: number
}

interface SnapResult {
  x: number
  y: number
  guides: GuideLine[]
}

function getLayerRect(page: KonvaPage, layerId: string): RectBox | null {
  const layer = page.layers.find((item) => item.id === layerId)
  if (!layer) {
    return null
  }

  return resolveLayerAbsoluteFrame(page, layer)
}

export function computeSmartGuides(
  page: KonvaPage,
  layerId: string,
  rect: RectBox,
  threshold = 8,
): SnapResult {
  let nextX = rect.x
  let nextY = rect.y
  const guides: GuideLine[] = []

  const currentLeft = rect.x
  const currentCenterX = rect.x + rect.width / 2
  const currentRight = rect.x + rect.width
  const currentTop = rect.y
  const currentCenterY = rect.y + rect.height / 2
  const currentBottom = rect.y + rect.height

  const verticalTargets = [
    { value: 0, anchor: 'left' as const },
    { value: page.width / 2, anchor: 'center' as const },
    { value: page.width, anchor: 'right' as const },
  ]

  const horizontalTargets = [
    { value: 0, anchor: 'top' as const },
    { value: page.height / 2, anchor: 'center' as const },
    { value: page.height, anchor: 'bottom' as const },
  ]

  page.layers.forEach((layer) => {
    if (layer.id === layerId || layer.visible === false) {
      return
    }

    const rectBox = getLayerRect(page, layer.id)
    if (!rectBox) {
      return
    }

    verticalTargets.push(
      { value: rectBox.x, anchor: 'left' },
      { value: rectBox.x + rectBox.width / 2, anchor: 'center' },
      { value: rectBox.x + rectBox.width, anchor: 'right' },
    )

    horizontalTargets.push(
      { value: rectBox.y, anchor: 'top' },
      { value: rectBox.y + rectBox.height / 2, anchor: 'center' },
      { value: rectBox.y + rectBox.height, anchor: 'bottom' },
    )
  })

  for (const target of verticalTargets) {
    if (Math.abs(currentLeft - target.value) <= threshold) {
      nextX = target.value
      guides.push({ orientation: 'vertical', position: target.value })
      break
    }

    if (Math.abs(currentCenterX - target.value) <= threshold) {
      nextX = target.value - rect.width / 2
      guides.push({ orientation: 'vertical', position: target.value })
      break
    }

    if (Math.abs(currentRight - target.value) <= threshold) {
      nextX = target.value - rect.width
      guides.push({ orientation: 'vertical', position: target.value })
      break
    }
  }

  for (const target of horizontalTargets) {
    if (Math.abs(currentTop - target.value) <= threshold) {
      nextY = target.value
      guides.push({ orientation: 'horizontal', position: target.value })
      break
    }

    if (Math.abs(currentCenterY - target.value) <= threshold) {
      nextY = target.value - rect.height / 2
      guides.push({ orientation: 'horizontal', position: target.value })
      break
    }

    if (Math.abs(currentBottom - target.value) <= threshold) {
      nextY = target.value - rect.height
      guides.push({ orientation: 'horizontal', position: target.value })
      break
    }
  }

  return {
    x: Math.round(nextX),
    y: Math.round(nextY),
    guides,
  }
}
