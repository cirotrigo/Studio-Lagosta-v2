"use client"

import * as React from 'react'
import Konva from 'konva'
import { Rect, Image as KonvaImage, Circle, RegularPolygon, Line, Star, Path, Group, Arrow, Shape } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import useImage from 'use-image'
import type { Layer, LayerStyle } from '@/types/template'
import { ICON_PATHS } from '@/lib/assets/icon-library'
import { KonvaEditableText } from './konva-editable-text'
import { KonvaMultiStyledText } from './konva-multi-styled-text'
import { calculateImageCrop } from '@/lib/image-crop-utils'
import { cropForResizedBox, resolveImageSourceRect } from '@/lib/image-fit'

/**
 * Alças do MEIO. O `keepRatio` do Konva só vale nos cantos, então são estas que
 * mudam a proporção da caixa — e é nelas que a imagem precisa ser recortada em
 * vez de esticada.
 */
const LATERAL_ANCHORS = new Set(['middle-left', 'middle-right', 'top-center', 'bottom-center'])
import { traceSvgPath } from '@/lib/konva/svg-path-clip'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { throttle, getPerformanceConfig } from '@/lib/performance-utils'
// Import custom Konva filters
import '@/lib/konva/filters'

/**
 * Converte ângulo CSS para pontos de início e fim do gradiente Konva
 */
export function calculateGradientFromAngle(
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
 * Resolve os pontos de início/fim do gradiente linear em pixels da layer.
 * Usa o segmento customizado (gradientStartX/Y..EndX/Y, 0..1) quando definido;
 * caso contrário deriva do ângulo cobrindo a layer inteira.
 */
export function resolveLinearGradientPoints(
  style: LayerStyle | undefined,
  width: number,
  height: number,
): { start: { x: number; y: number }; end: { x: number; y: number } } {
  if (
    typeof style?.gradientStartX === 'number' &&
    typeof style?.gradientStartY === 'number' &&
    typeof style?.gradientEndX === 'number' &&
    typeof style?.gradientEndY === 'number'
  ) {
    return {
      start: { x: width * style.gradientStartX, y: height * style.gradientStartY },
      end: { x: width * style.gradientEndX, y: height * style.gradientEndY },
    }
  }
  return calculateGradientFromAngle(style?.gradientAngle ?? 0, width, height)
}

/**
 * Converte hex para rgba
 */
function hexToRgba(hex: string, opacity: number): string {
  // Cor malformada não pode derrubar o drawScene do Konva: um "  #977807"
  // colado com espaços virava rgba(NaN, …), o addColorStop lançava e a página
  // inteira abria em branco. Se depois do trim ainda não for hex, devolve um
  // fallback neutro em vez de propagar NaN.
  const normalized = hex.trim().replace('#', '')
  if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(normalized)) {
    return `rgba(0, 0, 0, ${Math.max(0, Math.min(1, opacity))})`
  }

  if (normalized.length === 8) {
    const r = parseInt(normalized.slice(0, 2), 16)
    const g = parseInt(normalized.slice(2, 4), 16)
    const b = parseInt(normalized.slice(4, 6), 16)
    const a = parseInt(normalized.slice(6, 8), 16) / 255
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a * opacity))})`
  }

  if (normalized.length === 4) {
    const r = parseInt(`${normalized[0]}${normalized[0]}`, 16)
    const g = parseInt(`${normalized[1]}${normalized[1]}`, 16)
    const b = parseInt(`${normalized[2]}${normalized[2]}`, 16)
    const a = parseInt(`${normalized[3]}${normalized[3]}`, 16) / 255
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a * opacity))})`
  }

  const expanded = normalized.length === 3
    ? `${normalized[0]}${normalized[0]}${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}`
    : normalized

  const r = parseInt(expanded.slice(0, 2), 16)
  const g = parseInt(expanded.slice(2, 4), 16)
  const b = parseInt(expanded.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

function parseAlphaValue(value: string): number {
  const normalized = value.trim()
  if (normalized.endsWith('%')) {
    return Number.parseFloat(normalized) / 100
  }
  return Number(normalized)
}

function withAdjustedFunctionalColor(
  family: 'rgb' | 'hsl',
  content: string,
  opacity: number,
): string {
  const normalized = content.trim()

  if (normalized.includes('/')) {
    const [base, alphaValue = '1'] = normalized.split('/').map((part) => part.trim())
    const alpha = Math.max(0, Math.min(1, parseAlphaValue(alphaValue) * opacity))
    return `${family}(${base} / ${alpha})`
  }

  const commaParts = normalized.split(',').map((part) => part.trim())
  if (commaParts.length >= 4) {
    const base = commaParts.slice(0, 3).join(', ')
    const alpha = Math.max(0, Math.min(1, parseAlphaValue(commaParts[3]) * opacity))
    return `${family}a(${base}, ${alpha})`
  }

  if (commaParts.length === 3) {
    return `${family}a(${commaParts.join(', ')}, ${opacity})`
  }

  return `${family}(${normalized} / ${opacity})`
}

function applyOpacityToColor(color: string, opacity: number): string {
  const normalizedOpacity = Math.max(0, Math.min(1, opacity))
  // Espaço nas pontas fazia o hex cair fora do startsWith('#') e a opacidade
  // ser ignorada — mesmo dado que quebra o hexToRgba acima.
  const trimmed = color.trim()

  if (trimmed.startsWith('#') && [4, 5, 7, 9].includes(trimmed.length)) {
    return hexToRgba(trimmed, normalizedOpacity)
  }

  const rgbMatch = trimmed.match(/rgba?\(([^)]+)\)/i)
  if (rgbMatch) {
    return withAdjustedFunctionalColor('rgb', rgbMatch[1], normalizedOpacity)
  }

  const hslMatch = trimmed.match(/hsla?\(([^)]+)\)/i)
  if (hslMatch) {
    return withAdjustedFunctionalColor('hsl', hslMatch[1], normalizedOpacity)
  }

  return trimmed
}

function normalizeOpacityValue(value: unknown): number | undefined {
  const numeric = typeof value === 'string'
    ? (value.trim().endsWith('%') ? Number.parseFloat(value) / 100 : Number(value))
    : value
  if (typeof numeric !== 'number' || Number.isNaN(numeric)) return undefined
  if (numeric > 1 && numeric <= 100) return Math.max(0, Math.min(1, numeric / 100))
  return Math.max(0, Math.min(1, numeric))
}

function getShapeChannelOpacity(layer: Layer, channel: 'fill' | 'stroke'): number {
  const style = (layer.style ?? {}) as Record<string, unknown>
  const border = ((layer.style?.border ?? {}) as Record<string, unknown>)
  const keys = channel === 'fill'
    ? ['fillOpacity', 'fillAlpha']
    : ['strokeOpacity', 'strokeAlpha', 'borderOpacity', 'borderAlpha']

  for (const key of keys) {
    const fromStyle = normalizeOpacityValue(style[key])
    if (fromStyle !== undefined) return fromStyle
    const fromBorder = normalizeOpacityValue(border[key])
    if (fromBorder !== undefined) return fromBorder
  }

  return 1
}

/**
 * KonvaLayerFactory - Factory pattern para renderizar diferentes tipos de camadas.
 *
 * Tipos suportados:
 * - text: Texto com formatação única (fonte, cor, alinhamento)
 * - rich-text: Texto com múltiplos estilos (cores, fontes diferentes na mesma frase)
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
  /** Escurecida pelo modo "focar textos" — segue interativa, só perde destaque */
  dimmed?: boolean
  stageRef?: React.RefObject<Konva.Stage | null>
  projectId?: number
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

export function KonvaLayerFactory({ layer, onSelect, onChange, onDragMove, onDragEnd, disableInteractions = false, dimmed = false, stageRef, projectId = 0 }: KonvaLayerFactoryProps) {
  const shapeRef = React.useRef<Konva.Shape | null>(null)
  const dragStateRef = React.useRef<{ startX: number; startY: number; hasMoved: boolean } | null>(null)

  const isVisible = layer.visible !== false
  const isLocked = !!layer.locked
  const opacityBase = isVisible ? layer.style?.opacity ?? 1 : 0.25
  const opacity = dimmed ? opacityBase * 0.12 : opacityBase
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

    case 'rich-text':
      return (
        <KonvaMultiStyledText
          layer={layer}
          shapeRef={shapeRef as unknown as React.RefObject<Konva.Group>}
          commonProps={commonProps}
          onChange={onChange}
          projectId={projectId}
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
  // Trim em refs: o elemento <video> é criado uma vez por URL; mudar o trim
  // não pode recriá-lo (perderia o frame atual e o estado de reprodução)
  const trimStartRef = React.useRef(layer.videoMetadata?.trimStart ?? 0)
  const trimEndRef = React.useRef(layer.videoMetadata?.trimEnd)
  // Refs para o loadedmetadata (closure do effect [videoUrl]) enxergar o
  // estado atual sem recriar o elemento
  const onChangeRef = React.useRef(onChange)
  const videoMetadataRef = React.useRef(layer.videoMetadata)
  const [videoMetaVersion, setVideoMetaVersion] = React.useState(0)

  React.useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  React.useEffect(() => {
    videoMetadataRef.current = layer.videoMetadata
  }, [layer.videoMetadata])

  React.useEffect(() => {
    autoplayRef.current = layer.videoMetadata?.autoplay
  }, [layer.videoMetadata?.autoplay])

  React.useEffect(() => {
    loopRef.current = layer.videoMetadata?.loop
  }, [layer.videoMetadata?.loop])

  React.useEffect(() => {
    trimStartRef.current = layer.videoMetadata?.trimStart ?? 0
    trimEndRef.current = layer.videoMetadata?.trimEnd
    // Trecho mudou: se o frame atual ficou fora do trim, reposicionar
    const video = videoRef.current
    if (!video) return
    const start = trimStartRef.current
    const end = trimEndRef.current
    if (video.currentTime < start || (end !== undefined && video.currentTime > end)) {
      try {
        video.currentTime = start
      } catch {
        // metadados ainda não carregados — o loadedmetadata posiciona
      }
    }
  }, [layer.videoMetadata?.trimStart, layer.videoMetadata?.trimEnd])
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
      // Persistir a duração real na camada: o trim do painel, o chip de
      // duração e a aba Músicas dependem dela (ninguém mais grava esse campo)
      const dur = video.duration
      if (
        Number.isFinite(dur) &&
        dur > 0 &&
        Math.abs((videoMetadataRef.current?.duration ?? 0) - dur) > 0.01
      ) {
        onChangeRef.current({
          videoMetadata: { ...videoMetadataRef.current, duration: dur },
        })
      }
      // Começar no início do trim (0 quando não há trim)
      if (trimStartRef.current > 0) {
        try {
          video.currentTime = trimStartRef.current
        } catch {
          // ignore
        }
      }
      // Autoplay se configurado
      if (autoplayRef.current !== false) {
        video.play().catch((err) => console.warn('[VideoNode] Autoplay falhou:', err))
      }
      setVideoMetaVersion((prev) => prev + 1)
    })

    // Loop manual simples (volta para o início do trim)
    video.addEventListener('ended', () => {
      if (loopRef.current ?? true) {
        video.currentTime = trimStartRef.current
        video.play()
      }
    })

    // Trim de fim: ao passar do trimEnd, loopa para o trimStart (ou pausa)
    video.addEventListener('timeupdate', () => {
      const end = trimEndRef.current
      if (end === undefined || video.currentTime < end) return
      if (loopRef.current ?? true) {
        video.currentTime = trimStartRef.current
      } else {
        video.pause()
        video.currentTime = trimStartRef.current
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
        case 'seek':
          try {
            video.currentTime = value
          } catch (err) {
            console.warn('[VideoNode] Seek falhou:', err)
          }
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
  const groupRef = React.useRef<Konva.Group>(null)

  // Máscara e flip vivem num Group wrapper: a máscara é clipFunc do Group e o
  // flip é scale NEGATIVO no KonvaImage interno — nunca no node transformado,
  // porque o handleTransformEnd reseta o scale para 1 e apagaria o flip.
  const flipH = layer.style?.flipH === true
  const flipV = layer.style?.flipV === true
  const maskPath = layer.style?.mask?.path
  const hasWrapper = Boolean(maskPath || flipH || flipV)
  const { setCroppingLayerId } = useTemplateEditor()

  // Duplo clique entra no recorte in-canvas (v1 não suporta camada rotacionada)
  const handleDblClick = React.useCallback(() => {
    if (layer.rotation) return
    setCroppingLayerId(layer.id)
  }, [layer.rotation, layer.id, setCroppingLayerId])

  // Transformer/seleção anexam no node com o id da camada: o Group quando há
  // wrapper, o próprio KonvaImage caso contrário
  React.useImperativeHandle(
    shapeRef,
    () => (hasWrapper ? (groupRef.current as unknown as Konva.Shape | null) : (imageRef.current as Konva.Shape | null)),
    [hasWrapper],
  )

  const filters = React.useMemo<KonvaFilter[]>(() => {
    const list: KonvaFilter[] = []

    // Professional adjustments (order matters for quality)
    // 1. Exposure/Brightness first
    if (layer.style?.exposure !== undefined || layer.style?.brightness !== undefined) {
      list.push(Konva.Filters.Brighten)
    }

    // 2. Contrast
    if (layer.style?.contrast !== undefined) list.push(Konva.Filters.Contrast)

    // 3. Highlights and Shadows
    if ((layer.style?.highlights !== undefined && layer.style.highlights !== 0) ||
        (layer.style?.shadows !== undefined && layer.style.shadows !== 0)) {
      // @ts-expect-error - Custom filter
      list.push(Konva.Filters.HighlightsShadows)
    }

    // 4. Whites and Blacks
    if ((layer.style?.whites !== undefined && layer.style.whites !== 0) ||
        (layer.style?.blacks !== undefined && layer.style.blacks !== 0)) {
      // @ts-expect-error - Custom filter
      list.push(Konva.Filters.WhitesBlacks)
    }

    // 5. Saturation
    if (layer.style?.saturation !== undefined && layer.style.saturation !== 0) {
      list.push(Konva.Filters.HSL)
    }

    // Effects filters
    // 6. Blur
    if (layer.style?.blur) list.push(Konva.Filters.Blur)

    // 7. Vignette (last for best visual effect)
    if (layer.style?.vignette !== undefined && layer.style.vignette > 0) {
      // @ts-expect-error - Custom filter
      list.push(Konva.Filters.Vignette)
    }

    // Legacy filters (deprecated)
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
    // objectFit/cropPosition mudam o recorte desenhado — sem eles aqui, imagem
    // com filtro (bitmap cacheado) não redesenha ao mudar o enquadramento
  }, [filters, image, layer.size?.width, layer.size?.height, layer.style?.objectFit, layer.style?.cropPosition])

  const width = Math.max(20, layer.size?.width ?? 0)
  const height = Math.max(20, layer.size?.height ?? 0)

  // Crop automático (objectFit: cover) resolvido pelo MESMO helper do render
  // server-side (src/lib/image-fit.ts) — inclusive o cropPosition da grade 3×3
  // do painel, que antes era gravado e ignorado.
  const crop = React.useMemo(() => {
    if (!image) return undefined

    return resolveImageSourceRect(
      { width: image.width, height: image.height },
      { width, height },
      layer.style,
    )
  }, [image, width, height, layer.style])

  /**
   * Alça LATERAL redimensiona a janela, não a imagem.
   *
   * O Konva ignora `keepRatio` nas alças do meio (só vale nos cantos), então
   * arrastar uma lateral mudava a proporção da caixa e o KonvaImage esticava a
   * foto. A caixa é enquadramento: ela passa a mostrar mais ou menos imagem, na
   * mesma escala, e quem reposiciona o recorte é o modo de recorte.
   *
   * A base do cálculo é congelada no início do gesto — refazer a conta a partir
   * do estado já corrigido acumularia erro a cada frame.
   */
  const baseRecorteRef = React.useRef<{ box: { width: number; height: number }; style: Layer['style'] } | null>(null)

  const anchorAtual = React.useCallback((node: Konva.Node | null) => {
    const transformer = node?.getStage()?.findOne('Transformer') as Konva.Transformer | null
    return transformer?.getActiveAnchor() ?? ''
  }, [])

  const handleTransformStart = React.useCallback(() => {
    baseRecorteRef.current = { box: { width, height }, style: layer.style }
  }, [width, height, layer.style])

  /** Recorte para a caixa nova, na escala e no enquadramento do início do gesto */
  const recorteParaCaixa = React.useCallback(
    (novaLargura: number, novaAltura: number, anchor: string) => {
      const base = baseRecorteRef.current
      if (!base || !image) return undefined
      return cropForResizedBox(
        { width: image.width, height: image.height },
        base.box,
        { width: novaLargura, height: novaAltura },
        base.style,
        anchor,
      )
    },
    [image],
  )

  // Limpar cache durante transform para evitar conflito (Konva issue #835)
  const handleTransform = React.useCallback(() => {
    const imageNode = imageRef.current
    if (!imageNode) return

    // Limpar cache durante transform
    if (filters.length > 0) {
      imageNode.clearCache()
    }

    // Com wrapper (máscara/flip) quem é transformado é o Group
    const node = hasWrapper ? groupRef.current : imageRef.current
    if (!node || !image) return
    const anchor = anchorAtual(node)
    if (!LATERAL_ANCHORS.has(anchor)) return

    const novaLargura = Math.max(5, imageNode.width() * node.scaleX())
    const novaAltura = Math.max(5, imageNode.height() * node.scaleY())
    const crop = recorteParaCaixa(novaLargura, novaAltura, anchor)
    if (!crop) return

    node.scaleX(1)
    node.scaleY(1)
    imageNode.width(novaLargura)
    imageNode.height(novaAltura)
    if (hasWrapper) {
      imageNode.x(flipH ? novaLargura : 0)
      imageNode.y(flipV ? novaAltura : 0)
    }
    imageNode.cropX(crop.x * image.width)
    imageNode.cropY(crop.y * image.height)
    imageNode.cropWidth(crop.width * image.width)
    imageNode.cropHeight(crop.height * image.height)
    node.getLayer()?.batchDraw()
  }, [filters.length, hasWrapper, image, anchorAtual, recorteParaCaixa, flipH, flipV])

  // Handler customizado - recalcular crop manualmente
  const handleTransformEnd = React.useCallback(() => {
    const imageNode = imageRef.current
    // Com wrapper, o transformer escala o GROUP (que não tem width próprio);
    // a base do cálculo é o tamanho atual da imagem interna
    const node = hasWrapper ? groupRef.current : imageRef.current
    if (!node || !imageNode || !image) return

    const anchor = anchorAtual(node)
    const lateral = LATERAL_ANCHORS.has(anchor)

    const scaleX = node.scaleX()
    const scaleY = node.scaleY()

    // Calcular novas dimensões
    const newWidth = Math.max(5, imageNode.width() * scaleX)
    const newHeight = Math.max(5, imageNode.height() * scaleY)

    // Alça lateral: a janela muda, a imagem não estica — grava o recorte
    if (lateral) {
      const crop = recorteParaCaixa(newWidth, newHeight, anchor)
      baseRecorteRef.current = null
      if (crop) {
        node.scaleX(1)
        node.scaleY(1)
        imageNode.width(newWidth)
        imageNode.height(newHeight)
        if (hasWrapper) {
          imageNode.x(flipH ? newWidth : 0)
          imageNode.y(flipV ? newHeight : 0)
        }
        if (filters.length > 0) imageNode.cache()
        node.getLayer()?.batchDraw()

        onChange({
          position: { x: Math.round(node.x()), y: Math.round(node.y()) },
          size: { width: Math.round(newWidth), height: Math.round(newHeight) },
          rotation: Math.round(node.rotation()),
          style: { ...layer.style, crop },
        })
        return
      }
    }
    baseRecorteRef.current = null

    // Resetar scale
    node.scaleX(1)
    node.scaleY(1)

    // Aplicar novas dimensões na imagem (e reposicionar o pivô do flip)
    imageNode.width(newWidth)
    imageNode.height(newHeight)
    if (hasWrapper) {
      imageNode.x(flipH ? newWidth : 0)
      imageNode.y(flipV ? newHeight : 0)
    }

    // ✅ CRITICAL: Recalcular e aplicar crop IMEDIATAMENTE no node
    const newCrop = resolveImageSourceRect(
      { width: image.width, height: image.height },
      { width: newWidth, height: newHeight },
      layer.style,
    )
    if (newCrop) {
      imageNode.cropX(newCrop.cropX)
      imageNode.cropY(newCrop.cropY)
      imageNode.cropWidth(newCrop.cropWidth)
      imageNode.cropHeight(newCrop.cropHeight)
    }

    // ✅ Reaplicar cache após transform
    if (filters.length > 0) {
      imageNode.cache()
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
  }, [
    onChange,
    image,
    layer.style,
    filters.length,
    hasWrapper,
    flipH,
    flipV,
    anchorAtual,
    recorteParaCaixa,
  ])

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

  const visualProps = {
    image,
    ...crop,
    filters: filters.length ? filters : undefined,
    // Professional adjustments
    brightness: layer.style?.exposure ?? layer.style?.brightness ?? 0,
    contrast: layer.style?.contrast ?? 0,
    highlights: layer.style?.highlights ?? 0,
    shadows: layer.style?.shadows ?? 0,
    whites: layer.style?.whites ?? 0,
    blacks: layer.style?.blacks ?? 0,
    saturation: layer.style?.saturation ?? 0,
    // Effects filters
    blurRadius: layer.style?.blur ?? 0,
    vignette: layer.style?.vignette ?? 0,
    // Styling
    cornerRadius: borderRadius,
    stroke: borderWidth > 0 ? borderColor : undefined,
    strokeWidth: borderWidth > 0 ? borderWidth : undefined,
  }

  if (hasWrapper) {
    return (
      <Group
        {...imageProps}
        ref={groupRef}
        clipFunc={
          maskPath
            ? (ctx: Konva.Context) => {
                // Path congelado em viewBox 0 0 100 100 escalado para a caixa;
                // desfaz a escala em seguida para não afetar os filhos
                ctx.scale(width / 100, height / 100)
                traceSvgPath(ctx, maskPath)
                ctx.scale(100 / width, 100 / height)
              }
            : undefined
        }
        onTransformStart={handleTransformStart}
        // O transformer transforma o GROUP: os eventos de transform nascem
        // AQUI. Presos no KonvaImage de dentro (eventos do Konva sobem, não
        // descem) eles nunca disparavam com máscara ou flip ligados.
        onTransform={handleTransform}
        onTransformEnd={handleTransformEnd}
        onDblClick={handleDblClick}
        onDblTap={handleDblClick}
      >
        <KonvaImage
          ref={imageRef}
          {...visualProps}
          x={flipH ? width : 0}
          y={flipV ? height : 0}
          scaleX={flipH ? -1 : 1}
          scaleY={flipV ? -1 : 1}
          width={width}
          height={height}
        />
      </Group>
    )
  }

  return (
    <KonvaImage
      {...imageProps}
      ref={imageRef}
      {...visualProps}
      width={width}
      height={height}
      onTransformStart={handleTransformStart}
      onTransform={handleTransform}
      onTransformEnd={handleTransformEnd}
      onDblClick={handleDblClick}
      onDblTap={handleDblClick}
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
    // Centro relativo (0..1) e escala do raio — mesmos defaults do render-engine (export)
    const centerX = width * (layer.style?.gradientCenterX ?? 0.5)
    const centerY = height * (layer.style?.gradientCenterY ?? 0.5)
    const radius = (Math.max(width, height) / 2) * (layer.style?.gradientRadiusScale ?? 1)
    return (
      <Rect
        {...commonProps}
        ref={shapeRef as React.RefObject<Konva.Rect>}
        width={width}
        height={height}
        cornerRadius={borderRadius}
        fillRadialGradientStartPoint={{ x: centerX, y: centerY }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndPoint={{ x: centerX, y: centerY }}
        fillRadialGradientEndRadius={radius}
        fillRadialGradientColorStops={colorStops}
        stroke={borderWidth > 0 ? borderColor : undefined}
        strokeWidth={borderWidth > 0 ? borderWidth : undefined}
      />
    )
  }

  // Segmento customizado (área de aplicação) quando definido; senão eixo pelo ângulo
  const gradientPoints = resolveLinearGradientPoints(layer.style, width, height)

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
  const fill = applyOpacityToColor(
    layer.style?.fill ?? '#2563eb',
    getShapeChannelOpacity(layer, 'fill'),
  )
  const stroke = layer.style?.strokeColor
    ? applyOpacityToColor(layer.style.strokeColor, getShapeChannelOpacity(layer, 'stroke'))
    : borderWidth > 0
      ? applyOpacityToColor(borderColor, getShapeChannelOpacity(layer, 'stroke'))
      : undefined
  const strokeWidth = layer.style?.strokeWidth ?? borderWidth ?? 0
  const width = Math.max(10, layer.size?.width ?? 0)
  const height = Math.max(10, layer.size?.height ?? 0)

  // Blur da PRÓPRIA forma (o halo do canvas de design): o Konva só filtra
  // node CACHEADO, e o cache sem folga cortaria o desfoque na borda da caixa
  // — `offset` de 3× o raio é a mesma folga do render server-side
  // (renderShapeBlurred), para editor e arte concordarem. O cache é refeito
  // quando o que está desenhado muda (tamanho, cor, raio), não na posição.
  const blurRadius = layer.effects?.blur?.enabled ? (layer.effects.blur.blurRadius ?? 0) : 0
  const filters = React.useMemo(() => (blurRadius > 0 ? [Konva.Filters.Blur] : undefined), [blurRadius])
  React.useEffect(() => {
    const node = shapeRef.current
    if (!node) return
    node.clearCache()
    if (blurRadius > 0) node.cache({ offset: Math.ceil(blurRadius * 3) })
    node.getLayer()?.batchDraw()
  }, [shapeRef, blurRadius, shapeType, fill, stroke, strokeWidth, width, height, borderRadius])
  const blurProps = { filters, blurRadius }

  switch (shapeType) {
    case 'circle':
      return (
        <Circle
          {...commonProps}
          {...blurProps}
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
          {...blurProps}
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
          {...blurProps}
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
          {...blurProps}
          ref={shapeRef as React.RefObject<Konva.Line>}
          points={[0, height / 2, width * 0.7, height / 2, width * 0.7, height * 0.2, width, height / 2, width * 0.7, height * 0.8, width * 0.7, height / 2]}
          tension={0}
          closed
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      )
    case 'svg-path': {
      // Forma vetorial genérica: path normalizado (viewBox 0 0 100 100 por
      // padrão) desenhado via sceneFunc — o path é traçado JÁ escalado para a
      // caixa e o transform é restaurado antes do fill/stroke, então o stroke
      // não distorce (equivalente a strokeScaleEnabled=false) e o
      // handleTransformEnd genérico (width/height) continua valendo.
      const pathData = layer.style?.pathData
      if (!pathData) {
        return (
          <Rect
            {...commonProps}
            {...blurProps}
            ref={shapeRef as React.RefObject<Konva.Rect>}
            width={width}
            height={height}
            fill={fill}
          />
        )
      }
      const [vx, vy, vw, vh] = layer.style?.pathViewBox ?? [0, 0, 100, 100]
      return (
        <Shape
          {...commonProps}
          {...blurProps}
          ref={shapeRef as React.RefObject<Konva.Shape>}
          width={width}
          height={height}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          lineJoin="round"
          sceneFunc={(ctx, shape) => {
            ctx.save()
            ctx.scale(shape.width() / (vw || 1), shape.height() / (vh || 1))
            ctx.translate(-vx, -vy)
            ctx.beginPath()
            traceSvgPath(ctx as unknown as Konva.Context, pathData)
            ctx.restore()
            ctx.fillStrokeShape(shape)
          }}
        />
      )
    }
    case 'line': {
      const lineWidth = layer.style?.strokeWidth ?? 4
      const lineStyle = layer.style?.lineStyle ?? 'solid'
      const dash =
        lineStyle === 'dashed'
          ? [lineWidth * 2.5, lineWidth * 2]
          : lineStyle === 'dotted'
            ? [0.1, lineWidth * 2]
            : undefined
      const startArrow = layer.style?.lineStartCap === 'arrow'
      const endArrow = layer.style?.lineEndCap === 'arrow'
      if (startArrow || endArrow) {
        const pointer = Math.max(10, lineWidth * 3)
        return (
          <Arrow
            {...commonProps}
            ref={shapeRef as React.RefObject<Konva.Arrow>}
            points={[0, height / 2, width, height / 2]}
            stroke={fill}
            fill={fill}
            strokeWidth={lineWidth}
            dash={dash}
            pointerLength={pointer}
            pointerWidth={pointer}
            pointerAtBeginning={startArrow}
            pointerAtEnding={endArrow}
            lineCap="round"
            lineJoin="round"
          />
        )
      }
      return (
        <Line
          {...commonProps}
          ref={shapeRef as React.RefObject<Konva.Line>}
          points={[0, height / 2, width, height / 2]}
          stroke={fill}
          strokeWidth={lineWidth}
          dash={dash}
          lineCap="round"
          lineJoin="round"
        />
      )
    }
    case 'rounded-rectangle':
      return (
        <Rect
          {...commonProps}
          {...blurProps}
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
          {...blurProps}
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
