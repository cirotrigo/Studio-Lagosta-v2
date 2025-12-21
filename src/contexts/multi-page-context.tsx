"use client"

import * as React from 'react'
import type { Page } from '@/types/template'
import { usePages, useUpdatePage } from '@/hooks/use-pages'

interface MultiPageContextValue {
  templateId: number
  pages: Page[]
  currentPageId: string | null
  currentPage: Page | null
  setCurrentPageId: (pageId: string) => void
  isLoading: boolean
  updatePageThumbnail: (pageId: string, thumbnail: string) => Promise<void>
  savePageLayers: (pageId: string, layers: unknown[]) => Promise<void>
}

const MultiPageContext = React.createContext<MultiPageContextValue | null>(null)

interface MultiPageProviderProps {
  templateId: number
  children: React.ReactNode
  initialPageId?: string | null
}

export function MultiPageProvider({ templateId, children, initialPageId }: MultiPageProviderProps) {
  const [currentPageId, setCurrentPageIdState] = React.useState<string | null>(initialPageId ?? null)

  const { data: pagesData = [], isLoading } = usePages(templateId)
  const updatePageMutation = useUpdatePage({ skipInvalidation: true }) // Otimizado: não causa re-fetch

  // Converter pages do banco para o formato Page
  const pages = React.useMemo<Page[]>(() => {
    return pagesData.map((p) => ({
      id: p.id,
      name: p.name,
      width: p.width,
      height: p.height,
      layers: Array.isArray(p.layers) ? p.layers : [],
      background: p.background ?? undefined,
      order: p.order,
      thumbnail: p.thumbnail ?? undefined,
      isTemplate: p.isTemplate,
      templateName: p.templateName ?? undefined,
      createdAt: new Date(p.createdAt),
      updatedAt: new Date(p.updatedAt),
    }))
  }, [pagesData])

  // Definir página inicial quando páginas carregarem
  React.useEffect(() => {
    if (!currentPageId && pages.length > 0) {
      setCurrentPageIdState(pages[0].id)
    }
  }, [pages, currentPageId])

  const currentPage = React.useMemo(() => {
    return pages.find((p) => p.id === currentPageId) ?? null
  }, [pages, currentPageId])

  const setCurrentPageId = React.useCallback((pageId: string) => {
    setCurrentPageIdState(pageId)
  }, [])

  const updatePageThumbnail = React.useCallback(
    async (pageId: string, thumbnail: string) => {
      try {
        await updatePageMutation.mutateAsync({
          templateId,
          pageId,
          data: { thumbnail },
        })
      } catch (error) {
        console.error('Error updating page thumbnail:', error)
        // Não lançar erro para não interromper o fluxo
      }
    },
    [templateId, updatePageMutation]
  )

  const savePageLayers = React.useCallback(
    async (pageId: string, layers: unknown[]) => {
      try {
        await updatePageMutation.mutateAsync({
          templateId,
          pageId,
          data: { layers },
        })
      } catch (error) {
        console.error('Error saving page layers:', error)
        throw error
      }
    },
    [templateId, updatePageMutation]
  )

  const value = React.useMemo<MultiPageContextValue>(
    () => ({
      templateId,
      pages,
      currentPageId,
      currentPage,
      setCurrentPageId,
      isLoading,
      updatePageThumbnail,
      savePageLayers,
    }),
    [templateId, pages, currentPageId, currentPage, setCurrentPageId, isLoading, updatePageThumbnail, savePageLayers]
  )

  return <MultiPageContext.Provider value={value}>{children}</MultiPageContext.Provider>
}

export function useMultiPage() {
  const ctx = React.useContext(MultiPageContext)
  if (!ctx) {
    throw new Error('useMultiPage must be used within a MultiPageProvider')
  }
  return ctx
}
