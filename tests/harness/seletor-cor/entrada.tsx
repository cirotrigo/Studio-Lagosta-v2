/**
 * Harness do seletor de cor (navegador): monta o `ShapeControls` REAL do painel (o spec o exporta só no bundle) com
 * um `setStyleValue` espião. Expõe `window.__seletor`.
 */
import * as React from 'react'
import { createRoot } from 'react-dom/client'
// @ts-expect-error -- o `export { ShapeControls }` é acrescentado só no bundle do harness
import { ShapeControls } from '@/components/templates/properties-panel'
import type { Layer, LayerStyle } from '@/types/template'
import { TemplateEditorContext, type CorDaPaleta } from './falsos'

export interface ApiDoSeletor {
  montar: (layer: Layer, paleta: CorDaPaleta[]) => void
  trocarCamada: (layer: Layer) => void
  rerender: () => void
  chamadas: () => Array<Partial<LayerStyle>>
  seletores: () => { preenchimento: string | null; borda: string | null }
  ativos: () => { preenchimento: string[]; borda: string[] }
}
declare global {
  interface Window {
    __seletor: ApiDoSeletor
  }
}

const chamadas: Array<Partial<LayerStyle>> = []
let controle: { trocar: (l: Layer) => void; tique: () => void } | null = null

function Teste({ inicial }: { inicial: Layer }) {
  const [layer, setLayer] = React.useState(inicial)
  const [, setTique] = React.useState(0)
  controle = { trocar: setLayer, tique: () => setTique((n) => n + 1) }
  return (
    <TemplateEditorContext.Provider value={{ projectId: 8 }}>
      <ShapeControls
        layer={layer}
        setStyleValue={(_l: Layer, style: Partial<LayerStyle>) => {
          chamadas.push(style)
          setLayer((atual) => ({ ...atual, style: { ...atual.style, ...style } }))
        }}
      />
    </TemplateEditorContext.Provider>
  )
}

/** Os dois grupos de swatches, na ordem do painel: preenchimento, depois borda. */
function gruposDeSwatches(): Element[] {
  const botoes = [...document.querySelectorAll('#raiz button[aria-label^="Aplicar cor "]')]
  return [...new Set(botoes.map((b) => b.parentElement!))]
}

const raiz = createRoot(document.getElementById('raiz')!)
window.__seletor = {
  montar(layer, paleta) {
    window.__paleta = paleta
    chamadas.length = 0
    raiz.render(<Teste key={Math.random()} inicial={layer} />)
  },
  trocarCamada: (layer) => controle?.trocar(layer),
  rerender: () => controle?.tique(),
  chamadas: () => chamadas.map((c) => ({ ...c })),
  seletores() {
    const [p, b] = [...document.querySelectorAll<HTMLInputElement>('#raiz input[type="color"]')]
    return { preenchimento: p?.value ?? null, borda: b?.value ?? null }
  },
  ativos() {
    const [p, b] = gruposDeSwatches()
    const ativos = (g?: Element) => (g ? [...g.querySelectorAll('button')].filter((x) => x.querySelector('span')).map((x) => x.getAttribute('title') ?? '') : [])
    return { preenchimento: ativos(p), borda: ativos(b) }
  },
}
