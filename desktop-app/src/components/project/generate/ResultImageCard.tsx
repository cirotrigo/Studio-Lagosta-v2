import { useState } from 'react'
import { Clock3, Download, Loader2, RefreshCw, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { ApprovalPanel } from '@/components/project/generate/ApprovalPanel'
import { exportSingle } from '@/lib/export/konva-exporter'
import { cn } from '@/lib/utils'
import type { GenerationVariationJob, ReviewField } from '@/stores/generation.store'
import type { ArtFormat, KonvaPage } from '@/types/template'
import type { EditorFontSource } from '@/lib/editor/font-utils'

interface ResultImageCardProps {
  format: ArtFormat
  variation: GenerationVariationJob
  projectSlug?: string
  projectFonts?: EditorFontSource[]
  onDownload: () => void
  onSchedule: () => void
  onRemove: () => void
  onApprove: () => void
  onOpenInEditor: () => void
  onOpenArts: () => void
  onFieldsChange?: (fields: ReviewField[]) => void
  onRegenerate?: () => void
}

function getAspectClass(format: ArtFormat) {
  switch (format) {
    case 'STORY':
      return 'aspect-[9/16]'
    case 'SQUARE':
      return 'aspect-square'
    default:
      return 'aspect-[4/5]'
  }
}

function getCurrentPage(variation: GenerationVariationJob): KonvaPage | null {
  if (!variation.document) return null
  const doc = variation.document
  return doc.design.pages.find((p) => p.id === doc.design.currentPageId) ?? doc.design.pages[0] ?? null
}

export function ResultImageCard({
  format,
  variation,
  projectSlug,
  projectFonts,
  onDownload,
  onSchedule,
  onRemove,
  onApprove,
  onOpenInEditor,
  onOpenArts,
  onFieldsChange,
  onRegenerate,
}: ResultImageCardProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [editedFields, setEditedFields] = useState<ReviewField[]>([])
  const [isEditing, setIsEditing] = useState(false)

  // Check if fields have been edited
  const hasEdits = editedFields.length > 0 && editedFields.some(
    (ef) => {
      const original = variation.fields.find((f) => f.key === ef.key)
      return original && original.value !== ef.value
    }
  )

  // Get current field value (edited or original)
  const getFieldValue = (fieldKey: string): string => {
    const edited = editedFields.find((f) => f.key === fieldKey)
    if (edited) return edited.value
    const original = variation.fields.find((f) => f.key === fieldKey)
    return original?.value ?? ''
  }

  // Handle field edit
  const handleFieldChange = (fieldKey: string, newValue: string) => {
    setEditedFields((prev) => {
      const existing = prev.find((f) => f.key === fieldKey)
      const original = variation.fields.find((f) => f.key === fieldKey)
      if (existing) {
        return prev.map((f) => f.key === fieldKey ? { ...f, value: newValue } : f)
      }
      return [...prev, { key: fieldKey, label: original?.label ?? fieldKey, value: newValue }]
    })
  }

  // Apply edits
  const handleApplyEdits = () => {
    if (!hasEdits || !onFieldsChange) return
    const mergedFields = variation.fields.map((f) => {
      const edited = editedFields.find((ef) => ef.key === f.key)
      return edited ? { ...f, value: edited.value } : f
    })
    onFieldsChange(mergedFields)
    setEditedFields([])
    setIsEditing(false)
    if (onRegenerate) {
      onRegenerate()
    }
  }

  // Cancel edits
  const handleCancelEdits = () => {
    setEditedFields([])
    setIsEditing(false)
  }

  async function handleExport() {
    const page = getCurrentPage(variation)
    if (!page) {
      onDownload()
      return
    }

    if (!window.electronAPI?.exportSingle) {
      onDownload()
      return
    }

    setIsExporting(true)
    try {
      const result = await exportSingle({
        page,
        format,
        document: variation.document,
        projectFonts,
        projectSlug: projectSlug || 'arte',
        mimeType: 'image/jpeg',
        quality: 92,
      })

      toast.success(`Exportado: ${result.fileName}`)
    } catch (error) {
      console.error('[Export Single] Falha:', error)
      toast.error(error instanceof Error ? error.message : 'Falha ao exportar')
      onDownload()
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div
        className={cn(
          'relative overflow-hidden border-b border-border bg-[#0c111d]',
          getAspectClass(format),
        )}
      >
        {variation.status === 'ready' && variation.imageUrl ? (
          <img
            src={variation.imageUrl}
            alt={`Variacao ${variation.index + 1}`}
            className="h-full w-full object-contain"
          />
        ) : variation.status === 'error' ? (
          <div className="flex h-full min-h-[220px] items-center justify-center p-6 text-center">
            <div>
              <TriangleAlert size={20} className="mx-auto text-error" />
              <p className="mt-2 text-sm font-medium text-text">Falha nesta variacao</p>
              <p className="mt-1 text-xs text-text-muted">
                {variation.error || 'Sem detalhes adicionais.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[220px] items-center justify-center">
            <div className="text-center">
              {variation.status === 'processing' ? (
                <Loader2 size={20} className="mx-auto animate-spin text-primary" />
              ) : (
                <Clock3 size={20} className="mx-auto text-text-muted" />
              )}
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-text-subtle">
                {variation.status === 'processing' ? 'Processando' : 'Na fila'}
              </p>
            </div>
          </div>
        )}

        <div className="absolute left-3 top-3 rounded-full bg-black/70 px-2 py-1 text-[10px] font-medium text-white">
          Variacao {variation.index + 1}
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em]',
              variation.status === 'ready'
                ? 'bg-emerald-500/10 text-emerald-300'
                : variation.status === 'error'
                  ? 'bg-error/10 text-error'
                  : variation.status === 'processing'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-input text-text-muted',
            )}
          >
            {variation.status}
          </span>
          {variation.templateName ? (
            <span className="rounded-full bg-input px-2.5 py-1 text-[10px] font-medium text-text-muted">
              {variation.templateName}
            </span>
          ) : null}
        </div>

        {variation.fields.length > 0 ? (
          <div className="space-y-2">
            {!isEditing && onFieldsChange && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="mb-2 text-xs text-primary hover:underline"
              >
                Editar textos
              </button>
            )}
            {variation.fields.map((field) => (
              <div
                key={`${variation.id}-${field.key}`}
                className="rounded-lg border border-border bg-background/30 px-3 py-2"
              >
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-text-subtle">
                  {field.label}
                </p>
                {isEditing ? (
                  <textarea
                    value={getFieldValue(field.key)}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                    rows={2}
                    className="mt-1 w-full resize-none rounded border border-border bg-input px-2 py-1 text-sm text-text focus:border-primary focus:outline-none"
                  />
                ) : (
                  <p className="mt-1 text-sm text-text">{field.value}</p>
                )}
              </div>
            ))}
            {isEditing && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleApplyEdits}
                  disabled={!hasEdits}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  <RefreshCw size={12} />
                  Aplicar e Regenerar
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdits}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        ) : null}

        {variation.background ? (
          <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-text-subtle">
              Fundo
            </p>
            <p className="mt-1 text-xs text-text-muted">
              {variation.background.mode === 'photo'
                ? 'Foto do projeto aplicada sem IA.'
                : variation.background.fallbackUsed
                  ? `Fallback automatico aplicado com ${variation.background.fallbackLabel || variation.background.modelLabel || 'modelo legado'}.`
                  : `${variation.background.modelLabel || 'Nano Banana 2'} aplicado ao fundo.`}
            </p>
            {variation.background.mode === 'ai' && variation.background.persisted ? (
              <p className="mt-1 text-[11px] text-text-subtle">
                Salva em Geradas com IA
                {variation.background.referenceCount
                  ? ` • ${variation.background.referenceCount} referencia(s)`
                  : ''}
              </p>
            ) : null}
          </div>
        ) : null}

        {variation.warnings.length > 0 ? (
          <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-text-subtle">
              Observacoes
            </p>
            <div className="mt-1 space-y-1">
              {variation.warnings.map((warning) => (
                <p key={`${variation.id}-${warning}`} className="text-xs text-text-muted">
                  {warning}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        {variation.status === 'ready' ? (
          <ApprovalPanel
            status={variation.approvalStatus}
            approvalError={variation.approvalError}
            approvedAt={variation.approvedAt}
            canOpenEditor={Boolean(variation.document)}
            canApprove={Boolean(variation.document && variation.imageUrl)}
            onOpenEditor={onOpenInEditor}
            onApprove={onApprove}
            onOpenArts={onOpenArts}
          />
        ) : null}

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={!variation.imageUrl || isExporting}
            onClick={handleExport}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-input/60 px-3 py-2 text-xs font-medium text-text transition-colors hover:bg-input disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isExporting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Download size={12} />
            )}
            {isExporting ? 'Exportando' : 'Exportar'}
          </button>
          <button
            type="button"
            disabled={!variation.imageUrl}
            onClick={onSchedule}
            className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Agendar
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-text-muted transition-colors hover:border-error/40 hover:text-error"
          >
            Remover
          </button>
        </div>
      </div>
    </div>
  )
}
