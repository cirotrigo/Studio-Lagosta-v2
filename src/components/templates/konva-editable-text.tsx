"use client"

import * as React from 'react'
import Konva from 'konva'
import { Text } from 'react-konva'
import { Html } from 'react-konva-utils'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Layer } from '@/types/template'

/**
 * KonvaEditableText - Componente de texto editável para Konva.js
 *
 * Funcionalidades:
 * - Duplo clique para editar texto inline
 * - Criação de textarea HTML temporário para edição
 * - Sincronização automática com layer após edição
 * - Suporte a todas as propriedades de estilo do texto
 *
 * @component
 */

interface KonvaEditableTextProps {
  layer: Layer
  shapeRef: React.RefObject<Konva.Text | null>
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
  borderColor: string
  borderWidth: number
  onChange: (updates: Partial<Layer>) => void
  stageRef?: React.RefObject<Konva.Stage | null>
}

interface TextEditingState {
  value: string
  initialValue: string
  width: number
  height: number
  padding: number
  fontSize: number
  fontFamily: string
  fontStyle: string
  fontWeight: string | number
  letterSpacing: number
  lineHeight: number
  textAlign: 'left' | 'center' | 'right' | 'justify'
  color: string
}

export function KonvaEditableText({
  layer,
  shapeRef,
  commonProps,
  borderColor,
  borderWidth,
  onChange,
  stageRef,
}: KonvaEditableTextProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const [editingState, setEditingState] = React.useState<TextEditingState | null>(null)
  const isComposingRef = React.useRef(false)

  // Cache for high quality rendering (especially for ornate/decorative fonts)
  React.useEffect(() => {
    const textNode = shapeRef.current
    if (!textNode) return

    // SEMPRE usar cache com pixelRatio alto para melhor qualidade de fontes
    // Especialmente importante para fontes ornamentadas/decorativas (Amithen, etc)
    const hasBlur = layer.effects?.blur?.enabled && layer.effects.blur.blurRadius > 0
    const hasEffects = hasBlur || (layer.effects?.shadow?.enabled && layer.effects.shadow.shadowBlur > 0)

    // Cache é obrigatório para blur e recomendado para fontes grandes/decorativas
    const shouldCache = hasEffects || (layer.style?.fontSize && layer.style.fontSize > 24)

    if (shouldCache) {
      // Limpar cache anterior para evitar problemas
      textNode.clearCache()

      // pixelRatio = 2 ou devicePixelRatio (para telas retina/4K)
      const pixelRatio = Math.max(2, window.devicePixelRatio || 2)
      textNode.cache({
        pixelRatio,
        imageSmoothingEnabled: true,
      })
    } else {
      textNode.clearCache()
    }

    textNode.getLayer()?.batchDraw()
  }, [layer.effects?.blur, layer.effects?.shadow, layer.style?.fontSize, layer.style?.fontFamily, shapeRef])

  // Setup transform handler para ajustar fontSize baseado no scale (comportamento tipo Canva)
  React.useEffect(() => {
    const textNode = shapeRef.current
    if (!textNode) return

    const handleTransform = () => {
      const transformer = textNode.getStage()?.findOne('Transformer') as Konva.Transformer | null
      if (!transformer) return

      // Detectar qual âncora está sendo arrastada
      const activeAnchor = transformer.getActiveAnchor()

      // Âncoras dos cantos (diagonais): ajustam fontSize proporcionalmente
      const cornerAnchors = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
      // Âncoras das laterais: ajustam apenas width/height, mantendo fontSize fixo
      const sideAnchors = ['middle-left', 'middle-right', 'top-center', 'bottom-center']

      if (cornerAnchors.includes(activeAnchor)) {
        // NÓS DOS CANTOS: Ajustar fontSize proporcionalmente
        const scaleX = textNode.scaleX()
        const scaleY = textNode.scaleY()
        // Usar a média das escalas para manter proporção
        const scale = Math.max(scaleX, scaleY)

        const currentFontSize = textNode.fontSize()
        const newFontSize = Math.max(8, Math.round(currentFontSize * scale))

        // Calcular novas dimensões aplicando scale
        const currentWidth = textNode.width()
        const currentHeight = textNode.height()
        const newWidth = Math.max(20, Math.round(currentWidth * scaleX))
        const newHeight = Math.max(20, Math.round(currentHeight * scaleY))

        // IMPORTANTE: Resetar scale SEMPRE para evitar acúmulo
        textNode.setAttrs({
          fontSize: newFontSize,
          width: newWidth,
          height: newHeight,
          scaleX: 1,
          scaleY: 1,
        })

        // Atualizar cache com novo fontSize
        textNode.clearCache()
        const pixelRatio = Math.max(2, window.devicePixelRatio || 2)
        textNode.cache({ pixelRatio, imageSmoothingEnabled: true })

        onChange({
          size: {
            width: newWidth,
            height: newHeight,
          },
          style: {
            ...layer.style,
            fontSize: newFontSize,
          },
        })
      } else if (sideAnchors.includes(activeAnchor)) {
        // NÓS DAS LATERAIS: Ajustar apenas dimensões da caixa, manter fontSize fixo
        const scaleX = textNode.scaleX()
        const scaleY = textNode.scaleY()

        const currentWidth = textNode.width()
        const currentHeight = textNode.height()

        // Aplicar scale às dimensões
        const newWidth = Math.max(20, Math.round(currentWidth * scaleX))
        const newHeight = Math.max(20, Math.round(currentHeight * scaleY))

        // IMPORTANTE: Resetar scale mas manter as novas dimensões
        textNode.setAttrs({
          width: newWidth,
          height: newHeight,
          scaleX: 1,
          scaleY: 1,
        })

        // fontSize NÃO é alterado aqui, apenas size
        onChange({
          size: {
            width: newWidth,
            height: newHeight,
          },
        })
      }
    }

    textNode.on('transform', handleTransform)

    return () => {
      textNode.off('transform', handleTransform)
    }
  }, [shapeRef, layer.style, layer.size, onChange])

  const handleDblClick = React.useCallback(() => {
    if (editingState) return

    const textNode = shapeRef.current
    if (!textNode) return

    const stage = stageRef?.current ?? textNode.getStage()
    if (!stage) return

    const currentValue = layer.content ?? textNode.text() ?? ''
    const padding = textNode.padding()
    const measured = textNode.measureSize(currentValue || ' ')

    const fontSize = layer.style?.fontSize ?? textNode.fontSize()
    const fontFamily = layer.style?.fontFamily ?? textNode.fontFamily()
    const textAlign = (layer.style?.textAlign ?? textNode.align() ?? 'left') as 'left' | 'center' | 'right' | 'justify'
    const lineHeight = layer.style?.lineHeight ?? textNode.lineHeight() ?? 1.2
    const fontStyle = layer.style?.fontStyle ?? (textNode.fontStyle().includes('italic') ? 'italic' : 'normal')
    const fontWeight = layer.style?.fontWeight ?? (textNode.fontStyle().includes('bold') ? '700' : '400')
    const letterSpacing = layer.style?.letterSpacing ?? textNode.letterSpacing()
    const fill = textNode.fill()
    const color = layer.style?.color ?? (typeof fill === 'string' ? fill : '#000000')

    const width = Math.max(textNode.width(), measured.width + padding * 2, 4)
    const height = Math.max(textNode.height(), measured.height + padding * 2, fontSize + padding * 2)

    setEditingState({
      value: currentValue,
      initialValue: currentValue,
      width,
      height,
      padding,
      fontSize,
      fontFamily,
      fontStyle,
      fontWeight,
      letterSpacing,
      lineHeight,
      textAlign,
      color,
    })

    if (typeof stage.batchDraw === 'function') {
      stage.batchDraw()
    }
  }, [editingState, layer, shapeRef, stageRef])

  const finishEditing = React.useCallback(
    (commit: boolean) => {
      setEditingState((prev) => {
        if (!prev) return null

        if (commit && prev.value !== prev.initialValue) {
          onChange({
            content: prev.value,
          })
        }

        return null
      })

      const stage = stageRef?.current ?? shapeRef.current?.getStage()
      if (stage && typeof stage.batchDraw === 'function') {
        stage.batchDraw()
      }
    },
    [onChange, shapeRef, stageRef],
  )

  const handleEditorChange = React.useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const textarea = event.target
      const nextValue = textarea.value

      // CRÍTICO: Salvar posição do cursor ANTES de qualquer atualização
      const cursorPosition = textarea.selectionStart

      setEditingState((prev) => {
        if (!prev) return prev

        const textNode = shapeRef.current
        if (!textNode) {
          return {
            ...prev,
            value: nextValue,
          }
        }

        const padding = textNode.padding()
        const measured = textNode.measureSize(nextValue || ' ')
        const width = Math.max(textNode.width(), measured.width + padding * 2, 4)
        const height = Math.max(textNode.height(), measured.height + padding * 2, prev.fontSize + padding * 2)

        return {
          ...prev,
          value: nextValue,
          width,
          height,
        }
      })

      // CRÍTICO: Restaurar posição do cursor após atualização
      // Usar setTimeout para garantir que o DOM foi atualizado
      setTimeout(() => {
        if (textarea && document.activeElement === textarea) {
          textarea.setSelectionRange(cursorPosition, cursorPosition)
        }
      }, 0)
    },
    [shapeRef],
  )

  const handleEditorKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        finishEditing(true)
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        finishEditing(false)
      }
    },
    [finishEditing],
  )

  const handleEditorBlur = React.useCallback(() => {
    finishEditing(true)
  }, [finishEditing])

  const handleCompositionStart = React.useCallback(() => {
    isComposingRef.current = true
  }, [])

  const handleCompositionEnd = React.useCallback(() => {
    isComposingRef.current = false
  }, [])

  const isEditing = editingState !== null

  // Effect para focus inicial no textarea ao entrar em modo de edição
  React.useEffect(() => {
    if (!isEditing) return
    const textarea = textareaRef.current
    if (!textarea) return

    // Sincronizar valor do textarea com o estado quando não está compondo
    if (!isComposingRef.current && editingState) {
      textarea.value = editingState.value
    }

    // Focus e posicionar cursor no final na primeira vez
    textarea.focus()
    const position = textarea.value.length
    textarea.setSelectionRange(position, position)
  }, [isEditing])

  React.useLayoutEffect(() => {
    if (!isEditing || !editingState) return
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    const baseHeight = Math.max(editingState.height, textarea.scrollHeight)
    textarea.style.height = `${baseHeight}px`
  }, [isEditing, editingState])

  React.useEffect(() => {
    if (!isEditing) return

    const handlePointerDown = (event: Event) => {
      const textarea = textareaRef.current
      if (!textarea) return
      if (event.target instanceof Node && textarea.contains(event.target)) {
        return
      }
      finishEditing(true)
    }

    const timer = window.setTimeout(() => {
      window.addEventListener('pointerdown', handlePointerDown, true)
      window.addEventListener('touchstart', handlePointerDown, true)
    }, 0)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('touchstart', handlePointerDown, true)
    }
  }, [isEditing, finishEditing])

  React.useEffect(() => {
    if (!editingState) return

    const textNode = shapeRef.current
    if (!textNode) return

    const nextFontSize = layer.style?.fontSize ?? textNode.fontSize()
    const nextFontFamily = layer.style?.fontFamily ?? textNode.fontFamily()
    const nextFontStyle = layer.style?.fontStyle ?? (textNode.fontStyle().includes('italic') ? 'italic' : 'normal')
    const nextFontWeight = layer.style?.fontWeight ?? (textNode.fontStyle().includes('bold') ? '700' : '400')
    const nextLetterSpacing = layer.style?.letterSpacing ?? textNode.letterSpacing()
    const nextLineHeight = layer.style?.lineHeight ?? textNode.lineHeight() ?? 1.2
    const nextTextAlign = (layer.style?.textAlign ?? textNode.align() ?? 'left') as 'left' | 'center' | 'right' | 'justify'
    const fill = textNode.fill()
    const nextColor = layer.style?.color ?? (typeof fill === 'string' ? fill : editingState.color)
    const nextPadding = textNode.padding()

    if (
      nextFontSize === editingState.fontSize &&
      nextFontFamily === editingState.fontFamily &&
      nextFontStyle === editingState.fontStyle &&
      String(nextFontWeight) === String(editingState.fontWeight) &&
      nextLetterSpacing === editingState.letterSpacing &&
      nextLineHeight === editingState.lineHeight &&
      nextTextAlign === editingState.textAlign &&
      nextColor === editingState.color &&
      nextPadding === editingState.padding
    ) {
      return
    }

    const measured = textNode.measureSize(editingState.value || ' ')
    const width = Math.max(textNode.width(), measured.width + nextPadding * 2, 4)
    const height = Math.max(textNode.height(), measured.height + nextPadding * 2, nextFontSize + nextPadding * 2)

    setEditingState((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        fontSize: nextFontSize,
        fontFamily: nextFontFamily,
        fontStyle: nextFontStyle,
        fontWeight: nextFontWeight,
        letterSpacing: nextLetterSpacing,
        lineHeight: nextLineHeight,
        textAlign: nextTextAlign,
        color: nextColor,
        padding: nextPadding,
        width,
        height,
      }
    })
  }, [
    editingState,
    layer.style?.fontSize,
    layer.style?.fontFamily,
    layer.style?.fontStyle,
    layer.style?.fontWeight,
    layer.style?.letterSpacing,
    layer.style?.lineHeight,
    layer.style?.textAlign,
    layer.style?.color,
    shapeRef,
  ])

  // Apply text transform based on style
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

  const htmlGroupProps = React.useMemo(() => {
    const node = shapeRef.current
    if (node) {
      return {
        x: node.x(),
        y: node.y(),
        rotation: node.rotation(),
        scaleX: node.scaleX(),
        scaleY: node.scaleY(),
        offsetX: node.offsetX(),
        offsetY: node.offsetY(),
        listening: false,
      }
    }

    return {
      x: layer.position?.x ?? 0,
      y: layer.position?.y ?? 0,
      rotation: layer.rotation ?? 0,
      scaleX: 1,
      scaleY: 1,
      offsetX: 0,
      offsetY: 0,
      listening: false,
    }
  }, [layer.position?.x, layer.position?.y, layer.rotation, isEditing, shapeRef])

  const displayText = React.useMemo(() => {
    return applyTextTransform(layer.content ?? '', layer.style?.textTransform)
  }, [layer.content, layer.style?.textTransform, applyTextTransform])

  // Log effects for debugging
  React.useEffect(() => {
    console.log('[KonvaEditableText] Layer effects:', layer.effects)
    console.log('[KonvaEditableText] Layer ID:', layer.id)
  }, [layer.effects, layer.id])

  // Prepare blur filter
  const filters = React.useMemo(() => {
    if (layer.effects?.blur?.enabled && layer.effects.blur.blurRadius > 0) {
      return [Konva.Filters.Blur]
    }
    return undefined
  }, [layer.effects?.blur])

  // Force update of the layer when style properties change
  // This ensures all changes are reflected immediately without breaking transformer
  React.useEffect(() => {
    const textNode = shapeRef.current
    if (!textNode) return

    // Obter referências ao stage e transformer
    const stage = textNode.getStage()
    const transformer = stage?.findOne('Transformer') as Konva.Transformer | null

    // IMPORTANTE: Forçar atualização do transformer quando propriedades mudam
    if (transformer && transformer.nodes().includes(textNode)) {
      transformer.forceUpdate()
    }

    // Force layer redraw to apply changes immediately
    const konvaLayer = textNode.getLayer()
    if (konvaLayer) {
      konvaLayer.batchDraw()
    }
  }, [
    layer.style?.fontSize,
    layer.style?.fontFamily,
    layer.style?.fontStyle,
    layer.style?.fontWeight,
    layer.style?.color,
    layer.style?.textAlign,
    layer.style?.lineHeight,
    layer.style?.letterSpacing,
    layer.style?.opacity,
    layer.style?.border?.color,
    layer.style?.border?.width,
    layer.style?.textTransform,
    layer.content,
    layer.size?.width,
    layer.size?.height,
  ])

  return (
    <>
      <Text
        key={layer.id}
        {...commonProps}
        ref={shapeRef as React.RefObject<Konva.Text>}
        text={displayText}
        width={layer.size?.width ?? 240}
        height={layer.size?.height ?? 120}
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
        listening={commonProps.listening && !isEditing}
        draggable={commonProps.draggable && !isEditing}
        visible={!isEditing}
        perfectDrawEnabled={true}
        imageSmoothingEnabled={true}
        stroke={layer.style?.border?.width && layer.style.border.width > 0 ? layer.style.border.color : undefined}
        strokeWidth={layer.style?.border?.width && layer.style.border.width > 0 ? layer.style.border.width : undefined}
        shadowColor={layer.effects?.shadow?.enabled ? layer.effects.shadow.shadowColor : undefined}
        shadowBlur={layer.effects?.shadow?.enabled ? layer.effects.shadow.shadowBlur : 0}
        shadowOffsetX={layer.effects?.shadow?.enabled ? layer.effects.shadow.shadowOffsetX : 0}
        shadowOffsetY={layer.effects?.shadow?.enabled ? layer.effects.shadow.shadowOffsetY : 0}
        shadowOpacity={layer.effects?.shadow?.enabled ? layer.effects.shadow.shadowOpacity : 1}
        filters={filters}
        blurRadius={layer.effects?.blur?.enabled ? layer.effects.blur.blurRadius : 0}
        onDblClick={handleDblClick}
        onDblTap={handleDblClick}
      />

      {isEditing && editingState && (
        <Html
          groupProps={htmlGroupProps}
          divProps={{
            style: {
              pointerEvents: 'auto',
            },
          }}
        >
          <textarea
            ref={textareaRef}
            defaultValue={editingState.value}
            spellCheck={false}
            onChange={handleEditorChange}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onKeyDown={handleEditorKeyDown}
            onBlur={handleEditorBlur}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: `${editingState.width}px`,
              minHeight: `${editingState.height}px`,
              padding: `${editingState.padding}px`,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: editingState.color,
              fontFamily: editingState.fontFamily,
              fontSize: `${editingState.fontSize}px`,
              fontStyle: editingState.fontStyle,
              fontWeight: String(editingState.fontWeight),
              letterSpacing: `${editingState.letterSpacing}px`,
              lineHeight: String(editingState.lineHeight),
              textAlign: editingState.textAlign,
              textTransform: 'none',
              whiteSpace: 'pre-wrap',
              overflow: 'hidden',
              resize: 'none',
              caretColor: editingState.color,
              transformOrigin: 'top left',
            }}
          />
        </Html>
      )}
    </>
  )
}
