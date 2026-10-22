/**
 * Harness do CP-X2b (navegador): monta o `PageSyncWrapper` REAL sobre os contextos falsos (`contextos-falsos.tsx`)
 * e o `ShapeControls` REAL do painel (o spec o exporta só no bundle). Expõe `window.__x2b` e `window.__campo`.
 */
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PageSyncWrapper, usePageSync } from '@/components/templates/page-sync-wrapper'
// @ts-expect-error -- o `export { ShapeControls }` é acrescentado só no bundle do harness
import { ShapeControls } from '@/components/templates/properties-panel'
import type { Layer, LayerStyle, Page } from '@/types/template'
import { Bancada, servidor, type ApiDaBancada, type EnvioRegistrado } from './contextos-falsos'

export interface ApiX2b extends ApiDaBancada {
  iniciar: (paginas: Page[], inicial: string) => void
  envios: () => EnvioRegistrado[]
  gravado: (pageId: string) => Page
  descarregar: () => Promise<string | null>
}
export interface ApiDoCampo {
  montar: (layer: Layer) => void
  gravacoes: () => Array<Partial<LayerStyle>>
}
declare global {
  interface Window {
    __x2b: ApiX2b
    __campo: ApiDoCampo
  }
}

let controle: { descarregar: () => Promise<void> } | null = null
function Sonda() {
  controle = usePageSync()
  return null
}

const raiz = createRoot(document.getElementById('editor')!)
window.__x2b = {
  iniciar(paginas, inicial) {
    servidor.paginas = new Map(paginas.map((p) => [p.id, p]))
    servidor.envios = []
    raiz.render(
      <Bancada inicial={inicial} aoPronto={(api) => Object.assign(window.__x2b, api)}>
        <PageSyncWrapper>
          <Sonda />
        </PageSyncWrapper>
      </Bancada>,
    )
  },
  envios: () => servidor.envios.map((e) => ({ ...e })),
  gravado: (pageId) => JSON.parse(JSON.stringify(servidor.paginas.get(pageId))),
  async descarregar() {
    try {
      await controle!.descarregar()
      return null
    } catch (erro) {
      return erro instanceof Error ? erro.message : String(erro)
    }
  },
} as ApiX2b

const gravacoes: Array<Partial<LayerStyle>> = []
function CampoDeTeste({ inicial }: { inicial: Layer }) {
  const [layer, setLayer] = React.useState(inicial)
  return (
    <ShapeControls
      layer={layer}
      setStyleValue={(_l: Layer, style: Partial<LayerStyle>) => {
        gravacoes.push(style)
        setLayer((atual) => ({ ...atual, style: { ...atual.style, ...style } }))
      }}
    />
  )
}
const raizDoCampo = createRoot(document.getElementById('campo')!)
window.__campo = {
  montar(layer) {
    gravacoes.length = 0
    raizDoCampo.render(
      <QueryClientProvider client={new QueryClient()}>
        <CampoDeTeste key={`${layer.id}-${Math.random()}`} inicial={layer} />
      </QueryClientProvider>,
    )
  },
  gravacoes: () => gravacoes.map((g) => ({ ...g })),
}
