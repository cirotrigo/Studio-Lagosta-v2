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
import { Bold, Italic, Underline, Strikethrough, Type, XIcon } from 'lucide-react'
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

  // Estado dos controles de estilo - inicializar com valores do layer
  const [currentColor, setCurrentColor] = React.useState(
    layer.style?.color ?? '#000000'
  )
  const [currentFont, setCurrentFont] = React.useState(
    layer.style?.fontFamily ?? 'Inter'
  )
  const [currentFontSize, setCurrentFontSize] = React.useState(
    layer.style?.fontSize ?? 16
  )

  // Estilo base do layer para preview
  const baseStyle = React.useMemo(() => ({
    fontFamily: layer.style?.fontFamily ?? 'Inter',
    fontSize: layer.style?.fontSize ?? 16,
    color: layer.style?.color ?? '#000000',
    textAlign: layer.style?.textAlign ?? 'left',
    lineHeight: layer.style?.lineHeight ?? 1.2,
    letterSpacing: layer.style?.letterSpacing ?? 0,
  }), [layer.style])

  // Atualizar lista de fontes
  React.useEffect(() => {
    const fonts = fontManager.getAvailableFonts(projectId)
    setAvailableFonts(fonts)
  }, [fontManager, projectId])

  // Atualizar seleção quando usuário seleciona texto
  const handleSelectionChange = React.useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    // Usar setTimeout para garantir que a seleção está completa
    setTimeout(() => {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const selectedText = content.substring(start, end)

      console.log('✂️ Seleção capturada:', { start, end, selectedText })

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
    }, 0)
  }, [content, styles])

  // Aplicar estilo ao trecho selecionado
  // Aceita selection como parâmetro para evitar usar state stale
  const applyStyle = React.useCallback(
    (styleUpdate: Partial<RichTextStyle>, currentSelection: SelectionState) => {
      if (currentSelection.start === currentSelection.end) {
        // Nada selecionado
        console.warn('⚠️ Tentou aplicar estilo sem seleção')
        return
      }

      console.log('🎨 Aplicando estilo:', {
        range: `${currentSelection.start}-${currentSelection.end}`,
        texto: currentSelection.selectedText,
        estilo: styleUpdate,
      })

      setStyles((prevStyles) => {
        // Encontrar estilo existente na mesma range exata
        const existingStyleIndex = prevStyles.findIndex(
          (s) => s.start === currentSelection.start && s.end === currentSelection.end
        )

        if (existingStyleIndex !== -1) {
          // Merge com estilo existente (acumular propriedades)
          const existingStyle = prevStyles[existingStyleIndex]
          const mergedStyle: RichTextStyle = {
            ...existingStyle,
            ...styleUpdate,
            start: currentSelection.start,
            end: currentSelection.end,
          }

          console.log('🔀 Fazendo merge de estilos:', {
            existente: existingStyle,
            novo: styleUpdate,
            resultado: mergedStyle,
          })

          // Substituir o estilo existente
          const newStyles = [...prevStyles]
          newStyles[existingStyleIndex] = mergedStyle
          return newStyles
        } else {
          // Criar novo estilo
          const newStyle: RichTextStyle = {
            start: currentSelection.start,
            end: currentSelection.end,
            ...styleUpdate,
          }

          // Remover estilos que se sobrepõem completamente
          const filteredStyles = prevStyles.filter(
            (s) =>
              s.end <= currentSelection.start || s.start >= currentSelection.end
          )

          return [...filteredStyles, newStyle]
        }
      })
    },
    []
  )

  // Atualizar seleção imediatamente antes de aplicar estilo
  const refreshSelection = React.useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return selection

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = content.substring(start, end)

    const newSelection = { start, end, selectedText }
    setSelection(newSelection)

    // Log detalhado para debug
    const context = 5
    const beforeContext = content.substring(Math.max(0, start - context), start)
    const afterContext = content.substring(end, Math.min(content.length, end + context))

    console.log('🔄 Seleção atualizada:', {
      start,
      end,
      length: end - start,
      selectedText: `"${selectedText}"`,
      context: `...${beforeContext}[${selectedText}]${afterContext}...`,
      indices: `[${start}:${end}]`,
      charAtStart: `content[${start}] = "${content[start]}"`,
      charBeforeStart: start > 0 ? `content[${start - 1}] = "${content[start - 1]}"` : 'início do texto',
      charAtEnd: end < content.length ? `content[${end}] = "${content[end]}"` : 'fim do texto',
    })
    return newSelection
  }, [content, selection])

  // Handlers de estilo
  const handleApplyColor = () => {
    const currentSelection = refreshSelection()
    if (currentSelection.start === currentSelection.end) {
      console.warn('⚠️ Nenhum texto selecionado')
      return
    }
    applyStyle({ fill: currentColor }, currentSelection)
  }

  const handleApplyFont = () => {
    const currentSelection = refreshSelection()
    if (currentSelection.start === currentSelection.end) {
      console.warn('⚠️ Nenhum texto selecionado')
      return
    }
    applyStyle({ fontFamily: currentFont }, currentSelection)
  }

  const handleApplyFontSize = () => {
    const currentSelection = refreshSelection()
    if (currentSelection.start === currentSelection.end) {
      console.warn('⚠️ Nenhum texto selecionado')
      return
    }
    console.log('🔤 Aplicando fontSize:', currentFontSize)
    applyStyle({ fontSize: currentFontSize }, currentSelection)
  }

  const handleToggleBold = () => {
    const currentSelection = refreshSelection()
    if (currentSelection.start === currentSelection.end) {
      console.warn('⚠️ Nenhum texto selecionado')
      return
    }
    applyStyle({ fontStyle: 'bold' }, currentSelection)
  }

  const handleToggleItalic = () => {
    const currentSelection = refreshSelection()
    if (currentSelection.start === currentSelection.end) {
      console.warn('⚠️ Nenhum texto selecionado')
      return
    }
    applyStyle({ fontStyle: 'italic' }, currentSelection)
  }

  const handleToggleUnderline = () => {
    const currentSelection = refreshSelection()
    if (currentSelection.start === currentSelection.end) {
      console.warn('⚠️ Nenhum texto selecionado')
      return
    }
    applyStyle({ textDecoration: 'underline' }, currentSelection)
  }

  const handleToggleStrikethrough = () => {
    const currentSelection = refreshSelection()
    if (currentSelection.start === currentSelection.end) {
      console.warn('⚠️ Nenhum texto selecionado')
      return
    }
    applyStyle({ textDecoration: 'line-through' }, currentSelection)
  }

  // Remover estilos do trecho selecionado
  const handleRemoveStyles = () => {
    const currentSelection = refreshSelection()
    if (currentSelection.start === currentSelection.end) {
      console.warn('⚠️ Nenhum texto selecionado para remover estilos')
      return
    }

    console.log('🗑️ Removendo estilos da seleção:', {
      range: `${currentSelection.start}-${currentSelection.end}`,
      texto: currentSelection.selectedText,
    })

    setStyles((prevStyles) =>
      prevStyles.filter(
        (s) =>
          s.end <= currentSelection.start || s.start >= currentSelection.end
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
      <DialogContent
        className="max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] overflow-hidden flex flex-col"
        style={{ zIndex: 10001 }}
      >
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="text-xl font-semibold">Editor de Rich Text</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {selection.start === selection.end
              ? 'Selecione um trecho de texto para aplicar estilos personalizados'
              : `"${selection.selectedText}" selecionado (${selection.end - selection.start} caracteres)`}
          </p>
        </DialogHeader>

        <div className="flex-1 flex flex-col gap-6 overflow-hidden py-2">
          {/* Toolbar de Estilos - Reorganizada e Centralizada */}
          <div className="bg-muted/50 dark:bg-muted/20 rounded-lg p-4 border">
            <div className="flex flex-col gap-3">
              {/* Linha 1: Texto e Fonte */}
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {/* Cor do Texto */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 h-9"
                      disabled={selection.start === selection.end}
                    >
                      <div
                        className="w-4 h-4 rounded border border-border"
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
                      projectId={projectId}
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
                  <SelectTrigger className="w-[160px] h-9">
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
                  className="h-9"
                  onClick={handleApplyFont}
                  disabled={selection.start === selection.end}
                >
                  Aplicar
                </Button>

                {/* Tamanho da Fonte */}
                <div className="flex items-center gap-1.5">
                  <Type className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    min={8}
                    max={200}
                    value={currentFontSize}
                    onChange={(e) => setCurrentFontSize(Number(e.target.value))}
                    className="w-16 h-9"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={handleApplyFontSize}
                    disabled={selection.start === selection.end}
                  >
                    Aplicar
                  </Button>
                </div>
              </div>

              {/* Linha 2: Formatação e Ações */}
              <div className="flex items-center justify-center gap-2">
                {/* Estilos de Texto */}
                <div className="flex items-center gap-1 bg-background rounded-md p-1 border">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-8 h-8 p-0"
                    onClick={handleToggleBold}
                    disabled={selection.start === selection.end}
                    title="Negrito"
                  >
                    <Bold className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-8 h-8 p-0"
                    onClick={handleToggleItalic}
                    disabled={selection.start === selection.end}
                    title="Itálico"
                  >
                    <Italic className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-8 h-8 p-0"
                    onClick={handleToggleUnderline}
                    disabled={selection.start === selection.end}
                    title="Sublinhado"
                  >
                    <Underline className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-8 h-8 p-0"
                    onClick={handleToggleStrikethrough}
                    disabled={selection.start === selection.end}
                    title="Tachado"
                  >
                    <Strikethrough className="h-4 w-4" />
                  </Button>
                </div>

                {/* Remover Estilos */}
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-9"
                  onClick={handleRemoveStyles}
                  disabled={!hasStylesInSelection}
                >
                  Limpar Estilos
                </Button>
              </div>
            </div>
          </div>

          {/* Editor e Preview - Layout Vertical */}
          <div className="flex-1 flex flex-col gap-4 overflow-hidden min-h-0">
            {/* Textarea */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium">Editar Texto</Label>
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onSelect={handleSelectionChange}
                onMouseUp={handleSelectionChange}
                onKeyUp={handleSelectionChange}
                className="w-full h-16 p-3 border rounded-md resize-none font-mono text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
                placeholder="Digite o texto aqui..."
                spellCheck={false}
              />
            </div>

            {/* Preview */}
            <div className="flex-1 flex flex-col gap-2 overflow-hidden min-h-0">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Preview</Label>
                <p className="text-xs text-muted-foreground">
                  {styles.length} estilo{styles.length !== 1 ? 's' : ''} aplicado{styles.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex-1 border rounded-md p-6 overflow-auto bg-slate-900 dark:bg-slate-950 min-h-0">
                <RichTextPreview
                  content={content}
                  styles={styles}
                  baseStyle={baseStyle}
                  originalWidth={layer.size?.width ?? 240}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t pt-4 gap-2">
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
 * Componente de preview que renderiza o texto com estilos aplicados
 */
interface RichTextPreviewProps {
  content: string
  styles: RichTextStyle[]
  baseStyle: {
    fontFamily: string
    fontSize: number
    color: string
    textAlign: string
    lineHeight: number
    letterSpacing: number
  }
  originalWidth?: number // Largura original da caixa de texto
}

function RichTextPreview({ content, styles, baseStyle, originalWidth }: RichTextPreviewProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [scale, setScale] = React.useState(1)

  // Calcular scale baseado na largura disponível
  React.useEffect(() => {
    if (!originalWidth || !containerRef.current) {
      setScale(1)
      return
    }

    const containerWidth = containerRef.current.clientWidth
    // Subtrair padding (6px de cada lado = 12px total) do container preview
    const availableWidth = containerWidth - 48 // 24px padding de cada lado

    if (availableWidth > 0 && originalWidth > 0) {
      // Calcular scale para que a largura seja similar
      const calculatedScale = Math.min(1, availableWidth / originalWidth)
      setScale(calculatedScale)
    }
  }, [originalWidth])

  // Aplicar scale nos estilos
  const scaledBaseStyle = {
    ...baseStyle,
    fontSize: baseStyle.fontSize * scale,
    letterSpacing: baseStyle.letterSpacing * scale,
  }
  if (!content) {
    return (
      <p className="text-muted-foreground text-sm italic">
        O preview aparecerá aqui...
      </p>
    )
  }

  // Se não há estilos, mostrar texto simples com estilo base
  if (styles.length === 0) {
    return (
      <div
        ref={containerRef}
        className="whitespace-pre-wrap"
        style={{
          fontFamily: scaledBaseStyle.fontFamily,
          fontSize: `${scaledBaseStyle.fontSize}px`,
          color: scaledBaseStyle.color,
          textAlign: scaledBaseStyle.textAlign as any,
          lineHeight: scaledBaseStyle.lineHeight,
          letterSpacing: `${scaledBaseStyle.letterSpacing}px`,
          width: originalWidth ? `${originalWidth * scale}px` : 'auto',
        }}
      >
        {content}
      </div>
    )
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
    <div
      ref={containerRef}
      className="whitespace-pre-wrap"
      style={{
        fontFamily: scaledBaseStyle.fontFamily,
        fontSize: `${scaledBaseStyle.fontSize}px`,
        color: scaledBaseStyle.color,
        textAlign: scaledBaseStyle.textAlign as any,
        lineHeight: scaledBaseStyle.lineHeight,
        letterSpacing: `${scaledBaseStyle.letterSpacing}px`,
        width: originalWidth ? `${originalWidth * scale}px` : 'auto',
      }}
    >
      {segments.map((segment, index) => {
        if (!segment.style) {
          // Texto sem estilo customizado - herda do container
          return <span key={index}>{segment.text}</span>
        }

        // Texto com estilo customizado - override sobre o base (com scale aplicado)
        const style: React.CSSProperties = {
          color: segment.style.fill ?? scaledBaseStyle.color,
          fontFamily: segment.style.fontFamily ?? scaledBaseStyle.fontFamily,
          fontSize: segment.style.fontSize ? `${segment.style.fontSize * scale}px` : undefined,
          fontWeight: segment.style.fontStyle?.includes('bold') ? 'bold' : undefined,
          fontStyle: segment.style.fontStyle?.includes('italic') ? 'italic' : undefined,
          textDecoration: segment.style.textDecoration,
          letterSpacing: segment.style.letterSpacing !== undefined
            ? `${segment.style.letterSpacing * scale}px`
            : undefined,
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
