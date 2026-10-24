/**
 * Harness do CP-V3 (navegador): o `TemplateEditorProvider` REAL, com um `QueryClient` real (o contexto pede), e o
 * `ShapeControls` REAL (o spec o exporta só no bundle) ligado ao `updateLayerStyle` do contexto, como o painel faz. A
 * camada mostrada é a última selecionada, SEM `key` (como no `PropertiesPanel`: trocar a seleção não remonta).
 * Expõe `window.__cp3` (editor ao vivo, troca de template sem remontar, funções puras do bundle para as variantes).
 */
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TemplateEditorProvider, useTemplateEditor, type TemplateResource, type TemplateEditorContextValue } from '@/contexts/template-editor-context'
// @ts-expect-error -- o `export { ShapeControls }` é acrescentado só no bundle do harness
import { ShapeControls } from '@/components/templates/properties-panel'
import * as puro from '@/lib/editor/cores-da-forma'
import type { LayerStyle } from '@/types/template'
import { avisar, recarregarTela, zerarConsultas, type EstadoFalso } from './falsos'

export interface ApiDoCp3 {
  montar: (template: TemplateResource, falsos: Omit<EstadoFalso, 'soltar' | 'releituras' | 'releiturasPor'>) => void
  editor: () => TemplateEditorContextValue
  trocarTemplate: (template: TemplateResource) => void
  falsos: () => EstadoFalso
  avisar: () => void
  recarregarTela: () => void
  soltarReleituras: () => number
  puro: typeof puro
}
declare global {
  interface Window {
    __cp3: ApiDoCp3
  }
}

let editorAtual: TemplateEditorContextValue | null = null
let trocar: ((t: TemplateResource) => void) | null = null

function Painel() {
  const editor = useTemplateEditor()
  editorAtual = editor
  const id = editor.selectedLayerIds.at(-1)
  const layer = editor.design.layers.find((l) => l.id === id)
  if (!layer || layer.type !== 'shape') return <div id="sem-forma" />
  return <ShapeControls layer={layer} setStyleValue={(l: { id: string }, style: LayerStyle) => editor.updateLayerStyle(l.id, style)} />
}

function Raiz({ inicial }: { inicial: TemplateResource }) {
  const [template, setTemplate] = React.useState(inicial)
  const [cliente] = React.useState(() => new QueryClient())
  trocar = setTemplate
  return (
    <QueryClientProvider client={cliente}>
      <TemplateEditorProvider key="fixo" template={template}>
        <Painel />
      </TemplateEditorProvider>
    </QueryClientProvider>
  )
}

const raiz = createRoot(document.getElementById('raiz')!)
window.__cp3 = {
  montar(template, falsos) {
    window.__falsos = { ...falsos, soltar: [], releituras: 0, releiturasPor: { paleta: 0, projeto: 0 } }
    zerarConsultas()
    raiz.render(<Raiz key={Math.random()} inicial={template} />)
  },
  editor: () => editorAtual!,
  trocarTemplate: (t) => trocar?.(t),
  falsos: () => window.__falsos,
  avisar,
  recarregarTela,
  soltarReleituras() {
    const fila = window.__falsos.soltar.splice(0)
    for (const s of fila) s()
    return fila.length
  },
  puro,
}
