"use client"

import * as React from 'react'
import { createRoot } from 'react-dom/client'
import Konva from 'konva'
import { Group, Text, Rect } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Layer, LayerStyle, RichTextStyle } from '@/types/template'
import type { TextStyleSegment, RichTextRenderOptions, LayoutResult } from '@/types/rich-text'
import { RichTextEditorModal } from './modals/rich-text-editor-modal'

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
  projectId?: number
}

export function KonvaMultiStyledText({
  layer,
  shapeRef,
  commonProps,
  onChange,
  projectId = 0,
}: KonvaMultiStyledTextProps) {
  const [modalOpen, setModalOpen] = React.useState(false)

  // DEBUG: Log quando componente é montado
  React.useEffect(() => {
    console.log('✨ KonvaMultiStyledText montado!', {
      layerId: layer.id,
      content: layer.content,
      listening: commonProps.listening,
      draggable: commonProps.draggable,
      position: { x: commonProps.x, y: commonProps.y }
    })
  }, [])

  // DEBUG: Log quando modal abre/fecha
  React.useEffect(() => {
    console.log(modalOpen ? '📂 Modal ABERTO' : '📁 Modal fechado')
  }, [modalOpen])

  // Apply text transform based on style (uppercase, lowercase, capitalize)
  const applyTextTransform = React.useCallback((text: string, transform?: string) => {
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
  }, [])

  // Get display text with transform applied
  const displayText = React.useMemo(() => {
    return applyTextTransform(layer.content ?? '', layer.style?.textTransform)
  }, [layer.content, layer.style?.textTransform, applyTextTransform])

  // Handler para clique simples
  const handleClick = React.useCallback((event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    console.log('👆 Rich text clicado (click simples)')
    commonProps.onClick(event)
  }, [commonProps])

  // Handler para duplo-clique - abre modal de edição
  const handleDblClick = React.useCallback((event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    console.log('👆👆 Rich text DUPLO-CLICADO! Abrindo modal...')
    event.cancelBubble = true
    setModalOpen(true)
  }, [])

  // Snapshot do layer quando o modal abre (não muda durante a edição)
  const layerSnapshot = React.useRef<Layer | null>(null)

  // Ref para onChange (sempre atualizado, mas não causa re-render)
  const onChangeRef = React.useRef(onChange)
  React.useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  React.useEffect(() => {
    if (modalOpen && !layerSnapshot.current) {
      console.log('📸 Capturando snapshot do layer:', layer.id)
      layerSnapshot.current = layer
    } else if (!modalOpen) {
      console.log('🗑️ Limpando snapshot do layer')
      layerSnapshot.current = null
    }
  }, [modalOpen, layer])

  // Handler para salvar mudanças do modal
  // Usa ref para onChange - não causa recriação do modal
  const handleSaveFromModal = React.useCallback(
    (content: string, styles: RichTextStyle[]) => {
      console.log('💾 Salvando mudanças do modal')
      onChangeRef.current({
        content,
        richTextStyles: styles,
      })
      setModalOpen(false)
    },
    [] // ← SEM dependências - usa ref
  )

  // Parsear rich text styles em segments
  const segments = React.useMemo(() => {
    const parsed = parseRichTextSegments(
      displayText, // ← USAR displayText em vez de layer.content
      layer.richTextStyles ?? [],
      layer.style // Estilo base
    )

    // DEBUG: Log para verificar parsing
    console.log('📝 KonvaMultiStyledText parsing:', {
      originalContent: layer.content,
      displayText: displayText,
      textTransform: layer.style?.textTransform,
      richTextStyles: layer.richTextStyles,
      segments: parsed,
      hasContent: !!layer.content,
      segmentCount: parsed.length
    })

    return parsed
  }, [displayText, layer.richTextStyles, layer.style])

  // Calcular layout (posição de cada segment)
  const layout = React.useMemo(() => {
    // Criar um Text do Konva temporário para calcular quebras de linha
    // usando o mesmo algoritmo que o KonvaEditableText usa
    const tempText = new Konva.Text({
      text: displayText,
      width: layer.size?.width ?? 240,
      fontSize: layer.style?.fontSize ?? 16,
      fontFamily: layer.style?.fontFamily ?? 'Inter',
      fontStyle: layer.style?.fontStyle ?? 'normal',
      lineHeight: layer.style?.lineHeight ?? 1.2,
      letterSpacing: layer.style?.letterSpacing ?? 0,
      padding: 6,
      wrap: 'word',
    })

    const options: RichTextRenderOptions = {
      maxWidth: layer.size?.width,
      lineHeight: layer.style?.lineHeight ?? 1.2,
      textAlign: layer.style?.textAlign ?? 'left',
      wrap: true,
      breakMode: 'word',
      useCache: false,
      pixelRatio: 2,
      padding: 6, // ← Mesmo padding que KonvaEditableText
    }

    // Usar as quebras de linha calculadas pelo Konva
    const textLines = tempText.textArr || []

    console.log('🔍 Konva calculou quebras de linha:', {
      numLines: textLines.length,
      lines: textLines.map(l => ({ text: l.text, width: l.width })),
      layerWidth: layer.size?.width,
    })

    const calculatedLayout = calculateSegmentLayout(segments, options, textLines)

    // DEBUG: Log layout calculado com TODOS os detalhes
    console.log('📐 KonvaMultiStyledText layout:', {
      bounds: calculatedLayout.bounds,
      layerSize: layer.size,
      segmentCount: calculatedLayout.segments.length,
      lines: calculatedLayout.lines.length,
      segments: calculatedLayout.segments.map(s => ({
        text: s.text,
        x: s.x,
        y: s.y,
        width: s.width,
        height: s.height
      }))
    })

    // GARANTIR que sempre tenha dimensões válidas para seleção
    // Se não há bounds calculados, usar size do layer ou valores mínimos
    if (calculatedLayout.bounds.width === 0 || calculatedLayout.bounds.height === 0) {
      console.warn('⚠️ Rich text layout com bounds zero, usando fallback', {
        layerSize: layer.size,
        fallbackWidth: layer.size?.width ?? 100,
        fallbackHeight: layer.size?.height ?? 50
      })
      return {
        ...calculatedLayout,
        bounds: {
          width: layer.size?.width ?? 100,
          height: layer.size?.height ?? 50,
        }
      }
    }

    return calculatedLayout
  }, [segments, layer.size, layer.style, displayText])

  // Renderizar modal fora da árvore Konva usando useEffect
  React.useEffect(() => {
    console.log('⚡ useEffect do modal disparou:', {
      modalOpen,
      hasDocument: typeof document !== 'undefined',
      hasSnapshot: !!layerSnapshot.current,
      projectId,
    })

    if (!modalOpen || typeof document === 'undefined' || !layerSnapshot.current) {
      console.log('❌ Não vai criar modal (condição não satisfeita)')
      return
    }

    console.log('🔧 Criando modal fora do Konva...', {
      modalOpen,
      hasSnapshot: !!layerSnapshot.current,
      projectId,
    })

    // Usar snapshot do layer (não muda durante edição, evita recriar modal)
    const currentLayer = layerSnapshot.current

    // Criar container div para o modal
    const modalContainer = document.createElement('div')
    modalContainer.id = `rich-text-modal-${currentLayer.id}`
    document.body.appendChild(modalContainer)

    // Renderizar modal no container usando createRoot
    const root = createRoot(modalContainer)
    root.render(
      <RichTextEditorModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        layer={currentLayer}
        projectId={projectId}
        onSave={handleSaveFromModal}
      />
    )

    console.log('✅ Modal criado e renderizado fora do Konva!')

    // Cleanup: remover modal quando fechar ou componente desmontar
    // IMPORTANTE: usar setTimeout para fazer unmount assíncrono (evita race condition)
    return () => {
      console.log('🗑️ Removendo modal do DOM...')
      setTimeout(() => {
        root.unmount()
        setTimeout(() => {
          modalContainer.remove()
        }, 0)
      }, 0)
    }
  }, [modalOpen, projectId, handleSaveFromModal])

  // Usar dimensões do layer (preservar caixa de texto original)
  const boxWidth = layer.size?.width ?? layout.bounds.width
  const boxHeight = layer.size?.height ?? layout.bounds.height

  return (
    <Group
      ref={shapeRef as any}
      id={commonProps.id}
      x={commonProps.x}
      y={commonProps.y}
      rotation={commonProps.rotation}
      opacity={commonProps.opacity}
      draggable={commonProps.draggable}
      listening={commonProps.listening}
      width={boxWidth}
      height={boxHeight}
      onClick={handleClick}
      onTap={handleClick}
      onDblClick={handleDblClick}
      onDblTap={handleDblClick}
      onMouseDown={commonProps.onMouseDown}
      onTouchStart={commonProps.onTouchStart}
      onDragEnd={commonProps.onDragEnd}
      onDragStart={commonProps.onDragStart}
      onDragMove={commonProps.onDragMove}
      onTransformEnd={commonProps.onTransformEnd}
    >
      {/* Retângulo invisível para garantir área clicável */}
      <Rect
        x={0}
        y={0}
        width={boxWidth}
        height={boxHeight}
        fill="transparent"
        listening={true}
      />

      {/* Renderizar segments de texto */}
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
 * @param konvaTextLines - Linhas quebradas pelo Konva (para garantir quebras idênticas)
 * @returns Layout com posições calculadas
 */
function calculateSegmentLayout(
  segments: TextStyleSegment[],
  options: RichTextRenderOptions,
  konvaTextLines?: Array<{ text: string; width: number }>
): LayoutResult {
  if (segments.length === 0) {
    return {
      segments: [],
      lines: [],
      bounds: { width: 0, height: 0 },
    }
  }

  const padding = options.padding ?? 0
  const paddingDouble = padding * 2

  // Se temos as linhas do Konva, usar elas (garantia de quebras idênticas)
  if (konvaTextLines && konvaTextLines.length > 0) {
    return calculateLayoutFromKonvaLines(segments, konvaTextLines, options)
  }

  // Fallback: calcular manualmente (pode ter pequenas diferenças)
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

  // Largura efetiva para quebra de linha (descontando padding)
  const effectiveMaxWidth = options.maxWidth ? options.maxWidth - paddingDouble : undefined

  const lines: Array<{
    segments: TextStyleSegment[]
    y: number
    width: number
    height: number
  }> = []

  let currentLine: TextStyleSegment[] = []
  let currentLineWidth = 0
  let maxLineWidth = 0
  let yOffset = padding // Começar com padding no topo

  // Pré-processar segments para dividir por quebras de linha (\n)
  const processedSegments: TextStyleSegment[] = []
  for (const segment of segments) {
    const parts = segment.text.split('\n')
    if (parts.length === 1) {
      // Sem quebra de linha, manter como está
      processedSegments.push(segment)
    } else {
      // Tem quebra de linha, dividir em múltiplos segments
      let currentStart = segment.start
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        const partEnd = currentStart + part.length

        if (part.length > 0) {
          processedSegments.push({
            ...segment,
            text: part,
            start: currentStart,
            end: partEnd,
          })
        }

        // Adicionar marcador de quebra de linha forçada (exceto no último)
        if (i < parts.length - 1) {
          processedSegments.push({
            ...segment,
            text: '\n',
            start: partEnd,
            end: partEnd + 1,
            forceLineBreak: true, // Marcador especial
          })
        }

        currentStart = partEnd + 1 // +1 para pular o \n
      }
    }
  }

  for (const segment of processedSegments) {
    // Se é marcador de quebra de linha, forçar nova linha
    if (segment.forceLineBreak) {
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

        currentLine = []
        currentLineWidth = 0
      }
      continue // Pular para o próximo segment
    }

    const style = segment.style
    const fontSize = style.fontSize ?? 16

    // Configurar font do canvas para medição
    const fontStyle = style.fontStyle ?? 'normal'
    const fontFamily = style.fontFamily ?? 'Inter'
    ctx.font = `${fontStyle} ${fontSize}px ${fontFamily}`

    // Medir largura do segment
    const metrics = ctx.measureText(segment.text)
    const segmentWidth = metrics.width + (style.letterSpacing ?? 0) * segment.text.length

    // Verificar se precisa quebrar linha (automático por largura)
    const needsBreak =
      options.wrap &&
      effectiveMaxWidth &&
      currentLineWidth + segmentWidth > effectiveMaxWidth &&
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

  // Largura do container para alinhamento (usar maxWidth se disponível, senão maxLineWidth)
  const containerWidth = effectiveMaxWidth ?? maxLineWidth

  // Calcular posições finais com alinhamento
  const positionedSegments: TextStyleSegment[] = []

  for (const line of lines) {
    let xOffset = padding // Começar com padding à esquerda

    // Aplicar alinhamento baseado na largura do container
    if (options.textAlign === 'center') {
      xOffset += (containerWidth - line.width) / 2
    } else if (options.textAlign === 'right') {
      xOffset += containerWidth - line.width
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
      width: maxLineWidth + paddingDouble,
      height: yOffset + padding, // Adicionar padding no final
    },
  }
}

/**
 * Calcular layout usando as quebras de linha do Konva
 * Garante que as quebras sejam IDÊNTICAS ao KonvaEditableText
 */
function calculateLayoutFromKonvaLines(
  segments: TextStyleSegment[],
  konvaLines: Array<{ text: string; width: number }>,
  options: RichTextRenderOptions
): LayoutResult {
  const padding = options.padding ?? 0
  const paddingDouble = padding * 2

  // Criar canvas para medições
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return {
      segments: [],
      lines: [],
      bounds: { width: 0, height: 0 },
    }
  }

  // Reconstruir texto completo das linhas do Konva
  const fullText = konvaLines.map(line => line.text).join('')

  const lines: Array<{
    segments: TextStyleSegment[]
    y: number
    width: number
    height: number
  }> = []

  const positionedSegments: TextStyleSegment[] = []
  let textPosition = 0 // Posição no texto completo
  let yOffset = padding
  let maxLineWidth = 0

  for (const konvaLine of konvaLines) {
    const lineText = konvaLine.text
    const lineStart = textPosition
    const lineEnd = textPosition + lineText.length

    // Encontrar todos os segments que pertencem a esta linha
    const lineSegments: TextStyleSegment[] = []

    for (const segment of segments) {
      // Verificar se o segment intersecta com esta linha
      const segmentStart = segment.start
      const segmentEnd = segment.end

      if (segmentEnd <= lineStart || segmentStart >= lineEnd) {
        // Segment não pertence a esta linha
        continue
      }

      // Calcular a parte do segment que pertence a esta linha
      const intersectStart = Math.max(segmentStart, lineStart)
      const intersectEnd = Math.min(segmentEnd, lineEnd)
      const intersectText = fullText.substring(intersectStart, intersectEnd)

      if (intersectText.length === 0) continue

      // Configurar font para medição
      const style = segment.style
      const fontSize = style.fontSize ?? 16
      const fontStyle = style.fontStyle ?? 'normal'
      const fontFamily = style.fontFamily ?? 'Inter'
      ctx.font = `${fontStyle} ${fontSize}px ${fontFamily}`

      // Medir largura deste pedaço do segment
      const metrics = ctx.measureText(intersectText)
      const segmentWidth = metrics.width + (style.letterSpacing ?? 0) * intersectText.length

      lineSegments.push({
        ...segment,
        text: intersectText,
        start: intersectStart,
        end: intersectEnd,
        width: segmentWidth,
        height: fontSize,
      })
    }

    // Calcular altura da linha (maior fontSize dos segments)
    const lineHeight = lineSegments.length > 0
      ? Math.max(...lineSegments.map(s => s.style.fontSize ?? 16))
      : (options.lineHeight * 16) // fallback

    // Calcular largura total da linha
    const lineWidth = lineSegments.reduce((sum, seg) => sum + (seg.width ?? 0), 0)

    lines.push({
      segments: lineSegments,
      y: yOffset,
      width: lineWidth,
      height: lineHeight,
    })

    maxLineWidth = Math.max(maxLineWidth, lineWidth)
    yOffset += lineHeight * options.lineHeight
    textPosition = lineEnd
  }

  // Aplicar alinhamento e posicionar segments
  const containerWidth = options.maxWidth ? options.maxWidth - paddingDouble : maxLineWidth

  for (const line of lines) {
    let xOffset = padding // Começar com padding à esquerda

    // Aplicar alinhamento baseado na largura do container
    if (options.textAlign === 'center') {
      xOffset += (containerWidth - line.width) / 2
    } else if (options.textAlign === 'right') {
      xOffset += containerWidth - line.width
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
      width: (options.maxWidth ?? maxLineWidth + paddingDouble),
      height: yOffset + padding,
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
