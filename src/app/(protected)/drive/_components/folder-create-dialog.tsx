'use client'

import * as React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useCreateFolder } from '@/hooks/use-drive'
import type { DriveFolderType } from '@/types/drive'
import { toast } from 'sonner'

interface FolderCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId?: number | null
  folderType: DriveFolderType
  parentId?: string | null
}

export function FolderCreateDialog({ open, onOpenChange, projectId, folderType, parentId }: FolderCreateDialogProps) {
  const [name, setName] = React.useState('')
  const mutation = useCreateFolder()

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!name.trim() || !projectId) return
    try {
      await mutation.mutateAsync({
        name: name.trim(),
        projectId,
        parentId: parentId ?? undefined,
        folderType,
      })
      toast.success('Pasta criada com sucesso!')
      setName('')
      onOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao criar pasta'
      toast.error(message)
    }
  }

  const disabled = !projectId || mutation.isPending

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!mutation.isPending) onOpenChange(next) }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova pasta</DialogTitle>
          <DialogDescription>Informe o nome para criar uma nova pasta no Google Drive.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="folder-name">Nome da pasta</Label>
            <Input
              id="folder-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex: Fotos campanha"
              disabled={disabled}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" type="button" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={disabled || !name.trim()}>
              {mutation.isPending ? 'Criando...' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
