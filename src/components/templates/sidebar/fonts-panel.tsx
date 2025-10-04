"use client"

import * as React from 'react'
import { Upload, Trash2, Type, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { getFontManager, type CustomFont } from '@/lib/font-manager'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { cn } from '@/lib/utils'

/**
 * FontsPanel - Painel de upload e gerenciamento de fontes customizadas
 *
 * Funcionalidades:
 * - Upload de múltiplas fontes (.ttf, .otf, .woff, .woff2)
 * - Preview visual de cada fonte
 * - Remover fontes individuais
 * - Persistência automática via localStorage
 * - Notificação de status de carregamento
 *
 * @component
 */

export function FontsPanel() {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [customFonts, setCustomFonts] = React.useState<CustomFont[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const { forceUpdate } = useTemplateEditor()

  const fontManager = React.useMemo(() => getFontManager(), [])

  // Carregar fontes customizadas ao montar
  React.useEffect(() => {
    const fonts = fontManager.getCustomFonts()
    setCustomFonts(fonts)
  }, [fontManager])

  /**
   * Handler de upload de fontes
   */
  const handleUpload = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files
      if (!files || files.length === 0) return

      setIsLoading(true)
      setError(null)

      const results: { success: string[]; failed: Array<{ name: string; error: string }> } = {
        success: [],
        failed: [],
      }

      for (const file of Array.from(files)) {
        try {
          console.log(`📤 Uploading font: ${file.name}`)
          const fontName = await fontManager.uploadFont(file)
          results.success.push(fontName)
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido'
          results.failed.push({ name: file.name, error: errorMessage })
          console.error(`❌ Erro ao carregar ${file.name}:`, err)
        }
      }

      // Atualizar lista de fontes
      const updatedFonts = fontManager.getCustomFonts()
      setCustomFonts(updatedFonts)

      // Forçar atualização do editor para atualizar dropdown
      forceUpdate?.()

      // Mostrar resultado
      if (results.success.length > 0) {
        console.log(`✅ ${results.success.length} fonte(s) carregada(s) com sucesso`)
      }

      if (results.failed.length > 0) {
        const errorMsg = results.failed.map((f) => `${f.name}: ${f.error}`).join('\n')
        setError(errorMsg)
        console.error('❌ Erros ao carregar fontes:', errorMsg)
      }

      setIsLoading(false)

      // Limpar input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [fontManager, forceUpdate],
  )

  /**
   * Remover fonte customizada
   */
  const handleRemoveFont = React.useCallback(
    (fontName: string) => {
      if (!confirm(`Deseja remover a fonte "${fontName}"?`)) return

      fontManager.removeFont(fontName)

      // Atualizar lista
      const updatedFonts = fontManager.getCustomFonts()
      setCustomFonts(updatedFonts)

      // Forçar atualização do editor
      forceUpdate?.()

      console.log(`🗑️ Fonte "${fontName}" removida`)
    },
    [fontManager, forceUpdate],
  )

  /**
   * Formatar tamanho do arquivo
   */
  const formatFileSize = (base64?: string): string => {
    if (!base64) return 'N/A'

    // Estimar tamanho a partir do base64
    const sizeBytes = (base64.length * 3) / 4
    if (sizeBytes < 1024) return `${sizeBytes.toFixed(0)} B`
    if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`
    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="flex h-full min-h-[400px] flex-col gap-3 rounded-lg border border-border/40 bg-card/60 p-4 shadow-sm">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Type className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Fontes Customizadas</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Importe suas próprias fontes (.ttf, .otf, .woff, .woff2) para usar nos textos do editor.
        </p>

        {/* Upload Button */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".ttf,.otf,.woff,.woff2"
          multiple
          className="hidden"
          onChange={handleUpload}
          disabled={isLoading}
        />
        <Button
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className="w-full"
        >
          <Upload className="mr-2 h-4 w-4" />
          {isLoading ? 'Carregando...' : 'Importar Fontes'}
        </Button>

        {/* Error Message */}
        {error && (
          <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            <p className="font-medium">Erro ao carregar fontes:</p>
            <pre className="mt-1 whitespace-pre-wrap">{error}</pre>
          </div>
        )}
      </div>

      {/* Fonts List */}
      <ScrollArea className="flex-1">
        <div className="space-y-2 pr-2">
          {customFonts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-6 text-center">
              <Type className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-2 text-xs text-muted-foreground">
                Nenhuma fonte customizada importada ainda.
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground/70">
                Clique em "Importar Fontes" para começar.
              </p>
            </div>
          ) : (
            customFonts.map((font) => (
              <FontItem
                key={font.name}
                font={font}
                onRemove={() => handleRemoveFont(font.name)}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Footer Info */}
      {customFonts.length > 0 && (
        <div className="border-t border-border/40 pt-2 text-[10px] text-muted-foreground">
          {customFonts.length} fonte(s) customizada(s) carregada(s)
        </div>
      )}
    </div>
  )
}

/**
 * FontItem - Item individual de fonte na lista
 */
interface FontItemProps {
  font: CustomFont
  onRemove: () => void
}

function FontItem({ font, onRemove }: FontItemProps) {
  const [isHovered, setIsHovered] = React.useState(false)

  return (
    <div
      className={cn(
        'group relative flex items-start gap-3 rounded-lg border border-border/40 bg-muted/20 p-3 transition-all',
        'hover:border-primary/40 hover:bg-muted/40',
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Icon */}
      <div className="flex-shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
          {font.loaded ? (
            <Check className="h-5 w-5 text-primary" />
          ) : (
            <Type className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">{font.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {font.extension.replace('.', '').toUpperCase()} • {formatFileSize(font.base64)}
            </p>
          </div>

          {/* Remove Button */}
          <Button
            size="icon"
            variant="ghost"
            className={cn(
              'h-6 w-6 flex-shrink-0 text-muted-foreground transition-opacity hover:text-destructive',
              isHovered ? 'opacity-100' : 'opacity-0',
            )}
            onClick={onRemove}
            title={`Remover fonte ${font.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Preview */}
        <div
          className="mt-2 rounded-md bg-background/50 p-2 text-sm leading-tight"
          style={{ fontFamily: font.family }}
        >
          <p className="text-xs">The quick brown fox</p>
          <p className="text-base font-medium">AaBbCc 123</p>
        </div>
      </div>
    </div>
  )
}

/**
 * Helper para formatar tamanho de arquivo
 */
function formatFileSize(base64?: string): string {
  if (!base64) return 'N/A'

  // Estimar tamanho a partir do base64
  const sizeBytes = (base64.length * 3) / 4
  if (sizeBytes < 1024) return `${sizeBytes.toFixed(0)} B`
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
}
