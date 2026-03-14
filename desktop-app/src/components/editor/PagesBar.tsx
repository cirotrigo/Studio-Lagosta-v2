import { useEffect, useMemo, useState } from 'react'
import { Copy, Plus, Tag, Trash2 } from 'lucide-react'
import { renderPageThumbnail } from '@/lib/editor/thumbnail'
import { ART_FORMAT_PRESETS } from '@/lib/editor/formats'
import { selectCurrentPageState, useEditorStore } from '@/stores/editor.store'
import { usePagesStore } from '@/stores/pages.store'
import { useTagsStore } from '@/stores/tags.store'
import { sortPages } from '@/lib/editor/document'
import type { ArtFormat } from '@/types/template'
import { cn } from '@/lib/utils'
import { PageTagsModal } from './PageTagsModal'

export function PagesBar() {
  const document = useEditorStore((state) => state.document)
  const currentPage = useEditorStore(selectCurrentPageState)
  const setCurrentPageId = useEditorStore((state) => state.setCurrentPageId)
  const thumbnails = usePagesStore((state) => state.thumbnails)
  const setThumbnail = usePagesStore((state) => state.setThumbnail)
  const removeThumbnail = usePagesStore((state) => state.removeThumbnail)
  const addPage = usePagesStore((state) => state.addPage)
  const duplicatePage = usePagesStore((state) => state.duplicatePage)
  const removePage = usePagesStore((state) => state.removePage)
  const reorderPages = usePagesStore((state) => state.reorderPages)
  const applyFormat = usePagesStore((state) => state.applyFormat)
  const projectTags = useTagsStore((state) => state.tags)

  // Helper to get tag color
  const getTagColor = (tagName: string): string => {
    const tag = projectTags.find((t) => t.name.toLowerCase() === tagName.toLowerCase())
    return tag?.color ?? '#6B7280'
  }

  const [draggingPageId, setDraggingPageId] = useState<string | null>(null)
  const [isTagsModalOpen, setIsTagsModalOpen] = useState(false)
  const compactButtonClass =
    'h-9 shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white/80 transition-all duration-150 hover:bg-white/10 hover:border-white/20 hover:text-white'

  const pages = useMemo(() => (document ? sortPages(document.design.pages) : []), [document])

  useEffect(() => {
    if (!pages.length) {
      return
    }

    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      void Promise.all(
        pages.map(async (page) => {
          const thumbnail = await renderPageThumbnail(page)
          if (!cancelled && thumbnail) {
            setThumbnail(page.id, thumbnail)
          }
        }),
      )
    }, 180)

    const validIds = new Set(pages.map((page) => page.id))
    Object.keys(thumbnails).forEach((pageId) => {
      if (!validIds.has(pageId)) {
        removeThumbnail(pageId)
      }
    })

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [pages, removeThumbnail, setThumbnail, thumbnails])

  if (!document || !pages.length || !currentPage) {
    return null
  }

  return (
    <div className="panel-glass shrink-0 px-4 py-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Paginas e formatos</h2>
          <p className="mt-1 text-xs text-white/50">Carrossel, variacoes e presets Instagram no mesmo documento.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={document.format}
            onChange={(event) => applyFormat(event.target.value as ArtFormat)}
            className="h-9 min-w-[240px] rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white/80 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 hover:bg-white/10 transition-all duration-150"
          >
            {Object.values(ART_FORMAT_PRESETS).map((preset) => (
              <option key={preset.format} value={preset.format}>
                {preset.label} ({preset.width}x{preset.height})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => addPage()}
            className={compactButtonClass}
          >
            <span className="inline-flex items-center gap-2">
              <Plus size={16} />
              Nova página
            </span>
          </button>
          <button
            type="button"
            onClick={() => duplicatePage(currentPage.id)}
            className={compactButtonClass}
          >
            <span className="inline-flex items-center gap-2">
              <Copy size={16} />
              Duplicar
            </span>
          </button>
          <button
            type="button"
            onClick={() => setIsTagsModalOpen(true)}
            className={compactButtonClass}
          >
            <span className="inline-flex items-center gap-2">
              <Tag size={16} />
              Tags
            </span>
          </button>
          <button
            type="button"
            disabled={pages.length <= 1}
            onClick={() => removePage(currentPage.id)}
            className="h-9 shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white/80 transition-all duration-150 hover:border-red-500/40 hover:text-red-400 disabled:opacity-40"
          >
            <span className="inline-flex items-center gap-2">
              <Trash2 size={16} />
              Remover
            </span>
          </button>
        </div>
      </div>

      <PageTagsModal isOpen={isTagsModalOpen} onClose={() => setIsTagsModalOpen(false)} />

      <div className="flex gap-3 overflow-x-auto pb-2">
        {pages.map((page) => {
          const thumbnail = thumbnails[page.id]
          const isActive = currentPage.id === page.id

          return (
            <button
              key={page.id}
              draggable
              onDragStart={() => setDraggingPageId(page.id)}
              onDragEnd={() => setDraggingPageId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                if (draggingPageId && draggingPageId !== page.id) {
                  reorderPages(draggingPageId, page.id)
                }
                setDraggingPageId(null)
              }}
              onClick={() => setCurrentPageId(page.id)}
              className={cn(
                'group min-w-[172px] rounded-2xl border p-3 text-left transition-all duration-150',
                isActive
                  ? 'border-primary/40 bg-primary/10'
                  : 'border-white/[0.08] bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]',
              )}
            >
              <div className="overflow-hidden rounded-xl border border-white/10 bg-[#080808]">
                {thumbnail ? (
                  <img src={thumbnail} alt={page.name} className="h-[192px] w-full object-cover" />
                ) : (
                  <div className="flex h-[192px] items-center justify-center bg-gradient-to-br from-[#0a0a0a] via-[#1a1a1a] to-primary/30">
                    <span className="text-xs uppercase tracking-[0.2em] text-white/60">Gerando thumb</span>
                  </div>
                )}
              </div>

              <div className="mt-3">
                <p className="text-sm font-medium text-white">{page.name}</p>
                <p className="mt-1 text-xs text-white/50">
                  {page.width}x{page.height} • {page.layers.length} layers
                </p>
                {page.tags && page.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {page.tags.map((tagName) => (
                      <span
                        key={tagName}
                        className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                        style={{ backgroundColor: getTagColor(tagName) }}
                      >
                        {tagName}
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/40">
                  Arraste para reordenar
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
