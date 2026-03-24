import { useMemo } from 'react'
import {
  Group,
  Image as KonvaImage,
  Line,
  Rect,
  RegularPolygon,
  Star,
  Shape,
  Text,
  TextPath,
  Circle,
} from 'react-konva'
import useImage from 'use-image'
import type { KonvaEventObject } from 'konva/lib/Node'
import { resolveImageCrop } from '@/lib/editor/image-fit'
import { serializeFontFamilyStack } from '@/lib/editor/font-utils'
import { resolveTextRenderState } from '@/lib/editor/text-layout'
import { splitTextIntoSegments, type TextSegment } from '@/lib/editor/rich-text-parser'
import type { KonvaPage, Layer, KonvaShapeLayer, KonvaTextLayer } from '@/types/template'

interface LayerFactoryProps {
  page: KonvaPage
  layer: Layer
  isSelected: boolean
  isEditing?: boolean
  onSelect: (event: KonvaEventObject<MouseEvent | TouchEvent>, layerId: string) => void
  onDragMove: (event: KonvaEventObject<DragEvent>, layer: Layer) => void
  onDragEnd: (event: KonvaEventObject<DragEvent>, layer: Layer) => void
  onDirectEdit: (layer: Layer) => void
}

// ─── Rich Text Canvas Renderer ─────────────────────────────────────
// Draws text segments with per-segment styles using canvas 2D API.
// Handles word-wrapping and alignment within the bounding box.

interface RichTextRenderOpts {
  segments: TextSegment[]
  width: number
  height: number
  baseFontFamily: string
  baseFontSize: number
  baseFontWeight: string
  baseFontStyle: string
  baseFill: string
  lineHeight: number
  letterSpacing: number
  align: string
  verticalAlign: string
  baseUnderline?: boolean
  baseStrikethrough?: boolean
}

interface MeasuredWord {
  text: string
  segIdx: number
  width: number
}

function drawRichText(ctx: CanvasRenderingContext2D, opts: RichTextRenderOpts) {
  const {
    segments, width, height,
    baseFontFamily, baseFontSize, baseFontWeight, baseFontStyle, baseFill,
    lineHeight, letterSpacing, align, verticalAlign,
    baseUnderline, baseStrikethrough,
  } = opts

  const lineHeightPx = baseFontSize * lineHeight

  // Helper to build a canvas font string for a segment
  function fontFor(seg: TextSegment) {
    const weight = seg.style.fontWeight || baseFontWeight || 'normal'
    const style = seg.style.fontStyle || baseFontStyle || 'normal'
    const size = seg.style.fontSize || baseFontSize
    const family = seg.style.fontFamily || baseFontFamily
    return `${style} ${weight} ${size}px ${family}`
  }

  // Break segments into individual words with their segment index
  // We need to handle word wrapping correctly across segments
  const words: MeasuredWord[] = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    ctx.font = fontFor(seg)

    // Split on whitespace but keep track of spaces
    const parts = seg.text.split(/(\s+)/)
    for (const part of parts) {
      if (part.length === 0) continue
      const w = ctx.measureText(part).width + (part.trim().length > 0 ? letterSpacing * part.length : 0)
      words.push({ text: part, segIdx: i, width: w })
    }
  }

  // Layout words into lines
  type LineWord = MeasuredWord
  const lines: LineWord[][] = [[]]
  let currentLineWidth = 0

  for (const word of words) {
    // Handle explicit newlines
    if (word.text.includes('\n')) {
      const nlParts = word.text.split('\n')
      for (let n = 0; n < nlParts.length; n++) {
        if (n > 0) {
          lines.push([])
          currentLineWidth = 0
        }
        if (nlParts[n].length > 0) {
          ctx.font = fontFor(segments[word.segIdx])
          const w = ctx.measureText(nlParts[n]).width + letterSpacing * nlParts[n].length
          lines[lines.length - 1].push({ text: nlParts[n], segIdx: word.segIdx, width: w })
          currentLineWidth += w
        }
      }
      continue
    }

    const isSpace = word.text.trim().length === 0
    if (!isSpace && currentLineWidth + word.width > width && lines[lines.length - 1].length > 0) {
      // Word wrap
      lines.push([])
      currentLineWidth = 0
    }
    lines[lines.length - 1].push(word)
    currentLineWidth += word.width
  }

  // Calculate total text height for vertical alignment
  const totalHeight = lines.length * lineHeightPx
  let startY = 0
  if (verticalAlign === 'middle') {
    startY = Math.max(0, (height - totalHeight) / 2)
  } else if (verticalAlign === 'bottom') {
    startY = Math.max(0, height - totalHeight)
  }

  // Draw each line
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]
    const y = startY + lineIdx * lineHeightPx + baseFontSize * 0.85 // baseline offset

    // Calculate line width for alignment
    let lineWidth = 0
    for (const w of line) lineWidth += w.width

    let x = 0
    if (align === 'center') x = (width - lineWidth) / 2
    else if (align === 'right') x = width - lineWidth

    for (const word of line) {
      const seg = segments[word.segIdx]
      const fill = seg.style.fill || baseFill
      const fontSize = seg.style.fontSize || baseFontSize
      const underline = seg.style.underline ?? baseUnderline
      const strikethrough = seg.style.strikethrough ?? baseStrikethrough

      ctx.font = fontFor(seg)
      ctx.fillStyle = fill
      ctx.fillText(word.text, x, y)

      // Decorations
      const textWidth = word.width
      if (underline) {
        ctx.beginPath()
        ctx.strokeStyle = fill
        ctx.lineWidth = Math.max(1, fontSize * 0.07)
        ctx.moveTo(x, y + fontSize * 0.15)
        ctx.lineTo(x + textWidth, y + fontSize * 0.15)
        ctx.stroke()
      }
      if (strikethrough) {
        ctx.beginPath()
        ctx.strokeStyle = fill
        ctx.lineWidth = Math.max(1, fontSize * 0.07)
        const strikeY = y - fontSize * 0.3
        ctx.moveTo(x, strikeY)
        ctx.lineTo(x + textWidth, strikeY)
        ctx.stroke()
      }

      x += word.width
    }
  }
}

function hasRichStyles(layer: KonvaTextLayer): boolean {
  return !!(layer.richStyles && layer.richStyles.length > 0)
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

function hexToRgba(hex: string, opacity: number): string {
  const cleanHex = hex.replace('#', '')
  const r = parseInt(cleanHex.substring(0, 2), 16)
  const g = parseInt(cleanHex.substring(2, 4), 16)
  const b = parseInt(cleanHex.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

/**
 * Generates an SVG path for curved text using a quadratic Bezier curve.
 * The text will follow the curve and remain centered on the arc.
 * @param width - Width of the text area
 * @param height - Height of the text area
 * @param power - Curve power from -100 to 100 (negative = down, positive = up)
 */
function generateCurvedTextPath(width: number, height: number, power: number): string {
  // Power determines how much the curve bends
  // Positive = curve bends up (convex arc)
  // Negative = curve bends down (concave arc)

  // Calculate the maximum curve deflection (proportional to text dimensions)
  // Using 4x multiplier for very aggressive curve effect
  const maxDeflection = Math.min(width, height)
  const curveDeflection = (power / 100) * maxDeflection * 4

  // Center Y position - the baseline for start and end points
  const centerY = height / 2

  // For upward curve (positive power): control point is above center
  // For downward curve (negative power): control point is below center
  const controlY = centerY - curveDeflection

  // Start and end points are at center height, creating a symmetric arc
  // The text baseline will follow the curve
  const startY = centerY
  const endY = centerY

  // Use quadratic Bezier curve: M (move to start) Q (control point, end point)
  return `M 0,${startY} Q ${width / 2},${controlY} ${width},${endY}`
}

interface ShapeShadowProps {
  shadowColor?: string
  shadowBlur?: number
  shadowOffsetX?: number
  shadowOffsetY?: number
  shadowOpacity?: number
}

function renderShape(layer: KonvaShapeLayer, shadowProps: ShapeShadowProps = {}) {
  const width = layer.width ?? 240
  const height = layer.height ?? 140
  const baseFill = layer.fill ?? '#F59E0B'
  const baseStroke = layer.stroke ?? '#111827'
  const fillOpacity = layer.fillOpacity ?? 100
  const strokeOpacity = layer.strokeOpacity ?? 100
  const strokeWidth = layer.strokeWidth ?? 0
  const cornerRadius = layer.cornerRadius ?? 0
  const dash = layer.strokeStyle?.dashArray

  // Apply opacity to colors using RGBA
  const fill = fillOpacity < 100 ? hexToRgba(baseFill, fillOpacity / 100) : baseFill
  const stroke = strokeOpacity < 100 ? hexToRgba(baseStroke, strokeOpacity / 100) : baseStroke

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
          dash={dash}
          {...shadowProps}
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
          dash={dash}
          {...shadowProps}
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
          dash={dash}
          {...shadowProps}
        />
      )
    case 'arrow':
      return (
        <Line
          points={layer.points ?? [0, height / 2, width - 30, height / 2, width - 60, height / 4, width, height / 2, width - 60, height * 0.75, width - 30, height / 2]}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth || 6}
          dash={dash}
          closed
          {...shadowProps}
        />
      )
    case 'line':
      return (
        <Line
          points={layer.points ?? [0, height / 2, width, height / 2]}
          stroke={stroke || fill}
          strokeWidth={strokeWidth || 8}
          dash={dash}
          lineCap="round"
          {...shadowProps}
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
          dash={dash}
          cornerRadius={cornerRadius || 24}
          {...shadowProps}
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
          dash={dash}
          cornerRadius={cornerRadius}
          {...shadowProps}
        />
      )
  }
}

export function LayerFactory({
  page,
  layer,
  isSelected,
  isEditing,
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
      // Locked layers: disable dragging and all event listening (click-through)
      listening: !layer.locked,
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
    const effects = layer.effects

    // Drop Shadow
    const dropShadow = effects?.dropShadow?.enabled ? effects.dropShadow : null

    // Text Stroke
    const textStroke = effects?.textStroke?.enabled ? effects.textStroke : null

    // Text Background
    const textBackground = effects?.textBackground?.enabled ? effects.textBackground : null

    // Curved Text
    const curvedText = effects?.curvedText?.enabled && effects.curvedText.power !== 0 ? effects.curvedText : null

    // Build textDecoration from underline/strikethrough
    const decorations: string[] = []
    if (layer.textStyle?.underline) decorations.push('underline')
    if (layer.textStyle?.strikethrough) decorations.push('line-through')
    const textDecoration = decorations.length > 0 ? decorations.join(' ') : undefined

    // Common text styling props
    const textStyleProps = {
      fontFamily: serializeFontFamilyStack(layer.textStyle?.fontFamily),
      fontSize: renderState.fontSize,
      fontStyle:
        `${layer.textStyle?.fontWeight ?? ''} ${layer.textStyle?.fontStyle ?? ''}`.trim() || 'normal',
      fill: layer.textStyle?.fill ?? '#111827',
      letterSpacing: layer.textStyle?.letterSpacing ?? 0,
      textDecoration,
      // Text Stroke
      stroke: textStroke ? textStroke.color : isSelected ? '#F59E0B' : undefined,
      strokeWidth: textStroke ? textStroke.width : isSelected ? 0.6 : 0,
      // Drop Shadow
      shadowColor: dropShadow ? dropShadow.color : undefined,
      shadowBlur: dropShadow ? dropShadow.blur : undefined,
      shadowOffsetX: dropShadow ? dropShadow.offsetX : undefined,
      shadowOffsetY: dropShadow ? dropShadow.offsetY : undefined,
      shadowOpacity: dropShadow ? dropShadow.opacity / 100 : undefined,
    }

    // Render curved text using TextPath
    if (curvedText) {
      const curvePath = generateCurvedTextPath(renderState.width, renderState.height, curvedText.power)

      return (
        <Group {...commonProps} x={renderState.x} y={renderState.y} visible={!isEditing}>
          {/* Text Background */}
          {textBackground && (
            <Rect
              x={-textBackground.padding}
              y={-textBackground.padding}
              width={renderState.width + textBackground.padding * 2}
              height={renderState.height + textBackground.padding * 2}
              fill={textBackground.color}
              opacity={textBackground.opacity / 100}
              cornerRadius={textBackground.cornerRadius}
            />
          )}

          {/* Curved Text using TextPath */}
          <TextPath
            data={curvePath}
            text={renderState.text}
            align={layer.textStyle?.align ?? 'center'}
            {...textStyleProps}
          />
        </Group>
      )
    }

    // Rich text segments for canvas rendering
    const richSegments = hasRichStyles(layer)
      ? splitTextIntoSegments(renderState.text, layer.richStyles)
      : null

    return (
      <Group {...commonProps} x={renderState.x} y={renderState.y} visible={!isEditing}>
        {/* Text Background */}
        {textBackground && (
          <Rect
            x={-textBackground.padding}
            y={-textBackground.padding}
            width={renderState.width + textBackground.padding * 2}
            height={renderState.height + textBackground.padding * 2}
            fill={textBackground.color}
            opacity={textBackground.opacity / 100}
            cornerRadius={textBackground.cornerRadius}
          />
        )}

        {/* Rich text rendering via custom canvas draw */}
        {richSegments ? (
          <Shape
            width={renderState.width}
            height={renderState.height}
            // Drop Shadow
            shadowColor={dropShadow ? dropShadow.color : undefined}
            shadowBlur={dropShadow ? dropShadow.blur : undefined}
            shadowOffsetX={dropShadow ? dropShadow.offsetX : undefined}
            shadowOffsetY={dropShadow ? dropShadow.offsetY : undefined}
            shadowOpacity={dropShadow ? dropShadow.opacity / 100 : undefined}
            sceneFunc={(context) => {
              const ctx = (context as any)._context as CanvasRenderingContext2D
              drawRichText(ctx, {
                segments: richSegments,
                width: renderState.width,
                height: renderState.height,
                baseFontFamily: serializeFontFamilyStack(layer.textStyle?.fontFamily),
                baseFontSize: renderState.fontSize,
                baseFontWeight: layer.textStyle?.fontWeight ?? 'normal',
                baseFontStyle: layer.textStyle?.fontStyle ?? 'normal',
                baseFill: layer.textStyle?.fill ?? '#111827',
                lineHeight: layer.textStyle?.lineHeight ?? 1.1,
                letterSpacing: layer.textStyle?.letterSpacing ?? 0,
                align: layer.textStyle?.align ?? 'left',
                verticalAlign: layer.textStyle?.verticalAlign ?? 'top',
                baseUnderline: layer.textStyle?.underline,
                baseStrikethrough: layer.textStyle?.strikethrough,
              })
            }}
            hitFunc={(context, shape) => {
              context.beginPath()
              context.rect(0, 0, renderState.width, renderState.height)
              context.closePath()
              context.fillStrokeShape(shape)
            }}
          />
        ) : (
          <Text
            width={renderState.width}
            height={renderState.height}
            text={renderState.text}
            {...textStyleProps}
            lineHeight={layer.textStyle?.lineHeight ?? 1.1}
            align={layer.textStyle?.align ?? 'left'}
            verticalAlign={layer.textStyle?.verticalAlign ?? 'top'}
            wrap="word"
          />
        )}
      </Group>
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
    const rawColors = layer.colors ?? []
    const colors = rawColors.length > 1 ? rawColors : ['#111827', '#F59E0B']
    const stops =
      layer.stops && layer.stops.length === colors.length
        ? layer.stops
        : colors.map((_, index) => index / Math.max(colors.length - 1, 1))
    const opacities = layer.opacities && layer.opacities.length === colors.length
      ? layer.opacities
      : colors.map(() => 1)

    // Build color stops with opacity support
    const colorStops = colors.flatMap((color, index) => [
      stops[index],
      opacities[index] < 1 ? hexToRgba(color, opacities[index]) : color,
    ])

    const isRadial = layer.gradientType === 'radial'

    if (isRadial) {
      const radius = Math.max(width, height) / 2
      return (
        <Rect
          {...commonProps}
          x={layer.x}
          y={layer.y}
          width={width}
          height={height}
          cornerRadius={18}
          fillRadialGradientStartPoint={{ x: width / 2, y: height / 2 }}
          fillRadialGradientStartRadius={0}
          fillRadialGradientEndPoint={{ x: width / 2, y: height / 2 }}
          fillRadialGradientEndRadius={radius}
          fillRadialGradientColorStops={colorStops}
          stroke={isSelected ? '#F59E0B' : undefined}
          strokeWidth={isSelected ? 3 : 0}
        />
      )
    }

    const { start, end } = calculateGradientPoints(width, height, layer.angle ?? 180)
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
        fillLinearGradientColorStops={colorStops}
        stroke={isSelected ? '#F59E0B' : undefined}
        strokeWidth={isSelected ? 3 : 0}
      />
    )
  }

  if (layer.type === 'shape') {
    const effects = layer.effects
    const dropShadow = effects?.dropShadow?.enabled ? effects.dropShadow : null

    const shadowProps: ShapeShadowProps = dropShadow
      ? {
          shadowColor: dropShadow.color,
          shadowBlur: dropShadow.blur,
          shadowOffsetX: dropShadow.offsetX,
          shadowOffsetY: dropShadow.offsetY,
          shadowOpacity: dropShadow.opacity / 100,
        }
      : {}

    return (
      <Group {...commonProps} x={layer.x} y={layer.y}>
        {renderShape(layer, shadowProps)}
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
