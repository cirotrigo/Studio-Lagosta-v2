"use client"

import * as React from 'react'
import { RichTextEditorModal } from './modals/rich-text-editor-modal'
import {
  closeRichTextEditor,
  getRichTextEditRequest,
  getRichTextEditServerSnapshot,
  subscribeRichTextEditor,
} from './rich-text-edit-store'

/**
 * Host do editor de Rich Text — precisa ficar na árvore DOM do app (dentro dos
 * providers de query/tema e do TemplateEditorContext), não dentro do Konva.
 */
export function RichTextEditorHost() {
  const request = React.useSyncExternalStore(
    subscribeRichTextEditor,
    getRichTextEditRequest,
    getRichTextEditServerSnapshot,
  )

  if (!request) return null

  return (
    <RichTextEditorModal
      key={request.layer.id}
      open
      onClose={closeRichTextEditor}
      layer={request.layer}
      projectId={request.projectId}
      onSave={request.onSave}
    />
  )
}
