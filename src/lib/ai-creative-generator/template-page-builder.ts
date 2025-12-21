/**
 * Template Page Builder
 * Constrói layers do Konva a partir dos layouts e dados fornecidos
 */

import type { Layer } from '@/types/template'
import type { LayoutTemplate, BrandAssets, TextsData, LayerBinding } from './layout-types'
import { createId } from '@/lib/id'
import { FONT_CONFIG } from '@/lib/font-config'

function calculatePosition(
  position: { x: string; y: string },
  dimensions: { width: number; height: number }
): { x: number; y: number } {
  const x = position.x.includes('%')
    ? (parseFloat(position.x) / 100) * dimensions.width
    : parseFloat(position.x)

  const y = position.y.includes('%')
    ? (parseFloat(position.y) / 100) * dimensions.height
    : parseFloat(position.y)

  return { x, y }
}

function calculateSize(
  size: string | number | undefined,
  dimension: number
): number {
  if (typeof size === 'number') return size
  if (typeof size === 'string' && size.includes('%')) {
    return (parseFloat(size) / 100) * dimension
  }
  return parseFloat(String(size || 0))
}

export interface BuildLayersResult {
  layers: Layer[]
  bindings: LayerBinding[]
}

export async function buildKonvaLayers(params: {
  layout: LayoutTemplate
  backgroundImageUrl: string
  brandAssets: BrandAssets
  texts: TextsData
}): Promise<BuildLayersResult> {
  const { layout, backgroundImageUrl, brandAssets, texts } = params
  const layers: Layer[] = []
  const bindings: LayerBinding[] = []

  for (const zone of layout.zones) {
    // Background image
    if (zone.type === 'image' && zone.id === 'background') {
      const layerId = createId()
      layers.push({
        id: layerId,
        type: 'image',
        name: 'Background',
        visible: true,
        locked: false,
        order: zone.layer,
        position: { x: 0, y: 0 },
        size: { width: layout.dimensions.width, height: layout.dimensions.height },
        fileUrl: backgroundImageUrl,
        style: { objectFit: zone.style?.objectFit || 'cover' },
      })
      bindings.push({ fieldName: 'background', layerId })
    }

    // Overlay rect
    else if (zone.type === 'rect' && zone.id === 'overlay') {
      const layerId = createId()
      layers.push({
        id: layerId,
        type: 'shape',
        name: 'Overlay',
        visible: true,
        locked: false,
        order: zone.layer,
        position: { x: 0, y: 0 },
        size: { width: layout.dimensions.width, height: layout.dimensions.height },
        style: {
          fill: zone.style?.fill || 'rgba(0,0,0,0.3)',
          shapeType: 'rectangle',
        },
      })
      bindings.push({ fieldName: 'overlay', layerId })
    }

    // Logo
    else if (zone.type === 'image' && zone.id === 'logo') {
      if (!brandAssets.logo) continue

      const position = calculatePosition(zone.position!, layout.dimensions)
      const maxWidth = calculateSize(zone.size?.maxWidth, layout.dimensions.width)
      const layerId = createId()

      layers.push({
        id: layerId,
        type: 'logo',
        name: 'Logo',
        visible: true,
        locked: false,
        order: zone.layer,
        position: { x: position.x, y: position.y },
        size: { width: maxWidth || 200, height: zone.size?.maxHeight as number || 100 },
        fileUrl: brandAssets.logo.fileUrl,
        style: { objectFit: 'contain' },
      })
      bindings.push({ fieldName: 'logo', layerId })
    }

    // Text layers
    else if (zone.type === 'text' && zone.textField) {
      const textField = zone.textField
      const textContent = texts[textField]

      // Se texto vazio, NÃO criar camada
      if (!textContent || textContent.trim() === '') continue

      const position = calculatePosition(zone.position!, layout.dimensions)
      const font = brandAssets.fonts?.[0]?.fontFamily || FONT_CONFIG.DEFAULT_FONT

      // Usar cor da marca se disponível, senão fallback
      let fillColor = zone.style?.fill || '#FFFFFF'
      if (zone.id === 'cta' || zone.id === 'badge') {
        fillColor = brandAssets.colors?.[0]?.hexCode || zone.style?.fill || '#FF0000'
      }

      const layerId = createId()

      const width = zone.style?.width
        ? calculateSize(zone.style.width, layout.dimensions.width)
        : undefined

      layers.push({
        id: layerId,
        type: 'text',
        name: capitalizeFieldName(textField),
        visible: true,
        locked: false,
        order: zone.layer,
        position: { x: position.x, y: position.y },
        size: { width: width || 500, height: 100 },
        content: textContent,
        style: {
          fontSize: zone.style?.fontSize || 48,
          fontFamily: font,
          fontWeight: (zone.style?.fontWeight as string) || 'normal',
          color: fillColor,
          textAlign: zone.style?.align || 'center',
          textTransform: zone.style?.textTransform,
        },
        rotation: zone.style?.rotation || 0,
        effects: zone.style?.stroke
          ? {
              stroke: {
                enabled: true,
                strokeColor: zone.style.stroke,
                strokeWidth: zone.style.strokeWidth || 0,
              },
            }
          : undefined,
      })

      bindings.push({ fieldName: textField, layerId })
    }
  }

  // Ordenar por layer order
  layers.sort((a, b) => (a.order || 0) - (b.order || 0))

  return { layers, bindings }
}

function capitalizeFieldName(field: string): string {
  return field.charAt(0).toUpperCase() + field.slice(1)
}
