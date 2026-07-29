"use client"

import * as React from 'react'
import { useToast } from '@/hooks/use-toast'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { useMultiPage } from '@/contexts/multi-page-context'
import { useCreatePage, useDuplicatePage, useDeletePage, useReorderPages } from '@/hooks/use-pages'
import type { Page } from '@/types/template'

/**
 * Ações de página compartilhadas entre a PagesBar e o workspace contínuo
 * (adicionar, adicionar abaixo de, duplicar, excluir). Extraído da PagesBar
 * para os controles por página do modo contínuo usarem os mesmos handlers.
 */
export function usePageActions() {
  const { toast } = useToast()
  const { templateId, design } = useTemplateEditor()
  const { pages, currentPageId, setCurrentPageId } = useMultiPage()
  const createPageMutation = useCreatePage()
  const duplicatePageMutation = useDuplicatePage()
  const deletePageMutation = useDeletePage()
  const reorderPagesMutation = useReorderPages()

  const sortedPages = React.useMemo<Page[]>(() => {
    return [...pages].sort((a, b) => a.order - b.order)
  }, [pages])

  const createPage = React.useCallback(async () => {
    const pageData = {
      name: `Página ${pages.length + 1}`,
      width: design.canvas.width || 1080,
      height: design.canvas.height || 1920,
      layers: [],
      background: design.canvas.backgroundColor || '#ffffff',
      order: pages.length,
    }

    const newPage = await createPageMutation.mutateAsync({
      templateId,
      data: pageData,
    })

    if (newPage && typeof newPage === 'object' && 'id' in newPage) {
      return newPage as unknown as Page
    }
    return null
  }, [templateId, pages.length, design.canvas, createPageMutation])

  const addPage = React.useCallback(async () => {
    try {
      const newPage = await createPage()
      if (newPage) {
        setCurrentPageId(newPage.id)
      }
      toast({
        title: 'Página criada!',
        description: 'Nova página adicionada ao template.',
      })
      return newPage
    } catch (_error) {
      console.error('[usePageActions] Erro ao criar página:', _error)
      const errorMessage = _error instanceof Error ? _error.message : 'Erro desconhecido'
      toast({
        title: 'Erro ao criar página',
        description: errorMessage,
        variant: 'destructive',
      })
      return null
    }
  }, [createPage, setCurrentPageId, toast])

  /**
   * Cria uma página e a reordena para logo abaixo de `afterPageId` (o "+" do
   * gap entre páginas no modo contínuo). O create do backend só faz append,
   * então o insert é create + reorder.
   */
  const addPageAfter = React.useCallback(
    async (afterPageId: string) => {
      try {
        const newPage = await createPage()
        if (!newPage) return null

        const ids = sortedPages.map((p) => p.id).filter((id) => id !== newPage.id)
        const targetIndex = ids.indexOf(afterPageId)
        if (targetIndex !== -1) {
          ids.splice(targetIndex + 1, 0, newPage.id)
          reorderPagesMutation.mutate({ templateId, pageIds: ids })
        }

        setCurrentPageId(newPage.id)
        toast({
          title: 'Página criada!',
          description: 'Nova página adicionada ao template.',
        })
        return newPage
      } catch (_error) {
        console.error('[usePageActions] Erro ao criar página:', _error)
        toast({
          title: 'Erro ao criar página',
          description: _error instanceof Error ? _error.message : 'Erro desconhecido',
          variant: 'destructive',
        })
        return null
      }
    },
    [createPage, sortedPages, reorderPagesMutation, templateId, setCurrentPageId, toast],
  )

  const duplicatePage = React.useCallback(
    async (pageId: string) => {
      try {
        await duplicatePageMutation.mutateAsync({ templateId, pageId })
        toast({
          title: 'Página duplicada!',
          description: 'A página foi duplicada com sucesso.',
        })
      } catch (_error) {
        console.error('[usePageActions] Error duplicating page:', _error)
        toast({
          title: 'Erro ao duplicar',
          description: 'Não foi possível duplicar a página.',
          variant: 'destructive',
        })
      }
    },
    [templateId, duplicatePageMutation, toast],
  )

  const deletePage = React.useCallback(
    async (pageId: string) => {
      if (pages.length <= 1) {
        toast({
          title: 'Ação não permitida',
          description: 'Não é possível deletar a última página.',
          variant: 'destructive',
        })
        return
      }

      try {
        // Se deletar a página atual, navegar para outra ANTES de deletar
        if (pageId === currentPageId && sortedPages.length > 1) {
          const currentIndex = sortedPages.findIndex((p) => p.id === pageId)
          const nextPage = currentIndex > 0 ? sortedPages[currentIndex - 1] : sortedPages[currentIndex + 1]
          if (nextPage) {
            setCurrentPageId(nextPage.id)
          }
        }

        await deletePageMutation.mutateAsync({ templateId, pageId })

        toast({
          title: 'Página deletada!',
          description: 'A página foi removida com sucesso.',
        })
      } catch (_error) {
        console.error('[usePageActions] Error deleting page:', _error)
        const errorMessage = _error instanceof Error ? _error.message : 'Erro desconhecido'
        toast({
          title: 'Erro ao deletar',
          description: errorMessage,
          variant: 'destructive',
        })
      }
    },
    [templateId, pages.length, currentPageId, sortedPages, deletePageMutation, setCurrentPageId, toast],
  )

  return {
    sortedPages,
    addPage,
    addPageAfter,
    duplicatePage,
    deletePage,
    canDeletePage: pages.length > 1,
  }
}
