'use client'

/**
 * Apontar UMA foto do acervo como sugestão de correção.
 *
 * Casca fina sobre o `GoogleDriveInlineSelector` (o mesmo navegador de Drive
 * do compositor de posts): abre na pasta de imagens do PROJETO quando o
 * cadastro tem uma, seleção única, e escolher JÁ resolve — o clique na foto
 * fecha o diálogo e devolve `{driveFileId, nome}` para quem chamou gravar no
 * pedido. Sem botão de confirmar: apontar é a ação inteira.
 */

import * as React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { GoogleDriveInlineSelector } from '@/components/posts/google-drive-inline-selector'
import { useProject } from '@/hooks/use-project'
import type { GoogleDriveItem } from '@/types/google-drive'
import type { FotoSugerida } from '@/lib/aprendizado/feedback-de-arte'

interface Props {
  projectId: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onEscolher: (foto: FotoSugerida) => void
}

export function SugerirFotoDialog({ projectId, open, onOpenChange, onEscolher }: Props) {
  // Só consulta o projeto com o diálogo aberto — a barra de feedback monta em
  // toda arte da agenda e não pode custar uma ida por card.
  const { data: projeto } = useProject(open ? projectId : null)

  const escolher = React.useCallback(
    (items: GoogleDriveItem[]) => {
      const foto = items[items.length - 1]
      if (!foto || foto.kind === 'folder') return
      onEscolher({ driveFileId: foto.id, nome: foto.name ?? null })
      onOpenChange(false)
    },
    [onEscolher, onOpenChange],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Apontar foto do acervo</DialogTitle>
          <DialogDescription>
            A foto escolhida entra no pedido de correção — a peça é refeita com ela.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-y-auto">
          {open && (
            <GoogleDriveInlineSelector
              mode="images"
              initialFolderId={projeto?.googleDriveImagesFolderId ?? null}
              initialFolderName={projeto?.googleDriveImagesFolderName ?? null}
              selectedIds={[]}
              maxSelection={1}
              onSelectionChange={escolher}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
