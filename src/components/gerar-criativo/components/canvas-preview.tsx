'use client'

import { useEffect, useRef, useState } from 'react'
import { Stage, Layer as KonvaLayer, Image, Text, Rect } from 'react-konva'
import { useImage } from 'react-konva-utils'
import type { Layer } from '@/types/template'
import type { ImageSource } from '@/lib/ai-creative-generator/layout-types'

interface CanvasPreviewProps {
  layers: Layer[]
  selectedLayerId: string | null
  onSelectLayer: (id: string | null) => void
  imageValues: Record<string, ImageSource>
  textValues: Record<string, string>
  hiddenLayerIds: Set<string>
  templateWidth?: number
  templateHeight?: number
}

function ImageLayer({
  layer,
  isSelected,
  onSelect,
  imageUrl,
}: {
  layer: Layer
  isSelected: boolean
  onSelect: () => void
  imageUrl?: string
}) {
  const src = imageUrl || layer.fileUrl || ''
  const [image] = useImage(src, 'anonymous')

  return (
    <Image
      image={image}
      x={layer.position?.x || 0}
      y={layer.position?.y || 0}
      width={layer.size?.width || 100}
      height={layer.size?.height || 100}
      rotation={layer.rotation || 0}
      opacity={layer.style?.opacity ?? 1}
      onClick={onSelect}
      onTap={onSelect}
      stroke={isSelected ? '#3b82f6' : undefined}
      strokeWidth={isSelected ? 4 : 0}
    />
  )
}

function applyTextTransform(text: string, transform?: string): string {
  if (!transform || transform === 'none') return text
  switch (transform) {
    case 'uppercase':
      return text.toUpperCase()
    case 'lowercase':
      return text.toLowerCase()
    case 'capitalize':
      return text.replace(/\b\w/g, (char) => char.toUpperCase())
    default:
      return text
  }
}

function TextLayer({
  layer,
  isSelected,
  onSelect,
  textOverride,
}: {
  layer: Layer
  isSelected: boolean
  onSelect: () => void
  textOverride?: string
}) {
  const rawContent = textOverride ?? layer.content ?? ''
  const content = applyTextTransform(rawContent, layer.style?.textTransform)

  // Build font style string (e.g., "bold italic")
  const fontStyle = [
    layer.style?.fontWeight === 'bold' || (typeof layer.style?.fontWeight === 'number' && layer.style.fontWeight >= 700) ? 'bold' : '',
    layer.style?.fontStyle === 'italic' ? 'italic' : '',
  ].filter(Boolean).join(' ') || 'normal'

  return (
    <Text
      text={content}
      x={layer.position?.x || 0}
      y={layer.position?.y || 0}
      width={layer.size?.width}
      height={layer.size?.height}
      fontSize={layer.style?.fontSize || 16}
      fontFamily={layer.style?.fontFamily || 'sans-serif'}
      fontStyle={fontStyle}
      fill={layer.style?.color || '#000'}
      align={layer.style?.textAlign || 'left'}
      lineHeight={(layer.style?.lineHeight || 1.2)}
      letterSpacing={layer.style?.letterSpacing || 0}
      opacity={layer.style?.opacity ?? 1}
      onClick={onSelect}
      onTap={onSelect}
    />
  )
}

function ShapeLayer({
  layer,
  isSelected,
  onSelect,
}: {
  layer: Layer
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <Rect
      x={layer.position?.x || 0}
      y={layer.position?.y || 0}
      width={layer.size?.width || 100}
      height={layer.size?.height || 100}
      fill={layer.style?.fill || '#ccc'}
      cornerRadius={layer.style?.border?.radius || 0}
      opacity={layer.style?.opacity ?? 1}
      onClick={onSelect}
      onTap={onSelect}
    />
  )
}

function GradientLayer({
  layer,
  isSelected,
  onSelect,
}: {
  layer: Layer
  isSelected: boolean
  onSelect: () => void
}) {
  const width = layer.size?.width || 100
  const height = layer.size?.height || 100
  const gradientStops = layer.style?.gradientStops || []
  const gradientAngle = layer.style?.gradientAngle || 0
  const gradientType = layer.style?.gradientType || 'linear'

  // Convert CSS gradient angle to Konva coordinates
  // CSS: 0deg = bottom→top, 90deg = left→right, 180deg = top→bottom
  // Math: 0rad = right, π/2 = up
  // Conversion: math_angle = css_angle - 90
  const angleRad = ((gradientAngle - 90) * Math.PI) / 180
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)

  // Calculate gradient points based on angle
  const startX = width / 2 - (cos * width) / 2
  const startY = height / 2 - (sin * height) / 2
  const endX = width / 2 + (cos * width) / 2
  const endY = height / 2 + (sin * height) / 2

  // Build color stops array for Konva
  const colorStops: (number | string)[] = []
  const sortedStops = [...gradientStops].sort((a, b) => a.position - b.position)

  sortedStops.forEach((stop) => {
    colorStops.push(stop.position)
    // Apply opacity to color if needed
    if (stop.opacity !== undefined && stop.opacity < 1) {
      // Convert hex to rgba
      const hex = stop.color.replace('#', '')
      const r = parseInt(hex.substring(0, 2), 16)
      const g = parseInt(hex.substring(2, 4), 16)
      const b = parseInt(hex.substring(4, 6), 16)
      colorStops.push(`rgba(${r},${g},${b},${stop.opacity})`)
    } else {
      colorStops.push(stop.color)
    }
  })

  // Fallback if no gradient stops defined
  if (colorStops.length === 0) {
    return (
      <Rect
        x={layer.position?.x || 0}
        y={layer.position?.y || 0}
        width={width}
        height={height}
        fill={layer.style?.fill || '#ccc'}
        cornerRadius={layer.style?.border?.radius || 0}
        opacity={layer.style?.opacity ?? 1}
        onClick={onSelect}
        onTap={onSelect}
      />
    )
  }

  if (gradientType === 'radial') {
    return (
      <Rect
        x={layer.position?.x || 0}
        y={layer.position?.y || 0}
        width={width}
        height={height}
        fillRadialGradientStartPoint={{ x: width / 2, y: height / 2 }}
        fillRadialGradientEndPoint={{ x: width / 2, y: height / 2 }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndRadius={Math.max(width, height) / 2}
        fillRadialGradientColorStops={colorStops}
        cornerRadius={layer.style?.border?.radius || 0}
        opacity={layer.style?.opacity ?? 1}
        onClick={onSelect}
        onTap={onSelect}
      />
    )
  }

  // Linear gradient
  return (
    <Rect
      x={layer.position?.x || 0}
      y={layer.position?.y || 0}
      width={width}
      height={height}
      fillLinearGradientStartPoint={{ x: startX, y: startY }}
      fillLinearGradientEndPoint={{ x: endX, y: endY }}
      fillLinearGradientColorStops={colorStops}
      cornerRadius={layer.style?.border?.radius || 0}
      opacity={layer.style?.opacity ?? 1}
      onClick={onSelect}
      onTap={onSelect}
    />
  )
}

function LayerRenderer({
  layer,
  isSelected,
  onSelect,
  imageUrl,
  textOverride,
}: {
  layer: Layer
  isSelected: boolean
  onSelect: () => void
  imageUrl?: string
  textOverride?: string
}) {
  if (layer.type === 'image' || layer.type === 'logo' || layer.type === 'element') {
    return (
      <ImageLayer layer={layer} isSelected={isSelected} onSelect={onSelect} imageUrl={imageUrl} />
    )
  }

  if (layer.type === 'text' || layer.type === 'rich-text') {
    return (
      <TextLayer
        layer={layer}
        isSelected={isSelected}
        onSelect={onSelect}
        textOverride={textOverride}
      />
    )
  }

  if (layer.type === 'gradient' || layer.type === 'gradient2') {
    return <GradientLayer layer={layer} isSelected={isSelected} onSelect={onSelect} />
  }

  if (layer.type === 'shape') {
    return <ShapeLayer layer={layer} isSelected={isSelected} onSelect={onSelect} />
  }

  return null
}

export function CanvasPreview({
  layers,
  selectedLayerId,
  onSelectLayer,
  imageValues,
  textValues,
  hiddenLayerIds,
  templateWidth = 1080,
  templateHeight = 1920,
}: CanvasPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const updateScale = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.clientWidth
        setScale(containerWidth / templateWidth)
      }
    }

    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [templateWidth])

  const visibleLayers = layers.filter((l) => !hiddenLayerIds.has(l.id) && l.visible !== false)

  return (
    <div ref={containerRef} className="w-full">
      <Stage
        width={templateWidth * scale}
        height={templateHeight * scale}
        scaleX={scale}
        scaleY={scale}
        onClick={(e) => {
          if (e.target === e.target.getStage()) {
            onSelectLayer(null)
          }
        }}
        onTap={(e) => {
          if (e.target === e.target.getStage()) {
            onSelectLayer(null)
          }
        }}
      >
        <KonvaLayer>
          <Rect x={0} y={0} width={templateWidth} height={templateHeight} fill="#f5f5f5" />
          {visibleLayers.map((layer) => (
            <LayerRenderer
              key={layer.id}
              layer={layer}
              isSelected={layer.id === selectedLayerId}
              onSelect={() => onSelectLayer(layer.id)}
              imageUrl={imageValues[layer.id]?.url}
              textOverride={textValues[layer.id]}
            />
          ))}
        </KonvaLayer>
      </Stage>
    </div>
  )
}
