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
  // Absolute position on screen
  absoluteX: number
  absoluteY: number
  rotation: number
}

export function KonvaEditableText({
  layer,
  shapeRef,
  commonProps,
  borderColor: _borderColor,
  borderWidth: _borderWidth,
  onChange,
  stageRef,
}: KonvaEditableTextProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const [editingState, setEditingState] = React.useState<TextEditingState | null>(null)
  const isComposingRef = React.useRef(false) // Para acentuação/IME

  // Mobile: Detectar duplo tap manualmente
  const lastTapTimeRef = React.useRef<number>(0)
  const isMobile = React.useMemo(() => {
    if (typeof window === 'undefined') return false
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth <= 768
  }, [])

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

  const startEditing = React.useCallback(() => {
    if (editingState) return

    const textNode = shapeRef.current
    if (!textNode) return

    const stage = stageRef?.current ?? textNode.getStage()
    if (!stage) return

    // OFICIAL KONVA PATTERN: Esconder text node E transformer durante edição
    textNode.hide()
    const transformer = stage.findOne('Transformer') as Konva.Transformer | null
    if (transformer) {
      transformer.hide()
    }

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

    // OFICIAL KONVA PATTERN: Calcular posição absoluta na tela
    const textPosition = textNode.absolutePosition()
    const stageBox = stage.container().getBoundingClientRect()

    // OFICIAL KONVA: Absolute position SEM multiplicar por scale
    const absoluteX = stageBox.left + textPosition.x
    const absoluteY = stageBox.top + textPosition.y
    const rotation = textNode.rotation()

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
      absoluteX,
      absoluteY,
      rotation,
    })

    if (typeof stage.batchDraw === 'function') {
      stage.batchDraw()
    }
  }, [editingState, layer, shapeRef, stageRef, isMobile])

  const handleDblClick = React.useCallback(() => {
    startEditing()
  }, [startEditing])

  // Mobile: Handler customizado de tap para detectar duplo tap
  const handleTap = React.useCallback(() => {
    if (!isMobile) return

    const now = Date.now()
    const timeSinceLastTap = now - lastTapTimeRef.current

    if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
      // Duplo tap detectado (< 300ms)
      startEditing()
      lastTapTimeRef.current = 0
    } else {
      // Primeiro tap
      lastTapTimeRef.current = now
    }
  }, [isMobile, startEditing])

  const finishEditing = React.useCallback(
    (commit: boolean) => {
      setEditingState((prev) => {
        if (!prev) return null

        const textNode = shapeRef.current
        const stage = stageRef?.current ?? textNode?.getStage()

        if (commit && prev.value !== prev.initialValue) {
          // ⚡ ATUALIZAR NODE DIRETAMENTE para visualização imediata
          if (textNode) {
            textNode.text(prev.value)
            // Limpar e recriar cache para fontes de alta qualidade
            if (textNode.isCached()) {
              textNode.clearCache()
              textNode.cache({
                pixelRatio: Math.max(2, window.devicePixelRatio || 2),
                imageSmoothingEnabled: true,
              })
            }
          }
          onChange({
            content: prev.value,
          })
        }

        // OFICIAL KONVA PATTERN: Restaurar visibilidade de text node e transformer
        if (textNode) {
          textNode.show()
        }
        if (stage) {
          const transformer = stage.findOne('Transformer') as Konva.Transformer | null
          if (transformer) {
            transformer.show()
          }
        }

        return null
      })

      // ⚡ FORÇAR REDESENHO IMEDIATO
      const textNode = shapeRef.current
      if (textNode) {
        const konvaLayer = textNode.getLayer()
        if (konvaLayer) konvaLayer.batchDraw()
      }

      const stage = stageRef?.current ?? shapeRef.current?.getStage()
      if (stage && typeof stage.batchDraw === 'function') {
        stage.batchDraw()
      }
    },
    [onChange, shapeRef, stageRef],
  )


  const isEditing = editingState !== null

  // OFICIAL KONVA PATTERN: Criar textarea usando DOM nativo
  React.useEffect(() => {
    if (!isEditing) {
      // Limpar textarea se existir
      if (textareaRef.current) {
        textareaRef.current.remove()
        textareaRef.current = null
      }
      return
    }

    if (!editingState) return

    const textNode = shapeRef.current
    if (!textNode) return

    const stage = textNode.getStage()
    if (!stage) return

    // Criar textarea element
    const textarea = document.createElement('textarea')
    textareaRef.current = textarea

    // CRÍTICO: Aplicar scale no tamanho do textarea para respeitar zoom do stage
    const absoluteScale = textNode.getAbsoluteScale().x
    const width = (textNode.width() - textNode.padding() * 2) * absoluteScale
    const height = (textNode.height() - textNode.padding() * 2) * absoluteScale
    const fontSize = textNode.fontSize() * absoluteScale

    // OFICIAL KONVA: Transform com rotação e ajuste de 2px
    let transform = ''
    if (editingState.rotation) {
      transform += `rotateZ(${editingState.rotation}deg)`
    }
    transform += ' translateY(-2px)'

    // OFICIAL KONVA: Textarea invisível que fica exatamente sobre o texto
    Object.assign(textarea.style, {
      position: 'absolute',
      top: `${editingState.absoluteY}px`,
      left: `${editingState.absoluteX}px`,
      width: `${width}px`,
      height: `${height + 5}px`,
      fontSize: `${fontSize}px`,
      border: 'none',
      padding: '0px',
      margin: '0px',
      overflow: 'hidden',
      background: 'none',
      outline: 'none',
      resize: 'none',
      lineHeight: textNode.lineHeight().toString(),
      fontFamily: textNode.fontFamily(),
      transformOrigin: 'left top',
      textAlign: textNode.align(),
      color: textNode.fill().toString(),
      fontStyle: editingState.fontStyle,
      fontWeight: String(editingState.fontWeight),
      letterSpacing: `${textNode.letterSpacing() * absoluteScale}px`,
      transform,
      zIndex: '9999',
    })

    // Atributos
    textarea.value = editingState.value
    textarea.spellcheck = false
    textarea.setAttribute('autocomplete', 'off')
    textarea.setAttribute('autocorrect', 'off')
    textarea.setAttribute('autocapitalize', 'off')
    textarea.setAttribute('inputmode', 'text')
    textarea.setAttribute('enterkeyhint', 'done')
    textarea.tabIndex = 0

    // Event listeners - usar closures para evitar dependências
    const handleInput = (e: Event) => {
      // CRÍTICO: Não processar durante composição (acentuação)
      if (isComposingRef.current) return

      const target = e.target as HTMLTextAreaElement
      const value = target.value

      // Atualizar estado SEM causar re-render do textarea
      setEditingState((prev) => {
        if (!prev) return prev
        return { ...prev, value }
      })

      // Auto-resize apenas height (width já está correto)
      target.style.height = 'auto'
      target.style.height = `${target.scrollHeight + 3}px`
    }

    const handleCompositionStart = () => {
      isComposingRef.current = true
    }

    const handleCompositionUpdate = () => {
      // Durante composição, atualizar apenas height
      textarea.style.height = 'auto'
      textarea.style.height = `${textarea.scrollHeight + 3}px`
    }

    const handleCompositionEnd = (e: Event) => {
      isComposingRef.current = false

      // Atualizar estado após composição finalizar
      const target = e.target as HTMLTextAreaElement
      setEditingState((prev) => {
        if (!prev) return prev
        return { ...prev, value: target.value }
      })

      // Auto-resize height
      textarea.style.height = 'auto'
      textarea.style.height = `${textarea.scrollHeight + 3}px`
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // CRÍTICO: Não capturar Enter/Escape durante composição
      if (isComposingRef.current) return

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        finishEditing(true)
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        finishEditing(false)
      }
    }

    const handleBlur = () => {
      // Esperar um pouco para composition finalizar
      setTimeout(() => {
        if (!isComposingRef.current) {
          finishEditing(true)
        }
      }, 100)
    }

    const handleTouchStart = (e: TouchEvent) => {
      e.stopPropagation()
    }

    textarea.addEventListener('input', handleInput)
    textarea.addEventListener('compositionstart', handleCompositionStart)
    textarea.addEventListener('compositionupdate', handleCompositionUpdate)
    textarea.addEventListener('compositionend', handleCompositionEnd)
    textarea.addEventListener('keydown', handleKeyDown)
    textarea.addEventListener('blur', handleBlur)
    textarea.addEventListener('touchstart', handleTouchStart)

    // Adicionar ao DOM
    document.body.appendChild(textarea)

    // OFICIAL KONVA: Auto-height inicial
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight + 3}px`

    // Focus com delay para mobile
    requestAnimationFrame(() => {
      textarea.focus()
      const position = textarea.value.length
      textarea.setSelectionRange(position, position)

      // iOS fix
      if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        textarea.click()
      }
    })

    // Cleanup
    return () => {
      textarea.removeEventListener('input', handleInput)
      textarea.removeEventListener('compositionstart', handleCompositionStart)
      textarea.removeEventListener('compositionupdate', handleCompositionUpdate)
      textarea.removeEventListener('compositionend', handleCompositionEnd)
      textarea.removeEventListener('keydown', handleKeyDown)
      textarea.removeEventListener('blur', handleBlur)
      textarea.removeEventListener('touchstart', handleTouchStart)
      textarea.remove()
      textareaRef.current = null
      isComposingRef.current = false
    }
    // CRÍTICO: Apenas isEditing nas dependências, não editingState
  }, [isEditing, shapeRef, finishEditing])

  // Detectar cliques fora do textarea
  React.useEffect(() => {
    if (!isEditing) return

    const handleClick = (event: MouseEvent | TouchEvent) => {
      const textarea = textareaRef.current
      if (!textarea) return

      // Se clicou no próprio textarea, não fazer nada
      if (event.target === textarea) return

      // Clicar fora = salvar e fechar
      finishEditing(true)
    }

    // Adicionar com delay para não capturar o clique que abriu
    const timer = setTimeout(() => {
      window.addEventListener('click', handleClick)
      window.addEventListener('touchstart', handleClick)
    }, 100)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('click', handleClick)
      window.removeEventListener('touchstart', handleClick)
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
    const nextRotation = layer.rotation ?? textNode.rotation()

    if (
      nextFontSize === editingState.fontSize &&
      nextFontFamily === editingState.fontFamily &&
      nextFontStyle === editingState.fontStyle &&
      String(nextFontWeight) === String(editingState.fontWeight) &&
      nextLetterSpacing === editingState.letterSpacing &&
      nextLineHeight === editingState.lineHeight &&
      nextTextAlign === editingState.textAlign &&
      nextColor === editingState.color &&
      nextPadding === editingState.padding &&
      nextRotation === editingState.rotation
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
        rotation: nextRotation,
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
    layer.rotation,
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

  // Update textarea position when zoom/pan/scroll changes
  React.useEffect(() => {
    if (!isEditing || !editingState) return

    const textarea = textareaRef.current
    if (!textarea) return

    const updatePosition = () => {
      const textNode = shapeRef.current
      if (!textNode) return

      const stage = stageRef?.current ?? textNode.getStage()
      if (!stage) return

      const textPosition = textNode.absolutePosition()
      const stageBox = stage.container().getBoundingClientRect()

      // Atualizar apenas posição (tamanho já está correto e aplicado com scale)
      const absoluteX = stageBox.left + textPosition.x
      const absoluteY = stageBox.top + textPosition.y

      textarea.style.top = `${absoluteY}px`
      textarea.style.left = `${absoluteX}px`
    }

    // Update on scroll, resize, or stage changes
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)

    // Check position periodically (for zoom/pan)
    const intervalId = setInterval(updatePosition, 100)

    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
      clearInterval(intervalId)
    }
  }, [isEditing, editingState, shapeRef, stageRef])

  const displayText = React.useMemo(() => {
    return applyTextTransform(layer.content ?? '', layer.style?.textTransform)
  }, [layer.content, layer.style?.textTransform, applyTextTransform])


  // Prepare blur filter
  const filters = React.useMemo(() => {
    if (layer.effects?.blur?.enabled && layer.effects.blur.blurRadius > 0) {
      return [Konva.Filters.Blur]
    }
    return undefined
  }, [layer.effects?.blur])

  // Force update of the layer when style properties change
  // This ensures all changes are reflected immediately without breaking transformer
  // ⚡ USAR useLayoutEffect para atualização síncrona (antes do paint)
  React.useLayoutEffect(() => {
    const textNode = shapeRef.current
    if (!textNode) return

    // Obter referências ao stage e transformer
    const stage = textNode.getStage()
    const transformer = stage?.findOne('Transformer') as Konva.Transformer | null

    // IMPORTANTE: Forçar atualização do transformer quando propriedades mudam
    if (transformer && transformer.nodes().includes(textNode)) {
      transformer.forceUpdate()
    }

    // ⚡ LIMPAR E RECRIAR CACHE para alta qualidade
    if (textNode.isCached()) {
      textNode.clearCache()
      textNode.cache({
        pixelRatio: Math.max(2, window.devicePixelRatio || 2),
        imageSmoothingEnabled: true,
      })
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
    shapeRef,
  ])

  return (
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
      onTap={handleTap}
    />
  )
}
