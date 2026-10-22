/**
 * Harness do seletor de cor: substitui no bundle `@/contexts/template-editor-context`, `@/contexts/multi-page-context`
 * e `@/hooks/use-brand-colors` (o spec redireciona os três para cá). O `ShapeControls` e o `BrandColorSwatches` são
 * os REAIS. A paleta da marca vem de `window.__paleta`, sem rede.
 */
import * as React from 'react'

export interface CorDaPaleta {
  id: string
  name: string
  hexCode: string
}

declare global {
  interface Window {
    __paleta: CorDaPaleta[]
  }
}

/** O `BrandColorSwatches` lê o `projectId` daqui e o passa ao hook (falso). */
export const TemplateEditorContext = React.createContext<{ projectId?: number } | null>(null)
export function useTemplateEditor() {
  return React.useContext(TemplateEditorContext) as never
}
export function useMultiPage() {
  return null as never
}
export function useMultiPageOpcional() {
  return null
}

export function useBrandColors(projectId: number | null | undefined) {
  return { data: typeof projectId === 'number' && projectId > 0 ? window.__paleta ?? [] : [] }
}
