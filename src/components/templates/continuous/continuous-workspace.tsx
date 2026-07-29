"use client"

import * as React from 'react'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { useMultiPage } from '@/contexts/multi-page-context'
import { usePageActions } from '@/hooks/use-page-actions'
import { KonvaEditorStage } from '../konva-editor-stage'
import { PagePreview } from './page-preview'
import type { Layer } from '@/types/template'

/**
 * Hit-test de camada em coordenadas do canvas da página (topmost primeiro).
 * Caixa alinhada aos eixos — rotação ignorada de propósito (o clique acorda a
 * página de qualquer jeito; a seleção é um bônus de conveniência). Formas de
 * origem central (circle/triangle/star) têm a caixa centrada na posição.
 */
function hitTestPageLayer(layers: Layer[], x: number, y: number): Layer | null {
  const ordered = [...layers].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  for (let i = ordered.length - 1; i >= 0; i--) {
    const layer = ordered[i]
    if (layer.visible === false || layer.locked) continue
    const width = layer.size?.width ?? 0
    const height = layer.size?.height ?? 0
    if (width <= 0 || height <= 0) continue
    const centerOrigin =
      layer.type === 'shape' && ['circle', 'triangle', 'star'].includes(layer.style?.shapeType ?? '')
    const left = (layer.position?.x ?? 0) - (centerOrigin ? width / 2 : 0)
    const top = (layer.position?.y ?? 0) - (centerOrigin ? height / 2 : 0)
    if (x >= left && x <= left + width && y >= top && y <= top + height) {
      return layer
    }
  }
  return null
}

/**
 * ContinuousWorkspace — todas as páginas do template empilhadas numa coluna
 * com scroll DOM nativo (modelo Polotno real: um stage por página).
 *
 * A página ATIVA monta o KonvaEditorStage em modo embutido (pipeline completo:
 * design do context, PageSync, undo, transformer, guias, crop). As demais
 * são previews que "acordam" ao clique ou quando ficam majoritariamente
 * visíveis no scroll — e acordar é setCurrentPageId, o MESMO caminho da
 * PagesBar: as guardas do PageSync continuam donas da troca.
 */

/** Página vira ativa quando cobre mais de 50% do que poderia cobrir do viewport */
const ACTIVATION_RATIO = 0.5
/** Espera o scroll assentar antes de trocar a ativa (evita flush/load em rajada) */
const SCROLL_SETTLE_MS = 300
/** Janela em que o scroll programático (scroll-to-page) não dispara ativação */
const PROGRAMMATIC_SCROLL_MS = 900
/** Resolução da captura da página ao desativá-la (alimenta os previews) */
const CAPTURE_WIDTH = 450

export function ContinuousWorkspace() {
  const { design, zoom, setZoom, croppingLayerId, generateThumbnail, selectLayer } = useTemplateEditor()
  const { currentPageId, setCurrentPageId, isLoading } = useMultiPage()
  const { sortedPages, addPageAfter, duplicatePage, deletePage, canDeletePage } = usePageActions()

  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const slotRefs = React.useRef(new Map<string, HTMLDivElement>())
  const scrollDebounceRef = React.useRef<number | null>(null)
  const programmaticScrollRef = React.useRef(false)
  const programmaticTimerRef = React.useRef<number | null>(null)
  const pendingScrollToRef = React.useRef<string | null>(null)
  const initialScrollDoneRef = React.useRef(false)

  // Refs espelhando estado para handlers estáveis (scroll/eventos/hit-test)
  const currentPageIdRef = React.useRef(currentPageId)
  currentPageIdRef.current = currentPageId
  const croppingRef = React.useRef(croppingLayerId)
  croppingRef.current = croppingLayerId
  const zoomRef = React.useRef(zoom)
  zoomRef.current = zoom
  const sortedPagesRef = React.useRef(sortedPages)
  sortedPagesRef.current = sortedPages

  // Capturas em memória das páginas visitadas (dataURL ~450px) — previews
  // nítidos e frescos; Page.thumbnail (150px) é só o primeiro paint
  const [captures, setCaptures] = React.useState<Map<string, string>>(() => new Map())

  // Virtualização estilo Polotno: só páginas no viewport ±1 tela montam stage
  // vivo; além disso, imagem (a altura do slot é fixa — scrollbar estável)
  const [liveIds, setLiveIds] = React.useState<string[]>([])
  const visibleRafRef = React.useRef(0)

  const computeLiveIds = React.useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const containerRect = container.getBoundingClientRect()
    const margin = containerRect.height
    const next: string[] = []
    for (const [pageId, el] of slotRefs.current) {
      const rect = el.getBoundingClientRect()
      if (rect.bottom >= containerRect.top - margin && rect.top <= containerRect.bottom + margin) {
        next.push(pageId)
      }
    }
    next.sort()
    setLiveIds((prev) => {
      if (prev.length === next.length && prev.every((id, i) => id === next[i])) return prev
      return next
    })
  }, [])

  const scheduleLiveIds = React.useCallback(() => {
    if (visibleRafRef.current) return
    visibleRafRef.current = requestAnimationFrame(() => {
      visibleRafRef.current = 0
      computeLiveIds()
    })
  }, [computeLiveIds])

  // Recalcular a janela viva quando páginas/zoom mudam (e no mount)
  React.useEffect(() => {
    scheduleLiveIds()
  }, [sortedPages, zoom, scheduleLiveIds])

  React.useEffect(() => {
    return () => {
      if (visibleRafRef.current) cancelAnimationFrame(visibleRafRef.current)
    }
  }, [])

  const registerSlot = React.useCallback((pageId: string, el: HTMLDivElement | null) => {
    if (el) {
      slotRefs.current.set(pageId, el)
    } else {
      slotRefs.current.delete(pageId)
    }
  }, [])

  const scrollToPage = React.useCallback((pageId: string, behavior: ScrollBehavior = 'smooth') => {
    const el = slotRefs.current.get(pageId)
    if (!el) {
      // Slot ainda não montou (página recém-criada) — o efeito de pendência resolve
      pendingScrollToRef.current = pageId
      return
    }
    programmaticScrollRef.current = true
    if (programmaticTimerRef.current) window.clearTimeout(programmaticTimerRef.current)
    el.scrollIntoView({ behavior, block: 'center' })
    programmaticTimerRef.current = window.setTimeout(() => {
      programmaticScrollRef.current = false
    }, PROGRAMMATIC_SCROLL_MS)
  }, [])

  /**
   * Troca a página ativa SEMPRE via setCurrentPageId (PageSync faz flush+load).
   * Antes de trocar, captura o stage da página que está saindo — o clone do
   * generateThumbnail é síncrono, então roda antes do design ser substituído.
   */
  const activatePage = React.useCallback(
    (pageId: string, options?: { scroll?: boolean }) => {
      if (croppingRef.current) return
      if (pageId === currentPageIdRef.current) {
        if (options?.scroll) scrollToPage(pageId)
        return
      }
      const previousPageId = currentPageIdRef.current
      if (previousPageId) {
        void generateThumbnail(CAPTURE_WIDTH).then((url) => {
          if (url) {
            setCaptures((prev) => {
              const next = new Map(prev)
              next.set(previousPageId, url)
              return next
            })
          }
        })
      }
      setCurrentPageId(pageId)
      if (options?.scroll) scrollToPage(pageId)
    },
    [generateThumbnail, setCurrentPageId, scrollToPage],
  )

  const activatePageRef = React.useRef(activatePage)
  activatePageRef.current = activatePage

  // Acordar com seleção: clique num elemento de página inativa guarda o alvo;
  // a seleção é aplicada DEPOIS que o PageSync carregou o design da página
  // (loadTemplate limpa a seleção — selecionar antes seria desfeito)
  const pendingSelectRef = React.useRef<{ pageId: string; layerId: string } | null>(null)

  React.useEffect(() => {
    const pending = pendingSelectRef.current
    if (!pending || pending.pageId !== currentPageId) return
    if (!design.layers.some((layer) => layer.id === pending.layerId)) return
    pendingSelectRef.current = null
    const { pageId, layerId } = pending
    // Um respiro para o stage embutido montar; guarda contra troca de página no meio
    window.setTimeout(() => {
      if (currentPageIdRef.current === pageId) {
        selectLayer(layerId)
      }
    }, 80)
  }, [currentPageId, design.layers, selectLayer])

  const handleSlotMouseDown = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>, pageId: string) => {
      if (pageId === currentPageIdRef.current) return
      const slotEl = slotRefs.current.get(pageId)
      const page = sortedPagesRef.current.find((p) => p.id === pageId)
      if (slotEl && page) {
        const rect = slotEl.getBoundingClientRect()
        const canvasX = (event.clientX - rect.left) / (zoomRef.current || 1)
        const canvasY = (event.clientY - rect.top) / (zoomRef.current || 1)
        const hit = hitTestPageLayer(Array.isArray(page.layers) ? (page.layers as Layer[]) : [], canvasX, canvasY)
        pendingSelectRef.current = hit ? { pageId, layerId: hit.id } : null
      }
      activatePage(pageId)
    },
    [activatePage],
  )

  // PagesBar (chips/thumbnails/atalhos) pede ativação+scroll por evento —
  // mesmo idioma dos eventos do crop (lagosta:crop-*)
  React.useEffect(() => {
    const handleActivateRequest = (event: Event) => {
      const pageId = (event as CustomEvent<string>).detail
      if (typeof pageId === 'string' && pageId) {
        activatePageRef.current(pageId, { scroll: true })
      }
    }
    window.addEventListener('lagosta:activate-page', handleActivateRequest)
    return () => window.removeEventListener('lagosta:activate-page', handleActivateRequest)
  }, [])

  // Página recém-criada: rola até ela assim que o slot montar
  React.useEffect(() => {
    const pending = pendingScrollToRef.current
    if (!pending) return
    if (slotRefs.current.has(pending)) {
      pendingScrollToRef.current = null
      requestAnimationFrame(() => scrollToPage(pending))
    }
  }, [sortedPages, scrollToPage])

  // Ativação por scroll: quando o scroll assenta, a página mais visível
  // (acima do limiar) vira ativa. Scroll programático não ativa (flag).
  const handleScroll = React.useCallback(() => {
    scheduleLiveIds()
    if (scrollDebounceRef.current) window.clearTimeout(scrollDebounceRef.current)
    scrollDebounceRef.current = window.setTimeout(() => {
      if (programmaticScrollRef.current) return
      if (croppingRef.current) return
      const container = containerRef.current
      if (!container) return
      const containerRect = container.getBoundingClientRect()

      let bestId: string | null = null
      let bestVisible = 0
      let bestPossible = 1
      for (const [pageId, el] of slotRefs.current) {
        const rect = el.getBoundingClientRect()
        const visible = Math.min(rect.bottom, containerRect.bottom) - Math.max(rect.top, containerRect.top)
        if (visible > bestVisible) {
          bestVisible = visible
          bestId = pageId
          bestPossible = Math.min(rect.height, containerRect.height)
        }
      }

      if (!bestId || bestId === currentPageIdRef.current) return
      if (bestVisible >= ACTIVATION_RATIO * bestPossible) {
        activatePageRef.current(bestId)
      }
    }, SCROLL_SETTLE_MS)
  }, [scheduleLiveIds])

  React.useEffect(() => {
    return () => {
      if (scrollDebounceRef.current) window.clearTimeout(scrollDebounceRef.current)
      if (programmaticTimerRef.current) window.clearTimeout(programmaticTimerRef.current)
    }
  }, [])

  // Auto-fit inicial pela largura do container + scroll até a página corrente
  // (link da agenda entra com initialPageId no meio do template)
  React.useEffect(() => {
    if (initialScrollDoneRef.current) return
    if (isLoading || sortedPages.length === 0 || !currentPageId) return
    initialScrollDoneRef.current = true

    const container = containerRef.current
    if (container) {
      const maxPageWidth = Math.max(...sortedPages.map((p) => p.width || 1080))
      const fit = (container.clientWidth - 96) / maxPageWidth
      const clamped = Math.min(0.6, Math.max(0.25, fit))
      if (Number.isFinite(clamped) && Math.abs(clamped - zoom) > 0.02) {
        setZoom(clamped)
      }
    }
    requestAnimationFrame(() => scrollToPage(currentPageId, 'auto'))
     
  }, [isLoading, sortedPages, currentPageId])

  if (isLoading && sortedPages.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#f5f5f5] dark:bg-[#1a1a1a]">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent text-muted-foreground" />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="h-full w-full overflow-y-auto overflow-x-auto bg-[#f5f5f5] dark:bg-[#1a1a1a]"
      data-testid="continuous-workspace"
    >
      <div className="flex min-h-full flex-col items-center gap-6 px-8 py-6">
        {sortedPages.map((page, index) => {
          const isActive = page.id === currentPageId
          // A ativa usa as dimensões vivas do design (resize antes do autosave);
          // as demais, o que está persistido na Page
          const pageWidth = isActive ? design.canvas.width : page.width
          const pageHeight = isActive ? design.canvas.height : page.height
          const slotWidth = Math.max(1, Math.round(pageWidth * zoom))
          const slotHeight = Math.max(1, Math.round(pageHeight * zoom))

          return (
            <div key={page.id} className="group/page flex flex-shrink-0 flex-col" style={{ width: slotWidth }}>
              {/* Faixa da página: nome + controles (estilo Polotno) */}
              <div className="flex h-8 items-end justify-between pb-1">
                <span className="select-none text-xs font-medium text-muted-foreground">{page.name}</span>
                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/page:opacity-100">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    title="Duplicar página"
                    onClick={() => void duplicatePage(page.id)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    title="Excluir página"
                    disabled={!canDeletePage}
                    onClick={() => void deletePage(page.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    title="Adicionar página abaixo"
                    onClick={() => void addPageAfter(page.id)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Slot da página */}
              <div
                ref={(el) => registerSlot(page.id, el)}
                data-page-id={page.id}
                className={`relative rounded-md transition-shadow ${
                  isActive ? 'ring-2 ring-primary' : ''
                }`}
                style={{ width: slotWidth, height: slotHeight }}
                onMouseDown={(event) => handleSlotMouseDown(event, page.id)}
              >
                {isActive ? (
                  <KonvaEditorStage embedded />
                ) : (
                  <PagePreview
                    page={page}
                    width={slotWidth}
                    height={slotHeight}
                    zoom={zoom}
                    live={liveIds.includes(page.id)}
                    capturedUrl={captures.get(page.id)}
                    index={index}
                  />
                )}
              </div>
            </div>
          )
        })}
        {/* Respiro no fim da coluna para a última página descolar da borda */}
        <div className="h-4 flex-shrink-0" />
      </div>
    </div>
  )
}
