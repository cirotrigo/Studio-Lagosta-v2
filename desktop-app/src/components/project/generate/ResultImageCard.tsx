import { useState } from 'react'
import { Clock3, Download, Loader2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { ApprovalPanel } from '@/components/project/generate/ApprovalPanel'
import { exportSingle } from '@/lib/export/konva-exporter'
import { cn } from '@/lib/utils'
import type { GenerationVariationJob } from '@/stores/generation.store'
import type { ArtFormat, KonvaPage } from '@/types/template'

interface ResultImageCardProps {
  format: ArtFormat
  variation: GenerationVariationJob
  projectSlug?: string
  onDownload: () => void
  onSchedule: () => void
  onRemove: () => void
  onApprove: () => void
  onOpenInEditor: () => void
  onOpenArts: () => void
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
  onDownload,
  onSchedule,
  onRemove,
  onApprove,
  onOpenInEditor,
  onOpenArts,
}: ResultImageCardProps) {
  const [isExporting, setIsExporting] = useState(false)

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
            {variation.fields.map((field) => (
              <div
                key={`${variation.id}-${field.key}`}
                className="rounded-lg border border-border bg-background/30 px-3 py-2"
              >
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-text-subtle">
                  {field.label}
                </p>
                <p className="mt-1 text-sm text-text">{field.value}</p>
              </div>
            ))}
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
