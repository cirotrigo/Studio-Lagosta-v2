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
    if (!shapeRef.current || !stageRef?.current) return

    const textNode = shapeRef.current
    const stage = stageRef.current

    // Ocultar o texto do canvas
    textNode.hide()
    stage.batchDraw()

    // Obter posição absoluta do texto no canvas
    const textPosition = textNode.absolutePosition()
    const stageBox = stage.container().getBoundingClientRect()

    // Calcular a escala do stage
    const scale = stage.scaleX()

    // Criar textarea para edição
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)

    // Estilizar textarea para corresponder ao texto
    const fontSize = layer.style?.fontSize ?? 16
    const fontFamily = layer.style?.fontFamily ?? 'Inter'
    const textAlign = layer.style?.textAlign ?? 'left'
    const lineHeight = layer.style?.lineHeight ?? 1.2
    const fontWeight = layer.style?.fontWeight ?? 'normal'
    const fontStyle = layer.style?.fontStyle ?? 'normal'

    textarea.value = layer.content ?? ''
    textarea.style.position = 'absolute'
    // Usar posição absoluta do texto no viewport
    textarea.style.top = `${stageBox.top + textPosition.y * scale}px`
    textarea.style.left = `${stageBox.left + textPosition.x * scale}px`
    textarea.style.width = `${Math.max(textNode.width() * scale, 100)}px`
    textarea.style.minHeight = `${textNode.height() * scale}px`
    textarea.style.fontSize = `${fontSize * scale}px`
    textarea.style.fontFamily = fontFamily
    textarea.style.color = '#FFFFFF'
    textarea.style.textAlign = textAlign
    textarea.style.lineHeight = String(lineHeight)
    textarea.style.fontWeight = String(fontWeight)
    textarea.style.fontStyle = fontStyle
    textarea.style.border = '2px solid #4F46E5'
    textarea.style.padding = `${6 * scale}px`
    textarea.style.margin = '0px'
    textarea.style.overflow = 'hidden'
    textarea.style.background = 'rgba(0, 0, 0, 0.85)'
    textarea.style.outline = 'none'
    textarea.style.resize = 'none'
    textarea.style.transformOrigin = 'left top'
    textarea.style.transform = `rotate(${textNode.rotation()}deg)`
    textarea.style.zIndex = '10000'
    textarea.style.backdropFilter = 'blur(8px)'
    textarea.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.4)'
    textarea.style.borderRadius = '4px'

    // Auto-focus e selecionar todo o texto
    setTimeout(() => {
      textarea.focus()
      textarea.select()
    }, 10)

    // Armazenar referência
    textareaRef.current = textarea

    // Auto-resize do textarea conforme o usuário digita
    const autoResize = () => {
      textarea.style.height = 'auto'
      textarea.style.height = `${textarea.scrollHeight}px`
    }

    textarea.addEventListener('input', autoResize)
    autoResize()

    // Handler para finalizar edição
    const handleFinishEdit = () => {
      // Verificar se textarea ainda está no DOM
      if (!textarea.parentNode) return

      const newText = textarea.value

      // Remover textarea primeiro
      try {
        if (textarea.parentNode) {
          textarea.parentNode.removeChild(textarea)
        }
      } catch (e) {
        // Ignorar erro se já foi removido
      }
      textareaRef.current = null

      // Atualizar o conteúdo do layer
      onChange({
        content: newText,
      })

      // Mostrar o texto novamente
      textNode.show()
      stage.batchDraw()
    }

    // Eventos para finalizar edição
    let isFinishing = false

    const safeFinishEdit = () => {
      if (isFinishing) return
      isFinishing = true
      handleFinishEdit()
    }

    textarea.addEventListener('blur', safeFinishEdit)

    textarea.addEventListener('keydown', (e) => {
      // Escape para cancelar
      if (e.key === 'Escape') {
        e.preventDefault()
        if (isFinishing) return
        isFinishing = true

        try {
          if (textarea.parentNode) {
            textarea.parentNode.removeChild(textarea)
          }
        } catch (err) {
          // Ignorar
        }
        textareaRef.current = null
        textNode.show()
        stage.batchDraw()
      }
      // Enter sem Shift para finalizar (Shift+Enter adiciona nova linha)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        safeFinishEdit()
      }
    })
  }, [layer, onChange, shapeRef, stageRef])

  // Cleanup ao desmontar
  React.useEffect(() => {
    return () => {
      if (textareaRef.current && textareaRef.current.parentNode) {
        document.body.removeChild(textareaRef.current)
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
