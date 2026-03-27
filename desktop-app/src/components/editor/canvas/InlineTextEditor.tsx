import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Palette,
} from 'lucide-react'
import { resolveTextRenderState } from '@/lib/editor/text-layout'
import { serializeFontFamilyStack } from '@/lib/editor/font-utils'
import { richStylesToHtml, htmlToRichStyles } from '@/lib/editor/rich-text-parser'
import type { KonvaPage, KonvaTextLayer, RichStyleRun } from '@/types/template'
import { cn } from '@/lib/utils'

interface RichTextResult {
  text: string
  richStyles: RichStyleRun[]
}

interface InlineTextEditorProps {
  layer: KonvaTextLayer
  page: KonvaPage
  pagePosition: { x: number; y: number }
  zoom: number
  isPanning: boolean
  projectPalette?: string[]
  availableFontFamilies?: string[]
  onConfirm: (result: RichTextResult) => void
  onCancel: () => void
}

// ─── Floating Toolbar ──────────────────────────────────────────────

function ToolbarBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault() // Prevent losing selection
        onClick()
      }}
      title={title}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md transition-all text-xs',
        active
          ? 'bg-orange-500/30 text-orange-300'
          : 'text-white/60 hover:bg-white/10 hover:text-white/80',
      )}
    >
      {children}
    </button>
  )
}

function FloatingToolbar({
  editorRef,
  position,
  projectPalette = [],
  availableFontFamilies = [],
}: {
  editorRef: React.RefObject<HTMLDivElement | null>
  position: { x: number; y: number } | null
  projectPalette?: string[]
  availableFontFamilies?: string[]
}) {
  const [selectionState, setSelectionState] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    color: '',
    fontFamily: '',
    fontSize: '',
  })
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showFontPicker, setShowFontPicker] = useState(false)

  // Poll selection state
  useEffect(() => {
    const check = () => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return

      setSelectionState({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikethrough: document.queryCommandState('strikeThrough'),
        color: document.queryCommandValue('foreColor'),
        fontFamily: document.queryCommandValue('fontName'),
        fontSize: document.queryCommandValue('fontSize'),
      })
    }

    const interval = setInterval(check, 200)
    check()
    return () => clearInterval(interval)
  }, [])

  const exec = (command: string, value?: string) => {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
  }

  if (!position) return null

  return (
    <div
      data-rich-toolbar
      className="fixed z-[60] flex items-center gap-0.5 rounded-xl bg-[#1a1a1a] border border-white/10 shadow-2xl px-1.5 py-1"
      style={{
        left: position.x,
        top: Math.max(48, position.y - 44),
        transform: 'translateX(-50%)',
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <ToolbarBtn active={selectionState.bold} onClick={() => exec('bold')} title="Negrito">
        <Bold size={13} />
      </ToolbarBtn>
      <ToolbarBtn active={selectionState.italic} onClick={() => exec('italic')} title="Italico">
        <Italic size={13} />
      </ToolbarBtn>
      <ToolbarBtn active={selectionState.underline} onClick={() => exec('underline')} title="Sublinhado">
        <Underline size={13} />
      </ToolbarBtn>
      <ToolbarBtn active={selectionState.strikethrough} onClick={() => exec('strikeThrough')} title="Tachado">
        <Strikethrough size={13} />
      </ToolbarBtn>

      <div className="w-px h-5 bg-white/10 mx-1" />

      {/* Color picker */}
      <div className="relative">
        <ToolbarBtn active={showColorPicker} onClick={() => { setShowColorPicker(!showColorPicker); setShowFontPicker(false) }} title="Cor">
          <Palette size={13} />
        </ToolbarBtn>
        {showColorPicker && (
          <div
            className="absolute top-full left-1/2 -translate-x-1/2 mt-2 p-2 rounded-xl bg-[#1a1a1a] border border-white/10 shadow-2xl z-[70]"
            onMouseDown={(e) => e.preventDefault()}
          >
            {projectPalette.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2 max-w-[160px]">
                {projectPalette.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      exec('foreColor', color)
                      setShowColorPicker(false)
                    }}
                    className="h-6 w-6 rounded-md border border-white/15 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            )}
            <input
              type="color"
              defaultValue="#ffffff"
              onChange={(e) => {
                exec('foreColor', e.target.value)
              }}
              className="w-full h-7 cursor-pointer rounded border-0 bg-transparent p-0"
            />
          </div>
        )}
      </div>

      {/* Font picker */}
      {availableFontFamilies.length > 0 && (
        <div className="relative">
          <ToolbarBtn active={showFontPicker} onClick={() => { setShowFontPicker(!showFontPicker); setShowColorPicker(false) }} title="Fonte">
            <span className="text-[10px] font-bold">Aa</span>
          </ToolbarBtn>
          {showFontPicker && (
            <div
              className="absolute top-full left-1/2 -translate-x-1/2 mt-2 p-1 rounded-xl bg-[#1a1a1a] border border-white/10 shadow-2xl z-[70] max-h-[200px] overflow-y-auto min-w-[140px]"
              onMouseDown={(e) => e.preventDefault()}
            >
              {availableFontFamilies.map((font) => (
                <button
                  key={font}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    exec('fontName', font)
                    setShowFontPicker(false)
                  }}
                  className="w-full text-left text-xs text-white/70 hover:bg-white/10 hover:text-white px-2 py-1.5 rounded-lg truncate"
                  style={{ fontFamily: font }}
                >
                  {font}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Editor ───────────────────────────────────────────────────

export function InlineTextEditor({
  layer,
  page,
  pagePosition,
  zoom,
  isPanning,
  projectPalette,
  availableFontFamilies,
  onConfirm,
  onCancel,
}: InlineTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const confirmedRef = useRef(false)
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null)

  const renderState = resolveTextRenderState(page, layer)

  // Build initial HTML from text + richStyles
  const initialHtml = useRef(richStylesToHtml(layer.text, layer.richStyles))

  const confirm = useCallback(() => {
    if (confirmedRef.current) return
    confirmedRef.current = true

    const editor = editorRef.current
    if (!editor) {
      onCancel()
      return
    }

    const html = editor.innerHTML
    const parsed = htmlToRichStyles(html)

    if (parsed.text.trim()) {
      onConfirm({
        text: parsed.text,
        richStyles: parsed.richStyles.length > 0 ? parsed.richStyles : [],
      })
    } else {
      onCancel()
    }
  }, [onConfirm, onCancel])

  // Track selection for toolbar position using multiple events
  const updateToolbarPosition = useCallback(() => {
    const sel = window.getSelection()

    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setToolbarPos(null)
      return
    }

    // Check selection is within our editor
    const editor = editorRef.current
    const containsAnchor = editor?.contains(sel.anchorNode ?? null)

    if (!editor || !containsAnchor) {
      setToolbarPos(null)
      return
    }

    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()

    // Only show if rect has meaningful dimensions
    if (rect.width < 2) {
      setToolbarPos(null)
      return
    }

    const pos = {
      x: rect.left + rect.width / 2,
      y: rect.top,
    }
    setToolbarPos(pos)
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    const handleMouseUp = () => {
      setTimeout(updateToolbarPosition, 10)
    }

    const handleKeyUp = () => {
      setTimeout(updateToolbarPosition, 10)
    }

    const handleSelectionChange = () => {
      setTimeout(updateToolbarPosition, 10)
    }

    editor.addEventListener('mouseup', handleMouseUp)
    editor.addEventListener('keyup', handleKeyUp)
    document.addEventListener('selectionchange', handleSelectionChange)

    return () => {
      editor.removeEventListener('mouseup', handleMouseUp)
      editor.removeEventListener('keyup', handleKeyUp)
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [updateToolbarPosition])

  // Auto-focus on mount
  useEffect(() => {
    const editor = editorRef.current
    if (editor) {
      editor.focus()
      // Select all text
      const range = document.createRange()
      range.selectNodeContents(editor)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)

      // Show toolbar after a short delay so position is calculated correctly
      setTimeout(updateToolbarPosition, 150)
    }
  }, [updateToolbarPosition])

  // Click outside to confirm
  const isPanningRef = useRef(isPanning)
  isPanningRef.current = isPanning

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isPanningRef.current) return
      const target = event.target as Node

      // Check if click is inside editor or toolbar
      const editor = editorRef.current
      if (editor && editor.contains(target)) return

      // Check if click is inside a toolbar popup
      const toolbar = document.querySelector('[data-rich-toolbar]')
      if (toolbar && toolbar.contains(target)) return

      confirm()
    }

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 50)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [confirm])

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    }
    // Ctrl/Cmd+Enter to confirm
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      confirm()
    }
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

  const decorations: string[] = []
  if (layer.textStyle?.underline) decorations.push('underline')
  if (layer.textStyle?.strikethrough) decorations.push('line-through')
  const textDecoration = decorations.length > 0 ? decorations.join(' ') : undefined

  return (
    <>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onKeyDown={handleKeyDown}
        onPaste={(e) => {
          e.preventDefault()
          const text = e.clipboardData.getData('text/plain')
          document.execCommand('insertText', false, text)
        }}
        dangerouslySetInnerHTML={{ __html: initialHtml.current }}
        className="inline-text-editor"
        style={{
          position: 'absolute',
          left: screenX,
          top: screenY,
          width: screenWidth,
          minHeight: screenHeight,
          fontFamily,
          fontSize: scaledFontSize,
          fontWeight,
          fontStyle,
          color: fill,
          textAlign,
          lineHeight,
          letterSpacing: `${letterSpacing * zoom}px`,
          textDecorationLine: textDecoration,
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
          cursor: 'text',
        }}
      />

      {/* Floating formatting toolbar — portal to body to escape overflow/stacking contexts */}
      {createPortal(
        <FloatingToolbar
          editorRef={editorRef}
          position={toolbarPos}
          projectPalette={projectPalette}
          availableFontFamilies={availableFontFamilies}
        />,
        document.body,
      )}
    </>
  )
}
