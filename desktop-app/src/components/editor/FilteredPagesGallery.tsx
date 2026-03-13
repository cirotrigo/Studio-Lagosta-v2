import { useEffect, useMemo, useState } from 'react'
import { Layers, Tag } from 'lucide-react'
import { renderPageThumbnail } from '@/lib/editor/thumbnail'
import { useTagsStore } from '@/stores/tags.store'
import type { KonvaPage, KonvaTemplateDocument } from '@/types/template'

interface FilteredPagesGalleryProps {
  templates: KonvaTemplateDocument[]
  selectedTags: string[]
  onPageSelect: (template: KonvaTemplateDocument, page: KonvaPage) => void
}

interface PageWithTemplate {
  template: KonvaTemplateDocument
  page: KonvaPage
  thumbnail: string | null
}

export function FilteredPagesGallery({
  templates,
  selectedTags,
  onPageSelect,
}: FilteredPagesGalleryProps) {
  const projectTags = useTagsStore((state) => state.tags)
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})

  // Filter pages based on selected tags
  const filteredPages = useMemo(() => {
    const pages: PageWithTemplate[] = []

    for (const template of templates) {
      for (const page of template.design.pages) {
        // If no tags selected, show all pages
        if (selectedTags.length === 0) {
          pages.push({ template, page, thumbnail: thumbnails[page.id] ?? null })
          continue
        }

        // Check if page has any of the selected tags
        const pageTags = page.tags ?? []
        const hasMatchingTag = selectedTags.some((selectedTag) =>
          pageTags.some((pageTag) => pageTag.toLowerCase() === selectedTag.toLowerCase()),
        )

        if (hasMatchingTag) {
          pages.push({ template, page, thumbnail: thumbnails[page.id] ?? null })
        }
      }
    }

    return pages
  }, [templates, selectedTags, thumbnails])

  // Generate thumbnails for visible pages
  useEffect(() => {
    const pagesToRender = filteredPages.filter((p) => !thumbnails[p.page.id])

    if (pagesToRender.length === 0) return

    let cancelled = false

    const generateThumbnails = async () => {
      for (const { page } of pagesToRender) {
        if (cancelled) break

        const thumbnail = await renderPageThumbnail(page)
        if (!cancelled && thumbnail) {
          setThumbnails((prev) => ({ ...prev, [page.id]: thumbnail }))
        }
      }
    }

    const timeoutId = window.setTimeout(() => {
      void generateThumbnails()
    }, 100)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [filteredPages, thumbnails])

  // Helper to get tag color
  const getTagColor = (tagName: string): string => {
    const tag = projectTags.find((t) => t.name.toLowerCase() === tagName.toLowerCase())
    return tag?.color ?? '#6B7280'
  }

  if (templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Layers size={40} className="mb-3 text-text-subtle opacity-50" />
        <p className="text-sm text-text-muted">Nenhum template encontrado</p>
        <p className="mt-1 text-xs text-text-subtle">
          Crie templates no Editor para usar aqui
        </p>
      </div>
    )
  }

  if (filteredPages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Tag size={40} className="mb-3 text-text-subtle opacity-50" />
        <p className="text-sm text-text-muted">
          Nenhuma pagina com {selectedTags.length === 1 ? 'a tag' : 'as tags'} selecionada(s)
        </p>
        <p className="mt-1 text-xs text-text-subtle">
          Selecione outras tags ou adicione tags as paginas no Editor
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {filteredPages.map(({ template, page, thumbnail }) => (
        <button
          key={`${template.id}-${page.id}`}
          type="button"
          onClick={() => onPageSelect(template, page)}
          className="group rounded-xl border border-border bg-card/60 p-2 text-left transition-colors hover:border-primary/40"
        >
          {/* Thumbnail */}
          <div className="overflow-hidden rounded-lg border border-border bg-[#0f172a]">
            {thumbnail ? (
              <img
                src={thumbnail}
                alt={page.name}
                className="aspect-[4/5] w-full object-cover"
              />
            ) : (
              <div className="flex aspect-[4/5] items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-amber-600/50">
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/80">
                  Gerando...
                </span>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="mt-2">
            <p className="truncate text-xs font-medium text-text">{page.name}</p>
            <p className="mt-0.5 text-[10px] text-text-muted">
              {template.name}
            </p>

            {/* Tags */}
            {page.tags && page.tags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {page.tags.slice(0, 2).map((tagName) => (
                  <span
                    key={tagName}
                    className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium text-white"
                    style={{ backgroundColor: getTagColor(tagName) }}
                  >
                    {tagName}
                  </span>
                ))}
                {page.tags.length > 2 && (
                  <span className="text-[9px] text-text-subtle">
                    +{page.tags.length - 2}
                  </span>
                )}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}
