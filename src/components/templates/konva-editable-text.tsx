"use client"

import * as React from 'react'
import Konva from 'konva'
import { Text, Rect, Path, Group } from 'react-konva'
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

    // DESKTOP: Esconder text node e transformer durante edição
    // MOBILE: Manter visível para atualização em tempo real
    if (!isMobile) {
      textNode.hide()
      const transformer = stage.findOne('Transformer') as Konva.Transformer | null
      if (transformer) {
        transformer.hide()
      }
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
  const handleTap = React.useCallback((e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!isMobile) return

    const now = Date.now()
    const timeSinceLastTap = now - lastTapTimeRef.current

    if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
      // Duplo tap detectado (< 300ms)
      e.evt.preventDefault()
      e.evt.stopPropagation()
      startEditing()
      lastTapTimeRef.current = 0
    } else {
      // Primeiro tap
      lastTapTimeRef.current = now
    }
  }, [isMobile, startEditing])

  const finishEditing = React.useCallback(
    (commit: boolean) => {
      // Capturar valor do textarea antes de limpar estado
      const currentValue = textareaRef.current?.value

      setEditingState((prev) => {
        if (!prev) return null

        const textNode = shapeRef.current
        const stage = stageRef?.current ?? textNode?.getStage()

        // Usar valor do textarea se disponível (modal mobile)
        const finalValue = currentValue !== undefined ? currentValue : prev.value

        if (commit && finalValue !== prev.initialValue) {
          // ⚡ ATUALIZAR NODE DIRETAMENTE para visualização imediata
          if (textNode) {
            textNode.text(finalValue)
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
            content: finalValue,
          })
        }

        // DESKTOP: Restaurar visibilidade de text node e transformer
        // MOBILE: Já está visível, não precisa mostrar novamente
        if (textNode && !isMobile) {
          textNode.show()
        }
        if (stage && !isMobile) {
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
    [onChange, shapeRef, stageRef, isMobile],
  )


  const isEditing = editingState !== null

  // MODAL MOBILE: Criar modal de edição para mobile
  React.useEffect(() => {
    if (!isEditing) {
      // Limpar modal/textarea se existir
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

    // MOBILE: Criar input minimalista acima do teclado
    if (isMobile) {
      // NÃO esconder o texto - atualizar em tempo real
      textNode.show()

      // Detectar tema atual (dark/light mode)
      const isDarkMode = document.documentElement.classList.contains('dark') ||
                        window.matchMedia('(prefers-color-scheme: dark)').matches

      // Cores adaptativas ao tema
      const colors = {
        background: isDarkMode ? 'rgba(23, 23, 23, 0.85)' : 'rgba(255, 255, 255, 0.85)',
        border: isDarkMode ? 'rgba(82, 82, 91, 0.3)' : 'rgba(228, 228, 231, 0.3)',
        text: isDarkMode ? '#e4e4e7' : '#18181b',
        placeholder: isDarkMode ? '#71717a' : '#a1a1aa',
        buttonBg: isDarkMode ? '#3b82f6' : '#3b82f6',
        buttonText: '#ffffff',
        shadow: isDarkMode ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.08)',
      }

      // Container minimalista
      const inputContainer = document.createElement('div')
      inputContainer.style.cssText = `
        position: fixed;
        left: 16px;
        right: 16px;
        bottom: 20px;
        z-index: 10000;
        transition: bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      `

      // Input com fundo glassmorphism
      const textarea = document.createElement('textarea')
      textarea.value = editingState.value
      textarea.style.cssText = `
        width: 100%;
        padding: 14px 48px 14px 16px;
        font-size: 16px;
        font-family: ${textNode.fontFamily()};
        color: ${colors.text};
        background: ${colors.background};
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        border: 1px solid ${colors.border};
        border-radius: 16px;
        outline: none;
        resize: none;
        line-height: 1.5;
        box-shadow: 0 8px 32px ${colors.shadow};
        min-height: 48px;
        max-height: 140px;
        transition: all 0.2s ease;
      `
      textarea.placeholder = 'Digite o texto...'

      // Estilo do placeholder
      const style = document.createElement('style')
      style.textContent = `
        textarea::placeholder {
          color: ${colors.placeholder};
          opacity: 1;
        }
      `
      document.head.appendChild(style)

      // Botão de concluir (check) - moderno
      const doneButton = document.createElement('button')
      doneButton.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `
      doneButton.style.cssText = `
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        width: 36px;
        height: 36px;
        border: none;
        background: ${colors.buttonBg};
        color: ${colors.buttonText};
        border-radius: 10px;
        font-size: 18px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
        box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
      `

      // Efeito hover/active no botão
      doneButton.addEventListener('touchstart', () => {
        doneButton.style.transform = 'translateY(-50%) scale(0.95)'
        doneButton.style.boxShadow = '0 1px 4px rgba(59, 130, 246, 0.2)'
      })
      doneButton.addEventListener('touchend', () => {
        doneButton.style.transform = 'translateY(-50%) scale(1)'
        doneButton.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.3)'
      })

      // Atualizar texto em tempo real
      const handleInput = (e: Event) => {
        // Não atualizar durante composição (acentuação)
        if (isComposingRef.current) return

        const target = e.target as HTMLTextAreaElement
        const value = target.value

        // Atualizar canvas em tempo real
        textNode.text(value)
        const konvaLayer = textNode.getLayer()
        if (konvaLayer) konvaLayer.batchDraw()

        // Auto-resize
        target.style.height = 'auto'
        target.style.height = `${Math.min(target.scrollHeight, 120)}px`

        // Atualizar estado
        setEditingState((prev) => {
          if (!prev) return null
          return { ...prev, value }
        })
      }

      const handleCompositionStart = () => {
        isComposingRef.current = true
      }

      const handleCompositionEnd = (e: Event) => {
        isComposingRef.current = false

        // Atualizar após composição
        const target = e.target as HTMLTextAreaElement
        const value = target.value

        textNode.text(value)
        const konvaLayer = textNode.getLayer()
        if (konvaLayer) konvaLayer.batchDraw()

        setEditingState((prev) => {
          if (!prev) return null
          return { ...prev, value }
        })
      }

      const handleDone = () => {
        finishEditing(true)
      }

      const handleKeyDown = (e: KeyboardEvent) => {
        // Não capturar Enter durante composição
        if (isComposingRef.current) return

        if (e.key === 'Enter') {
          if (e.shiftKey) {
            // Shift+Enter: Quebra de linha (comportamento padrão do textarea)
            // Não fazer nada, deixar o textarea processar
            return
          } else {
            // Enter sem Shift: Confirma edição
            e.preventDefault()
            handleDone()
          }
        }
      }

      textarea.addEventListener('input', handleInput)
      textarea.addEventListener('compositionstart', handleCompositionStart)
      textarea.addEventListener('compositionend', handleCompositionEnd)
      textarea.addEventListener('keydown', handleKeyDown)
      doneButton.addEventListener('click', handleDone)

      // Ajustar posição quando teclado abre (iOS/Android)
      const adjustPosition = () => {
        const viewportHeight = window.visualViewport?.height || window.innerHeight
        const windowHeight = window.innerHeight
        const keyboardHeight = windowHeight - viewportHeight

        if (keyboardHeight > 100) {
          // Teclado aberto - subir o input
          inputContainer.style.bottom = `${keyboardHeight + 10}px`
        } else {
          // Teclado fechado
          inputContainer.style.bottom = '20px'
        }
      }

      window.visualViewport?.addEventListener('resize', adjustPosition)
      window.visualViewport?.addEventListener('scroll', adjustPosition)

      // Montar estrutura
      inputContainer.appendChild(textarea)
      inputContainer.appendChild(doneButton)
      document.body.appendChild(inputContainer)

      // Guardar referência
      textareaRef.current = textarea

      // Focus
      setTimeout(() => {
        textarea.focus()
        const position = textarea.value.length
        textarea.setSelectionRange(position, position)
        adjustPosition()
      }, 100)

      // Cleanup
      return () => {
        textarea.removeEventListener('input', handleInput)
        textarea.removeEventListener('compositionstart', handleCompositionStart)
        textarea.removeEventListener('compositionend', handleCompositionEnd)
        textarea.removeEventListener('keydown', handleKeyDown)
        doneButton.removeEventListener('click', handleDone)
        doneButton.removeEventListener('touchstart', () => {})
        doneButton.removeEventListener('touchend', () => {})
        window.visualViewport?.removeEventListener('resize', adjustPosition)
        window.visualViewport?.removeEventListener('scroll', adjustPosition)
        inputContainer.remove()
        style.remove() // Remover estilo do placeholder
        textareaRef.current = null
        isComposingRef.current = false
      }
    }

    // DESKTOP: Criar textarea in-place (código existente)
    const textarea = document.createElement('textarea')
    textareaRef.current = textarea

    // CRÍTICO: Aplicar scale no tamanho do textarea para respeitar zoom do stage
    const absoluteScale = textNode.getAbsoluteScale().x
    const width = (textNode.width() - textNode.padding() * 2) * absoluteScale
    const height = (textNode.height() - textNode.padding() * 2) * absoluteScale

    // MOBILE: Garantir fontSize mínimo de 16px para ativar teclado no iOS
    const baseFontSize = textNode.fontSize() * absoluteScale
    const fontSize = isMobile ? Math.max(16, baseFontSize) : baseFontSize

    // OFICIAL KONVA: Transform com rotação e ajuste de 2px
    let transform = ''
    if (editingState.rotation) {
      transform += `rotateZ(${editingState.rotation}deg)`
    }

    // MOBILE: Ajustar scale do transform se fontSize foi aumentado
    if (isMobile && fontSize > baseFontSize) {
      const fontScale = baseFontSize / fontSize
      transform += ` scale(${fontScale})`
    }

    transform += ' translateY(-2px)'

    // OFICIAL KONVA: Textarea invisível que fica exatamente sobre o texto
    // MOBILE: Usar position fixed para evitar problemas com scroll
    Object.assign(textarea.style, {
      position: 'fixed',
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

    // MOBILE: Atributos adicionais para garantir que o teclado apareça
    if (isMobile) {
      textarea.setAttribute('data-mobile-edit', 'true')
      textarea.readOnly = false
      textarea.disabled = false
    }

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

      if (e.key === 'Enter') {
        if (e.shiftKey) {
          // Shift+Enter: Quebra de linha (comportamento padrão do textarea)
          // Não fazer nada, deixar o textarea processar
          return
        } else {
          // Enter sem Shift: Confirma edição
          e.preventDefault()
          finishEditing(true)
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        finishEditing(false)
      }
    }

    const handleBlur = () => {
      // Sempre confirmar ao perder foco, com pequeno delay para composition
      setTimeout(() => {
        finishEditing(true)
      }, 50)
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

    // MOBILE: Focus agressivo para garantir que o teclado apareça
    const focusTextarea = () => {
      textarea.focus()

      const position = textarea.value.length
      textarea.setSelectionRange(position, position)

      // iOS/Android: Múltiplas estratégias para ativar teclado
      if (isMobile) {
        // Estratégia 1: Click direto
        textarea.click()

        // Estratégia 2: Touch event simulado
        const touchEvent = new TouchEvent('touchstart', {
          bubbles: true,
          cancelable: true,
          view: window,
        })
        textarea.dispatchEvent(touchEvent)

        // Estratégia 3: Focus novamente após delay
        setTimeout(() => {
          textarea.focus()
          textarea.setSelectionRange(position, position)
        }, 100)

        // Estratégia 4: Verificar e tentar novamente se necessário
        setTimeout(() => {
          if (document.activeElement !== textarea) {
            textarea.focus()
            textarea.click()
          }
        }, 300)
      }
    }

    // Executar focus em múltiplos frames para garantir
    requestAnimationFrame(() => {
      focusTextarea()
      requestAnimationFrame(focusTextarea)
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

  // Detectar cliques fora do textarea (apenas desktop)
  React.useEffect(() => {
    if (!isEditing || isMobile) return // Skip para mobile (modal tem seus próprios botões)

    const handleMouseDown = (event: MouseEvent) => {
      const textarea = textareaRef.current
      if (!textarea) return

      // Se clicou no próprio textarea, não fazer nada
      if (event.target === textarea) return

      // Clicar fora = salvar e fechar
      finishEditing(true)
    }

    // Adicionar com delay para não capturar o clique que abriu
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleMouseDown, true) // Use capture phase
    }, 100)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleMouseDown, true)
    }
  }, [isEditing, isMobile, finishEditing])

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

  // Update textarea position when zoom/pan/scroll changes (apenas desktop)
  React.useEffect(() => {
    if (!isEditing || isMobile) return // Skip para mobile (modal é fixo)

    const textarea = textareaRef.current
    if (!textarea) return

    const updatePosition = () => {
      const textNode = shapeRef.current
      if (!textNode) return

      const stage = stageRef?.current ?? textNode.getStage()
      if (!stage) return

      const textPosition = textNode.absolutePosition()
      const stageBox = stage.container().getBoundingClientRect()

      // FIXED: Atualizar posição usando fixed positioning
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
  }, [isEditing, isMobile, shapeRef, stageRef])

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

  // Calculate background dimensions if background effect is enabled
  const backgroundPadding = layer.effects?.background?.enabled ? (layer.effects.background.padding || 10) : 0

  // Curved text effect - render each character along an arc
  const isCurvedText = layer.effects?.curved?.enabled && layer.effects.curved.curvature !== 0
  const curvedTextElements = React.useMemo(() => {
    if (!isCurvedText || !displayText) return null

    const curvature = layer.effects?.curved?.curvature || 0
    const chars = displayText.split('')
    const fontSize = layer.style?.fontSize ?? 16
    const width = layer.size?.width ?? 240

    // Calculate radius based on curvature (in degrees)
    // More curvature = tighter curve (smaller radius)
    const curvatureRadians = (curvature * Math.PI) / 180
    const radius = curvatureRadians !== 0 ? width / (2 * Math.sin(Math.abs(curvatureRadians) / 2)) : 1000

    // Center point for the arc
    const centerX = width / 2
    const centerY = curvature > 0 ? -radius : radius

    return chars.map((char, i) => {
      // Calculate position along the arc for each character
      const charAngle = (curvatureRadians * (i - chars.length / 2)) / chars.length
      const x = centerX + radius * Math.sin(charAngle)
      const y = centerY + radius * (1 - Math.cos(charAngle))
      const rotation = (charAngle * 180) / Math.PI

      return (
        <Text
          key={`curved-char-${i}`}
          x={x}
          y={y}
          rotation={rotation}
          text={char}
          fontSize={fontSize}
          fontFamily={layer.style?.fontFamily ?? 'Inter'}
          fontStyle={layer.style?.fontStyle ?? 'normal'}
          fontVariant={layer.style?.fontWeight ? String(layer.style.fontWeight) : undefined}
          fill={layer.style?.color ?? '#000000'}
          stroke={
            layer.effects?.stroke?.enabled
              ? layer.effects.stroke.strokeColor
              : undefined
          }
          strokeWidth={
            layer.effects?.stroke?.enabled
              ? layer.effects.stroke.strokeWidth
              : undefined
          }
          shadowColor={layer.effects?.shadow?.enabled ? layer.effects.shadow.shadowColor : undefined}
          shadowBlur={layer.effects?.shadow?.enabled ? layer.effects.shadow.shadowBlur : 0}
          shadowOffsetX={layer.effects?.shadow?.enabled ? layer.effects.shadow.shadowOffsetX : 0}
          shadowOffsetY={layer.effects?.shadow?.enabled ? layer.effects.shadow.shadowOffsetY : 0}
          shadowOpacity={layer.effects?.shadow?.enabled ? layer.effects.shadow.shadowOpacity : 1}
          filters={filters}
          blurRadius={layer.effects?.blur?.enabled ? layer.effects.blur.blurRadius : 0}
          listening={false}
          perfectDrawEnabled={true}
          imageSmoothingEnabled={true}
        />
      )
    })
  }, [isCurvedText, displayText, layer.effects, layer.style, layer.size?.width, filters])

  return (
    <>
      {/* Background Effect */}
      {layer.effects?.background?.enabled && !isCurvedText && (
        <Rect
          x={(layer.position?.x ?? 0) - backgroundPadding}
          y={(layer.position?.y ?? 0) - backgroundPadding}
          width={(layer.size?.width ?? 240) + (backgroundPadding * 2)}
          height={(layer.size?.height ?? 120) + (backgroundPadding * 2)}
          fill={layer.effects.background.backgroundColor}
          listening={false}
        />
      )}

      {/* Render curved text if curved effect is enabled */}
      {isCurvedText ? (
        <Group
          {...commonProps}
          ref={shapeRef as any}
          listening={commonProps.listening && !isEditing}
          draggable={commonProps.draggable && !isEditing}
          visible={!isEditing}
        >
          {curvedTextElements}
        </Group>
      ) : (
        /* Render normal text if curved effect is disabled */
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
        stroke={
          layer.effects?.stroke?.enabled
            ? layer.effects.stroke.strokeColor
            : (layer.style?.border?.width && layer.style.border.width > 0 ? layer.style.border.color : undefined)
        }
        strokeWidth={
          layer.effects?.stroke?.enabled
            ? layer.effects.stroke.strokeWidth
            : (layer.style?.border?.width && layer.style.border.width > 0 ? layer.style.border.width : undefined)
        }
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
      )}
    </>
  )
}
