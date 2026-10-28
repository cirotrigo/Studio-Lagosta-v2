/**
 * Entrada da prova H11 do CP-V3 (autosave): REAIS o `QueryProvider` do app, o `MultiPageProvider` (páginas pela API),
 * o `TemplateEditorProvider`, o `PageSyncWrapper` (fila de gravação e PATCH), os hooks `useBrandColorsEstrita` e
 * `useProject`, e o `ShapeControls` (exportado só no bundle). FALSA só a API, atendida no Node pelo `ServidorFalso` do
 * harness do V2d (mesma guarda de vetor e mesma canonização da rota real do PATCH). Sem canvas Konva, sem Clerk.
 */
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryProvider } from '@/components/providers/query-provider'
import { MultiPageProvider, useMultiPage } from '@/contexts/multi-page-context'
import { TemplateEditorProvider, useTemplateEditor, type TemplateResource, type TemplateEditorContextValue } from '@/contexts/template-editor-context'
import { PageSyncWrapper } from '@/components/templates/page-sync-wrapper'
// @ts-expect-error -- o `export { ShapeControls }` é acrescentado só no bundle do harness
import { ShapeControls } from '@/components/templates/properties-panel'
import type { LayerStyle } from '@/types/template'

declare global {
  interface Window {
    __asAbrir: (template: TemplateResource, paginaId: string) => void
    __as?: { editor: TemplateEditorContextValue; paginaAtual: string | null; paginasCarregadas: boolean }
  }
}

function Sonda() {
  const editor = useTemplateEditor()
  const mp = useMultiPage()
  window.__as = { editor, paginaAtual: mp.currentPageId, paginasCarregadas: mp.pages.length > 0 }
  const id = editor.selectedLayerIds.at(-1)
  const layer = editor.design.layers.find((l) => l.id === id)
  if (!layer || layer.type !== 'shape') return <div id="sem-forma" />
  return <ShapeControls layer={layer} setStyleValue={(l: { id: string }, style: LayerStyle) => editor.updateLayerStyle(l.id, style)} />
}

function App({ template, paginaId }: { template: TemplateResource; paginaId: string }) {
  return (
    <QueryProvider>
      <MultiPageProvider templateId={template.id} initialPageId={paginaId}>
        <TemplateEditorProvider key={paginaId} template={template}>
          <PageSyncWrapper>
            <Sonda />
          </PageSyncWrapper>
        </TemplateEditorProvider>
      </MultiPageProvider>
    </QueryProvider>
  )
}

const raiz = createRoot(document.getElementById('app')!)
window.__asAbrir = (template, paginaId) => raiz.render(<App template={template} paginaId={paginaId} />)
