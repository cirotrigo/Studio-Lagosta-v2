import * as React from 'react'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { useMultiPage } from '@/contexts/multi-page-context'
import { useToast } from '@/hooks/use-toast'

interface GenerationProgress {
  current: number
  total: number
  pageId: string
  pageName: string
}

interface UseGenerateMultipleCreativesReturn {
  generateMultiple: (pageIds: string[]) => Promise<void>
  isGenerating: boolean
  progress: GenerationProgress | null
}

/**
 * Hook para gerar múltiplos criativos (uma página por vez, sequencialmente)
 */
export function useGenerateMultipleCreatives(): UseGenerateMultipleCreativesReturn {
  const { exportDesign } = useTemplateEditor()
  const { pages, currentPageId, setCurrentPageId } = useMultiPage()
  const { toast } = useToast()

  const [isGenerating, setIsGenerating] = React.useState(false)
  const [progress, setProgress] = React.useState<GenerationProgress | null>(null)

  // Ref para armazenar página original (para restaurar no final)
  const originalPageIdRef = React.useRef<string | null>(null)

  const generateMultiple = React.useCallback(
    async (pageIds: string[]) => {
      if (pageIds.length === 0) {
        return
      }

      // Guardar página atual para restaurar depois
      originalPageIdRef.current = currentPageId

      setIsGenerating(true)

      // Toast inicial
      const loadingToast = toast({
        title: 'Gerando criativos...',
        description: `Preparando ${pageIds.length} página${pageIds.length > 1 ? 's' : ''}...`,
        duration: Infinity,
      })

      const errors: Array<{ pageId: string; error: string }> = []
      const successes: string[] = []

      try {
        // Processar cada página sequencialmente
        for (let i = 0; i < pageIds.length; i++) {
          const pageId = pageIds[i]
          const page = pages.find((p) => p.id === pageId)

          if (!page) {
            errors.push({
              pageId,
              error: 'Página não encontrada',
            })
            continue
          }

          // Atualizar progresso
          setProgress({
            current: i + 1,
            total: pageIds.length,
            pageId: page.id,
            pageName: page.name,
          })

          // Atualizar toast de progresso
          loadingToast.update?.({
            id: loadingToast.id,
            title: 'Gerando criativos...',
            description: `Página ${i + 1} de ${pageIds.length}: ${page.name}`,
          })

          try {
            // Navegar para a página (isso carrega os layers no canvas)
            setCurrentPageId(pageId)

            // Aguardar um frame para garantir que o canvas foi atualizado
            await new Promise((resolve) => requestAnimationFrame(resolve))
            // Aguardar mais um pouco para garantir renderização completa
            await new Promise((resolve) => setTimeout(resolve, 500))

            // Exportar a página atual com nome da página
            await exportDesign('jpeg', page.name)

            successes.push(pageId)

            console.log(`[GenerateMultiple] Página ${i + 1}/${pageIds.length} gerada com sucesso`)
          } catch (error) {
            console.error(`[GenerateMultiple] Erro ao gerar página ${page.name}:`, error)
            errors.push({
              pageId,
              error: error instanceof Error ? error.message : 'Erro desconhecido',
            })
          }
        }

        // Remover toast de loading
        loadingToast.dismiss?.()

        // Restaurar página original
        if (originalPageIdRef.current) {
          setCurrentPageId(originalPageIdRef.current)
        }

        // Toast final com resultado
        if (errors.length === 0) {
          // Sucesso total
          toast({
            title: '✅ Criativos gerados com sucesso!',
            description: `${successes.length} criativo${successes.length > 1 ? 's foram gerados' : ' foi gerado'}.`,
          })
        } else if (successes.length === 0) {
          // Falha total
          toast({
            title: '❌ Falha ao gerar criativos',
            description: `Não foi possível gerar nenhum criativo. ${errors[0].error}`,
            variant: 'destructive',
          })
        } else {
          // Sucesso parcial
          toast({
            title: '⚠️ Geração parcial',
            description: `${successes.length} criativo${successes.length > 1 ? 's gerados' : ' gerado'}, ${errors.length} falha${errors.length > 1 ? 's' : ''}.`,
            variant: 'default',
          })
        }
      } catch (error) {
        console.error('[GenerateMultiple] Erro geral:', error)

        loadingToast.dismiss?.()

        toast({
          title: 'Erro ao gerar criativos',
          description: error instanceof Error ? error.message : 'Erro desconhecido',
          variant: 'destructive',
        })
      } finally {
        setIsGenerating(false)
        setProgress(null)
      }
    },
    [pages, currentPageId, setCurrentPageId, exportDesign, toast]
  )

  return {
    generateMultiple,
    isGenerating,
    progress,
  }
}
