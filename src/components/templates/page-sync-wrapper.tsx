"use client"

import * as React from 'react'
import { useMultiPage } from '@/contexts/multi-page-context'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import type { Layer } from '@/types/template'

/**
 * Componente que sincroniza o estado entre MultiPageContext e TemplateEditorContext
 * - Carrega layers da página atual quando ela muda
 * - Salva layers da página atual quando o design muda
 */
export function PageSyncWrapper({ children }: { children: React.ReactNode }) {
  const { currentPage, currentPageId, savePageLayers, updatePageThumbnail } = useMultiPage()
  const { design, loadTemplate, generateThumbnail } = useTemplateEditor()

  const lastPageIdRef = React.useRef<string | null>(currentPageId)
  const isSyncingRef = React.useRef(false)
  const lastSavedLayersRef = React.useRef<string>('')

  // 1. Carregar layers quando a página atual muda
  React.useEffect(() => {
    if (!currentPage || isSyncingRef.current) {
      return
    }

    // Apenas atualizar se a página realmente mudou
    if (lastPageIdRef.current !== currentPageId) {
      console.log(`[PageSync] Trocando para página ${currentPage.name} (${currentPageId})`)

      isSyncingRef.current = true

      // Carregar design da nova página
      // IMPORTANTE: Não passar 'name' aqui para evitar sobrescrever o nome do template!
      // O nome do template deve permanecer constante, independente da página selecionada
      loadTemplate({
        designData: {
          canvas: {
            width: currentPage.width,
            height: currentPage.height,
            backgroundColor: currentPage.background,
          },
          layers: (currentPage.layers as Layer[]) || [],
        },
        // name: currentPage.name, // ❌ NÃO PASSAR - isso sobrescreve o nome do template
      })

      lastPageIdRef.current = currentPageId

      // Reset flag após um frame
      requestAnimationFrame(() => {
        isSyncingRef.current = false
      })
    }
  }, [currentPage, currentPageId, loadTemplate])

  // 2. Salvar layers da página atual quando o design muda (debounced e otimizado)
  React.useEffect(() => {
    if (!currentPageId || isSyncingRef.current) {
      return
    }

    // Verificar se os layers realmente mudaram (evitar saves desnecessários)
    const currentLayersString = JSON.stringify(design.layers)
    if (currentLayersString === lastSavedLayersRef.current) {
      return
    }

    const timeoutId = setTimeout(async () => {
      try {
        // Verificar novamente se ainda é diferente (pode ter mudado durante debounce)
        const layersToSave = JSON.stringify(design.layers)
        if (layersToSave === lastSavedLayersRef.current) {
          return
        }

        console.log(`[PageSync] Salvando layers da página ${currentPageId}`)

        // Salvar sem invalidar queries (evita re-render)
        await savePageLayers(currentPageId, design.layers)
        lastSavedLayersRef.current = layersToSave

        // Gerar thumbnail de forma silenciosa (não invalida cache)
        const thumbnail = await generateThumbnail(150)
        if (thumbnail) {
          console.log(`[PageSync] Thumbnail gerado (será salvo em background)`)
          // Salvar thumbnail sem aguardar (fire and forget)
          updatePageThumbnail(currentPageId, thumbnail).catch(err =>
            console.error('[PageSync] Erro ao atualizar thumbnail:', err)
          )
        }
      } catch (_error) {
        console.error('[PageSync] Erro ao salvar layers:', _error)
      }
    }, 3000) // Aumentado para 3 segundos (menos salvamentos)

    return () => clearTimeout(timeoutId)
  }, [design.layers, currentPageId, savePageLayers, generateThumbnail, updatePageThumbnail])

  return <>{children}</>
}
