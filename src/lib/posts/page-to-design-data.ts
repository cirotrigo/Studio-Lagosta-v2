/**
 * Converts a Page record (from database) into DesignData format
 * for use with the RenderEngine.
 *
 * The Page.layers JSON in the database already uses the same structure
 * as DesignData.layers (position: {x,y}, size: {width,height}, content, style, etc.)
 * — confirmed by the working generate-creatives.ts pipeline.
 *
 * This converter handles:
 * 1. Wrapping page fields into DesignData canvas config
 * 2. Parsing layers JSON if stored as string
 * 3. Applying slotValues (dynamic text/image substitution)
 */

import type { DesignData, Layer } from '@/types/template'

interface PageRecord {
  id: string
  name: string
  width: number
  height: number
  layers: unknown // Json field from Prisma
  background?: string | null
}

/**
 * Convert a Page database record to DesignData for rendering.
 */
export function convertPageToDesignData(page: PageRecord): DesignData {
  const layers = parseLayers(page.layers)

  return {
    canvas: {
      width: page.width,
      height: page.height,
      backgroundColor: page.background ?? '#ffffff',
    },
    layers,
  }
}

/**
 * Apply slot values to design data layers.
 * Slot values allow overriding dynamic layer content (text, images)
 * without modifying the template itself.
 *
 * slotValues format:
 * {
 *   "layerId-or-name": { content?: string, fileUrl?: string },
 *   // OR simple string shorthand for text content:
 *   "layerId-or-name": "replacement text"
 * }
 */
export function applySlotValues(
  designData: DesignData,
  slotValues: Record<string, unknown>,
): DesignData {
  const layers = designData.layers.map((layer) => {
    // Match by layer ID or name
    const slot = slotValues[layer.id] ?? slotValues[layer.name]
    if (!slot) return layer

    const updated = { ...layer }

    if (typeof slot === 'string') {
      // Simple string: replace text content
      updated.content = slot
    } else if (typeof slot === 'object' && slot !== null) {
      const slotObj = slot as Record<string, unknown>
      if (typeof slotObj.content === 'string') {
        updated.content = slotObj.content
      }
      if (typeof slotObj.fileUrl === 'string') {
        updated.fileUrl = slotObj.fileUrl
      }
    }

    return updated
  })

  return { ...designData, layers }
}

function parseLayers(layers: unknown): Layer[] {
  if (typeof layers === 'string') {
    try {
      return JSON.parse(layers) as Layer[]
    } catch {
      console.error('Failed to parse layers JSON string')
      return []
    }
  }
  if (Array.isArray(layers)) {
    return layers as Layer[]
  }
  return []
}
