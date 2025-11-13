import Konva from 'konva'
import type { Layer, DesignData } from '@/types/template'
import type { AudioConfig } from '@/components/audio/audio-selection-modal'

export interface VideoExportOptions {
  fps?: number // Frames por segundo (padrão: 30)
  duration?: number // Duração em segundos
  format?: 'webm' | 'mp4' // Formato de saída
  quality?: number // Qualidade (0-1)
  audioConfig?: AudioConfig // Configuração de áudio (padrão: áudio original)
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
    node: Konva.Node
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
    node: Konva.Node
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

    children.forEach((node: Konva.Node) => {
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
 * Carrega áudio de uma URL e retorna o ArrayBuffer
 */
async function loadAudioFromUrl(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Falha ao carregar áudio: ${response.statusText}`)
  }
  return response.arrayBuffer()
}

/**
 * Cria um AudioBuffer processado com volume, fade e trim
 */
async function createProcessedAudioBuffer(
  audioContext: AudioContext,
  arrayBuffer: ArrayBuffer,
  audioConfig: AudioConfig,
  videoDuration: number
): Promise<AudioBuffer> {
  // Decodificar áudio
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

  // Calcular duração do trecho selecionado
  const { startTime, endTime, volume, fadeIn, fadeOut, fadeInDuration, fadeOutDuration } = audioConfig
  const selectedDuration = endTime - startTime
  const outputDuration = Math.min(selectedDuration, videoDuration)

  // Criar novo buffer para o áudio processado
  const processedBuffer = audioContext.createBuffer(
    audioBuffer.numberOfChannels,
    Math.ceil(outputDuration * audioBuffer.sampleRate),
    audioBuffer.sampleRate
  )

  // Copiar e processar cada canal
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const inputData = audioBuffer.getChannelData(channel)
    const outputData = processedBuffer.getChannelData(channel)

    // Índices de início e fim no buffer original
    const startSample = Math.floor(startTime * audioBuffer.sampleRate)
    const samplesToProcess = outputData.length

    for (let i = 0; i < samplesToProcess; i++) {
      const inputIndex = startSample + i
      if (inputIndex >= inputData.length) {
        outputData[i] = 0 // Silêncio se ultrapassar o áudio original
        continue
      }

      let sample = inputData[inputIndex]

      // Aplicar volume (0-100 para 0-1)
      sample *= volume / 100

      // Aplicar fade in
      if (fadeIn && i < fadeInDuration * audioBuffer.sampleRate) {
        const fadeProgress = i / (fadeInDuration * audioBuffer.sampleRate)
        sample *= fadeProgress
      }

      // Aplicar fade out
      if (fadeOut && i > samplesToProcess - fadeOutDuration * audioBuffer.sampleRate) {
        const fadeProgress =
          (samplesToProcess - i) / (fadeOutDuration * audioBuffer.sampleRate)
        sample *= fadeProgress
      }

      outputData[i] = sample
    }
  }

  return processedBuffer
}

/**
 * Cria um MediaStream com áudio processado
 */
function createAudioStreamFromBuffer(
  audioContext: AudioContext,
  audioBuffer: AudioBuffer
): MediaStreamAudioDestinationNode {
  const source = audioContext.createBufferSource()
  source.buffer = audioBuffer

  const destination = audioContext.createMediaStreamDestination()
  source.connect(destination)

  // Iniciar reprodução
  source.start(0)

  return destination
}

/**
 * Cria uma track de áudio silenciosa
 */
function createSilentAudioTrack(audioContext: AudioContext): MediaStreamTrack {
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()
  const destination = audioContext.createMediaStreamDestination()

  // Volume zero = silêncio
  gainNode.gain.value = 0

  oscillator.connect(gainNode)
  gainNode.connect(destination)
  oscillator.start()

  return destination.stream.getAudioTracks()[0]
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
  const { fps = 30, duration, format = 'webm', quality = 0.8, audioConfig } = options

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
    // Se usar música da biblioteca, usar duração do trecho selecionado
    // Caso contrário, usar duração total do vídeo
    let videoDuration: number
    if (audioConfig?.source === 'library' && audioConfig.startTime !== undefined && audioConfig.endTime !== undefined) {
      videoDuration = audioConfig.endTime - audioConfig.startTime
      console.log(`[Video Export] Usando duração do trecho selecionado da música: ${videoDuration}s (${audioConfig.startTime}s - ${audioConfig.endTime}s)`)
    } else {
      videoDuration = duration || videoLayer.videoMetadata?.duration || videoElement.duration || 10
      console.log(`[Video Export] Usando duração total do vídeo: ${videoDuration}s`)
    }

    // Posicionar vídeo no início e garantir que o primeiro frame está renderizado
    videoElement.currentTime = 0
    await new Promise<void>((resolve) => {
      const handleSeeked = () => {
        resolve()
      }
      if (videoElement.readyState >= 2 && videoElement.currentTime === 0) {
        resolve()
      } else {
        videoElement.addEventListener('seeked', handleSeeked, { once: true })
      }
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

    // Preencher fundo branco (ou usar cor de fundo do design) com o frame inicial
    videoNode.getLayer()?.batchDraw()
    stage.batchDraw()
    const initialSnapshot = stage.toCanvas()
    offscreenCtx.fillStyle = design.canvas.backgroundColor || '#FFFFFF'
    offscreenCtx.fillRect(0, 0, stageWidth, stageHeight)
    offscreenCtx.drawImage(initialSnapshot, 0, 0)

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
    const canvasStream = offscreenCanvas.captureStream(fps)

    // Processar áudio de acordo com audioConfig
    let stream = canvasStream
    const audioSource = audioConfig?.source || 'original'

    try {
      const audioContext = new AudioContext()

      if (audioSource === 'mute') {
        // Caso 1: Vídeo mudo - criar track silenciosa
        console.log('[Video Export] Criando vídeo sem áudio (mudo)')
        const silentTrack = createSilentAudioTrack(audioContext)
        const videoTracks = canvasStream.getVideoTracks()
        stream = new MediaStream([...videoTracks, silentTrack])
      } else if (audioSource === 'library' && audioConfig?.musicId) {
        // Caso 2: Música da biblioteca
        console.log('[Video Export] Carregando música da biblioteca:', audioConfig.musicId)
        onProgress?.({ phase: 'preparing', progress: 45 })

        // Buscar informações da música
        const musicResponse = await fetch(`/api/biblioteca-musicas/${audioConfig.musicId}`)
        if (!musicResponse.ok) {
          throw new Error('Falha ao buscar informações da música')
        }
        const musicData = await musicResponse.json()

        // Carregar áudio da biblioteca
        const musicArrayBuffer = await loadAudioFromUrl(musicData.blobUrl)

        // Processar áudio (volume, fade, trim)
        const processedAudioBuffer = await createProcessedAudioBuffer(
          audioContext,
          musicArrayBuffer,
          audioConfig,
          videoDuration
        )

        // Criar stream de áudio processado
        const audioDestination = createAudioStreamFromBuffer(audioContext, processedAudioBuffer)

        // Combinar stream de vídeo com áudio processado
        const audioTracks = audioDestination.stream.getAudioTracks()
        const videoTracks = canvasStream.getVideoTracks()
        stream = new MediaStream([...videoTracks, ...audioTracks])

        console.log('[Video Export] Música da biblioteca adicionada com sucesso')
      } else {
        // Caso 3: Áudio original do vídeo (padrão)
        console.log('[Video Export] Usando áudio original do vídeo')

        // Verificar se o vídeo tem áudio
        const videoWithAudioProps = videoElement as HTMLVideoElement & {
          mozHasAudio?: boolean
          webkitAudioDecodedByteCount?: number
        }

        const videoHasAudio = videoWithAudioProps.mozHasAudio !== undefined
          ? videoWithAudioProps.mozHasAudio
          : videoWithAudioProps.webkitAudioDecodedByteCount !== undefined
            ? videoWithAudioProps.webkitAudioDecodedByteCount > 0
            : true // Assume que tem áudio por padrão

        if (videoHasAudio) {
          const source = audioContext.createMediaElementSource(videoElement)
          const destination = audioContext.createMediaStreamDestination()

          // Conectar o áudio do vídeo ao destination
          source.connect(destination)
          // Também conectar ao destino padrão para o usuário ouvir durante a exportação
          source.connect(audioContext.destination)

          // Combinar stream de vídeo com stream de áudio
          const audioTracks = destination.stream.getAudioTracks()
          const videoTracks = canvasStream.getVideoTracks()
          stream = new MediaStream([...videoTracks, ...audioTracks])

          console.log('[Video Export] Áudio original do vídeo adicionado ao stream')
        } else {
          console.log('[Video Export] Vídeo não possui áudio')
        }
      }
    } catch (error) {
      console.warn('[Video Export] Erro ao processar áudio:', error)
      // Continuar sem áudio se falhar
      stream = canvasStream
    }

    // Configurar MediaRecorder
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: finalMimeType,
      videoBitsPerSecond: quality * 5_000_000, // 5 Mbps max
    })

    const chunks: Blob[] = []

    // Coletar chunks de vídeo
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data)
      }
    }

    mediaRecorder.onerror = (e) => {
      console.error('[Video Export] Erro no MediaRecorder:', e)
    }

    onProgress?.({ phase: 'recording', progress: 50 })

    // Iniciar gravação ANTES de reproduzir o vídeo
    mediaRecorder.start(100) // Capturar chunks a cada 100ms

    // Aguardar start com timeout
    await new Promise((resolve) => setTimeout(resolve, 200))

    // Posicionar vídeo no início (novamente após start) e reproduzir
    videoElement.currentTime = 0

    try {
      await videoElement.play()
    } catch (error) {
      const isAbortError =
        error instanceof DOMException && (error.name === 'AbortError' || error.code === DOMException.ABORT_ERR)
      if (isAbortError) {
        console.warn('[Video Export] Reprodução interrompida imediatamente após play(). Prosseguindo mesmo assim.')
      } else {
        console.error('[Video Export] Erro ao reproduzir vídeo:', error)
        throw new Error(
          'Falha ao reproduzir vídeo: ' + (error instanceof Error ? error.message : 'erro desconhecido')
        )
      }
    }

    // Loop de animação para copiar o stage para o canvas offscreen frame por frame
    let animationId: number | null = null
    const startTime = Date.now()

    const animationLoop = () => {
      // 1. Forçar redraw do stage para atualizar com frame atual do vídeo
      videoNode.getLayer()?.batchDraw()
      stage.batchDraw()

      // 2. Copiar o stage renderizado para o canvas offscreen
      // Usar toCanvas() que retorna um snapshot do stage completo (todas as layers compostas)
      const stageSnapshot = stage.toCanvas()

      // 3. Limpar canvas offscreen e desenhar o snapshot
      offscreenCtx.fillStyle = design.canvas.backgroundColor || '#FFFFFF'
      offscreenCtx.fillRect(0, 0, stageWidth, stageHeight)
      offscreenCtx.drawImage(stageSnapshot, 0, 0)

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

    // Se formato solicitado for MP4, converter usando FFmpeg.wasm
    if (format === 'mp4') {
      onProgress?.({ phase: 'converting', progress: 85 })
      console.log('[exportVideoWithLayers] Convertendo WebM para MP4...')

      try {
        const { convertWebMToMP4 } = await import('@/lib/video/ffmpeg-converter')

        const mp4Blob = await convertWebMToMP4(webmBlob, (conversionProgress) => {
          // Mapear progresso da conversão (0-100) para progresso total (85-100)
          const totalProgress = 85 + (conversionProgress / 100) * 15
          onProgress?.({ phase: 'converting', progress: totalProgress })
        })

        onProgress?.({ phase: 'finalizing', progress: 100 })
        return mp4Blob
      } catch (error) {
        console.error('[exportVideoWithLayers] Erro ao converter para MP4:', error)
        console.warn('[exportVideoWithLayers] Retornando WebM como fallback')
        // Fallback: retornar WebM se conversão falhar
        onProgress?.({ phase: 'finalizing', progress: 100 })
        return webmBlob
      }
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

  // Garantir que o primeiro frame está renderizado antes de capturar o thumbnail
  try {
    video.currentTime = 0
  } catch (error) {
    console.warn('[generateVideoThumbnail] Não foi possível definir currentTime para 0:', error)
  }

  await new Promise<void>((resolve) => {
    video.addEventListener('seeked', () => resolve(), { once: true })
    if (video.readyState >= 2 && video.currentTime === 0) {
      resolve()
    }
  })

  videoNode.getLayer()?.batchDraw()
  stage.batchDraw()

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
