"use client"

import * as React from 'react'
import Konva from 'konva'
import { Group, Text } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Layer, LayerStyle, RichTextStyle } from '@/types/template'
import type { TextStyleSegment, RichTextRenderOptions, LayoutResult } from '@/types/rich-text'

/**
 * KonvaMultiStyledText - Componente para renderizar texto com múltiplos estilos
 *
 * Permite diferentes cores, fontes e formatações em trechos específicos do texto.
 * Renderiza como Group de múltiplos Text nodes posicionados automaticamente.
 *
 * Funcionalidades:
 * - Parsing de richTextStyles em segments
 * - Layout automático com quebra de linha
 * - Alinhamento (left, center, right)
 * - Suporte a eventos (click, drag, etc.) no Group pai
 *
 * @see /prompts/plano-texto-konva.md para documentação completa
 */

interface KonvaMultiStyledTextProps {
  layer: Layer
  shapeRef: React.RefObject<Konva.Group | null>
  commonProps: {
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
  onChange: (updates: Partial<Layer>) => void
}

export function KonvaMultiStyledText({
  layer,
  shapeRef,
  commonProps,
  onChange,
}: KonvaMultiStyledTextProps) {
  // Parsear rich text styles em segments
  const segments = React.useMemo(() => {
    return parseRichTextSegments(
      layer.content ?? '',
      layer.richTextStyles ?? [],
      layer.style // Estilo base
    )
  }, [layer.content, layer.richTextStyles, layer.style])

  // Calcular layout (posição de cada segment)
  const layout = React.useMemo(() => {
    const options: RichTextRenderOptions = {
      maxWidth: layer.size?.width,
      lineHeight: layer.style?.lineHeight ?? 1.2,
      textAlign: layer.style?.textAlign ?? 'left',
      wrap: true,
      breakMode: 'word',
      useCache: false,
      pixelRatio: 2,
      padding: 0,
    }

    return calculateSegmentLayout(segments, options)
  }, [segments, layer.size, layer.style])

  return (
    <Group
      {...commonProps}
      ref={shapeRef as any}
      width={layout.bounds.width}
      height={layout.bounds.height}
    >
      {layout.segments.map((segment, index) => (
        <Text
          key={`segment-${index}-${segment.start}`}
          x={segment.x ?? 0}
          y={segment.y ?? 0}
          text={segment.text}
          fontSize={segment.style.fontSize}
          fontFamily={segment.style.fontFamily}
          fontStyle={segment.style.fontStyle}
          fill={segment.style.fill}
          textDecoration={segment.style.textDecoration}
          letterSpacing={segment.style.letterSpacing ?? 0}
          stroke={segment.style.stroke?.color}
          strokeWidth={segment.style.stroke?.width}
          shadowColor={segment.style.shadow?.color}
          shadowBlur={segment.style.shadow?.blur}
          shadowOffsetX={segment.style.shadow?.offset.x}
          shadowOffsetY={segment.style.shadow?.offset.y}
          listening={false} // Eventos no Group pai
          perfectDrawEnabled={true}
          imageSmoothingEnabled={true}
        />
      ))}
    </Group>
  )
}

/**
 * Parsear texto com estilos em segments individuais
 *
 * Divide o texto em trechos baseado nos richTextStyles fornecidos.
 * Cada segment tem seu próprio estilo e posição no texto.
 *
 * @param text - Texto completo
 * @param styles - Array de estilos com start/end
 * @param baseStyle - Estilo base do layer (fallback)
 * @returns Array de segments com estilos aplicados
 */
function parseRichTextSegments(
  text: string,
  styles: RichTextStyle[],
  baseStyle?: LayerStyle
): TextStyleSegment[] {
  if (!text) return []

  // Se não há estilos customizados, retornar texto todo com estilo base
  if (!styles || styles.length === 0) {
    return [
      {
        text,
        start: 0,
        end: text.length,
        style: createStyleFromBase(baseStyle),
      },
    ]
  }

  // Ordenar estilos por posição inicial
  const sortedStyles = [...styles].sort((a, b) => a.start - b.start)

  const segments: TextStyleSegment[] = []
  let currentPos = 0

  for (const richStyle of sortedStyles) {
    const start = Math.max(0, richStyle.start)
    const end = Math.min(text.length, richStyle.end)

    // Se há gap entre estilos, adicionar segment com estilo base
    if (start > currentPos) {
      segments.push({
        text: text.substring(currentPos, start),
        start: currentPos,
        end: start,
        style: createStyleFromBase(baseStyle),
      })
    }

    // Adicionar segment com estilo customizado
    if (end > start) {
      segments.push({
        text: text.substring(start, end),
        start,
        end,
        style: mergeStyles(createStyleFromBase(baseStyle), richStyle),
      })
    }

    currentPos = Math.max(currentPos, end)
  }

  // Adicionar texto restante com estilo base
  if (currentPos < text.length) {
    segments.push({
      text: text.substring(currentPos),
      start: currentPos,
      end: text.length,
      style: createStyleFromBase(baseStyle),
    })
  }

  return segments
}

/**
 * Calcular layout de segments com quebra de linha e alinhamento
 *
 * Posiciona cada segment no canvas considerando:
 * - Largura máxima (quebra de linha)
 * - Alinhamento de texto
 * - Line height
 * - Espaçamento entre caracteres
 *
 * @param segments - Segments a serem posicionados
 * @param options - Opções de renderização
 * @returns Layout com posições calculadas
 */
function calculateSegmentLayout(
  segments: TextStyleSegment[],
  options: RichTextRenderOptions
): LayoutResult {
  if (segments.length === 0) {
    return {
      segments: [],
      lines: [],
      bounds: { width: 0, height: 0 },
    }
  }

  // Criar canvas temporário para medições precisas
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return {
      segments: [],
      lines: [],
      bounds: { width: 0, height: 0 },
    }
  }

  const lines: Array<{
    segments: TextStyleSegment[]
    y: number
    width: number
    height: number
  }> = []

  let currentLine: TextStyleSegment[] = []
  let currentLineWidth = 0
  let maxLineWidth = 0
  let yOffset = 0

  for (const segment of segments) {
    const style = segment.style
    const fontSize = style.fontSize ?? 16

    // Configurar font do canvas para medição
    const fontStyle = style.fontStyle ?? 'normal'
    const fontFamily = style.fontFamily ?? 'Inter'
    ctx.font = `${fontStyle} ${fontSize}px ${fontFamily}`

    // Medir largura do segment
    const metrics = ctx.measureText(segment.text)
    const segmentWidth = metrics.width + (style.letterSpacing ?? 0) * segment.text.length

    // Verificar se precisa quebrar linha
    const needsBreak =
      options.wrap &&
      options.maxWidth &&
      currentLineWidth + segmentWidth > options.maxWidth &&
      currentLine.length > 0

    if (needsBreak) {
      // Finalizar linha atual
      const lineHeight = Math.max(...currentLine.map((s) => s.style.fontSize ?? 16))
      lines.push({
        segments: currentLine,
        y: yOffset,
        width: currentLineWidth,
        height: lineHeight,
      })

      maxLineWidth = Math.max(maxLineWidth, currentLineWidth)
      yOffset += lineHeight * options.lineHeight

      // Iniciar nova linha
      currentLine = []
      currentLineWidth = 0
    }

    // Adicionar segment à linha atual
    currentLine.push({
      ...segment,
      width: segmentWidth,
      height: fontSize,
    })
    currentLineWidth += segmentWidth
  }

  // Adicionar última linha
  if (currentLine.length > 0) {
    const lineHeight = Math.max(...currentLine.map((s) => s.style.fontSize ?? 16))
    lines.push({
      segments: currentLine,
      y: yOffset,
      width: currentLineWidth,
      height: lineHeight,
    })
    maxLineWidth = Math.max(maxLineWidth, currentLineWidth)
    yOffset += lineHeight * options.lineHeight
  }

  // Calcular posições finais com alinhamento
  const positionedSegments: TextStyleSegment[] = []

  for (const line of lines) {
    let xOffset = 0

    // Aplicar alinhamento
    if (options.textAlign === 'center') {
      xOffset = (maxLineWidth - line.width) / 2
    } else if (options.textAlign === 'right') {
      xOffset = maxLineWidth - line.width
    }

    for (const segment of line.segments) {
      positionedSegments.push({
        ...segment,
        x: xOffset,
        y: line.y,
      })
      xOffset += segment.width ?? 0
    }
  }

  return {
    segments: positionedSegments,
    lines,
    bounds: {
      width: maxLineWidth,
      height: yOffset,
    },
  }
}

/**
 * Criar RichTextStyle a partir de LayerStyle base
 */
function createStyleFromBase(baseStyle?: LayerStyle): RichTextStyle {
  return {
    start: 0,
    end: 0,
    fontFamily: baseStyle?.fontFamily ?? 'Inter',
    fontSize: baseStyle?.fontSize ?? 16,
    fill: baseStyle?.color ?? '#000000',
    fontStyle: (baseStyle?.fontStyle ?? 'normal') as 'normal' | 'italic' | 'bold' | 'bold italic',
    textDecoration: 'none',
    letterSpacing: baseStyle?.letterSpacing ?? 0,
  }
}

/**
 * Merge de estilo base com estilo customizado
 * Estilo customizado tem prioridade
 */
function mergeStyles(baseStyle: RichTextStyle, customStyle: RichTextStyle): RichTextStyle {
  return {
    start: customStyle.start,
    end: customStyle.end,
    fontFamily: customStyle.fontFamily ?? baseStyle.fontFamily,
    fontSize: customStyle.fontSize ?? baseStyle.fontSize,
    fill: customStyle.fill ?? baseStyle.fill,
    fontStyle: customStyle.fontStyle ?? baseStyle.fontStyle,
    textDecoration: customStyle.textDecoration ?? baseStyle.textDecoration,
    letterSpacing: customStyle.letterSpacing ?? baseStyle.letterSpacing,
    stroke: customStyle.stroke ?? baseStyle.stroke,
    shadow: customStyle.shadow ?? baseStyle.shadow,
  }
}
