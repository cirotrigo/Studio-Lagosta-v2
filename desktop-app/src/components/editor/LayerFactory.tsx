import { useMemo } from 'react'
import {
  Group,
  Image as KonvaImage,
  Line,
  Rect,
  RegularPolygon,
  Star,
  Text,
  Circle,
} from 'react-konva'
import useImage from 'use-image'
import type { KonvaEventObject } from 'konva/lib/Node'
import { resolveImageCrop } from '@/lib/editor/image-fit'
import { resolveTextRenderState } from '@/lib/editor/text-layout'
import type { KonvaPage, Layer, KonvaShapeLayer } from '@/types/template'

interface LayerFactoryProps {
  page: KonvaPage
  layer: Layer
  isSelected: boolean
  onSelect: (event: KonvaEventObject<MouseEvent | TouchEvent>, layerId: string) => void
  onDragMove: (event: KonvaEventObject<DragEvent>, layer: Layer) => void
  onDragEnd: (event: KonvaEventObject<DragEvent>, layer: Layer) => void
  onDirectEdit: (layer: Layer) => void
}

function calculateGradientPoints(width: number, height: number, angle = 180) {
  const radians = ((180 - angle) / 180) * Math.PI
  const length = Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians))
  const halfX = (Math.sin(radians) * length) / 2
  const halfY = (Math.cos(radians) * length) / 2
  const centerX = width / 2
  const centerY = height / 2

  return {
    start: {
      x: centerX - halfX,
      y: centerY - halfY,
    },
    end: {
      x: centerX + halfX,
      y: centerY + halfY,
    },
  }
}

function renderShape(layer: KonvaShapeLayer) {
  const width = layer.width ?? 240
  const height = layer.height ?? 140
  const fill = layer.fill ?? '#F59E0B'
  const stroke = layer.stroke ?? '#111827'
  const strokeWidth = layer.strokeWidth ?? 0
  const cornerRadius = layer.cornerRadius ?? 0

  switch (layer.shape) {
    case 'circle':
      return (
        <Circle
          radius={Math.min(width, height) / 2}
          x={width / 2}
          y={height / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      )
    case 'triangle':
      return (
        <RegularPolygon
          sides={3}
          radius={Math.min(width, height) / 2}
          x={width / 2}
          y={height / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      )
    case 'star':
      return (
        <Star
          x={width / 2}
          y={height / 2}
          numPoints={5}
          innerRadius={Math.min(width, height) * 0.18}
          outerRadius={Math.min(width, height) / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      )
    case 'arrow':
      return (
        <Line
          points={layer.points ?? [0, height / 2, width - 30, height / 2, width - 60, height / 4, width, height / 2, width - 60, height * 0.75, width - 30, height / 2]}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth || 6}
          closed
        />
      )
    case 'line':
      return (
        <Line
          points={layer.points ?? [0, height / 2, width, height / 2]}
          stroke={stroke || fill}
          strokeWidth={strokeWidth || 8}
          lineCap="round"
        />
      )
    case 'rounded-rectangle':
      return (
        <Rect
          width={width}
          height={height}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          cornerRadius={cornerRadius || 24}
        />
      )
    case 'rectangle':
    default:
      return (
        <Rect
          width={width}
          height={height}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          cornerRadius={cornerRadius}
        />
      )
  }
}

export function LayerFactory({
  page,
  layer,
  isSelected,
  onSelect,
  onDragMove,
  onDragEnd,
  onDirectEdit,
}: LayerFactoryProps) {
  const [image] = useImage(
    layer.type === 'image' || layer.type === 'logo' || layer.type === 'icon' ? (layer.src ?? '') : '',
    'anonymous',
  )

  const commonProps = useMemo(
    () => ({
      id: layer.id,
      rotation: layer.rotation ?? 0,
      opacity: layer.opacity ?? 1,
      visible: layer.visible !== false,
      draggable: layer.locked ? false : layer.draggable !== false,
      onClick: (event: KonvaEventObject<MouseEvent | TouchEvent>) => onSelect(event, layer.id),
      onTap: (event: KonvaEventObject<MouseEvent | TouchEvent>) => onSelect(event, layer.id),
      onDragMove: (event: KonvaEventObject<DragEvent>) => onDragMove(event, layer),
      onDragEnd: (event: KonvaEventObject<DragEvent>) => onDragEnd(event, layer),
      onDblClick: () => onDirectEdit(layer),
      onDblTap: () => onDirectEdit(layer),
    }),
    [layer, onDirectEdit, onDragEnd, onDragMove, onSelect],
  )

  if (layer.type === 'text' || layer.type === 'rich-text') {
    const renderState = resolveTextRenderState(page, layer)

    return (
      <Text
        {...commonProps}
        x={renderState.x}
        y={renderState.y}
        width={renderState.width}
        height={renderState.height}
        text={renderState.text}
        fontFamily={layer.textStyle?.fontFamily ?? 'Inter'}
        fontSize={renderState.fontSize}
        fontStyle={
          `${layer.textStyle?.fontWeight ?? ''} ${layer.textStyle?.fontStyle ?? ''}`.trim() || 'normal'
        }
        fill={layer.textStyle?.fill ?? '#111827'}
        lineHeight={layer.textStyle?.lineHeight ?? 1.1}
        align={layer.textStyle?.align ?? 'left'}
        letterSpacing={layer.textStyle?.letterSpacing ?? 0}
        verticalAlign={layer.textStyle?.verticalAlign ?? 'top'}
        wrap="word"
        stroke={isSelected ? '#F59E0B' : undefined}
        strokeWidth={isSelected ? 0.6 : 0}
      />
    )
  }

  if (layer.type === 'image' || layer.type === 'logo' || layer.type === 'icon') {
    const width = layer.width ?? 280
    const height = layer.height ?? 220
    const crop =
      image && layer.type === 'image'
        ? resolveImageCrop(layer, image.width, image.height, width, height)
        : undefined
    const cornerRadius = layer.role === 'background' ? 0 : layer.type === 'image' ? 18 : 0
    const showBorder = layer.role !== 'background' || isSelected

    return (
      <Group {...commonProps} x={layer.x} y={layer.y}>
        <Rect
          width={width}
          height={height}
          cornerRadius={cornerRadius}
          fill={image ? undefined : '#E5E7EB'}
          stroke={showBorder ? (isSelected ? '#F59E0B' : '#CBD5E1') : undefined}
          strokeWidth={showBorder ? (isSelected ? 3 : 1) : 0}
          dash={showBorder && !image ? [8, 8] : undefined}
        />
        {image ? (
          <KonvaImage
            image={image}
            width={width}
            height={height}
            cornerRadius={cornerRadius}
            crop={crop}
          />
        ) : (
          <Text
            x={16}
            y={height / 2 - 14}
            width={width - 32}
            text="Defina a URL da imagem"
            align="center"
            fill="#64748B"
            fontSize={22}
          />
        )}
      </Group>
    )
  }

  if (layer.type === 'gradient' || layer.type === 'gradient2') {
    const width = layer.width ?? 280
    const height = layer.height ?? 240
    const { start, end } = calculateGradientPoints(width, height, layer.angle ?? 180)
    const colors = layer.colors.length > 1 ? layer.colors : ['#111827', '#F59E0B']
    const stops =
      layer.stops && layer.stops.length === colors.length
        ? layer.stops
        : colors.map((_, index) => index / Math.max(colors.length - 1, 1))

    return (
      <Rect
        {...commonProps}
        x={layer.x}
        y={layer.y}
        width={width}
        height={height}
        cornerRadius={18}
        fillLinearGradientStartPoint={start}
        fillLinearGradientEndPoint={end}
        fillLinearGradientColorStops={colors.flatMap((color, index) => [stops[index], color])}
        stroke={isSelected ? '#F59E0B' : undefined}
        strokeWidth={isSelected ? 3 : 0}
      />
    )
  }

  if (layer.type === 'shape') {
    return (
      <Group {...commonProps} x={layer.x} y={layer.y}>
        {renderShape(layer)}
        {isSelected ? (
          <Rect
            width={layer.width ?? 240}
            height={layer.height ?? 140}
            stroke="#F59E0B"
            strokeWidth={2}
            dash={[10, 8]}
            listening={false}
          />
        ) : null}
      </Group>
    )
  }

  return (
    <Group {...commonProps} x={layer.x} y={layer.y}>
      <Rect
        width={layer.width ?? 240}
        height={layer.height ?? 120}
        fill="#E2E8F0"
        stroke={isSelected ? '#F59E0B' : '#94A3B8'}
        strokeWidth={isSelected ? 3 : 1}
        cornerRadius={16}
        dash={[8, 8]}
      />
      <Text
        x={16}
        y={20}
        width={(layer.width ?? 240) - 32}
        text={`${layer.type} ainda nao possui renderer dedicado`}
        fill="#475569"
        fontSize={18}
        align="center"
      />
    </Group>
  )
}
