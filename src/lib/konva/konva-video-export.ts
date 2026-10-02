import Konva from 'konva'
import type { Layer, DesignData } from '@/types/template'
import type { AudioConfig } from '@/components/audio/audio-selection-modal'
import { duracaoDoExport, ehMotion, trechoDoVideo, videosDaPagina } from '@/lib/video/camadas-de-video'

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
): Promise<{ webm: Blob; duracao: number }> {
  const {
    fps: requestedFps = 30,
    duration,
    quality: requestedQuality = 0.8,
    audioConfig,
  } = options
  const normalizedQuality = Math.min(Math.max(requestedQuality, 0.5), 1)
  const captureFps = Math.min(60, Math.max(24, Math.round(requestedFps)))

  onProgress?.({ phase: 'preparing', progress: 0 })

  // Verificar se o stage está disponível
  if (!stage) {
    throw new Error('Stage não disponível para exportação')
  }

  let cleanupState: StageCleanupState | null = null

  let baseVideoOriginalMuted = false
  let baseVideoOriginalVolume = 1
  const outrosVideos: Array<{ el: HTMLVideoElement; inicio: number }> = []
  // Tudo o que a gravação abre é fechado no `finally`, dê certo ou não: antes,
  // uma falha depois de o gravador começar deixava recorder e tracks ativos.
  const encerrar: Array<() => void> = []
  let baseEstavaTocando = false

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
    // O motion toca uma vez e para; só o vídeo comum volta a tocar depois.
    baseEstavaTocando = !ehMotion(videoLayer) && !videoElement.paused && !videoElement.ended
    baseVideoOriginalVolume = typeof videoElement.volume === 'number' ? videoElement.volume : 1

    // O WebM gravado aqui é SEMPRE mudo — trilha, áudio original e mix são
    // aplicados pelo ffmpeg na fila (/api/video-processing) a partir do
    // audioConfig. Mutar o elemento evita o som vazar nas caixas durante a
    // gravação.
    try {
      videoElement.muted = true
      videoElement.volume = 0
    } catch (error) {
      console.warn('[Video Export] Não foi possível mutar o vídeo durante a gravação:', error)
    }

    // Duração efetiva = trecho do vídeo principal ∧ fatia da música. Regra
    // ÚNICA (src/lib/video/camadas-de-video.ts): o chip do painel, a aba Músicas
    // e a fila calculam igual.
    const trecho = trechoDoVideo(videoLayer.videoMetadata, duration || videoElement.duration)
    const videoTrimStart = trecho.inicio
    const videoDuration = duracaoDoExport(trecho.duracao ?? 10, audioConfig) ?? 10
    console.log(`[Video Export] Duração efetiva: ${videoDuration}s (trecho do vídeo: ${trecho.duracao}s)`)

    // Todo vídeo VISÍVEL da página entra na gravação (o stage inteiro é
    // copiado), então todos precisam estar carregados e LARGAR JUNTOS — antes o
    // segundo vídeo tocava de onde estivesse, e um motion que ainda não tivesse
    // chegado sairia faltando no MP4, sem aviso.
    const naoCarregou = (nome?: string) =>
      new Error(`"${nome || 'Vídeo'}" ainda não carregou. Espere ele aparecer na página e exporte de novo.`)
    if (videoElement.readyState < 2) throw naoCarregou(videoLayer.name)
    for (const layer of videosDaPagina(design.layers)) {
      if (layer.id === videoLayer.id) continue
      const node = stage.findOne(`#${layer.id}`)
      const el = node instanceof Konva.Image ? node.image() : null
      if (!(el instanceof HTMLVideoElement) || el.readyState < 2) throw naoCarregou(layer.name)
      outrosVideos.push({ el, inicio: trechoDoVideo(layer.videoMetadata).inicio })
    }

    // Todos parados no início do próprio trecho, com o quadro já decodificado.
    // Vídeo que não responde derruba o export com mensagem — nunca segue gravando.
    const posicionar = (el: HTMLVideoElement, inicio: number) =>
      new Promise<void>((resolve, reject) => {
        el.pause()
        if (!el.seeking && Math.abs(el.currentTime - inicio) < 0.05) return resolve()
        const limite = setTimeout(
          () => reject(new Error('Um dos vídeos da página não respondeu. Recarregue a página e exporte de novo.')),
          5000,
        )
        el.addEventListener(
          'seeked',
          () => {
            clearTimeout(limite)
            resolve()
          },
          { once: true },
        )
        el.currentTime = inicio
      })
    await Promise.all([
      posicionar(videoElement, videoTrimStart),
      ...outrosVideos.map(({ el, inicio }) => posicionar(el, inicio)),
    ])

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

    // Stream SEM áudio: a trilha (biblioteca/original/mix) é mixada pelo
    // ffmpeg na fila server-side a partir do audioConfig persistido no job.
    // Isso elimina o clone <video> ressincronizado e o mix WebAudio ao vivo
    // — os pontos mais frágeis do export antigo.
    const stream = canvasStream
    encerrar.push(() => canvasStream.getTracks().forEach((track) => track.stop()))

    // Configurar MediaRecorder
    const targetVideoBitrate = Math.round(
      Math.min(12_000_000, Math.max(6_000_000, normalizedQuality * 10_000_000))
    )
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: finalMimeType,
      videoBitsPerSecond: targetVideoBitrate,
    })

    encerrar.push(() => {
      if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
    })

    const chunks: Blob[] = []

    // Coletar chunks de vídeo
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data)
      }
    }

    // Gravador que falha no meio fica `inactive` sozinho: sem isto o `stop()` do
    // fim lançava dentro do timer e a promessa nunca terminava (diálogo preso).
    let aoFalhar: ((erro: Error) => void) | null = null
    let erroDoGravador: Error | null = null
    mediaRecorder.onerror = (e) => {
      console.error('[Video Export] Erro no MediaRecorder:', e)
      erroDoGravador = new Error('A gravação do vídeo falhou no navegador. Exporte de novo.')
      aoFalhar?.(erroDoGravador)
    }
    // Armado antes de gravar: o `stop` pode chegar antes de alguém esperar por ele.
    const parou = new Promise<void>((resolve) => {
      mediaRecorder.onstop = () => resolve()
    })

    onProgress?.({ phase: 'recording', progress: 50 })

    // Gravação e reprodução largam do MESMO ponto: o gravador começa e todos os
    // vídeos tocam no mesmo instante, já parados no primeiro quadro do trecho.
    // (Antes: 200 ms de espera e um seek com o vídeo tocando — o som, que o
    // servidor corta exatamente no início do trecho, saía fora da imagem.)
    await new Promise<void>((resolve) => {
      mediaRecorder.onstart = () => resolve()
      mediaRecorder.start(100) // Capturar chunks a cada 100ms
      setTimeout(resolve, 500) // navegador que não avisa o início
    })

    // Com prazo: vídeo com o quadro atual carregado pode ficar esperando dados
    // para tocar, e sem prazo o gravador seguia ligado com o diálogo travado.
    const tocar = (el: HTMLVideoElement) =>
      Promise.race([
        el.play(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('um dos vídeos da página não começou a tocar. Recarregue a página e exporte de novo')), 5000),
        ),
      ])
    const partidas = await Promise.allSettled([videoElement, ...outrosVideos.map(({ el }) => el)].map(tocar))
    for (const partida of partidas) {
      if (partida.status === 'fulfilled') continue
      const error = partida.reason
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
    encerrar.push(() => {
      if (animationId !== null) cancelAnimationFrame(animationId)
    })
    const startTime = Date.now()

    const animationLoop = () => {
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
    await new Promise<void>((resolve, reject) => {
      const progressInterval = setInterval(() => {
        const currentProgress = ((videoElement.currentTime - videoTrimStart) / videoDuration) * 100
        onProgress?.({ phase: 'recording', progress: 50 + Math.max(0, currentProgress) * 0.35 })
      }, 100)

      const fim = setTimeout(() => {
        clearInterval(progressInterval)

        // Parar loop de animação
        if (animationId !== null) {
          cancelAnimationFrame(animationId)
        }

        videoElement.pause()
        for (const { el } of outrosVideos) el.pause()

        // Aguardar um pouco antes de parar para garantir que último frame foi capturado
        setTimeout(() => {
          if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
          resolve()
        }, 200)
      }, videoDuration * 1000)

      aoFalhar = (erro) => {
        clearInterval(progressInterval)
        clearTimeout(fim)
        reject(erro)
      }
      // Falhou antes de chegar aqui (durante o `play()` dos vídeos)
      if (erroDoGravador) aoFalhar(erroDoGravador)
    })
    aoFalhar = null
    if (erroDoGravador) throw erroDoGravador

    onProgress?.({ phase: 'finalizing', progress: 85 })

    // Aguardar finalização do MediaRecorder
    await parou

    // Gerar blob WebM — a conversão para MP4 é da fila server-side
    // (/api/video-processing), nunca do browser.
    const webmBlob = new Blob(chunks, { type: finalMimeType })

    onProgress?.({ phase: 'finalizing', progress: 100 })
    // A duração vai junto: a fila precisa da MESMA que a gravação usou
    return { webm: webmBlob, duracao: videoDuration }
  } finally {
    for (const fechar of encerrar) {
      try {
        fechar()
      } catch {
        // fechar o que der; o resto do finally ainda precisa rodar
      }
    }

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
        // Quem estava tocando volta a tocar (o motion segue o vídeo sozinho).
        if (baseEstavaTocando) void baseVideo.play().catch(() => {})
        else baseVideo.pause()
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
