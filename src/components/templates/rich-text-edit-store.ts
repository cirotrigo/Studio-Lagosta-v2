import type { Layer, RichTextStyle } from '@/types/template'

/**
 * Canal entre a camada rich-text (que vive DENTRO da árvore do Konva) e o
 * modal de edição (que precisa viver na árvore DOM do app).
 *
 * O modal usa TanStack Query (paleta do projeto no seletor de cor), tema e o
 * TemplateEditorContext. Renderizá-lo num `createRoot` avulso — como era antes
 * — o deixava sem NENHUM provider: ao abrir o seletor de cor, o `useQuery`
 * estourava "No QueryClient set", o React derrubava aquela raiz inteira (sem
 * error boundary) e o modal sumia sem avisar ninguém. Como o estado `open`
 * continuava `true` na camada, o duplo-clique não reabria mais nada.
 */

export interface RichTextEditRequest {
  layer: Layer
  projectId: number
  onSave: (content: string, styles: RichTextStyle[]) => void
}

let current: RichTextEditRequest | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function openRichTextEditor(request: RichTextEditRequest): void {
  current = request
  emit()
}

export function closeRichTextEditor(): void {
  if (!current) return
  current = null
  emit()
}

export function subscribeRichTextEditor(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getRichTextEditRequest(): RichTextEditRequest | null {
  return current
}

/** No servidor nunca há modal aberto */
export function getRichTextEditServerSnapshot(): null {
  return null
}
