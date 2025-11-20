'use client'

import * as React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useMoveFiles } from '@/hooks/use-drive'
import { toast } from 'sonner'

interface MoveFilesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId?: number | null
  fileIds: string[]
  onSuccess?: () => void
}

export function MoveFilesDialog({ open, onOpenChange, projectId, fileIds, onSuccess }: MoveFilesDialogProps) {
  const [targetFolderId, setTargetFolderId] = React.useState('')
  const mutation = useMoveFiles()

  const disabled = !projectId || !fileIds.length || mutation.isPending

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!projectId || !fileIds.length || !targetFolderId.trim()) return

    try {
      await mutation.mutateAsync({
        projectId,
        fileIds,
        targetFolderId: targetFolderId.trim(),
      })
      toast.success('Arquivos movidos com sucesso!')
      setTargetFolderId('')
      onSuccess?.()
      onOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao mover arquivos'
      toast.error(message)
    }
  }

  React.useEffect(() => {
    if (!open) {
      setTargetFolderId('')
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!mutation.isPending) onOpenChange(next) }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mover arquivos</DialogTitle>
          <DialogDescription>Informe o ID da pasta destino no Google Drive.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label htmlFor="targetFolder" className="text-sm font-medium">
              ID da pasta destino
            </label>
            <Input
              id="targetFolder"
              value={targetFolderId}
              onChange={(event) => setTargetFolderId(event.target.value)}
              placeholder="Ex: 1aBcDEFghIjk"
              disabled={disabled}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={disabled || !targetFolderId.trim()}>
              {mutation.isPending ? 'Movendo...' : `Mover ${fileIds.length} arquivo${fileIds.length > 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
