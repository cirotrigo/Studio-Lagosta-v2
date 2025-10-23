"use client"

import * as React from 'react'
import Konva from 'konva'
import { Rect, Image as KonvaImage, Circle, RegularPolygon, Line, Star, Path } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import useImage from 'use-image'
import type { Layer } from '@/types/template'
import { ICON_PATHS } from '@/lib/assets/icon-library'
import { KonvaEditableText } from './konva-editable-text'
import { calculateImageCrop } from '@/lib/image-crop-utils'
import { throttle, getPerformanceConfig } from '@/lib/performance-utils'

/**
 * Converte ângulo CSS para pontos de início e fim do gradiente Konva
 */
function calculateGradientFromAngle(
  angleInDegrees: number,
  width: number,
  height: number
): { start: { x: number; y: number }; end: { x: number; y: number } } {
  // Converte ângulo CSS (180 = topo) para ângulo matemático (0 = direita)
  const angle = ((180 - angleInDegrees) / 180) * Math.PI

  // Calcula comprimento para alcançar os cantos
  const length = Math.abs(width * Math.sin(angle)) + Math.abs(height * Math.cos(angle))

  // Calcula pontos x,y centralizados na forma
  const halfx = (Math.sin(angle) * length) / 2.0
  const halfy = (Math.cos(angle) * length) / 2.0
  const cx = width / 2.0
  const cy = height / 2.0

  return {
    start: { x: cx - halfx, y: cy - halfy },
    end: { x: cx + halfx, y: cy + halfy },
  }
}

/**
 * Converte hex para rgba
 */
function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

/**
 * KonvaLayerFactory - Factory pattern para renderizar diferentes tipos de camadas.
 *
 * Tipos suportados:
 * - text: Texto com formatação completa (fonte, cor, alinhamento)
 * - image/logo/element: Imagens com filtros Konva (blur, brightness, contrast, grayscale, sepia, invert)
 * - gradient/gradient2: Gradientes lineares e radiais
 * - shape: Formas geométricas (rectangle, circle, triangle, star, arrow, line)
 * - icon: Ícones SVG usando Path
 *
 * Funcionalidades:
 * - Drag & drop
 * - Transform (resize, rotate) via Transformer
 * - Filtros de imagem em tempo real
 * - Border/stroke customizável
 * - Opacity e visibility
 * - Lock para prevenir edições
 *
 * @component
 */

type KonvaFilter = (typeof Konva.Filters)[keyof typeof Konva.Filters]

interface KonvaLayerFactoryProps {
  layer: Layer
  onSelect: (event: KonvaEventObject<MouseEvent | TouchEvent>, layer: Layer) => void
  onChange: (updates: Partial<Layer>) => void
  onDragMove?: (event: KonvaEventObject<DragEvent>) => void
  onDragEnd?: () => void
  disableInteractions?: boolean
  stageRef?: React.RefObject<Konva.Stage | null>
}

interface CommonProps {
  id: string
  x: number
  y: number
  rotation: number
  opacity: number
  draggable: boolean
  listening: boolean
  onClick: (event: KonvaEventObject<MouseEvent | TouchEvent>) => void
  onTap: (event: KonvaEventObject<MouseEvent | TouchEvent>) => void
  onMouseDown: (event: KonvaEventObject<MouseEvent>) => void
  onTouchStart: (event: KonvaEventObject<TouchEvent>) => void
  onDragEnd: (event: KonvaEventObject<DragEvent>) => void
  onDragStart: (event: KonvaEventObject<DragEvent>) => void
  onDragMove: (event: KonvaEventObject<DragEvent>) => void
  onTransformEnd: (event: KonvaEventObject<Event>) => void
}

export function KonvaLayerFactory({ layer, onSelect, onChange, onDragMove, onDragEnd, disableInteractions = false, stageRef }: KonvaLayerFactoryProps) {
  const shapeRef = React.useRef<Konva.Shape | null>(null)
  const dragStateRef = React.useRef<{ startX: number; startY: number; hasMoved: boolean } | null>(null)

  const isVisible = layer.visible !== false
  const isLocked = !!layer.locked
  const opacity = isVisible ? layer.style?.opacity ?? 1 : 0.25
  const interactionsDisabled = disableInteractions || !isVisible

  const handleSelect = React.useCallback(
    (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (interactionsDisabled) return
      onSelect(event, layer)
    },
    [interactionsDisabled, layer, onSelect],
  )

  const handleDragStart = React.useCallback(
    (event: KonvaEventObject<DragEvent>) => {
      if (interactionsDisabled) return
      const node = event.target
      dragStateRef.current = {
        startX: node.x(),
        startY: node.y(),
        hasMoved: false,
      }
      onSelect(event as unknown as KonvaEventObject<MouseEvent | TouchEvent>, layer)
    },
    [interactionsDisabled, layer, onSelect],
  )

  const handleMouseDown = React.useCallback(
    (event: KonvaEventObject<MouseEvent>) => {
      if (interactionsDisabled) return
      onSelect(event as unknown as KonvaEventObject<MouseEvent | TouchEvent>, layer)
    },
    [interactionsDisabled, layer, onSelect],
  )

  const handleTouchStart = React.useCallback(
    (event: KonvaEventObject<TouchEvent>) => {
      if (interactionsDisabled) return
      onSelect(event as unknown as KonvaEventObject<MouseEvent | TouchEvent>, layer)
    },
    [interactionsDisabled, layer, onSelect],
  )

  const handleDragEnd = React.useCallback<CommonProps['onDragEnd']>(
    (event) => {
      if (interactionsDisabled) return
      const node = event.target
      const state = dragStateRef.current

      if (!state || !state.hasMoved) {
        if (state) {
          node.position({ x: state.startX, y: state.startY })
        }
        dragStateRef.current = null
        onDragEnd?.()
        return
      }

      onChange({
        position: {
          x: Math.round(node.x()),
          y: Math.round(node.y()),
        },
      })
      onDragEnd?.()
      dragStateRef.current = null
    },
    [interactionsDisabled, onChange, onDragEnd],
  )

  // OTIMIZAÇÃO MOBILE: Throttle de drag para melhor performance
  const handleDragMoveThrottled = React.useMemo(() => {
    const performanceConfig = getPerformanceConfig()
    const dragMove = (event: KonvaEventObject<DragEvent>) => {
      if (interactionsDisabled) return
      const node = event.target
      const state = dragStateRef.current

      if (!state) {
        dragStateRef.current = {
          startX: node.x(),
          startY: node.y(),
          hasMoved: false,
        }
        return
      }

      const deltaX = Math.abs(node.x() - state.startX)
      const deltaY = Math.abs(node.y() - state.startY)
      const hasMoved = deltaX > 1 || deltaY > 1

      if (hasMoved && !state.hasMoved) {
        state.hasMoved = true
      }

      if (!state.hasMoved) {
        return
      }

      onDragMove?.(event)
    }

    return throttle(dragMove, performanceConfig.dragThrottleMs)
  }, [interactionsDisabled, onDragMove])

  const handleDragMove: CommonProps['onDragMove'] = React.useCallback(
    (event) => handleDragMoveThrottled(event),
    [handleDragMoveThrottled],
  )

  const handleTransformEnd = React.useCallback<CommonProps['onTransformEnd']>(
    () => {
      if (interactionsDisabled) return
      const node = shapeRef.current
      if (!node) return

      const scaleX = node.scaleX()
      const scaleY = node.scaleY()

      // Reset scale to 1 to prevent distortion (Konva best practice)
      // Para textos, o scale já foi resetado no evento 'transform'
      node.scaleX(1)
      node.scaleY(1)

      // Calculate new dimensions from scale
      const newWidth = Math.max(5, Math.round(node.width() * scaleX))
      const newHeight = Math.max(5, Math.round(node.height() * scaleY))

      // Para imagens com objectFit: cover, o crop será recalculado automaticamente
      // pelo useMemo no ImageNode quando size mudar
      // Não precisamos calcular aqui pois o cropData é derivado de width/height

      onChange({
        position: {
          x: Math.round(node.x()),
          y: Math.round(node.y()),
        },
        size: {
          width: newWidth,
          height: newHeight,
        },
        rotation: Math.round(node.rotation()),
      })
    },
    [interactionsDisabled, onChange],
  )

  const borderColor = layer.style?.border?.color ?? '#000000'
  const borderWidth = layer.style?.border?.width ?? 0
  const borderRadius = layer.style?.border?.radius ?? 0

  const commonProps: CommonProps = {
    id: layer.id,
    x: layer.position?.x ?? 0,
    y: layer.position?.y ?? 0,
    rotation: layer.rotation ?? 0,
    opacity,
    draggable: !isLocked && isVisible && !interactionsDisabled,
    listening: isVisible && !interactionsDisabled,
    onClick: handleSelect,
    onTap: handleSelect,
    onMouseDown: handleMouseDown,
    onTouchStart: handleTouchStart,
    onDragEnd: handleDragEnd,
    onDragStart: handleDragStart,
    onDragMove: handleDragMove,
    onTransformEnd: handleTransformEnd,
  }

  switch (layer.type) {
    case 'text':
      return (
        <KonvaEditableText
          layer={layer}
          shapeRef={shapeRef as React.RefObject<Konva.Text>}
          commonProps={commonProps}
          borderColor={borderColor}
          borderWidth={borderWidth}
          onChange={onChange}
          stageRef={stageRef}
        />
      )

    case 'image':
    case 'logo':
    case 'element':
      return <ImageNode layer={layer} commonProps={commonProps} shapeRef={shapeRef} borderColor={borderColor} borderWidth={borderWidth} borderRadius={borderRadius} onChange={onChange} stageRef={stageRef} />

    case 'video':
      return <VideoNode layer={layer} commonProps={commonProps} shapeRef={shapeRef} borderColor={borderColor} borderWidth={borderWidth} borderRadius={borderRadius} onChange={onChange} />

    case 'gradient':
    case 'gradient2':
      return <GradientNode layer={layer} commonProps={commonProps} shapeRef={shapeRef} borderColor={borderColor} borderWidth={borderWidth} borderRadius={borderRadius} />

    case 'shape':
      return (
        <ShapeNode
          layer={layer}
          commonProps={commonProps}
          shapeRef={shapeRef}
          borderColor={borderColor}
          borderWidth={borderWidth}
          borderRadius={borderRadius}
        />
      )

    case 'icon':
      return (
        <IconNode
          layer={layer}
          commonProps={commonProps}
          shapeRef={shapeRef}
        />
      )

    default:
      return null
  }
}

type VideoNodeProps = {
  layer: Layer
  commonProps: CommonProps
  shapeRef: React.MutableRefObject<Konva.Shape | null>
  borderColor: string
  borderWidth: number
  borderRadius: number
  onChange: (updates: Partial<Layer>) => void
}

function VideoNode({ layer, commonProps, shapeRef, borderColor, borderWidth, borderRadius, onChange }: VideoNodeProps) {
  const videoUrl = layer.fileUrl || ''
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const autoplayRef = React.useRef(layer.videoMetadata?.autoplay)
  const loopRef = React.useRef(layer.videoMetadata?.loop)
  const [videoMetaVersion, setVideoMetaVersion] = React.useState(0)

  React.useEffect(() => {
    autoplayRef.current = layer.videoMetadata?.autoplay
  }, [layer.videoMetadata?.autoplay])

  React.useEffect(() => {
    loopRef.current = layer.videoMetadata?.loop
  }, [layer.videoMetadata?.loop])
  const imageRef = React.useRef<Konva.Image>(null)

  React.useImperativeHandle(shapeRef, () => imageRef.current as Konva.Shape | null, [])

  const width = Math.max(20, layer.size?.width ?? 0)
  const height = Math.max(20, layer.size?.height ?? 0)

  // Criar e configurar elemento de vídeo (somente uma vez, quando o URL muda)
  React.useEffect(() => {
    if (!videoUrl) return

    console.log('[VideoNode] Criando elemento de vídeo:', videoUrl)

    // ✨ SEGUINDO EXEMPLO OFICIAL DO KONVA
    const video = document.createElement('video')
    video.src = videoUrl
    video.crossOrigin = videoUrl.startsWith('http') ? 'anonymous' : undefined

    // Configurações mínimas (como exemplo oficial)
    video.muted = true // Para permitir autoplay
    video.playsInline = true

    // NÃO adicionar ao DOM - deixar como elemento independente (como exemplo oficial)

    // ✨ Configuração simples como exemplo oficial
    video.addEventListener('loadedmetadata', () => {
      console.log('[VideoNode] ✅ Metadados carregados')
      // Autoplay se configurado
      if (autoplayRef.current !== false) {
        video.play().catch((err) => console.warn('[VideoNode] Autoplay falhou:', err))
      }
      setVideoMetaVersion((prev) => prev + 1)
    })

    // Loop manual simples
    video.addEventListener('ended', () => {
      if (loopRef.current ?? true) {
        video.currentTime = 0
        video.play()
      }
    })

    videoRef.current = video

    return () => {
      console.log('[VideoNode] Limpando elemento de vídeo')
      video.pause()
      video.src = ''
      videoRef.current = null
    }
  }, [videoUrl])

  // Atualizar propriedades do vídeo quando metadata mudar (sem recriar o elemento)
  React.useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Aplicar metadata sem recriar elemento
    const muted = layer.videoMetadata?.muted ?? true
    const playbackRate = layer.videoMetadata?.playbackRate ?? 1

    if (video.muted !== muted) video.muted = muted
    if (video.playbackRate !== playbackRate) video.playbackRate = playbackRate

    console.log('[VideoNode] Propriedades atualizadas:', { muted, playbackRate })
  }, [layer.videoMetadata?.muted, layer.videoMetadata?.playbackRate])

  // ✨ Animação EXATAMENTE como exemplo oficial do Konva
  React.useEffect(() => {
    const video = videoRef.current
    const image = imageRef.current

    if (!video) {
      console.log('[VideoNode] ⏸️ Animação aguardando vídeo...')
      return
    }

    if (!image) {
      console.log('[VideoNode] ⏸️ Animação aguardando imageRef...')
      return
    }

    const konvaLayer = image.getLayer()
    if (!konvaLayer) {
      console.log('[VideoNode] ⏸️ Animação aguardando layer...')
      return
    }

    // Exemplo oficial: função vazia, Konva cuida do resto
    const anim = new Konva.Animation(function () {
      // empty function - Konva continuously redraws
    }, konvaLayer)

    anim.start()
    console.log('[VideoNode] ✅ Animação iniciada!')

    return () => {
      anim.stop()
      console.log('[VideoNode] Animação parada')
    }
  }, [videoMetaVersion, width, height, layer.id])

  // Escutar eventos de controle de vídeo
  React.useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleVideoControl = (event: Event) => {
      const customEvent = event as CustomEvent
      const { layerId, action, value } = customEvent.detail

      // Apenas processar eventos para esta camada
      if (layerId !== layer.id) return

      switch (action) {
        case 'play':
          video.play().catch((err) => console.warn('[VideoNode] Play falhou:', err))
          break
        case 'pause':
          video.pause()
          break
        case 'mute':
          video.muted = value
          break
        case 'loop':
          video.loop = value
          break
        case 'playbackRate':
          video.playbackRate = value
          break
      }
    }

    window.addEventListener('video-control', handleVideoControl)

    return () => {
      window.removeEventListener('video-control', handleVideoControl)
    }
  }, [layer.id])

  // Calcular crop para objectFit: cover
  const crop = React.useMemo(() => {
    const metadataReady = videoMetaVersion > 0
    const video = videoRef.current
    if (!metadataReady || !video || !video.videoWidth || !video.videoHeight) return undefined

    const objectFit = layer.videoMetadata?.objectFit ?? 'cover'
    if (objectFit === 'cover') {
      return calculateImageCrop(
        { width: video.videoWidth, height: video.videoHeight },
        { width, height },
        'center-middle'
      )
    }

    return undefined
  }, [videoMetaVersion, width, height, layer.videoMetadata?.objectFit])

  // Estado para rastrear se estava tocando antes da transformação
  const wasPlayingRef = React.useRef(false)

  // Handler de início de transformação - pausar vídeo para melhor performance
  const handleTransformStart = React.useCallback(() => {
    const video = videoRef.current
    if (!video) return

    // Salvar estado de reprodução
    wasPlayingRef.current = !video.paused

    // Pausar vídeo durante transform para melhor performance
    if (!video.paused) {
      video.pause()
    }

    // NÃO pausar a animação Konva - ela precisa continuar rodando
    // para manter o vídeo visível durante a transformação
  }, [])

  // Handler de transformação
  const handleTransformEnd = React.useCallback(() => {
    const node = imageRef.current
    const video = videoRef.current
    if (!node || !video) return

    const scaleX = node.scaleX()
    const scaleY = node.scaleY()

    const newWidth = Math.max(5, node.width() * scaleX)
    const newHeight = Math.max(5, node.height() * scaleY)

    node.scaleX(1)
    node.scaleY(1)
    node.width(newWidth)
    node.height(newHeight)

    // Recalcular crop se necessário
    const objectFit = layer.videoMetadata?.objectFit ?? 'cover'
    if (objectFit === 'cover' && video.videoWidth && video.videoHeight) {
      const newCrop = calculateImageCrop(
        { width: video.videoWidth, height: video.videoHeight },
        { width: newWidth, height: newHeight },
        'center-middle'
      )

      if (newCrop) {
        node.cropX(newCrop.cropX)
        node.cropY(newCrop.cropY)
        node.cropWidth(newCrop.cropWidth)
        node.cropHeight(newCrop.cropHeight)
      }
    }

    node.getLayer()?.batchDraw()

    // Retomar reprodução se estava tocando antes
    if (wasPlayingRef.current && layer.videoMetadata?.autoplay !== false) {
      video.play().catch((err) => console.warn('[VideoNode] Falha ao retomar reprodução:', err))
    }

    // A animação Konva já está rodando continuamente, não precisa reiniciar

    onChange({
      position: {
        x: Math.round(node.x()),
        y: Math.round(node.y()),
      },
      size: {
        width: Math.round(newWidth),
        height: Math.round(newHeight),
      },
      rotation: Math.round(node.rotation()),
    })
  }, [onChange, layer.videoMetadata?.objectFit, layer.videoMetadata?.autoplay])

  // Placeholder enquanto o vídeo carrega
  if (!videoRef.current) {
    return (
      <Rect
        {...commonProps}
        ref={shapeRef as React.RefObject<Konva.Rect>}
        width={width}
        height={height}
        cornerRadius={borderRadius}
        fill="#1f2937"
        stroke="#374151"
        dash={[8, 4]}
      />
    )
  }

  const { onTransformEnd: _, ...videoProps } = commonProps

  return (
    <KonvaImage
      {...videoProps}
      ref={imageRef}
      image={videoRef.current}
      width={width}
      height={height}
      {...crop}
      cornerRadius={borderRadius}
      stroke={borderWidth > 0 ? borderColor : undefined}
      strokeWidth={borderWidth > 0 ? borderWidth : undefined}
      onTransformStart={handleTransformStart}
      onTransformEnd={handleTransformEnd}
    />
  )
}

type ImageNodeProps = {
  layer: Layer
  commonProps: CommonProps
  shapeRef: React.MutableRefObject<Konva.Shape | null>
  borderColor: string
  borderWidth: number
  borderRadius: number
  onChange: (updates: Partial<Layer>) => void
  stageRef?: React.RefObject<Konva.Stage | null>
}

function ImageNode({ layer, commonProps, shapeRef, borderColor, borderWidth, borderRadius, onChange }: ImageNodeProps) {
  const imageUrl = layer.fileUrl || ''
  const [image] = useImage(imageUrl, imageUrl.startsWith('http') ? 'anonymous' : undefined)
  const imageRef = React.useRef<Konva.Image>(null)

  React.useImperativeHandle(shapeRef, () => imageRef.current as Konva.Shape | null, [])

  const filters = React.useMemo<KonvaFilter[]>(() => {
    const list: KonvaFilter[] = []
    if (layer.style?.blur) list.push(Konva.Filters.Blur)
    if (layer.style?.brightness !== undefined) list.push(Konva.Filters.Brighten)
    if (layer.style?.contrast !== undefined) list.push(Konva.Filters.Contrast)
    if (layer.style?.grayscale) list.push(Konva.Filters.Grayscale)
    if (layer.style?.sepia) list.push(Konva.Filters.Sepia)
    if (layer.style?.invert) list.push(Konva.Filters.Invert)
    return list
  }, [layer.style])

  // Cache only when filters are applied (Konva performance best practice)
  React.useEffect(() => {
    if (!imageRef.current) return
    if (filters.length === 0) {
      imageRef.current.clearCache()
      return
    }
    imageRef.current.cache()
    imageRef.current.getLayer()?.batchDraw()
  }, [filters, image, layer.size?.width, layer.size?.height])

  const width = Math.max(20, layer.size?.width ?? 0)
  const height = Math.max(20, layer.size?.height ?? 0)

  // Calcular crop automático baseado em objectFit: cover
  // Usa a função getCrop do exemplo oficial do Konva
  // SEMPRE usa center-middle para manter a imagem centralizada
  const crop = React.useMemo(() => {
    if (!image) return undefined

    if (layer.style?.objectFit === 'cover') {
      return calculateImageCrop(
        { width: image.width, height: image.height },
        { width, height },
        'center-middle'
      )
    }

    return undefined
  }, [image, width, height, layer.style?.objectFit])

  // Limpar cache durante transform para evitar conflito (Konva issue #835)
  const handleTransform = React.useCallback(() => {
    const node = imageRef.current
    if (!node) return

    // Limpar cache durante transform
    if (filters.length > 0) {
      node.clearCache()
    }
  }, [filters.length])

  // Handler customizado - recalcular crop manualmente
  const handleTransformEnd = React.useCallback(() => {
    const node = imageRef.current
    if (!node || !image) return

    const scaleX = node.scaleX()
    const scaleY = node.scaleY()

    // Calcular novas dimensões
    const newWidth = Math.max(5, node.width() * scaleX)
    const newHeight = Math.max(5, node.height() * scaleY)

    // Resetar scale
    node.scaleX(1)
    node.scaleY(1)

    // Aplicar novas dimensões no node
    node.width(newWidth)
    node.height(newHeight)

    // ✅ CRITICAL: Recalcular e aplicar crop IMEDIATAMENTE no node
    if (layer.style?.objectFit === 'cover') {
      const newCrop = calculateImageCrop(
        { width: image.width, height: image.height },
        { width: newWidth, height: newHeight },
        'center-middle'
      )

      if (newCrop) {
        node.cropX(newCrop.cropX)
        node.cropY(newCrop.cropY)
        node.cropWidth(newCrop.cropWidth)
        node.cropHeight(newCrop.cropHeight)
      }
    }

    // ✅ Reaplicar cache após transform
    if (filters.length > 0) {
      node.cache()
    }

    // Forçar re-draw
    node.getLayer()?.batchDraw()

    // Persistir mudanças
    onChange({
      position: {
        x: Math.round(node.x()),
        y: Math.round(node.y()),
      },
      size: {
        width: Math.round(newWidth),
        height: Math.round(newHeight),
      },
      rotation: Math.round(node.rotation()),
    })
  }, [onChange, image, layer.style?.objectFit, filters.length])

  if (!image) {
    return (
      <Rect
        {...commonProps}
        ref={shapeRef as React.RefObject<Konva.Rect>}
        width={width}
        height={height}
        cornerRadius={borderRadius}
        fill="#f5f5f5"
        stroke="#d4d4d8"
        dash={[8, 4]}
      />
    )
  }

  // Separar onTransformEnd do commonProps para usar nosso handler customizado
  const { onTransformEnd: _, ...imageProps } = commonProps

  return (
    <KonvaImage
      {...imageProps}
      ref={imageRef}
      image={image}
      width={width}
      height={height}
      {...crop}
      filters={filters.length ? filters : undefined}
      blurRadius={layer.style?.blur ?? 0}
      brightness={layer.style?.brightness ?? 0}
      contrast={layer.style?.contrast ?? 0}
      cornerRadius={borderRadius}
      stroke={borderWidth > 0 ? borderColor : undefined}
      strokeWidth={borderWidth > 0 ? borderWidth : undefined}
      onTransform={handleTransform}
      onTransformEnd={handleTransformEnd}
    />
  )
}

type GradientNodeProps = {
  layer: Layer
  commonProps: CommonProps
  shapeRef: React.MutableRefObject<Konva.Shape | null>
  borderColor: string
  borderWidth: number
  borderRadius: number
}

function GradientNode({ layer, commonProps, shapeRef, borderColor, borderWidth, borderRadius }: GradientNodeProps) {
  const gradientStops = layer.style?.gradientStops
  const angle = layer.style?.gradientAngle ?? 0
  const gradientType = layer.style?.gradientType ?? 'linear'

  const colorStops = React.useMemo(() => {
    const stops = Array.isArray(gradientStops) && gradientStops.length > 0
      ? gradientStops
      : [
          { id: '1', position: 0, color: '#000000', opacity: 1 },
          { id: '2', position: 1, color: '#ffffff', opacity: 1 },
        ]

    // Ordena as paradas por posição e converte para formato Konva com suporte a opacity
    return stops
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .flatMap((stop) => [
        stop.position ?? 0,
        hexToRgba(stop.color ?? '#000000', stop.opacity ?? 1)
      ])
  }, [gradientStops])

  const width = Math.max(20, layer.size?.width ?? 0)
  const height = Math.max(20, layer.size?.height ?? 0)

  if (gradientType === 'radial') {
    return (
      <Rect
        {...commonProps}
        ref={shapeRef as React.RefObject<Konva.Rect>}
        width={width}
        height={height}
        cornerRadius={borderRadius}
        fillRadialGradientStartPoint={{ x: 0, y: 0 }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndPoint={{ x: 0, y: 0 }}
        fillRadialGradientEndRadius={Math.max(width, height) / 2}
        fillRadialGradientColorStops={colorStops}
        stroke={borderWidth > 0 ? borderColor : undefined}
        strokeWidth={borderWidth > 0 ? borderWidth : undefined}
      />
    )
  }

  // Usa a função calculateGradientFromAngle para calcular corretamente os pontos
  const gradientPoints = calculateGradientFromAngle(angle, width, height)

  return (
    <Rect
      {...commonProps}
      ref={shapeRef as React.RefObject<Konva.Rect>}
      width={width}
      height={height}
      cornerRadius={borderRadius}
      fillLinearGradientStartPoint={gradientPoints.start}
      fillLinearGradientEndPoint={gradientPoints.end}
      fillLinearGradientColorStops={colorStops}
      stroke={borderWidth > 0 ? borderColor : undefined}
      strokeWidth={borderWidth > 0 ? borderWidth : undefined}
    />
  )
}

type ShapeNodeProps = {
  layer: Layer
  commonProps: CommonProps
  shapeRef: React.MutableRefObject<Konva.Shape | null>
  borderColor: string
  borderWidth: number
  borderRadius: number
}

function ShapeNode({ layer, commonProps, shapeRef, borderColor, borderWidth, borderRadius }: ShapeNodeProps) {
  const shapeType = layer.style?.shapeType ?? 'rectangle'
  const fill = layer.style?.fill ?? '#2563eb'
  const stroke = layer.style?.strokeColor ?? (borderWidth > 0 ? borderColor : undefined)
  const strokeWidth = layer.style?.strokeWidth ?? borderWidth ?? 0
  const width = Math.max(10, layer.size?.width ?? 0)
  const height = Math.max(10, layer.size?.height ?? 0)

  switch (shapeType) {
    case 'circle':
      return (
        <Circle
          {...commonProps}
          ref={shapeRef as React.RefObject<Konva.Circle>}
          radius={Math.min(width, height) / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      )
    case 'triangle':
      return (
        <RegularPolygon
          {...commonProps}
          ref={shapeRef as React.RefObject<Konva.RegularPolygon>}
          sides={3}
          radius={Math.min(width, height) / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      )
    case 'star':
      return (
        <Star
          {...commonProps}
          ref={shapeRef as React.RefObject<Konva.Star>}
          numPoints={5}
          innerRadius={Math.min(width, height) / 4}
          outerRadius={Math.min(width, height) / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      )
    case 'arrow':
      return (
        <Line
          {...commonProps}
          ref={shapeRef as React.RefObject<Konva.Line>}
          points={[0, height / 2, width * 0.7, height / 2, width * 0.7, height * 0.2, width, height / 2, width * 0.7, height * 0.8, width * 0.7, height / 2]}
          tension={0}
          closed
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      )
    case 'line':
      return (
        <Line
          {...commonProps}
          ref={shapeRef as React.RefObject<Konva.Line>}
          points={[0, height / 2, width, height / 2]}
          stroke={fill}
          strokeWidth={layer.style?.strokeWidth ?? 4}
          lineCap="round"
          lineJoin="round"
        />
      )
    case 'rounded-rectangle':
      return (
        <Rect
          {...commonProps}
          ref={shapeRef as React.RefObject<Konva.Rect>}
          width={width}
          height={height}
          cornerRadius={Math.min(borderRadius || 24, Math.min(width, height) / 2)}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      )
    case 'rectangle':
    default:
      return (
        <Rect
          {...commonProps}
          ref={shapeRef as React.RefObject<Konva.Rect>}
          width={width}
          height={height}
          cornerRadius={borderRadius}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      )
  }
}

type IconNodeProps = {
  layer: Layer
  commonProps: CommonProps
  shapeRef: React.MutableRefObject<Konva.Shape | null>
}

function IconNode({ layer, commonProps, shapeRef }: IconNodeProps) {
  const iconPath = layer.style?.iconId ? ICON_PATHS[layer.style.iconId] : undefined
  const fill = layer.style?.fill ?? '#111111'
  const stroke = layer.style?.strokeColor
  const strokeWidth = layer.style?.strokeWidth ?? 0

  if (!iconPath) {
    return (
      <Rect
        {...commonProps}
        ref={shapeRef as React.RefObject<Konva.Rect>}
        width={Math.max(10, layer.size?.width ?? 0)}
        height={Math.max(10, layer.size?.height ?? 0)}
        fill="#f5f5f5"
        stroke="#d4d4d8"
        dash={[4, 4]}
      />
    )
  }

  return (
    <Path
      {...commonProps}
      ref={shapeRef as React.RefObject<Konva.Path>}
      data={iconPath}
      width={Math.max(10, layer.size?.width ?? 0)}
      height={Math.max(10, layer.size?.height ?? 0)}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      listening={commonProps.listening}
    />
  )
}
