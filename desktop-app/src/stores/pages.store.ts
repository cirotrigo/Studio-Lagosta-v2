import { create } from 'zustand'
import { applyFormatToDocument } from '@/lib/editor/formats'
import { createBlankPage, duplicatePage as duplicatePageEntry, sortPages } from '@/lib/editor/document'
import type { ArtFormat, KonvaPage } from '@/types/template'
import { useEditorStore } from './editor.store'

interface PagesState {
  thumbnails: Record<string, string>
  setThumbnail: (pageId: string, dataUrl: string) => void
  removeThumbnail: (pageId: string) => void
  addPage: () => void
  duplicatePage: (pageId?: string) => void
  removePage: (pageId: string) => void
  reorderPages: (fromPageId: string, toPageId: string) => void
  applyFormat: (format: ArtFormat) => void
  reset: () => void
}

function normalizePageOrder(pages: KonvaPage[]): KonvaPage[] {
  return pages.map((page, index) => ({
    ...page,
    order: index,
    name: page.name || `Página ${index + 1}`,
  }))
}

export const usePagesStore = create<PagesState>((set) => ({
  thumbnails: {},

  setThumbnail: (pageId, dataUrl) =>
    set((state) => ({
      thumbnails: {
        ...state.thumbnails,
        [pageId]: dataUrl,
      },
    })),

  removeThumbnail: (pageId) =>
    set((state) => {
      const next = { ...state.thumbnails }
      delete next[pageId]
      return { thumbnails: next }
    }),

  addPage: () => {
    const editor = useEditorStore.getState()
    const document = editor.document
    if (!document) {
      return
    }

    const orderedPages = sortPages(document.design.pages)
    const sourcePage = orderedPages.find((page) => page.id === document.design.currentPageId) ?? orderedPages[0]
    const nextPage = createBlankPage(document.format, orderedPages.length, {
      name: `Página ${orderedPages.length + 1}`,
      background: sourcePage?.background ?? '#F8F5EF',
    })

    editor.updateDocument((currentDocument) => ({
      ...currentDocument,
      design: {
        ...currentDocument.design,
        currentPageId: nextPage.id,
        pages: [...orderedPages, nextPage],
      },
    }))
    editor.clearSelection()
  },

  duplicatePage: (pageId) => {
    const editor = useEditorStore.getState()
    const document = editor.document
    if (!document) {
      return
    }

    const orderedPages = sortPages(document.design.pages)
    const sourcePage = orderedPages.find((page) => page.id === (pageId ?? document.design.currentPageId))
    if (!sourcePage) {
      return
    }

    const sourceIndex = orderedPages.findIndex((page) => page.id === sourcePage.id)
    const nextPages = [...orderedPages]
    const pageCopy = duplicatePageEntry(sourcePage, sourceIndex + 1)
    nextPages.splice(sourceIndex + 1, 0, pageCopy)

    editor.updateDocument((currentDocument) => ({
      ...currentDocument,
      design: {
        ...currentDocument.design,
        currentPageId: pageCopy.id,
        pages: normalizePageOrder(nextPages),
      },
    }))
    editor.clearSelection()
  },

  removePage: (pageId) => {
    const editor = useEditorStore.getState()
    const document = editor.document
    if (!document || document.design.pages.length <= 1) {
      return
    }

    const orderedPages = sortPages(document.design.pages)
    const removingIndex = orderedPages.findIndex((page) => page.id === pageId)
    if (removingIndex === -1) {
      return
    }

    const nextPages = orderedPages.filter((page) => page.id !== pageId)
    const fallbackPage = nextPages[Math.max(0, removingIndex - 1)] ?? nextPages[0]

    editor.updateDocument((currentDocument) => ({
      ...currentDocument,
      design: {
        ...currentDocument.design,
        currentPageId:
          currentDocument.design.currentPageId === pageId ? fallbackPage.id : currentDocument.design.currentPageId,
        pages: normalizePageOrder(nextPages),
      },
    }))
    editor.clearSelection()

    set((state) => {
      const next = { ...state.thumbnails }
      delete next[pageId]
      return { thumbnails: next }
    })
  },

  reorderPages: (fromPageId, toPageId) => {
    const editor = useEditorStore.getState()
    const document = editor.document
    if (!document || fromPageId === toPageId) {
      return
    }

    const orderedPages = sortPages(document.design.pages)
    const fromIndex = orderedPages.findIndex((page) => page.id === fromPageId)
    const toIndex = orderedPages.findIndex((page) => page.id === toPageId)
    if (fromIndex === -1 || toIndex === -1) {
      return
    }

    const nextPages = [...orderedPages]
    const [movingPage] = nextPages.splice(fromIndex, 1)
    nextPages.splice(toIndex, 0, movingPage)

    editor.updateDocument((currentDocument) => ({
      ...currentDocument,
      design: {
        ...currentDocument.design,
        pages: normalizePageOrder(nextPages),
      },
    }))
  },

  applyFormat: (format) => {
    const editor = useEditorStore.getState()
    if (!editor.document || editor.document.format === format) {
      return
    }

    editor.updateDocument((document) => applyFormatToDocument(document, format))
    editor.clearSelection()
    set({ thumbnails: {} })
  },

  reset: () => set({ thumbnails: {} }),
}))
