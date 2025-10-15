import type Konva from 'konva'
import type { Page } from '@/types/template'

interface ThumbnailOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
}

/**
 * Gera um thumbnail de uma página Konva
 * @param stage - Instância do Stage Konva
 * @param page - Dados da página
 * @param options - Opções de geração
 * @returns DataURL do thumbnail em JPEG
 */
export async function generatePageThumbnail(
  stage: Konva.Stage | null,
  page: Page,
  options: ThumbnailOptions = {}
): Promise<string | null> {
  if (!stage) {
    console.warn('[generatePageThumbnail] Stage não disponível')
    return null
  }

  const { maxWidth = 150, maxHeight = 200, quality = 0.7 } = options

  // Salvar estado atual do stage
  const previousScale = stage.scaleX()
  const previousPosition = { x: stage.x(), y: stage.y() }

  try {
    // Normalizar zoom para 100%
    stage.scale({ x: 1, y: 1 })
    stage.position({ x: 0, y: 0 })

    // Aguardar frame para aplicar mudanças
    await new Promise((resolve) => requestAnimationFrame(resolve))

    // Ocultar guides temporariamente
    const guidesLayer = stage.findOne('.guides-layer')
    const guidesWasVisible = guidesLayer?.visible() ?? false
    if (guidesLayer) {
      guidesLayer.visible(false)
    }

    // Forçar redraw
    stage.batchDraw()
    await new Promise((resolve) => requestAnimationFrame(resolve))

    // Calcular dimensões do thumbnail mantendo aspect ratio
    const aspectRatio = page.width / page.height
    let thumbWidth = maxWidth
    let thumbHeight = Math.round(maxWidth / aspectRatio)

    // Se altura calculada for muito grande, ajustar pela altura
    if (thumbHeight > maxHeight) {
      thumbHeight = maxHeight
      thumbWidth = Math.round(maxHeight * aspectRatio)
    }

    // Gerar thumbnail
    const dataUrl = stage.toDataURL({
      pixelRatio: thumbWidth / page.width,
      mimeType: 'image/jpeg',
      quality,
      x: 0,
      y: 0,
      width: page.width,
      height: page.height,
    })

    // Restaurar guides
    if (guidesLayer) {
      guidesLayer.visible(guidesWasVisible)
    }

    return dataUrl
  } catch (error) {
    console.error('[generatePageThumbnail] Erro ao gerar thumbnail:', error)
    return null
  } finally {
    // Restaurar estado original
    stage.scale({ x: previousScale, y: previousScale })
    stage.position(previousPosition)
    stage.batchDraw()
  }
}

/**
 * Gera thumbnail com debounce para evitar muitas gerações
 */
export function createDebouncedThumbnailGenerator(delay = 500) {
  let timeoutId: NodeJS.Timeout | null = null

  return function debouncedGenerate(
    stage: Konva.Stage | null,
    page: Page,
    callback: (thumbnail: string | null) => void,
    options?: ThumbnailOptions
  ) {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    timeoutId = setTimeout(async () => {
      const thumbnail = await generatePageThumbnail(stage, page, options)
      callback(thumbnail)
      timeoutId = null
    }, delay)
  }
}
