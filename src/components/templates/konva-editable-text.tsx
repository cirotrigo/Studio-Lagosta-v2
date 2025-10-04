"use client"

import * as React from 'react'
import Konva from 'konva'
import { Text } from 'react-konva'
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
  const cleanupRef = React.useRef<(() => void) | null>(null)

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
    const textNode = shapeRef.current
    if (!textNode) return

    const stage = stageRef?.current ?? textNode.getStage()
    if (!stage) return

    // Evitar múltiplos textareas simultâneos
    if (textareaRef.current) {
      textareaRef.current.focus()
      return
    }

    const fontSize = layer.style?.fontSize ?? textNode.fontSize()
    const fontFamily = layer.style?.fontFamily ?? textNode.fontFamily()
    const textAlign = layer.style?.textAlign ?? textNode.align() ?? 'left'
    const lineHeight = layer.style?.lineHeight ?? textNode.lineHeight() ?? 1.2
    const fontWeight = layer.style?.fontWeight ?? (textNode.fontStyle().includes('bold') ? '700' : '400')
    const fontStyle = layer.style?.fontStyle ?? (textNode.fontStyle().includes('italic') ? 'italic' : 'normal')
    const letterSpacing = layer.style?.letterSpacing ?? 0
    const textColor = layer.style?.color ?? (typeof textNode.fill() === 'string' ? (textNode.fill() as string) : '#000000')

    const textarea = document.createElement('textarea')
    textarea.setAttribute('spellcheck', 'false')
    textarea.value = layer.content ?? textNode.text() ?? ''
    textarea.style.position = 'absolute'
    textarea.style.margin = '0px'
    textarea.style.borderStyle = 'solid'
    textarea.style.borderColor = '#4F46E5'
    textarea.style.borderWidth = '2px'
    textarea.style.borderRadius = '4px'
    textarea.style.background = 'rgba(0, 0, 0, 0.85)'
    textarea.style.color = textColor
    textarea.style.fontFamily = fontFamily
    textarea.style.lineHeight = String(lineHeight)
    textarea.style.fontWeight = String(fontWeight)
    textarea.style.fontStyle = fontStyle
    textarea.style.letterSpacing = `${letterSpacing}px`
    textarea.style.textAlign = textAlign
    textarea.style.whiteSpace = 'pre-wrap'
    textarea.style.overflow = 'hidden'
    textarea.style.outline = 'none'
    textarea.style.resize = 'none'
    textarea.style.transformOrigin = 'left top'
    textarea.style.transform = `rotate(${textNode.rotation()}deg)`
    textarea.style.zIndex = '10000'
    textarea.style.backdropFilter = 'blur(8px)'
    textarea.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.4)'

    document.body.appendChild(textarea)

    const applyTextareaGeometry = () => {
      const updatedStageBox = stage.container().getBoundingClientRect()
      const currentStagePosition = stage.position()
      const currentScaleX = stage.scaleX()
      const currentScaleY = stage.scaleY()
      const currentAbsolutePosition = textNode.absolutePosition()
      const currentAbsoluteScale = textNode.getAbsoluteScale()
      const padding = textNode.padding()
      const paddingX = padding * currentAbsoluteScale.x
      const paddingY = padding * currentAbsoluteScale.y

      const left = updatedStageBox.left + currentStagePosition.x + currentAbsolutePosition.x * currentScaleX
      const top = updatedStageBox.top + currentStagePosition.y + currentAbsolutePosition.y * currentScaleY
      const width = Math.max((textNode.width() - padding * 2) * currentAbsoluteScale.x, 100)
      const height = Math.max((textNode.height() - padding * 2) * currentAbsoluteScale.y + 4 * currentAbsoluteScale.y, fontSize * currentAbsoluteScale.y)

      textarea.style.left = `${left}px`
      textarea.style.top = `${top}px`
      textarea.style.width = `${width}px`
      textarea.style.minHeight = `${height}px`
      textarea.style.fontSize = `${fontSize * currentAbsoluteScale.y}px`
      textarea.style.padding = `${paddingY}px ${paddingX}px`
      const borderScale = Math.max(currentAbsoluteScale.x, currentAbsoluteScale.y)
      textarea.style.borderWidth = `${Math.max(1, 2 * borderScale)}px`
    }

    // Ocultar o texto original enquanto edita
    textNode.hide()
    stage.batchDraw()

    applyTextareaGeometry()

    // Guardar referência para gerenciar ciclo de vida
    textareaRef.current = textarea

    const originalValue = textarea.value
    let isFinishing = false

    function finishEditing(commit: boolean) {
      if (isFinishing) return
      isFinishing = true

      const value = textarea.value

      const teardown = cleanupRef.current
      if (teardown) {
        teardown()
        cleanupRef.current = null
      }

      if (commit && value !== originalValue) {
        onChange({
          content: value,
        })
      }
    }

    function handleInput() {
      applyTextareaGeometry()
      textarea.style.height = 'auto'
      textarea.style.height = `${textarea.scrollHeight}px`
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        finishEditing(true)
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        textarea.value = originalValue
        finishEditing(false)
      }
    }

    function handleBlur() {
      finishEditing(true)
    }

    function handlePointerDown(event: Event) {
      if (event.target === textarea) return
      finishEditing(true)
    }

    function handleResize() {
      applyTextareaGeometry()
    }

    const cleanupListeners = () => {
      textarea.removeEventListener('input', handleInput)
      textarea.removeEventListener('keydown', handleKeyDown)
      textarea.removeEventListener('blur', handleBlur)
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('touchstart', handlePointerDown, true)
      window.removeEventListener('resize', handleResize)
    }

    cleanupRef.current = () => {
      cleanupListeners()
      if (textarea.parentNode) {
        textarea.parentNode.removeChild(textarea)
      }
      textareaRef.current = null
      textNode.show()
      if (!stage.isDestroyed?.()) {
        stage.batchDraw()
      }
    }

    textarea.addEventListener('input', handleInput)
    textarea.addEventListener('keydown', handleKeyDown)
    textarea.addEventListener('blur', handleBlur)
    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('touchstart', handlePointerDown, true)
    window.addEventListener('resize', handleResize)

    // Ajustar altura inicial e foco
    handleInput()
    setTimeout(() => {
      textarea.focus()
      textarea.select()
    }, 0)
  }, [layer, onChange, shapeRef, stageRef])

  // Cleanup ao desmontar
  React.useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = null
      } else if (textareaRef.current && textareaRef.current.parentNode) {
        document.body.removeChild(textareaRef.current)
        textareaRef.current = null
      }
    }
  }, [])

  return (
    <Text
      {...commonProps}
      ref={shapeRef as React.RefObject<Konva.Text>}
      text={layer.content ?? ''}
      // Não definir width/height fixos - deixar auto-dimensionar baseado no conteúdo
      // width e height serão calculados automaticamente pelo Konva
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
      listening={commonProps.listening}
      perfectDrawEnabled={false}
      stroke={borderWidth > 0 ? borderColor : undefined}
      strokeWidth={borderWidth > 0 ? borderWidth : undefined}
      onDblClick={handleDblClick}
      onDblTap={handleDblClick}
    />
  )
}
