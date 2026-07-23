"use client"

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ColorPicker } from '@/components/canvas/effects/ColorPicker'
import { Bold, Italic, Underline, Strikethrough, Type, TextSelect, Eraser } from 'lucide-react'
import type { Layer, RichTextStyle } from '@/types/template'
import { getFontManager } from '@/lib/font-manager'
import { cn } from '@/lib/utils'

/**
 * RichTextEditorModal - Editor de texto com múltiplos estilos
 *
 * Redesign: a seleção é feita direto no texto estilizado, tocando nas
 * palavras (toque seleciona a palavra; toque em outra estende o intervalo;
 * toque dentro da seleção reinicia nela). Os estilos aplicam na hora sobre
 * a seleção — sem botões "Aplicar" separados.
 */

interface RichTextEditorModalProps {
  open: boolean
  onClose: () => void
  layer: Layer
  projectId: number
  onSave: (content: string, styles: RichTextStyle[]) => void
}

interface SelectionState {
  start: number
  end: number
}

interface TokenSegment {
  text: string
  style?: RichTextStyle
}

interface Token {
  /** Sub-trechos da palavra, divididos nos limites dos estilos (para renderização fiel) */
  segments: TokenSegment[]
  start: number
  end: number
  isWord: boolean
}

/** Estilo efetivo em um trecho: o ÚLTIMO estilo aplicado que contém o trecho vence */
function styleAt(styles: RichTextStyle[], start: number, end: number): RichTextStyle | undefined {
  for (let i = styles.length - 1; i >= 0; i--) {
    const s = styles[i]
    if (s.start <= start && s.end >= end) return s
  }
  return undefined
}

/**
 * Divide o conteúdo em tokens de PALAVRA INTEIRA (unidade de seleção).
 * Estilos que terminam no meio de uma palavra não quebram o token — a palavra
 * continua selecionável por inteiro; a renderização usa sub-segmentos.
 */
function buildTokens(content: string, styles: RichTextStyle[]): Token[] {
  const parts = content.split(/(\s+)/).filter((p) => p.length > 0)
  const tokens: Token[] = []
  let offset = 0

  for (const part of parts) {
    const start = offset
    const end = offset + part.length
    offset = end

    // Limites de estilo dentro desta palavra
    const boundaries = new Set<number>([start, end])
    for (const s of styles) {
      if (s.start > start && s.start < end) boundaries.add(s.start)
      if (s.end > start && s.end < end) boundaries.add(s.end)
    }
    const sorted = [...boundaries].sort((a, b) => a - b)

    const segments: TokenSegment[] = []
    for (let i = 0; i < sorted.length - 1; i++) {
      const segStart = sorted[i]
      const segEnd = sorted[i + 1]
      if (segEnd <= segStart) continue
      segments.push({
        text: content.substring(segStart, segEnd),
        style: styleAt(styles, segStart, segEnd),
      })
    }

    tokens.push({ segments, start, end, isWord: !/^\s+$/.test(part) })
  }
  return tokens
}

export function RichTextEditorModal({
  open,
  onClose,
  layer,
  projectId,
  onSave,
}: RichTextEditorModalProps) {
  const [content, setContent] = React.useState(layer.content ?? '')
  const [styles, setStyles] = React.useState<RichTextStyle[]>(
    layer.richTextStyles ?? []
  )
  // Seleção múltipla: cada toque em uma palavra adiciona/remove a palavra
  // (permite estilizar palavras separadas na mesma frase de uma vez)
  const [selectedRanges, setSelectedRanges] = React.useState<SelectionState[]>([])
  const [isEditingText, setIsEditingText] = React.useState(false)

  const fontManager = React.useMemo(() => getFontManager(), [])
  const [availableFonts, setAvailableFonts] = React.useState<{
    system: string[]
    custom: string[]
    all: string[]
  }>(() => fontManager.getAvailableFonts(projectId))

  // Controles de estilo (valores atuais dos pickers)
  const [currentColor, setCurrentColor] = React.useState(layer.style?.color ?? '#000000')
  const [currentFont, setCurrentFont] = React.useState(layer.style?.fontFamily ?? 'Inter')
  const [currentFontSize, setCurrentFontSize] = React.useState(layer.style?.fontSize ?? 16)

  const hasSelection = selectedRanges.length > 0

  const baseStyle = React.useMemo(() => ({
    fontFamily: layer.style?.fontFamily ?? 'Inter',
    fontSize: layer.style?.fontSize ?? 16,
    color: layer.style?.color ?? '#000000',
    textAlign: layer.style?.textAlign ?? 'left',
    lineHeight: layer.style?.lineHeight ?? 1.2,
    letterSpacing: layer.style?.letterSpacing ?? 0,
  }), [layer.style])

  React.useEffect(() => {
    const fonts = fontManager.getAvailableFonts(projectId)
    setAvailableFonts(fonts)
  }, [fontManager, projectId])

  const tokens = React.useMemo(() => buildTokens(content, styles), [content, styles])

  // ---- Seleção por toque nas palavras (toggle) ----
  const handleTokenClick = React.useCallback((token: Token) => {
    if (!token.isWord) return
    setSelectedRanges((prev) => {
      const exists = prev.some((r) => r.start === token.start && r.end === token.end)
      if (exists) {
        return prev.filter((r) => !(r.start === token.start && r.end === token.end))
      }
      return [...prev, { start: token.start, end: token.end }].sort((a, b) => a.start - b.start)
    })
  }, [])

  const selectAll = React.useCallback(() => {
    setSelectedRanges(
      tokens.filter((t) => t.isWord).map((t) => ({ start: t.start, end: t.end }))
    )
  }, [tokens])

  const clearSelection = React.useCallback(() => {
    setSelectedRanges([])
  }, [])

  // ---- Aplicação de estilos (imediata, sobre TODAS as palavras selecionadas) ----
  // Estilos antigos que se sobrepõem a cada trecho são RECORTADOS (a parte fora
  // sobrevive; a parte dentro é substituída). Garante que toda a seleção mude.
  const applyStyle = React.useCallback(
    (styleUpdate: Partial<RichTextStyle>) => {
      if (selectedRanges.length === 0) return
      setStyles((prevStyles) => {
        let next = [...prevStyles]
        for (const { start, end } of selectedRanges) {
          // Herdar propriedades do estilo efetivo (para não perder cor ao aplicar negrito, etc.)
          const containing = styleAt(next, start, end)
          const out: RichTextStyle[] = []
          for (const s of next) {
            if (s.end <= start || s.start >= end) {
              out.push(s)
              continue
            }
            if (s.start < start) out.push({ ...s, end: start })
            if (s.end > end) out.push({ ...s, start: end })
          }
          out.push({
            ...(containing ? { ...containing } : {}),
            ...styleUpdate,
            start,
            end,
          })
          next = out
        }
        return next
      })
    },
    [selectedRanges]
  )

  // Estilo efetivo na seleção atual (para toggles e feedback dos botões)
  const effectiveStyle = React.useMemo(() => {
    if (!hasSelection) return undefined
    const first = selectedRanges[0]
    return styleAt(styles, first.start, first.end)
  }, [styles, selectedRanges, hasSelection])

  const fontStyleParts = React.useMemo(
    () => new Set((effectiveStyle?.fontStyle ?? '').split(' ').filter((p) => p && p !== 'normal')),
    [effectiveStyle]
  )
  const isBoldActive = fontStyleParts.has('bold')
  const isItalicActive = fontStyleParts.has('italic')
  const isUnderlineActive = effectiveStyle?.textDecoration === 'underline'
  const isStrikeActive = effectiveStyle?.textDecoration === 'line-through'

  const toggleFontStyleFlag = (flag: 'bold' | 'italic') => {
    const bold = flag === 'bold' ? !isBoldActive : isBoldActive
    const italic = flag === 'italic' ? !isItalicActive : isItalicActive
    const value: RichTextStyle['fontStyle'] =
      bold && italic ? 'bold italic' : bold ? 'bold' : italic ? 'italic' : 'normal'
    applyStyle({ fontStyle: value })
  }

  const toggleDecoration = (value: 'underline' | 'line-through') => {
    applyStyle({
      textDecoration: effectiveStyle?.textDecoration === value ? undefined : value,
    })
  }

  // Aplicação imediata dos pickers
  const handleColorChange = (color: string) => {
    setCurrentColor(color)
    applyStyle({ fill: color })
  }

  const handleFontChange = (font: string) => {
    setCurrentFont(font)
    applyStyle({ fontFamily: font })
  }

  const handleFontSizeChange = (size: number) => {
    setCurrentFontSize(size)
    if (Number.isFinite(size) && size >= 8 && size <= 200) {
      applyStyle({ fontSize: size })
    }
  }

  const handleRemoveStyles = () => {
    if (!hasSelection) return
    setStyles((prevStyles) => {
      let next = [...prevStyles]
      for (const { start, end } of selectedRanges) {
        const out: RichTextStyle[] = []
        for (const s of next) {
          if (s.end <= start || s.start >= end) {
            out.push(s)
            continue
          }
          // Preserva as partes do estilo fora do trecho selecionado
          if (s.start < start) out.push({ ...s, end: start })
          if (s.end > end) out.push({ ...s, start: end })
        }
        next = out
      }
      return next
    })
  }

  const handleSave = () => {
    onSave(content, styles)
    onClose()
  }

  const hasStylesInSelection = React.useMemo(() => {
    if (!hasSelection) return false
    return styles.some((s) =>
      selectedRanges.some((r) => s.start < r.end && s.end > r.start)
    )
  }, [styles, selectedRanges, hasSelection])

  const selectedText = selectedRanges
    .map((r) => content.substring(r.start, r.end))
    .join(' · ')

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="max-w-[95vw] w-[95vw] max-h-[95dvh] h-[95dvh] overflow-hidden flex flex-col gap-3"
        style={{ zIndex: 10001 }}
      >
        <DialogHeader className="border-b pb-3">
          <DialogTitle className="text-lg font-semibold">Editor de Rich Text</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {hasSelection
              ? `${selectedRanges.length} palavra${selectedRanges.length > 1 ? 's' : ''}: "${selectedText.length > 60 ? `${selectedText.slice(0, 60)}…` : selectedText}"`
              : 'Toque nas palavras para selecionar — cada toque adiciona ou remove a palavra.'}
          </p>
        </DialogHeader>

        {/* Toolbar de estilos - aplica na hora sobre a seleção */}
        <div className="flex flex-wrap items-center justify-center gap-2 rounded-lg border bg-muted/40 p-2">
          {/* Cor */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-2" disabled={!hasSelection}>
                <div
                  className="h-4 w-4 rounded border border-border"
                  style={{ backgroundColor: currentColor }}
                />
                Cor
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <ColorPicker
                label="Cor do trecho selecionado"
                value={currentColor}
                onChange={handleColorChange}
                projectId={projectId}
              />
            </PopoverContent>
          </Popover>

          {/* Fonte */}
          <Select value={currentFont} onValueChange={handleFontChange} disabled={!hasSelection}>
            <SelectTrigger className="h-9 w-[140px] sm:w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {availableFonts.system.length > 0 && (
                <>
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                    Sistema
                  </div>
                  {availableFonts.system.map((font) => (
                    <SelectItem key={font} value={font}>
                      <span style={{ fontFamily: font }}>{font}</span>
                    </SelectItem>
                  ))}
                </>
              )}
              {availableFonts.custom.length > 0 && (
                <>
                  <div className="mt-2 px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                    Minhas Fontes
                  </div>
                  {availableFonts.custom.map((font) => (
                    <SelectItem key={font} value={font}>
                      <span style={{ fontFamily: font }}>{font}</span>
                    </SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>

          {/* Tamanho */}
          <div className="flex items-center gap-1.5">
            <Type className="h-4 w-4 text-muted-foreground" />
            <Input
              type="number"
              min={8}
              max={200}
              value={currentFontSize}
              onChange={(e) => handleFontSizeChange(Number(e.target.value))}
              disabled={!hasSelection}
              className="h-9 w-16"
            />
          </div>

          {/* Formatação */}
          <div className="flex items-center gap-1 rounded-md border bg-background p-1">
            <Button
              variant={isBoldActive ? 'default' : 'ghost'}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => toggleFontStyleFlag('bold')}
              disabled={!hasSelection}
              title="Negrito"
            >
              <Bold className="h-4 w-4" />
            </Button>
            <Button
              variant={isItalicActive ? 'default' : 'ghost'}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => toggleFontStyleFlag('italic')}
              disabled={!hasSelection}
              title="Itálico"
            >
              <Italic className="h-4 w-4" />
            </Button>
            <Button
              variant={isUnderlineActive ? 'default' : 'ghost'}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => toggleDecoration('underline')}
              disabled={!hasSelection}
              title="Sublinhado"
            >
              <Underline className="h-4 w-4" />
            </Button>
            <Button
              variant={isStrikeActive ? 'default' : 'ghost'}
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => toggleDecoration('line-through')}
              disabled={!hasSelection}
              title="Tachado"
            >
              <Strikethrough className="h-4 w-4" />
            </Button>
          </div>

          {/* Limpar estilos da seleção */}
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={handleRemoveStyles}
            disabled={!hasStylesInSelection}
            title="Remove os estilos do trecho selecionado"
          >
            <Eraser className="h-4 w-4" />
            Limpar estilos
          </Button>
        </div>

        {/* Barra de seleção */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={selectAll}>
            <TextSelect className="h-4 w-4" />
            Selecionar tudo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={clearSelection}
            disabled={!hasSelection}
          >
            Limpar seleção
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-8"
            onClick={() => setIsEditingText((v) => !v)}
          >
            {isEditingText ? 'Ocultar edição de texto' : 'Editar texto'}
          </Button>
        </div>

        {/* Campo de texto bruto (opcional, recolhido por padrão) */}
        {isEditingText && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              Alterar o texto pode desalinhar estilos existentes
            </Label>
            <textarea
              value={content}
              onChange={(e) => {
                setContent(e.target.value)
                setSelectedRanges([])
              }}
              className="h-20 w-full resize-none rounded-md border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Digite o texto aqui..."
              spellCheck={false}
            />
          </div>
        )}

        {/* Superfície de seleção = preview estilizado com palavras tocáveis */}
        <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-slate-900 p-4 dark:bg-slate-950 sm:p-6">
          {content ? (
            <SelectableRichText
              tokens={tokens}
              baseStyle={baseStyle}
              selectedRanges={selectedRanges}
              onTokenClick={handleTokenClick}
              originalWidth={layer.size?.width ?? 240}
            />
          ) : (
            <p className="text-sm italic text-muted-foreground">
              Sem texto — use &quot;Editar texto&quot; para digitar.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 border-t pt-3">
          <Button variant="outline" onClick={onClose} className="min-w-[100px]">
            Cancelar
          </Button>
          <Button onClick={handleSave} className="min-w-[100px]">
            Salvar Alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Texto estilizado com palavras tocáveis para seleção
 */
interface SelectableRichTextProps {
  tokens: Token[]
  baseStyle: {
    fontFamily: string
    fontSize: number
    color: string
    textAlign: string
    lineHeight: number
    letterSpacing: number
  }
  selectedRanges: SelectionState[]
  onTokenClick: (token: Token) => void
  originalWidth?: number
}

function SelectableRichText({
  tokens,
  baseStyle,
  selectedRanges,
  onTokenClick,
  originalWidth,
}: SelectableRichTextProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [scale, setScale] = React.useState(1)

  React.useEffect(() => {
    if (!originalWidth || !containerRef.current) {
      setScale(1)
      return
    }
    const containerWidth = containerRef.current.clientWidth
    const availableWidth = containerWidth - 8
    if (availableWidth > 0 && originalWidth > 0) {
      setScale(Math.min(1, availableWidth / originalWidth))
    }
  }, [originalWidth])

  const hasSelection = selectedRanges.length > 0

  return (
    <div
      ref={containerRef}
      className="whitespace-pre-wrap select-none"
      style={{
        fontFamily: baseStyle.fontFamily,
        fontSize: `${baseStyle.fontSize * scale}px`,
        color: baseStyle.color,
        textAlign: baseStyle.textAlign as React.CSSProperties['textAlign'],
        lineHeight: baseStyle.lineHeight,
        letterSpacing: `${baseStyle.letterSpacing * scale}px`,
        width: originalWidth ? `${originalWidth * scale}px` : 'auto',
      }}
    >
      {tokens.map((token, index) => {
        const renderSegments = token.segments.map((segment, segIndex) => {
          const isBoldSeg = segment.style?.fontStyle?.includes('bold') ?? false
          const style: React.CSSProperties = segment.style
            ? {
                color: segment.style.fill ?? undefined,
                fontFamily: segment.style.fontFamily ?? undefined,
                fontSize: segment.style.fontSize
                  ? `${segment.style.fontSize * scale}px`
                  : undefined,
                fontWeight: isBoldSeg ? 'bold' : undefined,
                fontStyle: segment.style.fontStyle?.includes('italic') ? 'italic' : undefined,
                textDecoration: segment.style.textDecoration,
                letterSpacing:
                  segment.style.letterSpacing !== undefined
                    ? `${segment.style.letterSpacing * scale}px`
                    : undefined,
                // Fontes customizadas têm um único peso — engrossa igual ao canvas
                WebkitTextStroke: isBoldSeg ? '0.03em currentcolor' : undefined,
              }
            : {}
          return (
            <span key={segIndex} style={style}>
              {segment.text}
            </span>
          )
        })

        if (!token.isWord) {
          return <span key={index}>{renderSegments}</span>
        }

        const isSelected =
          hasSelection &&
          selectedRanges.some((r) => token.start >= r.start && token.end <= r.end)

        return (
          <span
            key={index}
            role="button"
            tabIndex={0}
            onClick={() => onTokenClick(token)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onTokenClick(token)
              }
            }}
            className={cn(
              'cursor-pointer rounded-sm transition-colors duration-100',
              isSelected
                ? 'bg-primary/40 ring-2 ring-primary/70'
                : 'hover:bg-primary/15'
            )}
          >
            {renderSegments}
          </span>
        )
      })}
    </div>
  )
}
