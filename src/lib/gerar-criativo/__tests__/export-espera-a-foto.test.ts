/**
 * G4.2 · rodada 1 do Codex — o export da prévia do /gerar-criativo não sai com foto faltando. O `CanvasPreview` REAL é
 * montado (host sem DOM) e o `exportToDataUrl` REAL do handle é chamado. Dublês controlados: os componentes do
 * react-konva (o Stage entrega um palco falso cujo `toDataURL` é espiado) e o `useImage` (cada URL num estado:
 * carregando, falhou, entregou a foto de OUTRA URL, pronta). Foto pendente, com erro ou da URL antiga ⇒ o export recusa
 * e o `toDataURL` nem é chamado (o `handleGenerateCreative` só chama o finalize DEPOIS do export). Célula vazia de
 * propósito e camada oculta não esperam. Não prova o navegador nem o Konva real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'

const h = vi.hoisted(() => ({
  imagens: new Map<string, [unknown, string]>(),
  exportados: 0,
}))
vi.mock('react-konva-utils', () => ({ useImage: (src: string) => h.imagens.get(src) ?? [undefined, 'loading'] }))
vi.mock('@/lib/font-manager', () => ({ getFontManager: () => ({ loadDatabaseFont: async () => undefined }) }))
vi.mock('react-konva', async () => {
  const R = await import('react')
  const palco = {
    scaleX: () => 1, scaleY: () => 1, x: () => 0, y: () => 0, scale: () => undefined, position: () => undefined, batchDraw: () => undefined,
    find: () => [], findOne: () => null,
    toDataURL: () => {
      h.exportados++
      return 'data:image/png;base64,AAAA'
    },
  }
  const transformador = { nodes: () => undefined, getLayer: () => null, visible: () => true }
  const filhos = ({ children }: { children?: React.ReactNode }) => R.createElement(R.Fragment, null, children)
  const nada = R.forwardRef(() => null)
  return {
    Stage: R.forwardRef(({ children }: { children?: React.ReactNode }, ref) => {
      R.useImperativeHandle(ref, () => palco)
      return R.createElement(R.Fragment, null, children)
    }),
    Layer: filhos,
    Group: R.forwardRef(({ children }: { children?: React.ReactNode }, _ref) => R.createElement(R.Fragment, null, children)),
    Image: nada, Text: nada, Rect: nada, Line: nada, Shape: nada,
    Transformer: R.forwardRef((_p, ref) => {
      R.useImperativeHandle(ref, () => transformador)
      return null
    }),
  }
})

import type { Layer } from '@/types/template'
import { CanvasPreview, type CanvasPreviewHandle } from '@/components/gerar-criativo/components/canvas-preview'
import { emAct, montar } from '@/lib/grades/__tests__/suporte/host-sem-dom'
import { celula } from '@/lib/grades/__tests__/fixtures'

const BLOB = 'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com'
const A = `${BLOB}/a.jpg`
const B = `${BLOB}/b.jpg`
const g = { id: 'g1', layout: '2-colunas' }
const grade = (fotos: [string, string]) => [
  celula('c0', g, 0, { x: 0, y: 0, w: 535, h: 1350 }, { fileUrl: fotos[0] }),
  celula('c1', g, 1, { x: 545, y: 0, w: 535, h: 1350 }, { fileUrl: fotos[1] }),
]
const pronta = (url: string) => h.imagens.set(url, [{ src: url, width: 1600, height: 1000 }, 'loaded'])

beforeEach(() => {
  // o vitest compila JSX no modo clássico (`React.createElement`) e o componente não importa React (o Next usa o
  // runtime automático): só o harness precisa do global
  vi.stubGlobal('React', React)
  vi.stubGlobal('window', { location: { href: 'http://localhost:3000/gerar-criativo' }, addEventListener: () => undefined, removeEventListener: () => undefined, devicePixelRatio: 1 })
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => setTimeout(() => cb(0), 0))
})
let desmontar: (() => Promise<void>) | null = null
afterEach(async () => {
  await desmontar?.()
  desmontar = null
  h.imagens.clear()
  h.exportados = 0
  vi.unstubAllGlobals()
})

async function exportar(layers: Layer[], opcoes: { trocas?: Record<string, { type: string; url: string }>; ocultas?: string[] } = {}) {
  await desmontar?.()
  desmontar = null
  const ref = React.createRef<CanvasPreviewHandle>()
  const m = await montar(
    React.createElement(CanvasPreview, {
      ref, layers, selectedLayerId: null, onSelectLayer: () => undefined, imageValues: (opcoes.trocas ?? {}) as never, textValues: {},
      hiddenLayerIds: new Set(opcoes.ocultas ?? []), templateWidth: 1080, templateHeight: 1350,
    }),
  )
  desmontar = m.desmontar
  let resultado: { ok: true; valor: string } | { ok: false; erro: string } = { ok: false, erro: 'não rodou' }
  await emAct(async () => {
    try {
      resultado = { ok: true, valor: await ref.current!.exportToDataUrl('png') }
    } catch (e) {
      resultado = { ok: false, erro: (e as Error).message }
    }
  })
  return resultado
}

describe('export da prévia espera a foto da URL atual (G4.2, rodada 1)', () => {
  it('as fotos prontas na URL atual: exporta (toDataURL uma vez)', async () => {
    pronta(A)
    pronta(B)
    expect(await exportar(grade([A, B]))).toEqual({ ok: true, valor: 'data:image/png;base64,AAAA' })
    expect(h.exportados).toBe(1)
  })

  it('foto ainda carregando: recusa citando a camada e NÃO exporta', async () => {
    pronta(A)
    const r = await exportar(grade([A, B]))
    expect(r).toMatchObject({ ok: false })
    expect((r as { erro: string }).erro).toMatch(/ainda não carregou.*Grade · foto 2/)
    expect(h.exportados).toBe(0)
  }, 15_000)

  it('foto que falhou ao carregar: recusa e NÃO exporta', async () => {
    pronta(A)
    h.imagens.set(B, [undefined, 'failed'])
    expect((await exportar(grade([A, B]))).ok).toBe(false)
    expect(h.exportados).toBe(0)
  }, 15_000)

  it('foto trocada pelo assistente com o use-image ainda entregando a da URL ANTERIOR: recusa e NÃO exporta', async () => {
    pronta(A)
    const nova = `${BLOB}/nova.jpg`
    h.imagens.set(nova, [{ src: B, width: 1600, height: 1000 }, 'loaded'])
    expect((await exportar(grade([A, B]), { trocas: { c1: { type: 'upload', url: nova } } })).ok).toBe(false)
    expect(h.exportados).toBe(0)
  }, 15_000)

  it('célula vazia de propósito e camada oculta com foto pendente não esperam: exporta', async () => {
    pronta(A)
    expect((await exportar(grade([A, '']))).ok).toBe(true)
    expect((await exportar(grade([A, B]), { ocultas: ['c1'] })).ok).toBe(true)
    expect(h.exportados).toBe(2)
  })
})

/**
 * Residual da rodada 1: a prontidão era conferida ANTES das esperas do export (quadro + 200 ms). Trocar ou ocultar uma
 * foto nessa janela mudava o Stage, e o finalize gravaria as camadas/fotos do clique com o PNG de outra arte. Agora a
 * identidade das entradas da arte e a prontidão da URL atual são conferidas de novo IMEDIATAMENTE antes do `toDataURL`.
 */
describe('janela entre a prontidão e a captura (residual da rodada 1)', () => {
  type Props = { trocas?: Record<string, { type: string; url: string }>; ocultas?: string[]; selecionada?: string | null }
  async function exportarMudandoNoMeio(layers: Layer[], antes: Props, depois: Props) {
    await desmontar?.()
    desmontar = null
    const ref = React.createRef<CanvasPreviewHandle>()
    const elemento = (p: Props) =>
      React.createElement(CanvasPreview, {
        ref, layers, selectedLayerId: p.selecionada ?? null, onSelectLayer: () => undefined, imageValues: (p.trocas ?? {}) as never, textValues: {},
        hiddenLayerIds: new Set(p.ocultas ?? []), templateWidth: 1080, templateHeight: 1350,
      })
    const m = await montar(elemento(antes))
    desmontar = m.desmontar
    // o export começa com tudo pronto; a mudança entra durante a espera do quadro + 200 ms
    const pedido = ref.current!.exportToDataUrl('png').then((valor) => ({ ok: true as const, valor }), (e: Error) => ({ ok: false as const, erro: e.message }))
    await new Promise((r) => setTimeout(r, 60))
    await m.atualizar(elemento(depois))
    return pedido
  }

  it('foto trocada (já pronta na URL nova) depois da prontidão e antes da captura: recusa e NÃO exporta', async () => {
    const nova = `${BLOB}/nova.jpg`
    pronta(A)
    pronta(B)
    pronta(nova)
    const r = await exportarMudandoNoMeio(grade([A, B]), {}, { trocas: { c1: { type: 'upload', url: nova } } })
    expect(r).toMatchObject({ ok: false })
    expect((r as { erro: string }).erro).toMatch(/A arte mudou durante a exportação/)
    expect(h.exportados).toBe(0)
  })

  it('camada ocultada na janela: recusa e NÃO exporta', async () => {
    pronta(A)
    pronta(B)
    expect((await exportarMudandoNoMeio(grade([A, B]), {}, { ocultas: ['c1'] })).ok).toBe(false)
    expect(h.exportados).toBe(0)
  })

  it('controle: só a seleção muda na janela (UI de edição, não a arte): exporta', async () => {
    pronta(A)
    pronta(B)
    expect(await exportarMudandoNoMeio(grade([A, B]), {}, { selecionada: 'c0' })).toEqual({ ok: true, valor: 'data:image/png;base64,AAAA' })
    expect(h.exportados).toBe(1)
  })
})
