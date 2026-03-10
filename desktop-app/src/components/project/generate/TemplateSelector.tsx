import { useMemo } from 'react'
import { Image as ImageIcon, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ArtFormat, ReviewField } from '@/stores/generation.store'
import { ArtTemplate } from '@/hooks/use-art-templates'
import { ImportedDsTemplateSummary, InstagramPreviewTokens } from '@/lib/instagram-ds/token-parser'
import InstagramHtmlPreview from '@/components/project/generate/InstagramHtmlPreview'

interface TemplateSelectorProps {
  templates: ArtTemplate[] | undefined
  importedTemplates?: ImportedDsTemplateSummary[]
  previewTokens?: Partial<InstagramPreviewTokens>
  previewCss?: string
  referenceImageUrl?: string
  logoUrl?: string
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
  importedTemplates,
  previewTokens,
  previewCss,
  referenceImageUrl,
  logoUrl,
  format,
  selectedIds,
  onChange,
  isLoading,
}: TemplateSelectorProps) {
  const filteredTemplates = useMemo(() => {
    if (!templates || !Array.isArray(templates)) return []
    return templates.filter((t) => t.format === FORMAT_MAP[format])
  }, [templates, format])

  const handleToggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((s) => s !== id))
    } else if (selectedIds.length < 3) {
      onChange([...selectedIds, id])
    }
  }

  const filteredImportedTemplates = useMemo(() => {
    if (!importedTemplates || !Array.isArray(importedTemplates)) return []
    return importedTemplates.filter((template) => template.format === FORMAT_MAP[format])
  }, [importedTemplates, format])

  const sampleFieldsByTemplate = useMemo<Record<string, ReviewField[]>>(() => ({
    S1: [
      { key: 'pre_title', label: 'Pre title', value: 'PROMOCAO EXCLUSIVA' },
      { key: 'title', label: 'Title', value: 'RESERVE<br>HOJE MESMO' },
      { key: 'cta', label: 'CTA', value: 'GARANTIR MESA' },
    ],
    S2: [
      { key: 'pre_title', label: 'Pre title', value: 'EXPERIENCIA' },
      { key: 'title', label: 'Title', value: 'SABOR<br>QUE NAO<br>SE ESQUECE' },
      { key: 'description', label: 'Description', value: 'Visual editorial com contraste e foco no produto.' },
    ],
    S3: [
      { key: 'title', label: 'Title', value: 'O QUE TEM<br>HOJE' },
      { key: 'description', label: 'Description', value: 'Aberto ate 23h|Dose dupla de chopp|Estacionamento gratis' },
      { key: 'footer_info_1', label: 'Footer 1', value: 'Rua Exemplo, 123' },
      { key: 'footer_info_2', label: 'Footer 2', value: '(27) 99999-9999' },
    ],
    S4: [
      { key: 'badge', label: 'Badge', value: 'BASTIDORES' },
      { key: 'title', label: 'Title', value: 'A LUZ QUE<br>VENDE MAIS' },
      { key: 'description', label: 'Description', value: 'Producao audiovisual profissional para restaurantes.' },
      { key: 'cta', label: 'CTA', value: 'VER PORTFOLIO' },
    ],
    S5: [
      { key: 'badge', label: 'Badge', value: 'EM GRAVACAO' },
      { key: 'title', label: 'Title', value: 'FOTOGRAFIA<br>GASTRONOMICA' },
      { key: 'footer_info_1', label: 'Footer 1', value: 'Vitoria, ES' },
      { key: 'footer_info_2', label: 'Footer 2', value: 'Sessao das 14h as 18h' },
    ],
    S6: [
      { key: 'badge', label: 'Badge', value: 'QUALIDADE' },
      { key: 'title', label: 'Title', value: 'CONTEUDO<br>QUE DA FOME' },
      { key: 'cta', label: 'CTA', value: 'AGENDE SUA SESSAO' },
    ],
    F1: [
      { key: 'pre_title', label: 'Pre title', value: 'APENAS HOJE' },
      { key: 'badge', label: 'Badge', value: 'R$ 49,90' },
    ],
    F2: [
      { key: 'title', label: 'Title', value: 'A ARTE<br>DE COMER BEM' },
      { key: 'description', label: 'Description', value: 'Lifestyle visual com foco em atmosfera e textura.' },
    ],
    F3: [
      { key: 'badge', label: 'Badge', value: '#GASTRONOMIA' },
    ],
  }), [])

  const getImportedTemplateFields = (templateId: string): ReviewField[] =>
    sampleFieldsByTemplate[templateId] || sampleFieldsByTemplate.S1

  const renderImportedTemplates = () => (
    <div className="rounded-xl border border-border bg-card/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-text">Templates detectados no DS importado</p>
        <span className="text-[10px] text-text-subtle">Clique para usar como template</span>
      </div>
      {filteredImportedTemplates.length > 0 ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {filteredImportedTemplates.map((template) => {
            const isSelected = selectedIds.includes(template.id)
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => handleToggle(template.id)}
                className={cn(
                  'space-y-1 rounded-lg border p-1.5 text-left transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/10'
                    : 'border-border bg-input/40 hover:border-primary/40'
                )}
                title={template.name}
              >
                <div
                  className={cn(
                    'overflow-hidden rounded-md border border-border',
                    template.format === 'STORY'
                      ? 'aspect-[9/16]'
                      : template.format === 'SQUARE'
                        ? 'aspect-square'
                        : 'aspect-[4/5]'
                  )}
                >
                  <InstagramHtmlPreview
                    format={template.format}
                    fields={getImportedTemplateFields(template.id)}
                    sourceImageUrl={referenceImageUrl}
                    logoUrl={logoUrl}
                    includeLogo={Boolean(logoUrl)}
                    templateName={template.id}
                    tokens={previewTokens}
                    customCss={previewCss}
                    className="h-full w-full"
                  />
                </div>
                <div className="truncate text-[10px] text-text-muted">
                  <span className="font-semibold text-text">{template.id}</span>{' '}
                  {template.name.replace(`${template.id} — `, '')}
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <p className="mt-2 text-[10px] text-text-subtle">
          O DS importado nao trouxe templates para o formato atual.
        </p>
      )}
      <p className="mt-2 text-[10px] text-text-subtle">
        Esses templates entram no fluxo de geração e aprovação.
      </p>
    </div>
  )

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
      <div className="space-y-2">
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-4 text-center">
          <ImageIcon size={20} className="mx-auto mb-1 text-text-subtle" />
          <p className="text-xs text-text-muted">
            Nenhum template salvo para este formato.
          </p>
          <p className="text-[10px] text-text-subtle">
            Crie templates na aba Identidade.
          </p>
        </div>
        {importedTemplates && importedTemplates.length > 0 && renderImportedTemplates()}
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
      {selectedIds.length > 0 && (
        <p className="rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-[10px] text-text-muted">
          A IA segue os slots e limites dos templates selecionados ao gerar copy.
        </p>
      )}
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
                  <ImageIcon size={16} className="text-text-subtle" />
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

      {importedTemplates && importedTemplates.length > 0 && (
        renderImportedTemplates()
      )}
    </div>
  )
}
