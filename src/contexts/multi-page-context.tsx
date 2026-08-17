"use client"

import * as React from 'react'
import type { Page, PageAudioConfig } from '@/types/template'
import { usePages, useUpdatePage } from '@/hooks/use-pages'
import { ApiError } from '@/lib/api-client'

export interface PageStatePatch {
  layers?: unknown[]
  width?: number
  height?: number
  background?: string
  /** Trilha sonora da página; null limpa a trilha. Fora do diff visual (não invalida renders). */
  audio?: PageAudioConfig | null
}

interface MultiPageContextValue {
  templateId: number
  pages: Page[]
  currentPageId: string | null
  currentPage: Page | null
  setCurrentPageId: (pageId: string) => void
  isLoading: boolean
  updatePageThumbnail: (pageId: string, thumbnail: string) => Promise<void>
  savePageLayers: (pageId: string, layers: unknown[]) => Promise<void>
  savePageState: (pageId: string, data: PageStatePatch) => Promise<void>
}

const MultiPageContext = React.createContext<MultiPageContextValue | null>(null)

interface MultiPageProviderProps {
  templateId: number
  children: React.ReactNode
  initialPageId?: string | null
}

export function MultiPageProvider({ templateId, children, initialPageId }: MultiPageProviderProps) {
  const [currentPageId, setCurrentPageIdState] = React.useState<string | null>(initialPageId ?? null)

  const { data: pagesData = [], isLoading, refetch } = usePages(templateId)
  const updatePageMutation = useUpdatePage({ skipInvalidation: true }) // Otimizado: não causa re-fetch

  // Force refetch when mounting with initialPageId (agenda navigation)
  const hasRefetchedRef = React.useRef(false)
  React.useEffect(() => {
    if (initialPageId && !hasRefetchedRef.current) {
      hasRefetchedRef.current = true
      refetch()
    }
  }, [initialPageId, refetch])

  // Converter pages do banco para o formato Page.
  // Dedupe por id AQUI (não só no select do usePages): um refetch em voo
  // resolvendo entre o POST de criação e o append do onSuccess ainda produzia
  // ids duplicados no cache — e chave duplicada quebra o React e o
  // SortableContext das barras de páginas. No provider, cobre TODOS os
  // consumidores de uma vez.
  const pages = React.useMemo<Page[]>(() => {
    const seen = new Set<string>()
    return pagesData.filter((p) => {
      // Entrada sem id nunca deveria chegar aqui (ver isPageResponse em
      // use-pages) — mas se chegar, é melhor sumir do que quebrar as keys
      if (!p || typeof p.id !== 'string') return false
      if (seen.has(p.id)) return false
      seen.add(p.id)
      return true
    }).map((p) => ({
      id: p.id,
      name: p.name,
      width: p.width,
      height: p.height,
      layers: Array.isArray(p.layers) ? p.layers : [],
      background: p.background ?? undefined,
      audio: p.audio ?? undefined,
      order: p.order,
      thumbnail: p.thumbnail ?? undefined,
      isTemplate: p.isTemplate,
      templateName: p.templateName ?? undefined,
      tags: p.tags ?? [],
      createdAt: new Date(p.createdAt),
      updatedAt: new Date(p.updatedAt),
    }))
  }, [pagesData])

  // Definir página inicial quando páginas carregarem
  // IMPORTANTE: initialPageId é aplicado UMA única vez. Este efeito roda de novo a cada
  // mudança do cache de pages (todo autosave), e forçar a volta ao initialPageId aqui
  // trocava a página no meio da edição — edições subsequentes vazavam para a página do link.
  const appliedInitialPageIdRef = React.useRef(false)
  React.useEffect(() => {
    if (pages.length === 0) return

    // Se initialPageId foi fornecido e existe nas pages, usar ele (apenas na primeira vez)
    if (initialPageId && !appliedInitialPageIdRef.current && pages.some((p) => p.id === initialPageId)) {
      appliedInitialPageIdRef.current = true
      if (currentPageId !== initialPageId) {
        setCurrentPageIdState(initialPageId)
      }
      return
    }

    // Fallback: se não tem página selecionada (ou ela deixou de existir), usar a primeira
    if (!currentPageId || !pages.some((p) => p.id === currentPageId)) {
      setCurrentPageIdState(pages[0].id)
    }
  }, [pages, currentPageId, initialPageId])

  const currentPage = React.useMemo(() => {
    return pages.find((p) => p.id === currentPageId) ?? null
  }, [pages, currentPageId])

  const setCurrentPageId = React.useCallback((pageId: string) => {
    setCurrentPageIdState(pageId)
  }, [])

  const updatePageThumbnail = React.useCallback(
    async (pageId: string, thumbnail: string) => {
      // Guarda: um caller sem pageId virava PATCH /pages/undefined (404 no
      // console a cada autosave). O trace identifica o caller em dev.
      if (!pageId) {
        console.warn('[MultiPage] updatePageThumbnail chamado sem pageId — ignorando.', new Error().stack)
        return
      }
      try {
        await updatePageMutation.mutateAsync({
          templateId,
          pageId,
          data: { thumbnail },
        })
      } catch (error) {
        // Thumbnail é fire-and-forget: se a página foi apagada (ou era uma
        // entrada fantasma de cache) entre gerar e enviar, o 404 é esperado
        // e não é um problema — sem stack vermelho no console por isso.
        if (error instanceof ApiError && error.status === 404) {
          return
        }
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

  // Layers + canvas (width/height/background) num PATCH único: dois writers
  // concorrentes na mesma página fariam o autosave e o resize competirem
  const savePageState = React.useCallback(
    async (pageId: string, data: PageStatePatch) => {
      try {
        await updatePageMutation.mutateAsync({
          templateId,
          pageId,
          data,
        })
      } catch (error) {
        console.error('Error saving page state:', error)
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
      savePageState,
    }),
    [templateId, pages, currentPageId, currentPage, setCurrentPageId, isLoading, updatePageThumbnail, savePageLayers, savePageState]
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
