/**
 * Harness do seletor de cor: substitui no bundle `@/contexts/template-editor-context`, `@/contexts/multi-page-context`,
 * `@/hooks/use-brand-colors` e `@/hooks/use-project` (o spec redireciona os quatro para cá; o `use-project` desde o CP-V3). O `ShapeControls` e o `BrandColorSwatches` são
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

/** CP-V3: a fileira Marca da forma lê a paleta ESTRITA; aqui ela é a mesma `window.__paleta`, em sucesso. */
export function useBrandColorsEstrita(projectId: number) {
  return { status: 'success' as const, data: { projectId, cores: window.__paleta ?? [] }, refetch: async () => ({ status: 'success' as const, data: { projectId, cores: window.__paleta ?? [] } }) }
}
/** CP-V3: o Reaplicar lê o projeto (só aparece com `style.vetor`, que estas camadas não têm). */
export function useProject(projectId: number | null) {
  return { status: 'success' as const, data: { id: projectId, assinatura: null }, refetch: async () => ({ status: 'success' as const, data: { id: projectId, assinatura: null } }) }
}
