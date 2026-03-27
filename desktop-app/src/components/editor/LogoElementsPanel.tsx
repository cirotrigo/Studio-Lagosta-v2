import { useState } from 'react'
import { Crown, Puzzle, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { useProjectLogos, type ProjectLogo } from '@/hooks/use-project-logos'
import { useProjectElements, type ProjectElement } from '@/hooks/use-project-elements'
import { useProjectStore } from '@/stores/project.store'
import { selectCurrentPageState, useEditorStore } from '@/stores/editor.store'
import { createImageLayer } from '@/lib/editor/document'

/**
 * Collapsible panel that shows project Logos and Elements
 * for insertion into the editor canvas.
 */
export function LogoElementsPanel() {
  const currentProject = useProjectStore((state) => state.currentProject)
  const currentPage = useEditorStore(selectCurrentPageState)
  const addLayer = useEditorStore((state) => state.addLayer)

  const { data: logos = [], isLoading: logosLoading } = useProjectLogos(currentProject?.id)
  const { data: elements = [], isLoading: elementsLoading } = useProjectElements(currentProject?.id)

  const [logosOpen, setLogosOpen] = useState(true)
  const [elementsOpen, setElementsOpen] = useState(true)

  const insertAsset = (asset: ProjectLogo | ProjectElement, type: 'logo' | 'element') => {
    if (!currentPage) return

    const img = new Image()
    img.onload = () => {
      const maxWidth = 200
      let w = img.width
      let h = img.height

      if (w > maxWidth) {
        const ratio = maxWidth / w
        w = maxWidth
        h = Math.round(h * ratio)
      }

      const layer = createImageLayer(currentPage, {
        name: type === 'logo' ? `Logo - ${asset.name}` : `Elemento - ${asset.name}`,
        role: 'content',
        src: asset.fileUrl,
        x: Math.round((currentPage.width - w) / 2),
        y: Math.round((currentPage.height - h) / 2),
        width: w,
        height: h,
        fit: 'contain',
        locked: false,
      })

      addLayer(layer)
    }
    img.onerror = () => {
      // Fallback: add with default size
      const layer = createImageLayer(currentPage, {
        name: type === 'logo' ? `Logo - ${asset.name}` : `Elemento - ${asset.name}`,
        role: 'content',
        src: asset.fileUrl,
        x: Math.round((currentPage.width - 200) / 2),
        y: Math.round((currentPage.height - 200) / 2),
        width: 200,
        height: 200,
        fit: 'contain',
        locked: false,
      })
      addLayer(layer)
    }
    img.src = asset.fileUrl
  }

  const sectionHeaderClass =
    'flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-white/50 hover:text-white/80 transition-colors cursor-pointer'

  const gridItemClass =
    'group relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-white/5 transition-all hover:border-primary/50 hover:bg-white/10 cursor-pointer'

  return (
    <div className="space-y-1">
      {/* Logos Section */}
      <button type="button" className={sectionHeaderClass} onClick={() => setLogosOpen(!logosOpen)}>
        {logosOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Crown size={14} />
        Logos ({logos.length})
      </button>

      {logosOpen && (
        <div className="px-3 pb-3">
          {logosLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={18} className="animate-spin text-white/40" />
            </div>
          ) : logos.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {logos.map((logo) => (
                <button
                  key={logo.id}
                  type="button"
                  className={gridItemClass}
                  onClick={() => insertAsset(logo, 'logo')}
                  title={logo.name}
                >
                  <img
                    src={logo.fileUrl}
                    alt={logo.name}
                    className="h-full w-full object-contain p-2"
                    loading="lazy"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="truncate text-[9px] text-white/90">{logo.name}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-xs text-white/30">Nenhum logo cadastrado</p>
          )}
        </div>
      )}

      {/* Elements Section */}
      <button type="button" className={sectionHeaderClass} onClick={() => setElementsOpen(!elementsOpen)}>
        {elementsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Puzzle size={14} />
        Elementos ({elements.length})
      </button>

      {elementsOpen && (
        <div className="px-3 pb-3">
          {elementsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 size={18} className="animate-spin text-white/40" />
            </div>
          ) : elements.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {elements.map((el) => (
                <button
                  key={el.id}
                  type="button"
                  className={gridItemClass}
                  onClick={() => insertAsset(el, 'element')}
                  title={el.name}
                >
                  <img
                    src={el.fileUrl}
                    alt={el.name}
                    className="h-full w-full object-contain p-2"
                    loading="lazy"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="truncate text-[9px] text-white/90">{el.name}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-xs text-white/30">Nenhum elemento cadastrado</p>
          )}
        </div>
      )}
    </div>
  )
}
