import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, CreditCard, Loader2, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { useCreativeDownloadCost, useCreditsBalance } from '@/hooks/use-project-generations'
import { sortPages } from '@/lib/editor/document'
import { cn } from '@/lib/utils'
import { useGenerationStore } from '@/stores/generation.store'
import type { KonvaPage } from '@/types/template'

interface EditorGenerateArtModalProps {
  open: boolean
  onClose: () => void
  pages: KonvaPage[]
  currentPageId: string | null
  thumbnails: Record<string, string>
  onGenerate: (selectedPageIds: string[]) => Promise<void> | void
}

function getAspectClass(page: KonvaPage) {
  const ratio = page.width / page.height
  if (ratio >= 0.95 && ratio <= 1.05) {
    return 'aspect-square'
  }
  if (page.height > page.width * 1.5) {
    return 'aspect-[9/16]'
  }
  return 'aspect-[4/5]'
}

export function EditorGenerateArtModal({
  open,
  onClose,
  pages,
  currentPageId,
  thumbnails,
  onGenerate,
}: EditorGenerateArtModalProps) {
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const analyzeImageForContext = useGenerationStore((state) => state.analyzeImageForContext)
  const setAnalyzeImageForContext = useGenerationStore((state) => state.setAnalyzeImageForContext)
  const creditCostQuery = useCreativeDownloadCost()
  const creditsBalanceQuery = useCreditsBalance()

  const orderedPages = useMemo(() => sortPages(pages), [pages])
  const allSelected = orderedPages.length > 0 && selectedPageIds.size === orderedPages.length
  const selectedCount = selectedPageIds.size
  const creditCost = creditCostQuery.data ?? 2
  const totalCost = selectedCount * creditCost
  const estimatedTime = selectedCount * 3
  const creditsRemaining = creditsBalanceQuery.data?.creditsRemaining ?? null
  const hasCredits = creditsRemaining === null || totalCost === 0 || creditsRemaining >= totalCost

  useEffect(() => {
    if (!open) {
      return
    }

    const defaultPageId = currentPageId ?? orderedPages[0]?.id ?? null
    setSelectedPageIds(defaultPageId ? new Set([defaultPageId]) : new Set())
    setIsSubmitting(false)
  }, [currentPageId, open, orderedPages])

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-[32px] border border-white/10 bg-[#050607] shadow-[0_30px_120px_rgba(0,0,0,0.45)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-8 py-6">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-white">
              Gerar Criativos - Selecione as Páginas
            </h2>
            <p className="mt-2 max-w-3xl text-lg text-white/60">
              Escolha quais páginas deseja exportar como criativos JPEG em alta qualidade.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 text-white/70 transition-colors hover:border-primary/40 hover:text-white disabled:opacity-50"
          >
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() =>
                setSelectedPageIds(
                  allSelected ? new Set() : new Set(orderedPages.map((page) => page.id)),
                )
              }
              disabled={isSubmitting || orderedPages.length === 0}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.02] px-4 text-sm font-medium text-white transition-colors hover:border-primary/40 disabled:opacity-50"
            >
              <Check size={16} />
              {allSelected ? 'Limpar seleção' : `Selecionar todas (${orderedPages.length})`}
            </button>

            <div className="text-sm text-white/50">
              A página atual do editor entra marcada por padrão.
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {orderedPages.map((page, index) => {
              const isSelected = selectedPageIds.has(page.id)
              const isCurrentPage = page.id === currentPageId

              return (
                <button
                  key={page.id}
                  type="button"
                  onClick={() =>
                    setSelectedPageIds((previous) => {
                      const next = new Set(previous)
                      if (next.has(page.id)) {
                        next.delete(page.id)
                      } else {
                        next.add(page.id)
                      }
                      return next
                    })
                  }
                  disabled={isSubmitting}
                  className={cn(
                    'relative overflow-hidden rounded-[28px] border bg-white/[0.02] p-4 text-left transition-all',
                    isSelected
                      ? 'border-[#ff7a3d] bg-[#ff7a3d]/[0.08] shadow-[0_0_0_1px_rgba(255,122,61,0.45)]'
                      : 'border-white/10 hover:border-white/25',
                    isSubmitting && 'opacity-60',
                  )}
                >
                  <div
                    className={cn(
                      'absolute left-4 top-4 flex h-8 w-8 items-center justify-center rounded-xl border text-sm transition-colors',
                      isSelected
                        ? 'border-[#ff7a3d] bg-[#ff7a3d] text-white'
                        : 'border-white/15 bg-black/25 text-transparent',
                    )}
                  >
                    <Check size={16} />
                  </div>

                  {isCurrentPage ? (
                    <span className="absolute right-4 top-4 rounded-xl bg-[#ff7a3d] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white">
                      Atual
                    </span>
                  ) : null}

                  <div
                    className={cn(
                      'overflow-hidden rounded-[24px] border border-white/10 bg-[#0d1014]',
                      getAspectClass(page),
                    )}
                  >
                    {thumbnails[page.id] ? (
                      <img src={thumbnails[page.id]} alt={page.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full min-h-[280px] items-center justify-center bg-gradient-to-br from-[#16181d] via-[#111318] to-[#2a180f]">
                        <span className="text-sm uppercase tracking-[0.24em] text-white/60">
                          Página {index + 1}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4">
                    <p className="truncate text-[15px] font-semibold text-white">{page.name}</p>
                    <p className="mt-1 text-sm text-white/45">Página {index + 1}</p>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.02] px-6 py-5">
            <div className="flex items-center gap-2 text-2xl font-semibold text-white">
              <CreditCard size={24} className="text-white/70" />
              <span>Resumo:</span>
            </div>

            <div className="mt-5 grid gap-3 text-base text-white/55 md:grid-cols-[1fr_auto]">
              <span>Páginas selecionadas:</span>
              <span className="font-medium text-white">
                {selectedCount} de {orderedPages.length}
              </span>

              <span>Custo total:</span>
              <span className="font-medium text-white">
                {totalCost} créditos ({creditCost} créditos/página)
              </span>

              <span>Tempo estimado:</span>
              <span className="font-medium text-white">~{estimatedTime} segundos</span>

              <span>Créditos disponíveis:</span>
              <span className="font-medium text-white">
                {creditsBalanceQuery.isLoading ? 'Carregando...' : creditsRemaining ?? 'Indisponível'}
              </span>
            </div>

            {!hasCredits && selectedCount > 0 ? (
              <div className="mt-5 flex items-start gap-3 rounded-2xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <p>
                  Créditos insuficientes para gerar {selectedCount} página(s). Ajuste a seleção
                  ou recarregue seus créditos antes de continuar.
                </p>
              </div>
            ) : null}
          </div>

          <div className="mt-6 rounded-[28px] border border-white/10 bg-white/[0.02] px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-base font-semibold text-white">Analisar imagem para contexto</p>
                <p className="mt-1 text-sm text-white/55">
                  Preferencia compartilhada com o modo rapido. Fica desligada por padrao e so entra no pipeline de copy quando houver imagem base.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={analyzeImageForContext}
                onClick={() => setAnalyzeImageForContext(!analyzeImageForContext)}
                className={cn(
                  'relative inline-flex h-8 w-14 items-center rounded-full transition-colors',
                  analyzeImageForContext ? 'bg-[#ff7a3d]' : 'bg-white/15',
                )}
              >
                <span
                  className={cn(
                    'inline-block h-6 w-6 rounded-full bg-white transition-transform',
                    analyzeImageForContext ? 'translate-x-7' : 'translate-x-1',
                  )}
                />
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-white/10 px-8 py-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-14 rounded-[22px] border border-white/15 px-8 text-lg text-white transition-colors hover:border-white/30 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={selectedCount === 0 || !hasCredits || isSubmitting}
            onClick={async () => {
              if (selectedCount === 0 || !hasCredits) {
                return
              }

              try {
                setIsSubmitting(true)
                await onGenerate(Array.from(selectedPageIds))
                onClose()
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : 'Falha ao iniciar a geração dos criativos.',
                )
              } finally {
                setIsSubmitting(false)
              }
            }}
            className="inline-flex h-14 items-center gap-3 rounded-[22px] bg-white px-8 text-lg font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Save size={20} />
                Gerar Criativos Selecionados
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
