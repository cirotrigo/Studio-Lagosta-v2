"use client"

import * as React from 'react'
import Konva from 'konva'
import { Text } from 'react-konva'
import { Html } from 'react-konva-utils'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { Layer } from '@/types/template'
import { EffectsManager } from '@/lib/konva/effects'

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

  // Apply saved effects when layer loads or changes
  React.useEffect(() => {
    const textNode = shapeRef.current
    if (!textNode || !layer.effects) return

    const konvaLayer = textNode.getLayer()
    if (!konvaLayer) return

    try {
      EffectsManager.applyEffects(textNode, layer.effects, konvaLayer)
      konvaLayer.batchDraw()
    } catch (error) {
      console.error('[KonvaEditableText] Error applying effects:', error)
    }
  }, [layer.effects, shapeRef])

  // Setup transform handler para ajustar fontSize baseado no scale (comportamento tipo Canva)
  React.useEffect(() => {
    const textNode = shapeRef.current
    if (!textNode) return

    const handleTransform = () => {
      // Pegar escalas atuais
      const scaleX = textNode.scaleX()
      const scaleY = textNode.scaleY()

      // Usar a menor escala para manter proporção
      const scale = Math.min(scaleX, scaleY)

      // Ajustar fontSize baseado no scale
      const currentFontSize = textNode.fontSize()
      const newFontSize = Math.max(8, Math.round(currentFontSize * scale))

      // Aplicar novo fontSize e resetar scales
      textNode.setAttrs({
        fontSize: newFontSize,
        scaleX: 1,
        scaleY: 1,
      })

      // Atualizar layer com novo fontSize
      onChange({
        style: {
          ...layer.style,
          fontSize: newFontSize,
        },
      })
    }

    textNode.on('transform', handleTransform)

    return () => {
      textNode.off('transform', handleTransform)
    }
  }, [shapeRef, layer.style, onChange])

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
      const nextValue = event.target.value

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

  React.useEffect(() => {
    if (!isEditing) return
    const textarea = textareaRef.current
    if (!textarea) return

    // Sincronizar valor do textarea com o estado quando não está compondo
    if (!isComposingRef.current) {
      textarea.value = editingState?.value ?? ''
    }

    textarea.focus()
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
  }, [isEditing, editingState?.value])

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

  return (
    <>
      <Text
        {...commonProps}
        ref={shapeRef as React.RefObject<Konva.Text>}
        text={displayText}
        fontSize={layer.style?.fontSize ?? 16}
        fontFamily={layer.style?.fontFamily ?? 'Inter'}
        fontStyle={layer.style?.fontStyle ?? 'normal'}
        fontVariant={layer.style?.fontWeight ? String(layer.style.fontWeight) : undefined}
        fill={layer.style?.color ?? '#000000'}
        align={layer.style?.textAlign ?? 'left'}
        padding={6}
        lineHeight={layer.style?.lineHeight ?? 1.2}
        letterSpacing={layer.style?.letterSpacing ?? 0}
        wrap="none"
        ellipsis={false}
        listening={commonProps.listening && !isEditing}
        draggable={commonProps.draggable && !isEditing}
        visible={!isEditing}
        perfectDrawEnabled={false}
        stroke={borderWidth > 0 ? borderColor : undefined}
        strokeWidth={borderWidth > 0 ? borderWidth : undefined}
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
