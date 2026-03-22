import { useCallback, useEffect, useRef, useState } from 'react'
import { resolveTextRenderState } from '@/lib/editor/text-layout'
import { serializeFontFamilyStack } from '@/lib/editor/font-utils'
import type { KonvaPage, KonvaTextLayer } from '@/types/template'

interface InlineTextEditorProps {
  layer: KonvaTextLayer
  page: KonvaPage
  pagePosition: { x: number; y: number }
  zoom: number
  isPanning: boolean
  onConfirm: (newText: string) => void
  onCancel: () => void
}

export function InlineTextEditor({
  layer,
  page,
  pagePosition,
  zoom,
  isPanning,
  onConfirm,
  onCancel,
}: InlineTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState(layer.text)
  const confirmedRef = useRef(false)

  const renderState = resolveTextRenderState(page, layer)

  const confirm = useCallback(() => {
    if (confirmedRef.current) return
    confirmedRef.current = true
    if (text.trim()) {
      onConfirm(text)
    } else {
      onCancel()
    }
  }, [text, onConfirm, onCancel])

  // Auto-focus and select all on mount
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.focus()
      textarea.select()
    }
  }, [])

  // Click outside to confirm (skip when panning with space+drag)
  const isPanningRef = useRef(isPanning)
  isPanningRef.current = isPanning

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isPanningRef.current) return
      if (textareaRef.current && !textareaRef.current.contains(event.target as Node)) {
        confirm()
      }
    }

    // Delay adding listener to prevent immediate trigger from the double-click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 50)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [confirm])

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      confirm()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    }
    // Shift+Enter = natural newline (default textarea behavior)
    // Stop propagation to prevent editor shortcuts
    event.stopPropagation()
  }

  // Position in screen coordinates
  const screenX = pagePosition.x + renderState.x * zoom
  const screenY = pagePosition.y + renderState.y * zoom
  const screenWidth = renderState.width * zoom
  const screenHeight = renderState.height * zoom
  const scaledFontSize = renderState.fontSize * zoom
  const rotation = layer.rotation ?? 0

  const fontFamily = serializeFontFamilyStack(layer.textStyle?.fontFamily)
  const fontWeight = layer.textStyle?.fontWeight ?? 'normal'
  const fontStyle = layer.textStyle?.fontStyle ?? 'normal'
  const fill = layer.textStyle?.fill ?? '#111827'
  const textAlign = (layer.textStyle?.align ?? 'left') as React.CSSProperties['textAlign']
  const lineHeight = layer.textStyle?.lineHeight ?? 1.1
  const letterSpacing = layer.textStyle?.letterSpacing ?? 0

  return (
    <textarea
      ref={textareaRef}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={handleKeyDown}
      className="inline-text-editor"
      style={{
        position: 'absolute',
        left: screenX,
        top: screenY,
        width: screenWidth,
        height: screenHeight,
        fontFamily,
        fontSize: scaledFontSize,
        fontWeight,
        fontStyle,
        color: fill,
        textAlign,
        lineHeight,
        letterSpacing: `${letterSpacing * zoom}px`,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: 'top left',
        background: 'transparent',
        border: '2px solid #F59E0B',
        borderRadius: 2,
        outline: 'none',
        resize: 'none',
        overflow: 'hidden',
        padding: 0,
        margin: 0,
        boxSizing: 'border-box',
        zIndex: 50,
        caretColor: '#F59E0B',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
      }}
    />
  )
}
