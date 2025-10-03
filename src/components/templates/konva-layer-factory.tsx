"use client"

import * as React from 'react'
import Konva from 'konva'
import { Text, Rect, Image as KonvaImage } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import useImage from 'use-image'
import type { Layer } from '@/types/template'

type KonvaFilter = (typeof Konva.Filters)[keyof typeof Konva.Filters]

interface KonvaLayerFactoryProps {
  layer: Layer
  isSelected: boolean
  onSelect: (event: KonvaEventObject<MouseEvent | TouchEvent>, layer: Layer) => void
  onChange: (updates: Partial<Layer>) => void
  onDragMove?: (event: KonvaEventObject<DragEvent>) => void
  onDragEnd?: () => void
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

export function KonvaLayerFactory({ layer, isSelected, onSelect, onChange, onDragMove, onDragEnd }: KonvaLayerFactoryProps) {
  const shapeRef = React.useRef<Konva.Shape | null>(null)

  const isVisible = layer.visible !== false
  const isLocked = !!layer.locked
  const opacity = isVisible ? layer.style?.opacity ?? 1 : 0.25

  const handleSelect = React.useCallback(
    (event: KonvaEventObject<MouseEvent | TouchEvent>) => {
      onSelect(event, layer)
    },
    [layer, onSelect],
  )

  const handleDragStart = React.useCallback(
    (event: KonvaEventObject<DragEvent>) => {
      onSelect(event as unknown as KonvaEventObject<MouseEvent | TouchEvent>, layer)
    },
    [layer, onSelect],
  )

  const handleMouseDown = React.useCallback(
    (event: KonvaEventObject<MouseEvent>) => {
      onSelect(event as unknown as KonvaEventObject<MouseEvent | TouchEvent>, layer)
    },
    [layer, onSelect],
  )

  const handleTouchStart = React.useCallback(
    (event: KonvaEventObject<TouchEvent>) => {
      onSelect(event as unknown as KonvaEventObject<MouseEvent | TouchEvent>, layer)
    },
    [layer, onSelect],
  )

  const handleDragEnd = React.useCallback<CommonProps['onDragEnd']>(
    (event) => {
      const node = event.target
      onChange({
        position: {
          x: Math.round(node.x()),
          y: Math.round(node.y()),
        },
      })
      onDragEnd?.()
    },
    [onChange, onDragEnd],
  )

  const handleDragMove = React.useCallback<CommonProps['onDragMove']>(
    (event) => {
      onDragMove?.(event)
    },
    [onDragMove],
  )

  const handleTransformEnd = React.useCallback<CommonProps['onTransformEnd']>(
    () => {
      const node = shapeRef.current
      if (!node) return

      const scaleX = node.scaleX()
      const scaleY = node.scaleY()

      node.scaleX(1)
      node.scaleY(1)

      onChange({
        position: {
          x: Math.round(node.x()),
          y: Math.round(node.y()),
        },
        size: {
          width: Math.max(5, Math.round(node.width() * scaleX)),
          height: Math.max(5, Math.round(node.height() * scaleY)),
        },
        rotation: Math.round(node.rotation()),
      })
    },
    [onChange],
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
    draggable: !isLocked && isVisible,
    listening: isVisible || isSelected,
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
        <Text
          {...commonProps}
          ref={shapeRef as React.RefObject<Konva.Text>}
          text={layer.content ?? ''}
          width={Math.max(20, layer.size?.width ?? 0)}
          height={Math.max(20, layer.size?.height ?? 0)}
          fontSize={layer.style?.fontSize ?? 16}
          fontFamily={layer.style?.fontFamily ?? 'Inter'}
          fontStyle={layer.style?.fontStyle ?? 'normal'}
          fontVariant={layer.style?.fontWeight ? String(layer.style.fontWeight) : undefined}
          fill={layer.style?.color ?? '#000000'}
          align={layer.style?.textAlign ?? 'left'}
          padding={6}
          lineHeight={layer.style?.lineHeight ?? 1.2}
          letterSpacing={layer.style?.letterSpacing ?? 0}
          wrap="word"
          ellipsis={false}
          listening={commonProps.listening}
          perfectDrawEnabled={false}
          stroke={borderWidth > 0 ? borderColor : undefined}
          strokeWidth={borderWidth > 0 ? borderWidth : undefined}
        />
      )

    case 'image':
    case 'logo':
    case 'element':
      return <ImageNode layer={layer} commonProps={commonProps} shapeRef={shapeRef} borderColor={borderColor} borderWidth={borderWidth} borderRadius={borderRadius} />

    case 'gradient':
    case 'gradient2':
      return <GradientNode layer={layer} commonProps={commonProps} shapeRef={shapeRef} borderColor={borderColor} borderWidth={borderWidth} borderRadius={borderRadius} />

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
}

function ImageNode({ layer, commonProps, shapeRef, borderColor, borderWidth, borderRadius }: ImageNodeProps) {
  const [image] = useImage(layer.fileUrl ?? '', layer.fileUrl?.startsWith('http') ? 'anonymous' : undefined)
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
