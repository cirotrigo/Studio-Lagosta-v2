import { useMemo } from 'react'
import { Image, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ArtFormat } from '@/stores/generation.store'
import { ArtTemplate } from '@/hooks/use-art-templates'

interface TemplateSelectorProps {
  templates: ArtTemplate[] | undefined
  format: ArtFormat
  selectedIds: string[]
  onChange: (ids: string[]) => void
  isLoading?: boolean
}

const FORMAT_MAP: Record<ArtFormat, string> = {
  FEED_PORTRAIT: 'FEED_PORTRAIT',
  STORY: 'STORY',
  SQUARE: 'SQUARE',
}

export default function TemplateSelector({
  templates,
  format,
  selectedIds,
  onChange,
  isLoading,
}: TemplateSelectorProps) {
  const filteredTemplates = useMemo(() => {
    if (!templates) return []
    return templates.filter((t) => t.format === FORMAT_MAP[format])
  }, [templates, format])

  const handleToggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((s) => s !== id))
    } else if (selectedIds.length < 3) {
      onChange([...selectedIds, id])
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card/50 p-4">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-xs text-text-muted">Carregando templates...</span>
      </div>
    )
  }

  if (filteredTemplates.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-4 text-center">
        <Image size={20} className="mx-auto mb-1 text-text-subtle" />
        <p className="text-xs text-text-muted">
          Nenhum template para este formato.
        </p>
        <p className="text-[10px] text-text-subtle">
          Crie templates na aba Identidade.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">
          Selecione ate 3 templates
        </span>
        {selectedIds.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[10px] text-primary hover:underline"
          >
            Limpar
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {/* Auto option */}
        <button
          type="button"
          onClick={() => onChange([])}
          className={cn(
            'flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition-all duration-200',
            selectedIds.length === 0
              ? 'border-primary bg-primary/10'
              : 'border-border bg-card hover:border-primary/30'
          )}
        >
          <Sparkles
            size={20}
            className={cn(
              selectedIds.length === 0 ? 'text-primary' : 'text-text-subtle'
            )}
          />
          <span
            className={cn(
              'text-[10px] font-medium',
              selectedIds.length === 0 ? 'text-primary' : 'text-text-muted'
            )}
          >
            Automatico
          </span>
        </button>

        {/* Template cards */}
        {filteredTemplates.map((tpl) => {
          const isSelected = selectedIds.includes(tpl.id)
          return (
            <button
              key={tpl.id}
              type="button"
              onClick={() => handleToggle(tpl.id)}
              className={cn(
                'relative flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition-all duration-200',
                isSelected
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card hover:border-primary/30'
              )}
            >
              {tpl.sourceImageUrl ? (
                <img
                  src={tpl.sourceImageUrl}
                  alt={tpl.name}
                  className="h-10 w-10 rounded-md object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-input">
                  <Image size={16} className="text-text-subtle" />
                </div>
              )}
              <span
                className={cn(
                  'max-w-full truncate text-[10px] font-medium',
                  isSelected ? 'text-primary' : 'text-text-muted'
                )}
              >
                {tpl.name}
              </span>
              {tpl.analysisConfidence < 0.7 && (
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-500" title="Confianca baixa" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
