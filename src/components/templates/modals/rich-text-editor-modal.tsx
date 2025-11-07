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
import { Bold, Italic, Underline, Strikethrough, Type } from 'lucide-react'
import type { Layer, RichTextStyle } from '@/types/template'
import { FONT_CONFIG } from '@/lib/font-config'
import { getFontManager } from '@/lib/font-manager'

/**
 * RichTextEditorModal - Modal para editar texto com múltiplos estilos
 *
 * Permite aplicar diferentes cores, fontes e formatações em trechos específicos.
 *
 * Funcionalidades:
 * - Edição de texto em textarea
 * - Seleção de trechos com mouse
 * - Toolbar inline para aplicar estilos
 * - Preview visual com estilos aplicados
 * - Gerenciamento de estilos (adicionar, remover, merge)
 *
 * @component
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
  selectedText: string
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
  const [selection, setSelection] = React.useState<SelectionState>({
    start: 0,
    end: 0,
    selectedText: '',
  })

  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const fontManager = React.useMemo(() => getFontManager(), [])
  const [availableFonts, setAvailableFonts] = React.useState<{
    system: string[]
    custom: string[]
    all: string[]
  }>(() => fontManager.getAvailableFonts(projectId))

  // Estado dos controles de estilo
  const [currentColor, setCurrentColor] = React.useState('#000000')
  const [currentFont, setCurrentFont] = React.useState(
    layer.style?.fontFamily ?? 'Inter'
  )
  const [currentFontSize, setCurrentFontSize] = React.useState(
    layer.style?.fontSize ?? 16
  )

  // Atualizar lista de fontes
  React.useEffect(() => {
    const fonts = fontManager.getAvailableFonts(projectId)
    setAvailableFonts(fonts)
  }, [fontManager, projectId])

  // Atualizar seleção quando usuário seleciona texto
  const handleSelectionChange = React.useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = content.substring(start, end)

    setSelection({ start, end, selectedText })

    // Detectar estilo atual na seleção (se houver)
    if (start !== end && styles.length > 0) {
      const styleAtSelection = styles.find(
        (s) => s.start <= start && s.end >= end
      )
      if (styleAtSelection) {
        if (styleAtSelection.fill) setCurrentColor(styleAtSelection.fill)
        if (styleAtSelection.fontFamily) setCurrentFont(styleAtSelection.fontFamily)
        if (styleAtSelection.fontSize) setCurrentFontSize(styleAtSelection.fontSize)
      }
    }
  }, [content, styles])

  // Aplicar estilo ao trecho selecionado
  const applyStyle = React.useCallback(
    (styleUpdate: Partial<RichTextStyle>) => {
      if (selection.start === selection.end) {
        // Nada selecionado
        return
      }

      const newStyle: RichTextStyle = {
        start: selection.start,
        end: selection.end,
        ...styleUpdate,
      }

      // Adicionar ou merge com estilos existentes
      setStyles((prevStyles) => {
        // Remover estilos sobrepostos
        const filteredStyles = prevStyles.filter(
          (s) =>
            s.end <= selection.start || s.start >= selection.end
        )

        return [...filteredStyles, newStyle]
      })
    },
    [selection]
  )

  // Handlers de estilo
  const handleApplyColor = () => {
    applyStyle({ fill: currentColor })
  }

  const handleApplyFont = () => {
    applyStyle({ fontFamily: currentFont })
  }

  const handleApplyFontSize = () => {
    applyStyle({ fontSize: currentFontSize })
  }

  const handleToggleBold = () => {
    applyStyle({ fontStyle: 'bold' })
  }

  const handleToggleItalic = () => {
    applyStyle({ fontStyle: 'italic' })
  }

  const handleToggleUnderline = () => {
    applyStyle({ textDecoration: 'underline' })
  }

  const handleToggleStrikethrough = () => {
    applyStyle({ textDecoration: 'line-through' })
  }

  // Remover estilos do trecho selecionado
  const handleRemoveStyles = () => {
    if (selection.start === selection.end) return

    setStyles((prevStyles) =>
      prevStyles.filter(
        (s) =>
          s.end <= selection.start || s.start >= selection.end
      )
    )
  }

  // Salvar mudanças
  const handleSave = () => {
    onSave(content, styles)
    onClose()
  }

  // Verificar se há estilos aplicados na seleção atual
  const hasStylesInSelection = React.useMemo(() => {
    return styles.some(
      (s) =>
        (s.start >= selection.start && s.start < selection.end) ||
        (s.end > selection.start && s.end <= selection.end) ||
        (s.start <= selection.start && s.end >= selection.end)
    )
  }, [styles, selection])

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Editor de Rich Text</DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {/* Toolbar de Estilos */}
          <div className="border-b pb-4">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Cor do Texto */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled={selection.start === selection.end}
                  >
                    <div
                      className="w-4 h-4 rounded border"
                      style={{ backgroundColor: currentColor }}
                    />
                    Cor
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  <ColorPicker
                    label="Cor do Texto"
                    value={currentColor}
                    onChange={setCurrentColor}
                  />
                  <Button
                    className="w-full mt-2"
                    size="sm"
                    onClick={handleApplyColor}
                  >
                    Aplicar Cor
                  </Button>
                </PopoverContent>
              </Popover>

              {/* Fonte */}
              <Select value={currentFont} onValueChange={setCurrentFont}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {availableFonts.system.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase">
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
                      <div className="mt-2 px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase">
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
              <Button
                variant="outline"
                size="sm"
                onClick={handleApplyFont}
                disabled={selection.start === selection.end}
              >
                Aplicar Fonte
              </Button>

              {/* Tamanho da Fonte */}
              <div className="flex items-center gap-1">
                <Type className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  min={8}
                  max={200}
                  value={currentFontSize}
                  onChange={(e) => setCurrentFontSize(Number(e.target.value))}
                  className="w-20 h-9"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleApplyFontSize}
                  disabled={selection.start === selection.end}
                >
                  Aplicar
                </Button>
              </div>

              <div className="h-6 w-px bg-border" />

              {/* Estilos de Texto */}
              <Button
                variant="outline"
                size="sm"
                className="w-9 p-0"
                onClick={handleToggleBold}
                disabled={selection.start === selection.end}
                title="Negrito"
              >
                <Bold className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-9 p-0"
                onClick={handleToggleItalic}
                disabled={selection.start === selection.end}
                title="Itálico"
              >
                <Italic className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-9 p-0"
                onClick={handleToggleUnderline}
                disabled={selection.start === selection.end}
                title="Sublinhado"
              >
                <Underline className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-9 p-0"
                onClick={handleToggleStrikethrough}
                disabled={selection.start === selection.end}
                title="Tachado"
              >
                <Strikethrough className="h-4 w-4" />
              </Button>

              <div className="h-6 w-px bg-border" />

              {/* Remover Estilos */}
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRemoveStyles}
                disabled={!hasStylesInSelection}
              >
                Remover Estilos
              </Button>
            </div>

            {/* Instruções */}
            <p className="text-xs text-muted-foreground mt-2">
              {selection.start === selection.end
                ? 'Selecione um trecho de texto para aplicar estilos'
                : `Trecho selecionado: "${selection.selectedText}" (${selection.end - selection.start} caracteres)`}
            </p>
          </div>

          {/* Editor e Preview em duas colunas */}
          <div className="flex-1 grid grid-cols-2 gap-4 overflow-hidden">
            {/* Coluna Esquerda: Textarea */}
            <div className="flex flex-col gap-2 overflow-hidden">
              <Label>Editar Texto</Label>
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onSelect={handleSelectionChange}
                onBlur={handleSelectionChange}
                className="flex-1 w-full p-4 border rounded resize-none font-mono text-sm"
                placeholder="Digite o texto aqui..."
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                {styles.length} estilo{styles.length !== 1 ? 's' : ''} aplicado{styles.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Coluna Direita: Preview */}
            <div className="flex flex-col gap-2 overflow-hidden">
              <Label>Preview</Label>
              <div className="flex-1 border rounded p-4 overflow-auto bg-muted/20">
                <RichTextPreview content={content} styles={styles} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Componente de preview que renderiza o texto com estilos aplicados
 */
interface RichTextPreviewProps {
  content: string
  styles: RichTextStyle[]
}

function RichTextPreview({ content, styles }: RichTextPreviewProps) {
  if (!content) {
    return (
      <p className="text-muted-foreground text-sm italic">
        O preview aparecerá aqui...
      </p>
    )
  }

  // Se não há estilos, mostrar texto simples
  if (styles.length === 0) {
    return <p className="whitespace-pre-wrap">{content}</p>
  }

  // Ordenar estilos por posição
  const sortedStyles = [...styles].sort((a, b) => a.start - b.start)

  // Criar segments para renderização
  const segments: Array<{ text: string; style?: RichTextStyle }> = []
  let currentPos = 0

  for (const style of sortedStyles) {
    const start = Math.max(0, style.start)
    const end = Math.min(content.length, style.end)

    // Adicionar texto sem estilo antes deste segment
    if (start > currentPos) {
      segments.push({
        text: content.substring(currentPos, start),
      })
    }

    // Adicionar segment com estilo
    if (end > start) {
      segments.push({
        text: content.substring(start, end),
        style,
      })
    }

    currentPos = Math.max(currentPos, end)
  }

  // Adicionar texto restante sem estilo
  if (currentPos < content.length) {
    segments.push({
      text: content.substring(currentPos),
    })
  }

  return (
    <div className="whitespace-pre-wrap leading-relaxed">
      {segments.map((segment, index) => {
        if (!segment.style) {
          return <span key={index}>{segment.text}</span>
        }

        const style: React.CSSProperties = {
          color: segment.style.fill,
          fontFamily: segment.style.fontFamily,
          fontSize: segment.style.fontSize ? `${segment.style.fontSize}px` : undefined,
          fontWeight: segment.style.fontStyle?.includes('bold') ? 'bold' : undefined,
          fontStyle: segment.style.fontStyle?.includes('italic') ? 'italic' : undefined,
          textDecoration: segment.style.textDecoration,
          letterSpacing: segment.style.letterSpacing ? `${segment.style.letterSpacing}px` : undefined,
        }

        return (
          <span key={index} style={style}>
            {segment.text}
          </span>
        )
      })}
    </div>
  )
}
