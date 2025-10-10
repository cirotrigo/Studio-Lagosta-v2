import Konva from 'konva'
import type { Layer, DesignData } from '@/types/template'

export interface VideoExportOptions {
  fps?: number // Frames por segundo (padrão: 30)
  duration?: number // Duração em segundos
  format?: 'webm' | 'mp4' // Formato de saída
  quality?: number // Qualidade (0-1)
}

export interface VideoExportProgress {
  phase: 'preparing' | 'recording' | 'finalizing' | 'converting'
  progress: number // 0-100
}

interface StageCleanupState {
  previousSelection: string[]
  previousZoom: number
  previousPosition: { x: number; y: number }
  guidesWasVisible: boolean
  invisibleLayersState: Array<{
    node: any
    originalOpacity: number
    originalVisible: boolean
  }>
}

/**
 * Prepara o stage para exportação limpa (sem guides, transformers, etc)
 * Baseado na função exportDesign do template-editor-context.tsx
 */
async function prepareStageForExport(
  stage: Konva.Stage,
  design: DesignData,
  setSelectedLayerIds: (ids: string[]) => void,
  selectedLayerIdsRef: React.MutableRefObject<string[]>,
  zoom: number,
  setZoomState: (zoom: number) => void
): Promise<StageCleanupState> {
  // Salvar estado atual
  const previousSelection = [...selectedLayerIdsRef.current]
  const previousZoom = zoom
  const previousPosition = { x: stage.x(), y: stage.y() }

  const invisibleLayersState: Array<{
    node: any
    originalOpacity: number
    originalVisible: boolean
  }> = []

  // 1. Limpar seleção para ocultar transformers
  setSelectedLayerIds([])

  // 2. Aguardar próximo frame para React atualizar
  await new Promise((resolve) => requestAnimationFrame(resolve))

  // 3. Normalizar zoom para 100% (escala 1:1)
  setZoomState(1)
  stage.scale({ x: 1, y: 1 })
  stage.position({ x: 0, y: 0 })

  // 4. Aguardar frame para zoom ser aplicado
  await new Promise((resolve) => requestAnimationFrame(resolve))

  // 5. Ocultar camada de guides temporariamente
  const guidesLayer = stage.findOne('.guides-layer')
  const guidesWasVisible = guidesLayer?.visible() ?? false
  if (guidesLayer) {
    guidesLayer.visible(false)
  }

  // 6. Ocultar completamente camadas invisíveis (visible: false)
  const contentLayer = stage.findOne('.content-layer') as Konva.Layer | undefined

  if (contentLayer) {
    const children = (contentLayer as Konva.Layer).getChildren()

    children.forEach((node: any) => {
      const layerId = node.id()
      const layer = design.layers.find((l) => l.id === layerId)

      // Se a camada está marcada como invisível, ocultar completamente para exportação
      if (layer && layer.visible === false) {
        // Salvar estado original
        invisibleLayersState.push({
          node,
          originalOpacity: node.opacity(),
          originalVisible: node.visible(),
        })

        // Ocultar node do Konva
        node.visible(false)
      }
    })
  }

  // 7. Forçar redraw para aplicar mudanças
  stage.batchDraw()

  // 8. Aguardar frame para garantir que mudanças foram aplicadas
  await new Promise((resolve) => requestAnimationFrame(resolve))

  return {
    previousSelection,
    previousZoom,
    previousPosition,
    guidesWasVisible,
    invisibleLayersState,
  }
}

/**
 * Restaura o stage ao estado original após exportação
 */
function restoreStageState(
  stage: Konva.Stage,
  cleanupState: StageCleanupState,
  setSelectedLayerIds: (ids: string[]) => void,
  setZoomState: (zoom: number) => void
): void {
  const { previousSelection, previousZoom, previousPosition, guidesWasVisible, invisibleLayersState } =
    cleanupState

  // Restaurar estado das camadas invisíveis PRIMEIRO
  invisibleLayersState.forEach(({ node, originalOpacity, originalVisible }) => {
    node.opacity(originalOpacity)
    node.visible(originalVisible)
  })

  // Restaurar visibilidade dos guides
  const guidesLayer = stage.findOne('.guides-layer')
  if (guidesLayer) {
    guidesLayer.visible(guidesWasVisible)
  }

  // Restaurar zoom, posição e seleção original
  setZoomState(previousZoom)
  stage.scale({ x: previousZoom, y: previousZoom })
  stage.position(previousPosition)
  stage.batchDraw()
  setSelectedLayerIds(previousSelection)
}

/**
 * Exporta o vídeo com todas as layers sobrepostas usando MediaRecorder API
 * IMPORTANTE: Requer funções do React Context para limpar seleção e zoom
 *
 * @param stage - Konva Stage contendo o vídeo e layers
 * @param videoLayer - Layer do vídeo base
 * @param design - Design data com layers e canvas
 * @param contextFunctions - Funções do template editor context
 * @param options - Opções de exportação
 * @returns Blob do vídeo exportado
 */
export async function exportVideoWithLayers(
  stage: Konva.Stage,
  videoLayer: Layer,
  design: DesignData,
  contextFunctions: {
    setSelectedLayerIds: (ids: string[]) => void
    selectedLayerIdsRef: React.MutableRefObject<string[]>
    zoom: number
    setZoomState: (zoom: number) => void
  },
  options: VideoExportOptions = {},
  onProgress?: (progress: VideoExportProgress) => void
): Promise<Blob> {
  const { fps = 30, duration, format = 'webm', quality = 0.8 } = options

  onProgress?.({ phase: 'preparing', progress: 0 })

  // Verificar se o stage está disponível
  if (!stage) {
    throw new Error('Stage não disponível para exportação')
  }

  let cleanupState: StageCleanupState | null = null

  try {
    // Preparar stage (remover guides, transformers, normalizar zoom)
    cleanupState = await prepareStageForExport(
      stage,
      design,
      contextFunctions.setSelectedLayerIds,
      contextFunctions.selectedLayerIdsRef,
      contextFunctions.zoom,
      contextFunctions.setZoomState
    )

    onProgress?.({ phase: 'preparing', progress: 20 })

    // Obter o vídeo element
    const videoNode = stage.findOne(`#${videoLayer.id}`) as Konva.Image | null
    if (!videoNode) {
      throw new Error('VideoNode não encontrado no stage')
    }

    const videoElement = videoNode.image() as HTMLVideoElement
    if (!videoElement) {
      throw new Error('Elemento de vídeo não encontrado')
    }

    // Calcular duração do vídeo
    const videoDuration =
      duration || videoLayer.videoMetadata?.duration || videoElement.duration || 10

    // Posicionar vídeo no início
    videoElement.currentTime = 0
    await new Promise<void>((resolve) => {
      videoElement.addEventListener('seeked', () => resolve(), { once: true })
    })

    onProgress?.({ phase: 'preparing', progress: 30 })

    // IMPORTANTE: Konva usa múltiplos canvas (um por layer)
    // Precisamos criar um canvas offscreen que combina todos os layers
    const stageWidth = stage.width()
    const stageHeight = stage.height()

    // Criar canvas offscreen para composição
    const offscreenCanvas = document.createElement('canvas')
    offscreenCanvas.width = stageWidth
    offscreenCanvas.height = stageHeight
    const offscreenCtx = offscreenCanvas.getContext('2d', {
      alpha: false, // Sem transparência = melhor performance
      willReadFrequently: false,
    })

    if (!offscreenCtx) {
      throw new Error('Falha ao criar contexto do canvas offscreen')
    }

    // Preencher fundo branco (ou usar cor de fundo do design)
    offscreenCtx.fillStyle = design.canvas.backgroundColor || '#FFFFFF'
    offscreenCtx.fillRect(0, 0, stageWidth, stageHeight)


    // Verificar suporte a MediaRecorder (sempre WebM)
    const mimeType = 'video/webm;codecs=vp9'

    // Fallback para vp8 se vp9 não for suportado
    const finalMimeType = MediaRecorder.isTypeSupported(mimeType)
      ? mimeType
      : 'video/webm;codecs=vp8'

    if (!MediaRecorder.isTypeSupported(finalMimeType)) {
      throw new Error(
        'Seu navegador não suporta gravação de vídeo. Por favor, use Chrome, Firefox ou Edge.'
      )
    }

    onProgress?.({ phase: 'preparing', progress: 40 })

    // Criar stream do canvas offscreen
    const stream = offscreenCanvas.captureStream(fps)

    // Configurar MediaRecorder
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: finalMimeType,
      videoBitsPerSecond: quality * 5_000_000, // 5 Mbps max
    })

    const chunks: Blob[] = []
    let isRecording = false

    // Coletar chunks de vídeo
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data)
      }
    }

    // Configurar callback de start
    mediaRecorder.onstart = () => {
      isRecording = true
    }

    mediaRecorder.onerror = (e) => {
      console.error('[Video Export] Erro no MediaRecorder:', e)
    }

    onProgress?.({ phase: 'recording', progress: 50 })

    // Iniciar gravação ANTES de reproduzir o vídeo
    mediaRecorder.start(100) // Capturar chunks a cada 100ms

    // Aguardar start com timeout
    await new Promise((resolve) => setTimeout(resolve, 200))

    // Posicionar vídeo no início e reproduzir
    videoElement.currentTime = 0

    try {
      await videoElement.play()
    } catch (error) {
      console.error('[Video Export] Erro ao reproduzir vídeo:', error)
      throw new Error('Falha ao reproduzir vídeo: ' + (error instanceof Error ? error.message : 'erro desconhecido'))
    }

    // Loop de animação para copiar o stage para o canvas offscreen frame por frame
    let animationId: number | null = null
    let frameCount = 0
    const startTime = Date.now()

    const animationLoop = () => {
      // 1. Forçar redraw do stage para atualizar com frame atual do vídeo
      stage.batchDraw()

      // 2. Copiar o stage renderizado para o canvas offscreen
      // Usar toCanvas() que retorna um snapshot do stage completo (todas as layers compostas)
      const stageSnapshot = stage.toCanvas()

      // 3. Limpar canvas offscreen e desenhar o snapshot
      offscreenCtx.fillStyle = design.canvas.backgroundColor || '#FFFFFF'
      offscreenCtx.fillRect(0, 0, stageWidth, stageHeight)
      offscreenCtx.drawImage(stageSnapshot, 0, 0)

      frameCount++

      const elapsed = (Date.now() - startTime) / 1000
      if (elapsed < videoDuration) {
        animationId = requestAnimationFrame(animationLoop)
      }
    }

    // Iniciar loop de animação
    animationId = requestAnimationFrame(animationLoop)

    // Aguardar duração especificada
    await new Promise<void>((resolve) => {
      const progressInterval = setInterval(() => {
        const currentProgress = (videoElement.currentTime / videoDuration) * 100
        onProgress?.({ phase: 'recording', progress: 50 + currentProgress * 0.35 })
      }, 100)

      setTimeout(() => {
        clearInterval(progressInterval)

        // Parar loop de animação
        if (animationId !== null) {
          cancelAnimationFrame(animationId)
        }

        videoElement.pause()
        isRecording = false

        // Aguardar um pouco antes de parar para garantir que último frame foi capturado
        setTimeout(() => {
          mediaRecorder.stop()
          resolve()
        }, 200)
      }, videoDuration * 1000)
    })

    onProgress?.({ phase: 'finalizing', progress: 85 })

    // Aguardar finalização do MediaRecorder
    await new Promise<void>((resolve) => {
      mediaRecorder.onstop = () => resolve()
    })

    // Gerar blob WebM
    const webmBlob = new Blob(chunks, { type: finalMimeType })

    // Se formato solicitado for MP4, converter (nota: conversão client-side não é trivial)
    // Por enquanto, sempre retornamos WebM
    // TODO: Implementar conversão server-side para MP4 se necessário
    if (format === 'mp4') {
      onProgress?.({ phase: 'converting', progress: 90 })
      console.warn(
        '[exportVideoWithLayers] Conversão para MP4 não implementada. Retornando WebM.'
      )
    }

    onProgress?.({ phase: 'finalizing', progress: 100 })

    return webmBlob
  } finally {
    // Sempre restaurar estado do stage
    if (cleanupState) {
      restoreStageState(
        stage,
        cleanupState,
        contextFunctions.setSelectedLayerIds,
        contextFunctions.setZoomState
      )
    }
  }
}

/**
 * Gera um thumbnail estático do vídeo no frame atual
 *
 * @param stage - Konva Stage
 * @param videoLayer - Layer do vídeo
 * @returns Data URL do thumbnail
 */
export async function generateVideoThumbnail(
  stage: Konva.Stage,
  videoLayer: Layer
): Promise<string> {
  if (!stage) {
    throw new Error('Stage não disponível')
  }

  // Encontrar o VideoNode no stage
  const videoNode = stage.findOne(`#${videoLayer.id}`) as Konva.Image | null

  if (!videoNode) {
    throw new Error('VideoNode não encontrado')
  }

  // Aguardar frame válido do vídeo
  const video = videoNode.image() as HTMLVideoElement

  await new Promise<void>((resolve) => {
    if (video.readyState >= 2) {
      resolve()
    } else {
      video.addEventListener('loadeddata', () => resolve(), { once: true })
    }
  })

  // Gerar thumbnail do stage atual
  const dataURL = stage.toDataURL({
    pixelRatio: 1,
    mimeType: 'image/jpeg',
    quality: 0.8,
  })

  return dataURL
}

/**
 * Verifica se o navegador suporta exportação de vídeo
 */
export function checkVideoExportSupport(): {
  supported: boolean
  message?: string
} {
  if (typeof MediaRecorder === 'undefined') {
    return {
      supported: false,
      message: 'MediaRecorder API não disponível neste navegador',
    }
  }

  const webmVp9 = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
  const webmVp8 = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')

  if (!webmVp9 && !webmVp8) {
    return {
      supported: false,
      message: 'Formato de vídeo WebM não suportado',
    }
  }

  return { supported: true }
}
