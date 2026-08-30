'use client'

/**
 * Apontar UMA foto do acervo como sugestão de correção.
 *
 * Casca sobre o `GoogleDriveInlineSelector` (o mesmo navegador de Drive do
 * compositor de posts), abrindo na pasta de imagens do PROJETO quando o
 * cadastro tem uma.
 *
 * A escolha é em DOIS tempos de propósito (30/08/2026): tocar na foto
 * seleciona (anel + nome no rodapé) e "Usar esta foto" confirma. A primeira
 * versão fechava sozinha no toque e o Ciro relatou "parece que não recebe a
 * foto" — com a seleção visível e o botão, ou funciona na cara da pessoa, ou
 * o botão apagado DENUNCIA que o toque não selecionou (e aí o problema é do
 * seletor, não um mistério).
 */

import * as React from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

  const [selecionada, setSelecionada] = React.useState<GoogleDriveItem | null>(null)

  // Reabrir começa limpo — a seleção da rodada anterior já foi (ou não) usada.
  React.useEffect(() => {
    if (open) setSelecionada(null)
  }, [open])

  const aoMudarSelecao = React.useCallback((items: GoogleDriveItem[]) => {
    const foto = items[items.length - 1]
    setSelecionada(foto && foto.kind !== 'folder' ? foto : null)
  }, [])

  const confirmar = () => {
    if (!selecionada) return
    onEscolher({ driveFileId: selecionada.id, nome: selecionada.name ?? null })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Apontar foto do acervo</DialogTitle>
          <DialogDescription>
            Toque na foto para selecionar e confirme — a peça é refeita com ela.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {open && (
            <GoogleDriveInlineSelector
              mode="images"
              initialFolderId={projeto?.googleDriveImagesFolderId ?? null}
              initialFolderName={projeto?.googleDriveImagesFolderName ?? null}
              selectedIds={selecionada ? [selecionada.id] : []}
              /*
                2, não 1: o seletor BLOQUEIA o clique quando o limite está
                cheio — com 1, trocar de foto exigiria desmarcar a anterior
                primeiro. Com 2 o clique entra, a redução "a última vence"
                (aoMudarSelecao) fica com a nova, e o selectedIds controlado
                volta a mostrar UMA selecionada.
              */
              maxSelection={2}
              onSelectionChange={aoMudarSelecao}
            />
          )}
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {selecionada
              ? `Selecionada: ${selecionada.name}`
              : 'Nenhuma foto selecionada ainda — toque numa foto.'}
          </span>
          <Button type="button" size="sm" onClick={confirmar} disabled={!selecionada}>
            <Check className="mr-1.5 h-4 w-4" />
            Usar esta foto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
