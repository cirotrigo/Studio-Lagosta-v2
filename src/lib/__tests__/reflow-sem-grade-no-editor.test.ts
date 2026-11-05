/**
 * G4.4 · rodada 1 do Codex — o laço REAL do texto auto-expandido do editor. Monta o `KonvaEditableText` real dentro do
 * `TemplateEditorProvider` real (host sem DOM do G1): o efeito de autoexpansão mede num `Konva.Text` REAL (canvas do
 * Node, preparado pelo suporte `konva-no-node`), grava a altura pelo `updateLayer` real e empurra os irmãos do grupo.
 * Dublê só no react-konva: o `<Text>` entrega ao `shapeRef` um `Konva.Text` real com as props que o componente passa
 * (os outros nós não desenham). Cenário: uma célula de grade que divide o groupId com o texto (dado colado/legado,
 * de antes do G4) — ela não se move nem é tentada; o texto e a foto avulsa do mesmo grupo seguem fluindo.
 * Não prova o navegador, o stage montado nem a fonte do projeto (Arial do canvas do Node).
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import * as React from 'react'

const h = vi.hoisted(() => ({
  paginas: { data: [] as unknown[], isLoading: false, refetch: () => undefined },
  toasts: [] as Array<{ description?: string }>,
}))
vi.mock('@/hooks/use-pages', () => ({ usePages: () => h.paginas, useUpdatePage: () => ({ mutateAsync: async () => undefined }) }))
vi.mock('@/hooks/use-toast', () => {
  const toast = (t: { description?: string }) => void h.toasts.push(t)
  return { toast, useToast: () => ({ toast }) }
})
// o pacote `konva` no Node exige o `canvas` (não instalado); as internas são as mesmas do navegador
vi.mock('konva', async () => ({ default: (await import('konva/lib/_FullInternals')).Konva }))
vi.mock('react-konva', async () => {
  const R = await import('react')
  const { Konva } = await import('konva/lib/_FullInternals')
  const atributos = (props: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(props).filter(([k, v]) => typeof v !== 'function' && k !== 'children' && k !== 'key'))
  const filhos = R.forwardRef(({ children }: { children?: React.ReactNode }, _ref) => R.createElement(R.Fragment, null, children))
  return {
    Text: R.forwardRef((props: Record<string, unknown>, ref) => {
      const no = R.useMemo(() => new Konva.Text(), [])
      no.setAttrs(atributos(props))
      R.useImperativeHandle(ref, () => no)
      return null
    }),
    Rect: R.forwardRef(() => null),
    Path: R.forwardRef(() => null),
    Group: filhos,
  }
})

import { Shape } from 'konva/lib/Shape'
import type { DesignData, Layer, Page } from '@/types/template'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MultiPageProvider } from '@/contexts/multi-page-context'
import { TemplateEditorProvider, useTemplateEditor, type TemplateEditorContextValue, type TemplateResource } from '@/contexts/template-editor-context'
import { KonvaEditableText } from '@/components/templates/konva-editable-text'
import { pixelsDoNoKonva } from '@/lib/vetor/__tests__/suporte/konva-no-node'
import { emAct, montar } from '@/lib/grades/__tests__/suporte/host-sem-dom'
import { celula } from '@/lib/grades/__tests__/fixtures'

beforeAll(() => {
  // o suporte troca o canvas do Konva pelo do @napi-rs/canvas na primeira chamada; o Konva.Text mede nele
  pixelsDoNoKonva(1, 1, '#ffffff', () => new Shape({}))
  // o fundo do texto espera um quadro (requestAnimationFrame não existe no Node)
  globalThis.requestAnimationFrame ??= ((cb: (t: number) => void) => setTimeout(() => cb(0), 0) as unknown as number) as typeof requestAnimationFrame
  globalThis.cancelAnimationFrame ??= ((id: number) => clearTimeout(id)) as typeof cancelAnimationFrame
})

const BLOB = 'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com'
const GRUPO = 'grupo-legado'
const topo = {
  id: 'topo', type: 'text', name: 'Topo', visible: true, locked: false, order: 0, position: { x: 100, y: 100 }, size: { width: 600, height: 40 },
  content: 'Primeira linha\nSegunda linha\nTerceira linha', style: { fontSize: 24, lineHeight: 1.2, fontFamily: 'Arial' },
  textboxConfig: { anchor: 'top', autoWrap: { autoExpand: true, lineHeight: 1.2, breakMode: 'word' } }, metadata: { groupId: GRUPO },
} as unknown as Layer
const rodape = { id: 'rodape', type: 'text', name: 'Rodapé', visible: true, locked: false, order: 1, position: { x: 100, y: 300 }, size: { width: 600, height: 40 }, content: 'Rodapé', style: { fontSize: 20 }, metadata: { groupId: GRUPO } } as unknown as Layer
const avulsa = { id: 'avulsa', type: 'image', name: 'Foto', visible: true, locked: false, order: 2, position: { x: 100, y: 400 }, size: { width: 300, height: 200 }, fileUrl: `${BLOB}/f.jpg`, style: { objectFit: 'cover' }, metadata: { groupId: GRUPO } } as unknown as Layer
/** Célula de grade com o groupId do grupo do texto (o Cmd+G de antes do G4 fazia isso) */
const cel = { ...celula('c0', { id: 'g1', layout: '1-celula', caixa: { x: 100, y: 700, w: 400, h: 300 } }, 0, { x: 100, y: 700, w: 400, h: 300 }, { fileUrl: `${BLOB}/c.jpg` }) }
cel.metadata = { ...cel.metadata, groupId: GRUPO }

const sonda: { ctx: TemplateEditorContextValue | null } = { ctx: null }
const shapeRef = React.createRef<import('konva/lib/shapes/Text').Text>()
const nada = () => undefined
const comuns = { id: 'topo', x: 100, y: 100, rotation: 0, opacity: 1, draggable: true, listening: true, onClick: nada, onTap: nada, onMouseDown: nada, onTouchStart: nada, onDragEnd: nada, onDragStart: nada, onDragMove: nada, onTransformEnd: nada }
function Editor() {
  sonda.ctx = useTemplateEditor()
  const camada = sonda.ctx.design.layers.find((l) => l.id === 'topo')
  if (!camada) return null
  return React.createElement(KonvaEditableText, {
    layer: camada, shapeRef: shapeRef as never, commonProps: comuns as never, borderColor: '#000', borderWidth: 0,
    // o onChange do factory para texto: a atualização vai ao estado pelo updateLayer
    onChange: (u: Partial<Layer>) => sonda.ctx!.updateLayer('topo', (l) => ({ ...l, ...u })),
  })
}

let desmontar: (() => Promise<void>) | null = null
afterEach(async () => {
  await desmontar?.()
  desmontar = null
  h.toasts.length = 0
})

describe('G4.4 · laço real do texto auto-expandido no editor', () => {
  it('o texto cresce: rodapé e foto avulsa do grupo descem o mesmo delta; a célula de grade fica e nem é tentada', async () => {
    const d = { canvas: { width: 1080, height: 1350, backgroundColor: '#ffffff' }, layers: [topo, rodape, avulsa, cel] } as DesignData
    h.paginas = { data: [{ id: 'p1', name: 'p1', width: 1080, height: 1350, layers: d.layers, order: 0 } as unknown as Page], isLoading: false, refetch: () => undefined }
    const t: TemplateResource = { id: 1, name: 'T', type: 'FEED', dimensions: '1080x1350', designData: d, dynamicFields: [], projectId: 5 }
    const m = await montar(
      React.createElement(QueryClientProvider, { client: new QueryClient() },
        React.createElement(MultiPageProvider, { templateId: 1, initialPageId: 'p1' } as React.ComponentProps<typeof MultiPageProvider>,
          React.createElement(TemplateEditorProvider, { template: t } as React.ComponentProps<typeof TemplateEditorProvider>, React.createElement(Editor)))),
    )
    desmontar = m.desmontar
    await emAct(async () => {
      for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0))
    })
    const camada = (id: string) => sonda.ctx!.design.layers.find((l) => l.id === id)!
    // a medida veio do Konva.Text real: três linhas de 24 px × 1,2 + padding 6 dos dois lados
    expect(shapeRef.current!.text()).toBe(topo.content)
    const altura = camada('topo').size!.height
    expect(altura).toBe(Math.ceil(3 * 24 * 1.2 + 12))
    const delta = altura - 40
    expect(delta).toBeGreaterThan(40)
    expect(camada('rodape').position).toEqual({ x: 100, y: 300 + delta })
    expect(camada('avulsa').position).toEqual({ x: 100, y: 400 + delta })
    expect(camada('c0').position).toEqual({ x: 100, y: 700 })
    expect(camada('c0').size).toEqual({ width: 400, height: 300 })
    // nenhuma tentativa de mover a célula (a guarda do updateLayer avisaria a recusa)
    expect(h.toasts).toEqual([])
  })
})
