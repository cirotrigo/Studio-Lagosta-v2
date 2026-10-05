"use client"

import * as React from 'react'
import { relogioDaPagina } from '@/lib/video/relogio-da-pagina'
import { paginaEVideo } from '@/lib/video/camadas-de-video'
import { useMultiPage, type PageStatePatch } from '@/contexts/multi-page-context'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import type { Layer, Page } from '@/types/template'
import { canonicalizeLayersForPersistence } from '@/lib/shape-style'
import { criarAutosave, criarFila, type Autosave } from '@/lib/editor/fila-de-gravacao'

interface PageSyncControle {
  /**
   * Salva AGORA o que o debounce ainda não mandou, depois de esperar o PATCH
   * que já está em voo. Lança se o save falhar — quem sai do editor não pode
   * seguir achando que a edição foi gravada.
   *
   * O "Salvar e Voltar" do modo agenda navega com `router.back()`, e desmontar
   * o editor cancela o timer de 800ms: a edição feita logo antes do clique
   * nunca chegava ao banco, enquanto a tela prometia "imagem será regenerada".
   */
  descarregar: () => Promise<void>
}

/** O que o autosave grava: o PATCH e as serializações que viram "último salvo". */
interface PendenteDaPagina {
  pageId: string
  patch: PageStatePatch
  layersString: string
  canvasString: string
  audioString: string
}

const PageSyncContext = React.createContext<PageSyncControle | null>(null)

/** O controle do autosave da página — `null` fora do editor. */
export function usePageSync(): PageSyncControle | null {
  return React.useContext(PageSyncContext)
}

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
  /**
   * Toda escrita desta página passa por UMA fila: estado (autosave, descarregar,
   * flush), a página que sai na troca e a miniatura. Nunca dois PATCHes em voo,
   * e a miniatura velha não chega depois do estado que a apagou.
   */
  const filaRef = React.useRef(criarFila())
  /** Cresce a cada gravação de estado confirmada: miniatura de antes dela é velha. */
  const versaoGravadaRef = React.useRef(0)
  /** A conferência de miniatura pendente (efeito 1b) já está rodando. */
  const miniaturaEmAndamentoRef = React.useRef(false)
  /**
   * Página cuja miniatura ficou por gerar: com vídeo tocando (ou fora do 0) a
   * captura é recusada, e sem nova tentativa a miniatura ficava velha até a
   * próxima edição. Ela é refeita quando o relógio volta ao quadro de 0.
   */
  const miniaturaPendenteRef = React.useRef<string | null>(null)

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
    // Página-vídeo: a miniatura gravada é da versão anterior, e a nova só sai
    // com o quadro de 0 pronto. Apagá-la NO MESMO PATCH vale para todo
    // salvamento do PageSync (autosave, flush na troca de página, descarregar);
    // a nova volta pelo autosave ou pela nova tentativa.
    if ((layersChanged || canvasChanged) && paginaEVideo(design.layers, design.audio)) patch.thumbnail = null
    return { patch, layersString, canvasString, audioString }
  }, [design.layers, design.canvas.width, design.canvas.height, design.audio, canvasFromDesign, serializeAudio, serializeLayersForPersistence])

  // As funções do contexto mudam de identidade com o estado da mutação (a cada
  // PATCH que sai e volta). Dependência delas no efeito de autosave reagendava
  // o save a cada voo — então elas são lidas por ref, sempre a versão mais nova.
  const atuaisRef = React.useRef({ currentPageId, buildPendingPatch, savePageState, generateThumbnail, updatePageThumbnail })
  React.useLayoutEffect(() => {
    atuaisRef.current = { currentPageId, buildPendingPatch, savePageState, generateThumbnail, updatePageThumbnail }
  })

  /**
   * Grava a miniatura pela fila, e só se nenhuma gravação de estado mais nova
   * aconteceu desde que ela foi capturada (a dessa gravação traz a sua).
   */
  const gravarMiniatura = React.useCallback((pageId: string, thumbnail: string, versao: number) => {
    void filaRef.current
      .enfileirar(async () => {
        if (versaoGravadaRef.current !== versao || lastPageIdRef.current !== pageId) return
        await atuaisRef.current.updatePageThumbnail(pageId, thumbnail)
      })
      .catch((err) => console.error('[PageSync] Erro ao atualizar thumbnail:', err))
  }, [])

  const autosaveRef = React.useRef<Autosave<PendenteDaPagina> | null>(null)
  if (!autosaveRef.current) {
    autosaveRef.current = criarAutosave<PendenteDaPagina>({
      fila: filaRef.current,
      pendente: () => {
        const { currentPageId: pageId, buildPendingPatch: montar } = atuaisRef.current
        // design só pode ser salvo em pageId se foi essa página que o PageSync
        // carregou por último — senão o par (página, design) está desalinhado
        if (!pageId || isSyncingRef.current || lastPageIdRef.current !== pageId) return null
        const pending = montar()
        return pending ? { pageId, ...pending } : null
      },
      enviar: (p) => atuaisRef.current.savePageState(p.pageId, p.patch),
      confirmar: (p) => {
        // Se trocou de página durante o voo, os refs já pertencem à nova página
        if (lastPageIdRef.current !== p.pageId) return
        lastSavedLayersRef.current = p.layersString
        lastSavedCanvasRef.current = p.canvasString
        lastSavedAudioRef.current = p.audioString
        versaoGravadaRef.current++
      },
      aposGravar: (p) => {
        if (lastPageIdRef.current !== p.pageId) return
        const versao = versaoGravadaRef.current
        void (async () => {
          // Gerar thumbnail de forma silenciosa (não invalida cache)
          const thumbnail = await atuaisRef.current.generateThumbnail(150)
          if (lastPageIdRef.current !== p.pageId) return
          // Recusada: o PATCH já apagou a vencida (página-vídeo); o 1b a refaz
          if (!thumbnail) {
            miniaturaPendenteRef.current = p.pageId
            return
          }
          miniaturaPendenteRef.current = null
          gravarMiniatura(p.pageId, thumbnail, versao)
        })().catch((err) => console.error('[PageSync] Erro ao gerar thumbnail:', err))
      },
    })
  }

  // Aba escondida / saindo: pede o save pela mesma fila (o pendente é lido
  // quando a vez chega, depois do PATCH que estiver em voo).
  const flushPendingSave = React.useCallback(() => {
    autosaveRef.current!.salvar().catch((error) => {
      console.error('[PageSync] Erro ao salvar página no flush:', error)
    })
  }, [])

  const descarregar = React.useCallback(async () => {
    await autosaveRef.current!.salvar()
  }, [])

  // O controle é estável e sempre chama a versão mais nova: trocar o valor do
  // contexto a cada tecla re-renderizaria o editor inteiro à toa.
  const descarregarRef = React.useRef(descarregar)
  React.useLayoutEffect(() => {
    descarregarRef.current = descarregar
  }, [descarregar])
  const controle = React.useMemo<PageSyncControle>(
    () => ({ descarregar: () => descarregarRef.current() }),
    [],
  )

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
        // A página que sai deixa de tocar: a próxima abre parada em 0
        relogioDaPagina(previousPageId).zerar()
        // O pendente é capturado AGORA (o design vai ser trocado logo abaixo),
        // mas o envio entra na fila: um PATCH em voo da página que sai, com o
        // estado mais velho, não pode chegar ao servidor depois deste.
        const pending = buildPendingPatch()
        if (pending) {
          void filaRef.current
            .enfileirar(() => savePageState(previousPageId, pending.patch))
            .catch((error) => {
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
          const versao = versaoGravadaRef.current
          const thumbnail = await atuaisRef.current.generateThumbnail(150)
          if (!thumbnail) miniaturaPendenteRef.current = pageIdForThumbnail
          if (thumbnail && lastPageIdRef.current === pageIdForThumbnail) {
            gravarMiniatura(pageIdForThumbnail, thumbnail, versao)
          }
        }, 1000) // Aguardar 1 segundo para garantir que o canvas foi renderizado
      }
    }
  }, [currentPage, currentPageId, buildPendingPatch, canvasFromPage, gravarMiniatura, loadTemplate, savePageState, serializeAudio, serializeLayersForPersistence])

  // 1b. Miniatura recusada (vídeo fora do 0, ou o quadro de 0 ainda não pronto):
  // refaz assim que o quadro inicial estiver pronto. Sem teto de tempo — a
  // conferência é barata (generateThumbnail recusa cedo) e para quando a
  // miniatura sai ou a página deixa de ser a atual. A trava é um REF: com ela
  // local ao efeito, re-executá-lo (as funções do contexto mudam a cada PATCH)
  // abria um intervalo novo enquanto a geração do anterior ainda rodava.
  React.useEffect(() => {
    if (!currentPageId) return
    const relogio = relogioDaPagina(currentPageId)
    const intervalo = setInterval(async () => {
      if (miniaturaEmAndamentoRef.current) return
      if (miniaturaPendenteRef.current !== currentPageId || lastPageIdRef.current !== currentPageId) return
      const e = relogio.estado()
      if (e.tocando || e.t !== 0 || e.modo === 'gravacao') return
      miniaturaEmAndamentoRef.current = true
      try {
        const versao = versaoGravadaRef.current
        const thumbnail = await atuaisRef.current.generateThumbnail(150)
        if (!thumbnail) return
        if (miniaturaPendenteRef.current !== currentPageId || lastPageIdRef.current !== currentPageId) return
        miniaturaPendenteRef.current = null
        gravarMiniatura(currentPageId, thumbnail, versao)
      } finally {
        miniaturaEmAndamentoRef.current = false
      }
    }, 500)
    return () => clearInterval(intervalo)
  }, [currentPageId, gravarMiniatura])

  // 2. Salvar página atual quando o design muda (debounced e otimizado).
  // O timer só PEDE o save: quem grava é a fila, um PATCH por vez, lendo o
  // pendente quando a vez chega. Re-render durante o voo (ou deps que mudam de
  // identidade) não gera outro PATCH com o mesmo conteúdo, e a edição feita
  // durante o voo sai no seguinte, com o estado mais novo.
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

    const timeoutId = setTimeout(() => {
      autosaveRef.current!.salvar().catch((error) => {
        console.error('[PageSync] Erro ao salvar página:', error)
      })
    }, 800)

    return () => clearTimeout(timeoutId)
  }, [design.layers, design.canvas.width, design.canvas.height, design.canvas.backgroundColor, design.audio, currentPageId, buildPendingPatch])

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

  return <PageSyncContext.Provider value={controle}>{children}</PageSyncContext.Provider>
}
