// Substitui @/contexts/template-editor-context no bundle da validação: o
// componente REAL de camada (KonvaLayerFactory / VideoNode) só precisa do
// `design` e de um no-op. Assim o canvas roda sem login, sem banco e sem Next.
import * as React from 'react'

export const ContextoDaValidacao = React.createContext<{
  design: { canvas: { width: number; height: number; backgroundColor: string }; layers: unknown[] }
  setCroppingLayerId: (id: string | null) => void
} | null>(null)

export const useTemplateEditor = () => React.useContext(ContextoDaValidacao)
