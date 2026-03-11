import { useEffect, useMemo, useState } from 'react'
import { FolderOpen, Image as ImageIcon, Upload, X } from 'lucide-react'
import PhotoSelector from '@/components/project/generate/PhotoSelector'
import VariationSelector from '@/components/project/generate/VariationSelector'
import { sortPages } from '@/lib/editor/document'
import { cn } from '@/lib/utils'
import type { ArtFormat, KonvaPage } from '@/types/template'

interface SelectedPhotoRef {
  url: string
  source: string
  format?: ArtFormat
  aspectRatio?: string
  width?: number
  height?: number
}

interface EditorGenerateArtModalProps {
  open: boolean
  onClose: () => void
  projectId: number
  pages: KonvaPage[]
  currentPageId: string | null
  thumbnails: Record<string, string>
  onGenerate: (params: {
    selectedPageIds: string[]
    selectedPhoto: SelectedPhotoRef
    variations: 1 | 2 | 4
  }) => void
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
  projectId,
  pages,
  currentPageId,
  thumbnails,
  onGenerate,
}: EditorGenerateArtModalProps) {
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set())
  const [variations, setVariations] = useState<1 | 2 | 4>(1)
  const [selectedPhoto, setSelectedPhoto] = useState<SelectedPhotoRef | null>(null)

  const orderedPages = useMemo(() => sortPages(pages), [pages])
  const allSelected = orderedPages.length > 0 && selectedPageIds.size === orderedPages.length

  useEffect(() => {
    if (!open) {
      return
    }

    setSelectedPageIds(currentPageId ? new Set([currentPageId]) : new Set())
    setVariations(1)
  }, [currentPageId, open])

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-text">Gerar Arte</h2>
            <p className="mt-1 text-sm text-text-muted">
              Selecione as páginas do template atual e a foto base para gerar variações em fila.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-text transition-colors hover:border-primary/40"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-6 overflow-hidden px-6 py-5 lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="min-h-0 space-y-5 overflow-y-auto pr-1">
            <div className="rounded-2xl border border-border bg-background/30 p-4">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">
                <FolderOpen size={14} />
                Fontes de imagem
              </div>
              <p className="mt-2 text-sm text-text-muted">
                Nesta fase o editor gera a partir de `Upload local` e `Drive de fotos` do projeto.
              </p>

              <div className="mt-4">
                <PhotoSelector
                  projectId={projectId}
                  selectedPhoto={selectedPhoto}
                  onPhotoChange={setSelectedPhoto}
                  allowedTabs={['drive', 'upload']}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background/30 p-4">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">
                <Upload size={14} />
                Variações por página
              </div>
              <p className="mt-2 text-sm text-text-muted">
                A imagem é aplicada em `cover`, ocupando o canvas inteiro da página.
              </p>
              <div className="mt-4">
                <VariationSelector value={variations} onChange={setVariations} />
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-background/30 p-4">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-text-subtle">
                <ImageIcon size={14} />
                Resumo
              </div>
              <div className="mt-3 space-y-2 text-sm text-text-muted">
                <p>Páginas selecionadas: <span className="font-medium text-text">{selectedPageIds.size}</span></p>
                <p>Variações por página: <span className="font-medium text-text">{variations}</span></p>
                <p>Total estimado: <span className="font-medium text-text">{selectedPageIds.size * variations}</span> arte(s)</p>
              </div>
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto pr-1">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-text">Páginas do template</p>
                <p className="mt-1 text-xs text-text-muted">
                  A página atual entra marcada por padrão, como no Studio Web.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedPageIds(
                    allSelected ? new Set() : new Set(orderedPages.map((page) => page.id)),
                  )
                }
                className="h-9 rounded-xl border border-border px-3 text-sm text-text transition-colors hover:border-primary/40"
              >
                {allSelected ? 'Limpar seleção' : 'Selecionar todas'}
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                    className={cn(
                      'relative rounded-2xl border p-3 text-left transition-colors',
                      isSelected
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-background/30 hover:border-primary/35',
                    )}
                  >
                    {isCurrentPage ? (
                      <span className="absolute right-3 top-3 rounded-full bg-primary px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-foreground">
                        Atual
                      </span>
                    ) : null}

                    <div className="mb-3 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="h-4 w-4 rounded border-border bg-input text-primary"
                      />
                      <span className="text-sm font-medium text-text">{page.name}</span>
                    </div>

                    <div className={cn('overflow-hidden rounded-xl border border-border bg-[#0c111d]', getAspectClass(page))}>
                      {thumbnails[page.id] ? (
                        <img src={thumbnails[page.id]} alt={page.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full min-h-[180px] items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-amber-600/50">
                          <span className="text-xs uppercase tracking-[0.18em] text-white/80">Página {index + 1}</span>
                        </div>
                      )}
                    </div>

                    <p className="mt-3 text-xs text-text-muted">
                      {page.width}x{page.height} • {page.layers.length} layers
                    </p>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4">
          <p className="text-sm text-text-muted">
            {!selectedPhoto ? 'Selecione uma foto do Drive ou faça upload para iniciar.' : 'A fila roda em segundo plano e o editor continua utilizável.'}
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-xl border border-border px-4 text-sm text-text transition-colors hover:border-primary/40"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!selectedPhoto || selectedPageIds.size === 0}
              onClick={() => {
                if (!selectedPhoto || selectedPageIds.size === 0) {
                  return
                }

                onGenerate({
                  selectedPageIds: Array.from(selectedPageIds),
                  selectedPhoto,
                  variations,
                })
                onClose()
              }}
              className="h-10 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
            >
              Gerar na fila
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
