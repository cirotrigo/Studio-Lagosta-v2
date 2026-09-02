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
import { lerCamadas } from './page-layers'

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
  const layers = camadasDaPagina(page.layers, page)

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
  return camadasDaPagina(layers).some((layer) => layer?.type === 'video')
}

/**
 * `Page.layers` → `Layer[]`, pelo leitor único da casa (`page-layers.ts`),
 * que aceita as três codificações do banco — array, string JSON e a string
 * DUPLA-codificada do legado do PageSync.
 *
 * 🔴 Até 02/09/2026 isto era um `JSON.parse` de UM nível, sem `Array.isArray`:
 * na forma dupla devolvia a string interna tipada como `Layer[]`, e ela
 * seguia para `designData.layers.some(...)` e `applySlotValues` no render de
 * publicação (cron `render-stories`, executor, `renderPageAndRegister`).
 *
 * Ilegível LANÇA, nunca devolve `[]`: este é o caminho que produz a arte que
 * vai ao ar, e uma página "sem camadas" renderizaria um quadro em branco com
 * status RENDERED — pior do que falhar com o motivo escrito.
 */
function camadasDaPagina(raw: unknown, page?: { id: string; name: string }): Layer[] {
  const { camadas, legivel } = lerCamadas(raw)
  if (!legivel) {
    const quem = page ? `Página ${page.id} ("${page.name}")` : 'Página'
    throw new Error(
      `${quem} tem camadas ilegíveis (${descreverCamadas(raw)}) — ` +
        'não dá para renderizar. Abra a página no editor e salve de novo para regravar as camadas.',
    )
  }
  return camadas as unknown as Layer[]
}

function descreverCamadas(raw: unknown): string {
  if (raw === null) return 'null'
  if (typeof raw === 'string') return `string de ${raw.length} chars começando com ${JSON.stringify(raw.slice(0, 20))}`
  return typeof raw
}
