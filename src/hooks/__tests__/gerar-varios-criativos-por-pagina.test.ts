/**
 * Smoke de produção, 27/10/2026: com o editor aberto na Feed (1080×1350), "Gerar criativos" de Story + Feed exportou
 * as DUAS em 2160×2700 e a Story saiu cortada. O lote captura `exportDesign` no início e a reusa a cada página; a
 * função lia `design` do render em que nasceu (o da Feed), enquanto o PageSync já tinha posto a Story no editor.
 *
 * Caminho REAL: `MultiPageProvider`, `TemplateEditorProvider`, `PageSyncWrapper` e `useGenerateMultipleCreatives`.
 * Dublês: páginas (`use-pages`), toast, fila de melhoria, a rota de export (`fetch`) e o palco do Konva, cujo
 * `toDataURL` é espiado. Não prova o canvas real nem o arquivo gravado no Blob.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import type { DesignData, Layer, Page } from '@/types/template'

const paginas = vi.hoisted(() => ({ dados: { data: [] as unknown[], isLoading: false, refetch: () => undefined } }))
vi.mock('@/hooks/use-pages', () => ({
  usePages: () => paginas.dados,
  useUpdatePage: () => ({ mutateAsync: async () => undefined }),
}))
vi.mock('@/hooks/use-toast', () => {
  const t = () => ({ id: 't', update: () => undefined, dismiss: () => undefined })
  return { toast: t, useToast: () => ({ toast: t }) }
})
vi.mock('@/stores/improve-queue-store', () => ({ useImproveQueueStore: (sel: (s: unknown) => unknown) => sel({ addJob: () => undefined }) }))

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MultiPageProvider } from '@/contexts/multi-page-context'
import { TemplateEditorProvider, useTemplateEditor, type TemplateEditorContextValue, type TemplateResource } from '@/contexts/template-editor-context'
import { PageSyncWrapper } from '@/components/templates/page-sync-wrapper'
import { useGenerateMultipleCreatives } from '@/hooks/use-generate-multiple-creatives'
import { emAct, montar } from '@/lib/grades/__tests__/suporte/host-sem-dom'

beforeAll(() => {
  globalThis.requestAnimationFrame ??= ((cb: (t: number) => void) => setTimeout(() => cb(0), 0) as unknown as number) as typeof requestAnimationFrame
  globalThis.cancelAnimationFrame ??= ((id: number) => clearTimeout(id)) as typeof cancelAnimationFrame
})

const STORY = { width: 1080, height: 1920 }
const FEED = { width: 1080, height: 1350 }
const caixa = (id: string, h: number) =>
  ({ id, type: 'shape', name: id, visible: true, locked: false, order: 0, position: { x: 0, y: 0 }, size: { width: 1080, height: h }, style: { fill: '#183445' } }) as Layer
const pagina = (id: string, name: string, dim: { width: number; height: number }) =>
  ({ id, name, ...dim, background: '#183445', layers: [caixa(`fundo-${id}`, dim.height)], order: 0, createdAt: '2026-10-27', updatedAt: '2026-10-27' }) as unknown as Page

// ── Palco falso: o que importa é o recorte pedido ao `toDataURL` ─────────────
const recortes: Array<{ width: number; height: number; pixelRatio: number }> = []
const palco = {
  x: () => 0,
  y: () => 0,
  scale: () => undefined,
  position: () => undefined,
  batchDraw: () => undefined,
  findOne: () => undefined,
  toDataURL: (o: { width: number; height: number; pixelRatio: number }) => {
    recortes.push({ width: o.width, height: o.height, pixelRatio: o.pixelRatio })
    return 'data:image/jpeg;base64,AAAA'
  },
}
const enviados: string[] = []

const sonda: { ctx: TemplateEditorContextValue | null; lote: ReturnType<typeof useGenerateMultipleCreatives> | null } = { ctx: null, lote: null }
function Sonda() {
  sonda.ctx = useTemplateEditor()
  sonda.lote = useGenerateMultipleCreatives()
  return null
}

let desmontar: (() => Promise<void>) | null = null
afterEach(async () => {
  await desmontar?.()
  desmontar = null
  recortes.length = 0
  enviados.length = 0
  vi.unstubAllGlobals()
})

describe('Gerar criativos de várias páginas: cada uma no tamanho DELA', () => {
  it('editor aberto na Feed, lote Story + Feed: a Story sai 1080×1920 e a Feed 1080×1350 (pixelRatio 2), e o editor volta para a Feed', async () => {
    paginas.dados = { data: [pagina('p1', 'Pag.01', STORY), pagina('p3', 'Pagina3', FEED)], isLoading: false, refetch: () => undefined }
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      if (url !== '/api/templates/546/export') throw new Error(`rede bloqueada no teste: ${url}`)
      enviados.push(JSON.parse(String(init.body)).fileName)
      return new Response(JSON.stringify({ generation: { id: `gen-${enviados.length}`, resultUrl: 'https://x/y.jpg' } }), { status: 200 })
    })
    const t: TemplateResource = { id: 546, name: 'T', type: 'STORY', dimensions: '1080x1350', designData: { canvas: { ...FEED, backgroundColor: '#183445' }, layers: [] } as DesignData, dynamicFields: [], projectId: 8 }
    const m = await montar(
      React.createElement(
        QueryClientProvider,
        { client: new QueryClient() },
        React.createElement(
          MultiPageProvider,
          { templateId: 546, initialPageId: 'p3' } as React.ComponentProps<typeof MultiPageProvider>,
          React.createElement(TemplateEditorProvider, { template: t } as React.ComponentProps<typeof TemplateEditorProvider>, React.createElement(PageSyncWrapper, null, React.createElement(Sonda))),
        ),
      ),
    )
    desmontar = m.desmontar
    await emAct(() => new Promise((r) => setTimeout(r, 20)))
    expect(sonda.ctx!.design.canvas).toMatchObject(FEED) // a UI está na Feed, como no smoke
    await emAct(() => sonda.ctx!.setStageInstance(palco as never))

    // Como no navegador: o lote corre e o React aplica a troca de página (e o PageSync carrega a Story) durante as
    // esperas dele, não só no fim
    let fim = false
    await emAct(() => {
      void sonda.lote!.generateMultiple(['p1', 'p3']).finally(() => (fim = true))
    })
    for (let i = 0; i < 100 && !fim; i++) await emAct(() => new Promise((r) => setTimeout(r, 25)))
    expect(fim).toBe(true)

    expect(recortes).toEqual([
      { ...STORY, pixelRatio: 2 },
      { ...FEED, pixelRatio: 2 },
    ])
    expect(enviados).toEqual([expect.stringMatching(/_Pag\.01\.jpg$/), expect.stringMatching(/_Pagina3\.jpg$/)])
    expect(sonda.ctx!.exportHistory.map((e) => [e.width, e.height])).toEqual([
      [FEED.width, FEED.height],
      [STORY.width, STORY.height],
    ])
    await emAct(() => new Promise((r) => setTimeout(r, 20)))
    expect(sonda.ctx!.design.canvas).toMatchObject(FEED)
  }, 15_000)
})
