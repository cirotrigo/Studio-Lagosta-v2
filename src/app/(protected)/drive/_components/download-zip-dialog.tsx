'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

interface DownloadZipDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isDownloading: boolean
  progress: { current: number; total: number }
  error?: string | null
  onCancel: () => void
}

export function DownloadZipDialog({ open, onOpenChange, isDownloading, progress, error, onCancel }: DownloadZipDialogProps) {
  const percent = progress.total ? Math.round((progress.current / progress.total) * 100) : 0
  const completed = percent >= 100 && !isDownloading && !error

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!isDownloading) onOpenChange(next) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Preparando download</DialogTitle>
          <DialogDescription>Estamos comprimindo os arquivos selecionados em um único ZIP.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Progress value={percent} />
            <p className="text-sm text-muted-foreground">
              {progress.total ? `${progress.current} de ${progress.total} arquivos` : 'Preparando arquivos...'}
            </p>
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
          {completed && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/50 bg-emerald-500/5 p-3 text-sm text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              Download concluído
            </div>
          )}
        </div>
        <DialogFooter>
          {isDownloading ? (
            <Button variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
