import Konva from 'konva'
import type { Layer, DesignData } from '@/types/template'
import type { AudioConfig } from '@/components/audio/audio-selection-modal'

export interface VideoExportOptions {
  fps?: number // Frames por segundo (padrão: 30)
  duration?: number // Duração em segundos
  quality?: number // Qualidade (0-1)
  audioConfig?: AudioConfig // Configuração de áudio (padrão: áudio original)
}

export interface VideoExportProgress {
  phase: 'preparing' | 'recording' | 'finalizing' | 'converting' | 'uploading' | 'queued'
  progress: number // 0-100
}

interface StageCleanupState {
  previousSelection: string[]
  previousZoom: number
  previousPosition: { x: number; y: number }
  previousSize: { width: number; height: number }
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
  const previousSize = { width: stage.width(), height: stage.height() }

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

  // 4. IMPORTANTE: Forçar stage para dimensões do design
  // Isso garante que o stage capture todo o conteúdo sem cortes
  stage.width(design.canvas.width)
  stage.height(design.canvas.height)

  // 5. Aguardar frame para mudanças serem aplicadas
  await new Promise((resolve) => requestAnimationFrame(resolve))

  // 6. Ocultar camada de guides temporariamente
  const guidesLayer = stage.findOne('.guides-layer')
  const guidesWasVisible = guidesLayer?.visible() ?? false
  if (guidesLayer) {
    guidesLayer.visible(false)
  }

  // 7. Ocultar completamente camadas invisíveis (visible: false)
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

  // 8. Forçar redraw para aplicar mudanças
  stage.batchDraw()

  // 9. Aguardar frame para garantir que mudanças foram aplicadas
  await new Promise((resolve) => requestAnimationFrame(resolve))

  return {
    previousSelection,
    previousZoom,
    previousPosition,
    previousSize,
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
  const { previousSelection, previousZoom, previousPosition, previousSize, guidesWasVisible, invisibleLayersState } =
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

  // Restaurar tamanho original do stage
  stage.width(previousSize.width)
  stage.height(previousSize.height)

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
  const {
    fps: requestedFps = 30,
    duration,
    quality: requestedQuality = 0.8,
    audioConfig,
  } = options
  const normalizedQuality = Math.min(Math.max(requestedQuality, 0.5), 1)
  const captureFps = Math.min(60, Math.max(24, Math.round(requestedFps)))
  const audioSource = audioConfig?.source || 'original'

  onProgress?.({ phase: 'preparing', progress: 0 })

  // Verificar se o stage está disponível
  if (!stage) {
    throw new Error('Stage não disponível para exportação')
  }

  let cleanupState: StageCleanupState | null = null

  let baseVideoOriginalMuted = false
  let baseVideoOriginalVolume = 1

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
    baseVideoOriginalMuted = videoElement.muted
    baseVideoOriginalVolume = typeof videoElement.volume === 'number' ? videoElement.volume : 1
    const shouldMuteBaseVideo = audioSource !== 'original'

    if (shouldMuteBaseVideo) {
      try {
        videoElement.muted = true
        videoElement.volume = 0
      } catch (error) {
        console.warn('[Video Export] Não foi possível mutar o áudio original:', error)
      }
    }

    // Duração efetiva = trim do vídeo ∧ trecho da música (quando houver).
    // Regra única — o chip de duração do painel de vídeo calcula igual.
    const videoTrimStart = videoLayer.videoMetadata?.trimStart ?? 0
    const videoTrimEnd = videoLayer.videoMetadata?.trimEnd
    const sourceDuration =
      duration || videoLayer.videoMetadata?.duration || videoElement.duration || 10
    const trimmedDuration =
      videoTrimEnd !== undefined && videoTrimEnd > videoTrimStart
        ? videoTrimEnd - videoTrimStart
        : Math.max(0.5, sourceDuration - videoTrimStart)

    let videoDuration = trimmedDuration
    if (
      (audioConfig?.source === 'library' || audioConfig?.source === 'mix') &&
      audioConfig.musicId &&
      audioConfig.startTime !== undefined &&
      audioConfig.endTime !== undefined
    ) {
      const musicSlice = audioConfig.endTime - audioConfig.startTime
      if (musicSlice > 0) {
        videoDuration = Math.min(trimmedDuration, musicSlice)
      }
      console.log(
        `[Video Export] Duração efetiva: ${videoDuration}s (trim ${trimmedDuration}s ∧ trecho da música ${musicSlice}s)`,
      )
    } else {
      console.log(`[Video Export] Duração efetiva (trim): ${videoDuration}s`)
    }

    // Posicionar vídeo no início do trim e garantir que o frame está renderizado
    videoElement.currentTime = videoTrimStart
    await new Promise<void>((resolve) => {
      const handleSeeked = () => {
        resolve()
      }
      if (videoElement.readyState >= 2 && Math.abs(videoElement.currentTime - videoTrimStart) < 0.05) {
        resolve()
      } else {
        videoElement.addEventListener('seeked', handleSeeked, { once: true })
      }
    })

    onProgress?.({ phase: 'preparing', progress: 30 })

    // IMPORTANTE: Konva usa múltiplos canvas (um por layer)
    // Precisamos criar um canvas offscreen que combina todos os layers
    // Usar dimensões EXATAS do design, não do stage (que pode ter padding/margens)
    const stageWidth = stage.width()
    const stageHeight = stage.height()
    const designWidth = design.canvas.width
    const designHeight = design.canvas.height

    console.log('[Video Export] Dimensões do Stage:', stageWidth, 'x', stageHeight)
    console.log('[Video Export] Dimensões do Design:', designWidth, 'x', designHeight)

    // Criar canvas offscreen com dimensões EXATAS do design
    const offscreenCanvas = document.createElement('canvas')
    offscreenCanvas.width = designWidth
    offscreenCanvas.height = designHeight

    console.log('[Video Export] Canvas offscreen criado:', offscreenCanvas.width, 'x', offscreenCanvas.height)
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

    // Verificar se stage tem dimensões corretas (deve ter sido ajustado em prepareStageForExport)
    if (stageWidth !== designWidth || stageHeight !== designHeight) {
      console.warn('[Video Export] ⚠️ Stage não tem dimensões do design!', {stage: `${stageWidth}x${stageHeight}`, design: `${designWidth}x${designHeight}`})
    }

    // Capturar stage completo (agora ele já tem dimensões do design)
    console.log('[Video Export] Capturando stage completo...')
    const initialSnapshot = stage.toCanvas({ pixelRatio: 1 })
    console.log('[Video Export] Snapshot capturado:', initialSnapshot.width, 'x', initialSnapshot.height)

    // Desenhar snapshot no canvas offscreen
    offscreenCtx.fillStyle = design.canvas.backgroundColor || '#FFFFFF'
    offscreenCtx.fillRect(0, 0, designWidth, designHeight)
    offscreenCtx.drawImage(initialSnapshot, 0, 0)

    // AGUARDAR próximo frame para garantir que o canvas foi renderizado
    await new Promise(resolve => requestAnimationFrame(resolve))

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

    // Criar stream do canvas offscreen com frameRate fixo APÓS primeiro desenho estar completo
    const canvasStream = offscreenCanvas.captureStream(captureFps)
    console.log(`[Video Export] Canvas stream criado com ${captureFps} FPS`)

    // Forçar captura do primeiro frame desenhando novamente
    offscreenCtx.fillStyle = design.canvas.backgroundColor || '#FFFFFF'
    offscreenCtx.fillRect(0, 0, designWidth, designHeight)
    offscreenCtx.drawImage(initialSnapshot, 0, 0)
    console.log('[Video Export] Canvas redesenhado após criar stream')

    const primaryCanvasTrack = canvasStream.getVideoTracks()[0]
    if (primaryCanvasTrack) {
      if ('contentHint' in primaryCanvasTrack) {
        try {
          ;(primaryCanvasTrack as MediaStreamTrack & { contentHint?: string }).contentHint = 'motion'
        } catch {
          // Alguns navegadores não permitem definir o hint
        }
      }
      if (typeof primaryCanvasTrack.applyConstraints === 'function') {
        try {
          await primaryCanvasTrack.applyConstraints({ frameRate: captureFps })
          console.log(`[Video Export] ✅ FrameRate constraint aplicado: ${captureFps} FPS`)
        } catch (error) {
          console.warn('[Video Export] ⚠️ Não foi possível aplicar frameRate no track:', error)
        }
      }
    }

    // Processar áudio de acordo com audioConfig
    let stream = canvasStream
    try {
      const audioContext = new AudioContext()

      if (audioSource === 'mix' && audioConfig?.musicId) {
        // Caso 4: Mixar áudio original + música da biblioteca
        console.log('[Video Export] Mixando áudio original + música da biblioteca')
        onProgress?.({ phase: 'preparing', progress: 45 })

        // 1. Capturar áudio original do vídeo
        const clonedVideoForOriginal = document.createElement('video')
        clonedVideoForOriginal.src = videoElement.src
        clonedVideoForOriginal.crossOrigin = 'anonymous'
        clonedVideoForOriginal.muted = false

        await new Promise<void>((resolve, reject) => {
          clonedVideoForOriginal.addEventListener('loadedmetadata', () => resolve(), { once: true })
          clonedVideoForOriginal.addEventListener('error', () => reject(new Error('Falha ao carregar vídeo clone')), { once: true })
          clonedVideoForOriginal.load()
          setTimeout(() => reject(new Error('Timeout ao carregar vídeo clone')), 10000)
        })

        // @ts-expect-error - captureStream exists
        const originalStream = clonedVideoForOriginal.captureStream() as MediaStream
        const originalAudioTracks = originalStream.getAudioTracks()

        if (originalAudioTracks.length === 0) {
          throw new Error('Vídeo não possui áudio original para mixar')
        }

        // 2. Carregar música da biblioteca
        console.log('[Video Export] Carregando música da biblioteca:', audioConfig.musicId)
        const musicResponse = await fetch(`/api/biblioteca-musicas/${audioConfig.musicId}`)
        if (!musicResponse.ok) {
          throw new Error('Falha ao buscar informações da música')
        }
        const musicData = await musicResponse.json()

        // Determinar qual URL usar baseado na versão selecionada (original vs instrumental)
        const audioVersion = audioConfig.audioVersion || 'original'
        let audioUrl: string

        if (audioVersion === 'instrumental') {
          if (!musicData.hasInstrumentalStem || !musicData.instrumentalUrl) {
            throw new Error('A versão instrumental não está disponível ainda. Por favor, aguarde o processamento.')
          }
          audioUrl = musicData.instrumentalUrl
          console.log('[Video Export] Usando versão instrumental:', audioUrl)
        } else {
          audioUrl = musicData.blobUrl
          console.log('[Video Export] Usando versão original:', audioUrl)
        }

        const musicArrayBuffer = await loadAudioFromUrl(audioUrl)

        // 3. Processar música (volume, fade, trim)
        const processedMusicBuffer = await createProcessedAudioBuffer(
          audioContext,
          musicArrayBuffer,
          {
            ...audioConfig,
            volume: audioConfig.volumeMusic || 60, // Volume da música
          },
          videoDuration
        )

        // 4. Criar nós de áudio no AudioContext
        const musicSource = audioContext.createBufferSource()
        musicSource.buffer = processedMusicBuffer

        const originalSource = audioContext.createMediaStreamSource(
          new MediaStream(originalAudioTracks)
        )

        // 5. Criar gain nodes para controlar volume individual
        const originalGain = audioContext.createGain()
        originalGain.gain.value = (audioConfig.volumeOriginal || 80) / 100

        const musicGain = audioContext.createGain()
        musicGain.gain.value = (audioConfig.volumeMusic || 60) / 100

        // 6. Conectar ao destination
        const destination = audioContext.createMediaStreamDestination()

        originalSource.connect(originalGain)
        originalGain.connect(destination)

        musicSource.connect(musicGain)
        musicGain.connect(destination)

        // 7. Iniciar reprodução da música
        musicSource.start(0)

        // 8. Posicionar vídeo clone no início do trim e NÃO reproduzir ainda
        clonedVideoForOriginal.currentTime = videoTrimStart
        console.log('[Video Export] Mix preparado - aguardando início da gravação...')

        // 9. Combinar stream de vídeo com stream de áudio mixado
        const audioTracks = destination.stream.getAudioTracks()
        const videoTracks = canvasStream.getVideoTracks()
        stream = new MediaStream([...videoTracks, ...audioTracks])

        // Manter referência do clone para sincronização
        // @ts-expect-error - propriedade customizada
        stream._clonedVideoElement = clonedVideoForOriginal

        console.log('[Video Export] Mix de áudio criado com sucesso')
      } else if (audioSource === 'mute') {
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

        // Determinar qual URL usar baseado na versão selecionada (original vs instrumental)
        const audioVersion = audioConfig.audioVersion || 'original'
        let audioUrl: string

        if (audioVersion === 'instrumental') {
          if (!musicData.hasInstrumentalStem || !musicData.instrumentalUrl) {
            throw new Error('A versão instrumental não está disponível ainda. Por favor, aguarde o processamento.')
          }
          audioUrl = musicData.instrumentalUrl
          console.log('[Video Export] Usando versão instrumental:', audioUrl)
        } else {
          audioUrl = musicData.blobUrl
          console.log('[Video Export] Usando versão original:', audioUrl)
        }

        // Carregar áudio da biblioteca
        const musicArrayBuffer = await loadAudioFromUrl(audioUrl)

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
        console.log('[Video Export] URL do vídeo:', videoElement.src?.substring(0, 100))

        try {
          // Estratégia: Criar um vídeo clone para capturar áudio sem interferir no original
          const clonedVideo = document.createElement('video')
          clonedVideo.src = videoElement.src
          clonedVideo.crossOrigin = 'anonymous'
          clonedVideo.muted = false // Importante: não mutar o clone

          console.log('[Video Export] Aguardando carregamento do vídeo clone...')

          // Aguardar vídeo clone carregar
          await new Promise<void>((resolve, reject) => {
            clonedVideo.addEventListener('loadedmetadata', () => {
              console.log('[Video Export] ✅ Vídeo clone carregado')
              resolve()
            }, { once: true })

            clonedVideo.addEventListener('error', (e) => {
              console.error('[Video Export] ❌ Erro ao carregar vídeo clone:', e)
              reject(new Error('Falha ao carregar vídeo clone'))
            }, { once: true })

            clonedVideo.load()

            // Timeout de segurança
            setTimeout(() => reject(new Error('Timeout ao carregar vídeo clone')), 10000)
          })

          // Tentar capturar stream do clone
          // @ts-expect-error - captureStream() existe em navegadores modernos
          const cloneStream = clonedVideo.captureStream() as MediaStream
          const audioTracks = cloneStream.getAudioTracks()

          console.log('[Video Export] Audio tracks encontradas:', audioTracks.length)

          if (audioTracks.length > 0) {
            console.log('[Video Export] ✅ Áudio original capturado com sucesso')

            // Posicionar clone no início do trim mas NÃO reproduzir ainda
            clonedVideo.currentTime = videoTrimStart
            clonedVideo.muted = false
            console.log(`[Video Export] Clone posicionado em ${videoTrimStart}s, aguardando início da gravação...`)

            // Combinar stream de vídeo (do canvas) com áudio (do clone)
            const videoTracks = canvasStream.getVideoTracks()
            stream = new MediaStream([...videoTracks, ...audioTracks])

            // Manter referência do clone para sincronização durante a gravação
            // @ts-expect-error - adicionar propriedade customizada
            stream._clonedVideoElement = clonedVideo
          } else {
            console.log('[Video Export] ⚠️ Vídeo não possui faixas de áudio')
            stream = canvasStream
          }
        } catch (error) {
          console.error('[Video Export] ❌ Erro ao capturar áudio original:', error)
          console.log('[Video Export] Continuando sem áudio')
          stream = canvasStream
        }
      }
    } catch (error) {
      console.warn('[Video Export] Erro ao processar áudio:', error)
      // Continuar sem áudio se falhar
      stream = canvasStream
    }

    // Configurar MediaRecorder
    const targetVideoBitrate = Math.round(
      Math.min(12_000_000, Math.max(6_000_000, normalizedQuality * 10_000_000))
    )
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: finalMimeType,
      videoBitsPerSecond: targetVideoBitrate,
      audioBitsPerSecond: 256_000,
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

    // Posicionar vídeo no início do trim (novamente após start) e reproduzir
    videoElement.currentTime = videoTrimStart

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

    // Reproduzir vídeo clone simultaneamente (se existir) para capturar áudio
    // @ts-expect-error - propriedade customizada
    const clonedVideo = stream._clonedVideoElement as HTMLVideoElement | undefined
    if (clonedVideo) {
      try {
        await clonedVideo.play()
        console.log('[Video Export] 🎵 Clone iniciado - áudio sendo capturado')
      } catch (error) {
        console.warn('[Video Export] Erro ao reproduzir clone (áudio pode não funcionar):', error)
      }
    }

    // Loop de animação para copiar o stage para o canvas offscreen frame por frame
    let animationId: number | null = null
    const startTime = Date.now()

    const animationLoop = () => {
      // Sincronizar tempo do clone com o vídeo original (se existir)
      if (clonedVideo && !clonedVideo.paused) {
        const timeDiff = Math.abs(clonedVideo.currentTime - videoElement.currentTime)
        // Se diferença > 0.1s, ressincronizar
        if (timeDiff > 0.1) {
          clonedVideo.currentTime = videoElement.currentTime
          console.log('[Video Export] 🔄 Clone ressincronizado:', videoElement.currentTime.toFixed(2), 's')
        }
      }
      // 1. Forçar redraw do stage para atualizar com frame atual do vídeo
      videoNode.getLayer()?.batchDraw()
      stage.batchDraw()

      // 2. Copiar o stage renderizado para o canvas offscreen
      const stageSnapshot = stage.toCanvas({ pixelRatio: 1 })

      // 3. Desenhar snapshot (stage já tem dimensões corretas)
      offscreenCtx.fillStyle = design.canvas.backgroundColor || '#FFFFFF'
      offscreenCtx.fillRect(0, 0, designWidth, designHeight)
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
        const currentProgress = ((videoElement.currentTime - videoTrimStart) / videoDuration) * 100
        onProgress?.({ phase: 'recording', progress: 50 + Math.max(0, currentProgress) * 0.35 })
      }, 100)

      setTimeout(() => {
        clearInterval(progressInterval)

        // Parar loop de animação
        if (animationId !== null) {
          cancelAnimationFrame(animationId)
        }

        videoElement.pause()

        // Parar vídeo clone se existir
        // @ts-expect-error - propriedade customizada
        const clonedVideo = stream._clonedVideoElement as HTMLVideoElement | undefined
        if (clonedVideo) {
          clonedVideo.pause()
          console.log('[Video Export] Vídeo clone pausado')
        }

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

    // Gerar blob WebM — a conversão para MP4 é da fila server-side
    // (/api/video-processing), nunca do browser.
    const webmBlob = new Blob(chunks, { type: finalMimeType })

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

    try {
      const videoNode = stage.findOne(`#${videoLayer.id}`) as Konva.Image | null
      const baseVideo = videoNode?.image() as HTMLVideoElement | undefined
      if (baseVideo) {
        baseVideo.muted = baseVideoOriginalMuted
        baseVideo.volume = baseVideoOriginalVolume
      }
    } catch {
      // ignore
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

  // Garantir que o primeiro frame do TRIM está renderizado antes do thumbnail
  const thumbTime = videoLayer.videoMetadata?.trimStart ?? 0
  try {
    video.currentTime = thumbTime
  } catch (error) {
    console.warn('[generateVideoThumbnail] Não foi possível definir currentTime:', error)
  }

  await new Promise<void>((resolve) => {
    video.addEventListener('seeked', () => resolve(), { once: true })
    if (video.readyState >= 2 && Math.abs(video.currentTime - thumbTime) < 0.05) {
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
