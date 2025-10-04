"use client"

import * as React from 'react'
import Konva from 'konva'
import { Rect, Image as KonvaImage, Circle, RegularPolygon, Line, Star, Path } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import useImage from 'use-image'
import type { Layer } from '@/types/template'
import { ICON_PATHS } from '@/lib/assets/icon-library'
import { KonvaImageCrop } from './konva-image-crop'
import { KonvaEditableText } from './konva-editable-text'

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

  const handleDragMove = React.useCallback<CommonProps['onDragMove']>(
    (event) => {
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
    },
    [interactionsDisabled, onDragMove],
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

function ImageNode({ layer, commonProps, shapeRef, borderColor, borderWidth, borderRadius, onChange, stageRef }: ImageNodeProps) {
  const [image] = useImage(layer.fileUrl ?? '', layer.fileUrl?.startsWith('http') ? 'anonymous' : undefined)
  const imageRef = React.useRef<Konva.Image>(null)
  const [isCropMode, setIsCropMode] = React.useState(false)

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
  }, [filters, image])

  const width = Math.max(20, layer.size?.width ?? 0)
  const height = Math.max(20, layer.size?.height ?? 0)

  // Handler para duplo clique - ativar modo crop
  const handleDblClick = React.useCallback(() => {
    if (image && !commonProps.listening) return
    setIsCropMode(true)
  }, [image, commonProps.listening])

  const handleCropConfirm = React.useCallback(
    (croppedDataUrl: string) => {
      // Atualizar a imagem com a versão cropada
      onChange({
        fileUrl: croppedDataUrl,
      })
      setIsCropMode(false)
    },
    [onChange]
  )

  const handleCropCancel = React.useCallback(() => {
    setIsCropMode(false)
  }, [])

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

  return (
    <>
      <KonvaImage
        {...commonProps}
        ref={imageRef}
        image={image}
        width={width}
        height={height}
        filters={filters.length ? filters : undefined}
        blurRadius={layer.style?.blur ?? 0}
        brightness={layer.style?.brightness ?? 0}
        contrast={layer.style?.contrast ?? 0}
        cornerRadius={borderRadius}
        stroke={borderWidth > 0 ? borderColor : undefined}
        strokeWidth={borderWidth > 0 ? borderWidth : undefined}
        onDblClick={handleDblClick}
        onDblTap={handleDblClick}
      />
      {isCropMode && imageRef.current && stageRef && (
        <KonvaImageCrop
          imageNode={imageRef.current}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
          stageRef={stageRef}
        />
      )}
    </>
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
          { position: 0, color: '#000000' },
          { position: 1, color: '#ffffff' },
        ]
    return stops.flatMap((stop) => [stop.position ?? 0, stop.color ?? '#000000'])
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
        fillRadialGradientStartPoint={{ x: width / 2, y: height / 2 }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndPoint={{ x: width / 2, y: height / 2 }}
        fillRadialGradientEndRadius={Math.max(width, height) / 2}
        fillRadialGradientColorStops={colorStops}
        stroke={borderWidth > 0 ? borderColor : undefined}
        strokeWidth={borderWidth > 0 ? borderWidth : undefined}
      />
    )
  }

  return (
    <Rect
      {...commonProps}
      ref={shapeRef as React.RefObject<Konva.Rect>}
      width={width}
      height={height}
      cornerRadius={borderRadius}
      fillLinearGradientStartPoint={{ x: 0, y: 0 }}
      fillLinearGradientEndPoint={{
        x: Math.cos((angle * Math.PI) / 180) * width,
        y: Math.sin((angle * Math.PI) / 180) * height,
      }}
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
