"use client"

import * as React from 'react'
import { useMultiPage, type PageStatePatch } from '@/contexts/multi-page-context'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import type { Layer, Page } from '@/types/template'
import { canonicalizeLayersForPersistence } from '@/lib/shape-style'

/**
 * Componente que sincroniza o estado entre MultiPageContext e TemplateEditorContext
 * - Carrega layers + canvas da página atual quando ela muda
 * - Salva layers + canvas (width/height/background) da página atual quando o design muda
 *   sempre num PATCH único (dois writers na mesma página competiriam entre si)
 */
export function PageSyncWrapper({ children }: { children: React.ReactNode }) {
  const { currentPage, currentPageId, savePageState, updatePageThumbnail } = useMultiPage()
  const { design, loadTemplate, generateThumbnail } = useTemplateEditor()

  const lastPageIdRef = React.useRef<string | null>(null)
  const isSyncingRef = React.useRef(false)
  const lastSavedLayersRef = React.useRef<string>('')
  const lastSavedCanvasRef = React.useRef<string>('')
  const lastSavedAudioRef = React.useRef<string>('')

  // Trilha da página (aba Músicas). null e undefined são o mesmo estado ("sem
  // trilha") — normalizar para não gerar PATCH por falso diff.
  const serializeAudio = React.useCallback(
    (audio: Page['audio'] | undefined) => JSON.stringify(audio ?? null),
    [],
  )

  const serializeLayersForPersistence = React.useCallback((layers: Layer[]) => {
    return JSON.stringify(canonicalizeLayersForPersistence(layers as unknown[]))
  }, [])

  // Canvas persistido na Page: width/height/background. O background pode ser
  // null no banco e undefined no design — normalizar para comparar sem falso diff
  const serializeCanvas = React.useCallback(
    (width: number, height: number, background: string | null | undefined) => {
      return `${width}x${height}|${background ?? ''}`
    },
    [],
  )

  const canvasFromPage = React.useCallback(
    (page: Page) => serializeCanvas(page.width, page.height, page.background ?? null),
    [serializeCanvas],
  )

  const canvasFromDesign = React.useCallback(
    () => serializeCanvas(design.canvas.width, design.canvas.height, design.canvas.backgroundColor ?? null),
    [design.canvas.width, design.canvas.height, design.canvas.backgroundColor, serializeCanvas],
  )

  // Monta o PATCH único com o que realmente mudou (layers e/ou canvas).
  // Devolve null quando não há nada para salvar.
  const buildPendingPatch = React.useCallback((): { patch: PageStatePatch; layersString: string; canvasString: string; audioString: string } | null => {
    const layersString = serializeLayersForPersistence(design.layers)
    const canvasString = canvasFromDesign()
    const audioString = serializeAudio(design.audio)

    const layersChanged = layersString !== lastSavedLayersRef.current
    const canvasChanged = canvasString !== lastSavedCanvasRef.current
    const audioChanged = audioString !== lastSavedAudioRef.current

    if (!layersChanged && !canvasChanged && !audioChanged) return null

    const patch: PageStatePatch = {}
    if (layersChanged) patch.layers = design.layers
    if (canvasChanged) {
      patch.width = design.canvas.width
      patch.height = design.canvas.height
      // O PATCH não aceita null — background só entra quando é string.
      // (Limpar o fundo grava a string 'transparent', nunca null.)
      if (typeof design.canvas.backgroundColor === 'string') {
        patch.background = design.canvas.backgroundColor
      }
    }
    // Trilha entra no MESMO PATCH (nunca dois writers na mesma página);
    // null explícito limpa a coluna no banco.
    if (audioChanged) patch.audio = design.audio ?? null
    return { patch, layersString, canvasString, audioString }
  }, [design.layers, design.canvas.width, design.canvas.height, design.audio, canvasFromDesign, serializeAudio, serializeLayersForPersistence])

  const flushPendingSave = React.useCallback(() => {
    if (!currentPageId || isSyncingRef.current) {
      return
    }

    // design só pode ser salvo em currentPageId se foi essa página que o PageSync
    // carregou por último — caso contrário o par (página, design) está desalinhado
    if (lastPageIdRef.current !== currentPageId) {
      return
    }

    const pending = buildPendingPatch()
    if (!pending) return

    void savePageState(currentPageId, pending.patch)
      .then(() => {
        if (lastPageIdRef.current === currentPageId) {
          lastSavedLayersRef.current = pending.layersString
          lastSavedCanvasRef.current = pending.canvasString
          lastSavedAudioRef.current = pending.audioString
        }
      })
      .catch((error) => {
        console.error('[PageSync] Erro ao salvar página no flush:', error)
      })
  }, [currentPageId, buildPendingPatch, savePageState])

  // 1. Carregar layers quando a página atual muda
  React.useEffect(() => {
    if (!currentPage || isSyncingRef.current) {
      return
    }

    // Apenas atualizar se a página realmente mudou
    if (lastPageIdRef.current !== currentPageId) {
      // Edições da página anterior ainda não persistidas (debounce de 800ms em voo)
      // eram descartadas na troca — salvar antes de carregar a nova página
      const previousPageId = lastPageIdRef.current
      if (previousPageId) {
        const pending = buildPendingPatch()
        if (pending) {
          void savePageState(previousPageId, pending.patch).catch((error) => {
            console.error('[PageSync] Erro ao salvar página anterior:', error)
          })
        }
      }

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
          audio: currentPage.audio ?? null,
        },
        // name: currentPage.name, // ❌ NÃO PASSAR - isso sobrescreve o nome do template
        markDirty: false, // trocar/carregar página não é edição do usuário
        historyKey: currentPageId ?? undefined, // undo por página sobrevive à navegação
      })

      lastSavedLayersRef.current = serializeLayersForPersistence((currentPage.layers as Layer[]) || [])
      lastSavedCanvasRef.current = canvasFromPage(currentPage)
      lastSavedAudioRef.current = serializeAudio(currentPage.audio)

      lastPageIdRef.current = currentPageId

      // Reset flag após um frame
      requestAnimationFrame(() => {
        isSyncingRef.current = false
      })

      // Se a página não tem thumbnail, gerar um após carregar
      if (!currentPage.thumbnail) {
        const pageIdForThumbnail = currentPageId
        setTimeout(async () => {
          // Se o usuário trocou de página durante a espera, o stage mostra outra página —
          // gerar agora salvaria o thumbnail errado
          if (lastPageIdRef.current !== pageIdForThumbnail) return
          const thumbnail = await generateThumbnail(150)
          if (thumbnail && lastPageIdRef.current === pageIdForThumbnail) {
            updatePageThumbnail(pageIdForThumbnail, thumbnail).catch(err =>
              console.error('[PageSync] Erro ao gerar thumbnail inicial:', err)
            )
          }
        }, 1000) // Aguardar 1 segundo para garantir que o canvas foi renderizado
      }
    }
  }, [currentPage, currentPageId, buildPendingPatch, canvasFromPage, loadTemplate, generateThumbnail, savePageState, serializeLayersForPersistence, updatePageThumbnail])

  // 2. Salvar página atual quando o design muda (debounced e otimizado)
  React.useEffect(() => {
    if (!currentPageId || isSyncingRef.current) {
      return
    }

    // Só salvar se o design em memória corresponde à página atual (foi ela que o efeito 1
    // carregou por último). Sem isso, no mount/transições o design ainda é de outra página
    // (ou do designData do template) e o save gravaria na página errada.
    if (lastPageIdRef.current !== currentPageId) {
      return
    }

    // Verificar se algo realmente mudou (evitar saves desnecessários)
    if (!buildPendingPatch()) {
      return
    }

    const timeoutId = setTimeout(async () => {
      try {
        if (lastPageIdRef.current !== currentPageId) {
          return
        }

        // Verificar novamente (pode ter mudado durante o debounce)
        const pending = buildPendingPatch()
        if (!pending) {
          return
        }

        // Salvar sem invalidar queries (evita re-render)
        await savePageState(currentPageId, pending.patch)

        // Se trocou de página durante o await, os refs já pertencem à nova página
        // e o stage mostra outro conteúdo — não sobrescrever nem gerar thumbnail
        if (lastPageIdRef.current !== currentPageId) {
          return
        }
        lastSavedLayersRef.current = pending.layersString
        lastSavedCanvasRef.current = pending.canvasString
        lastSavedAudioRef.current = pending.audioString

        // Gerar thumbnail de forma silenciosa (não invalida cache)
        const thumbnail = await generateThumbnail(150)
        if (thumbnail && lastPageIdRef.current === currentPageId) {
          // Salvar thumbnail sem aguardar (fire and forget)
          updatePageThumbnail(currentPageId, thumbnail).catch(err =>
            console.error('[PageSync] Erro ao atualizar thumbnail:', err)
          )
        }
      } catch (_error) {
        console.error('[PageSync] Erro ao salvar página:', _error)
      }
    }, 800)

    return () => clearTimeout(timeoutId)
  }, [design.layers, design.canvas.width, design.canvas.height, design.canvas.backgroundColor, design.audio, currentPageId, buildPendingPatch, savePageState, generateThumbnail, updatePageThumbnail])

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingSave()
      }
    }

    window.addEventListener('beforeunload', flushPendingSave)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('beforeunload', flushPendingSave)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [flushPendingSave])

  return <>{children}</>
}
