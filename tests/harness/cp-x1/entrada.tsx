/**
 * Harness do CP-X1 (navegador): monta o CanvasPreview REAL do /gerar-criativo (React +
 * react-konva) e expõe o `exportToDataUrl` dele em `window.__previa`. Sem login, banco,
 * Blob ou rede: a fixture não tem imagem nem fonte de projeto. Empacotado pelo
 * esbuild em previa-real.spec.ts (a variante "base" troca o componente pelo de 6bdc1f77).
 */
import { useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import Konva from 'konva'
import { CanvasPreview, type CanvasPreviewHandle } from '@/components/gerar-criativo/components/canvas-preview'
import type { Layer } from '@/types/template'

export interface Montagem {
  largura: number
  altura: number
  camadas: Layer[]
  selecionado: string | null
  fundo: string
  /** Largura do contêiner em px; ≠ largura da página → o stage fica em escala ≠ 1. */
  larguraDoContainer?: number
}

interface ApiDaPrevia {
  exportar: () => Promise<string>
  camadas: () => Layer[]
  selecionado: () => string | null
}

declare global {
  interface Window {
    __montar: (m: Montagem) => Promise<void>
    __previa: ApiDaPrevia
    Konva: typeof Konva
  }
}

window.Konva = Konva

function Harness({ m }: { m: Montagem }) {
  const ref = useRef<CanvasPreviewHandle>(null)
  const [camadas, setCamadas] = useState<Layer[]>(m.camadas)
  const [selecionado, setSelecionado] = useState<string | null>(m.selecionado)
  const estado = useRef({ camadas, selecionado })
  estado.current = { camadas, selecionado }

  window.__previa = {
    exportar: () => {
      if (!ref.current) throw new Error('CanvasPreview não montado')
      return ref.current.exportToDataUrl('png')
    },
    camadas: () => estado.current.camadas,
    selecionado: () => estado.current.selecionado,
  }

  return (
    <div style={{ width: m.larguraDoContainer ?? m.largura }}>
      <CanvasPreview
        ref={ref}
        layers={camadas}
        selectedLayerId={selecionado}
        onSelectLayer={setSelecionado}
        imageValues={{}}
        textValues={{}}
        hiddenLayerIds={new Set<string>()}
        templateWidth={m.largura}
        templateHeight={m.altura}
        templateBackground={m.fundo}
        onLayerDrag={(id, position) => setCamadas((cs) => cs.map((c) => (c.id === id ? { ...c, position } : c)))}
        onLayerResize={(id, size, position) => setCamadas((cs) => cs.map((c) => (c.id === id ? { ...c, size, position } : c)))}
        projectFonts={[]}
      />
    </div>
  )
}

let root: Root | null = null

window.__montar = (m) =>
  new Promise((resolve) => {
    root?.unmount()
    const el = document.getElementById('raiz') as HTMLElement
    root = createRoot(el)
    root.render(<Harness m={m} />)
    // dois quadros: o React monta, o Konva desenha e o Transformer se prende ao nó selecionado
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
