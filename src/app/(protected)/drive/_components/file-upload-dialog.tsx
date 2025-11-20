'use client'

import * as React from 'react'
import { useDropzone } from 'react-dropzone'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { UploadCloud, FileIcon, X } from 'lucide-react'
import { useUploadFiles } from '@/hooks/use-drive'
import { toast } from 'sonner'

interface FileUploadDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId?: number | null
  folderId?: string | null
}

export function FileUploadDialog({ open, onOpenChange, projectId, folderId }: FileUploadDialogProps) {
  const [files, setFiles] = React.useState<File[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const uploadMutation = useUploadFiles()

  const disabled = !projectId || !folderId || uploadMutation.isPending

  const onDrop = React.useCallback((accepted: File[]) => {
    setFiles((prev) => [...prev, ...accepted])
    setError(null)
  }, [])

  const { getRootProps, getInputProps, isDragActive, open: openFileDialog } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    disabled,
  })

  const handleRemove = React.useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleUpload = async () => {
    if (!projectId || !folderId || !files.length) {
      setError('Selecione ao menos um arquivo')
      return
    }

    try {
      await uploadMutation.mutateAsync({ files, folderId, projectId })
      toast.success('Upload iniciado com sucesso!')
      setFiles([])
      setError(null)
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao enviar arquivos'
      setError(message)
      toast.error(message)
    }
  }

  React.useEffect(() => {
    if (!open) {
      setFiles([])
      setError(null)
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!uploadMutation.isPending) onOpenChange(next) }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload de arquivos</DialogTitle>
          <DialogDescription>Arraste arquivos ou selecione do seu computador para enviar ao Google Drive.</DialogDescription>
        </DialogHeader>
        <div {...getRootProps()} className="relative flex flex-col gap-3 rounded-2xl border border-dashed border-border/70 bg-muted/30 p-6 text-center">
          <input {...getInputProps()} />
          <UploadCloud className="mx-auto h-10 w-10 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            {isDragActive ? 'Solte os arquivos aqui' : 'Arraste arquivos ou clique abaixo para selecionar'}
          </div>
          <Button type="button" variant="secondary" onClick={openFileDialog} disabled={disabled}>
            Escolher arquivos
          </Button>
        </div>
        <ScrollArea className="max-h-60 rounded-xl border border-border/60 bg-card/70 p-3">
          {files.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">Nenhum arquivo selecionado.</p>
          ) : (
            <div className="space-y-2">
              {files.map((file, index) => (
                <div key={`${file.name}-${index}`} className="flex items-center justify-between rounded-lg border border-border/40 bg-background/60 px-3 py-2 text-sm">
                  <div className="flex flex-col gap-0.5 text-left">
                    <div className="flex items-center gap-2">
                      <FileIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{file.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => handleRemove(index)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        {error && <Badge variant="destructive">{error}</Badge>}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={uploadMutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleUpload} disabled={disabled || !files.length}>
            {uploadMutation.isPending ? 'Enviando...' : 'Iniciar upload'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
