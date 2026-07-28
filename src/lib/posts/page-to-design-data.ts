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
  // Conteúdo endereçado a um slot inexistente era descartado em silêncio:
  // a arte saía sem o texto e ninguém ficava sabendo
  const unmatched = findUnmatchedSlotKeys(designData.layers, slotValues)
  if (unmatched.length > 0) {
    console.warn(
      `[applySlotValues] ${unmatched.length} slot(s) sem layer correspondente — o conteúdo não será aplicado: ${unmatched.join(', ')}`,
    )
  }

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

/**
 * Chaves de controle não endereçam layers — são lidas por outros pontos do
 * pipeline (ex.: `_driveImageId`, resolvido na preparação do criativo).
 * Convenção: prefixo `_`.
 */
function isControlKey(key: string): boolean {
  return key.startsWith('_')
}

/**
 * Chaves de slotValues que não casam com nenhuma layer da página, nem por id
 * nem por nome. São conteúdo que seria descartado silenciosamente na renderização
 * — normalmente um texto (CTA, pré-título) endereçado a um layout que não tem
 * aquele elemento.
 */
export function findUnmatchedSlotKeys(
  layers: Array<Pick<Layer, 'id' | 'name'>>,
  slotValues: Record<string, unknown>,
): string[] {
  const known = new Set<string>()
  for (const layer of layers) {
    if (layer?.id) known.add(layer.id)
    if (layer?.name) known.add(layer.name)
  }

  return Object.keys(slotValues).filter((key) => !isControlKey(key) && !known.has(key))
}

/**
 * Página com camada de vídeo não pode ser renderizada server-side (o render é
 * imagem estática — a camada sairia como buraco transparente). Usado como guard
 * na criação de post template-based e no story-renderer.
 */
export function pageContainsVideoLayer(layers: unknown): boolean {
  return parseLayers(layers).some((layer) => layer?.type === 'video')
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
