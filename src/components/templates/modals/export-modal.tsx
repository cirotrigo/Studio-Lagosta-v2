"use client"

import * as React from 'react'
import { useTemplateEditor } from '@/contexts/template-editor-context'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Download, Loader2, Trash2, FileImage, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import Image from 'next/image'

interface ExportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Modal de exportação de designs
 *
 * Funcionalidades:
 * - Exportar em PNG ou JPEG
 * - Histórico de últimas 20 exportações
 * - Download individual ou limpar histórico
 * - Preview visual com lightbox
 * - Tamanho de arquivo em KB/MB
 */
export function ExportModal({ open, onOpenChange }: ExportModalProps) {
  const { toast } = useToast()
  const { exportDesign, exportHistory, removeExport, clearExports, isExporting } = useTemplateEditor()
  const [selectedPreview, setSelectedPreview] = React.useState<string | null>(null)

  const handleExport = React.useCallback(
    async (format: 'png' | 'jpeg') => {
      try {
        const record = await exportDesign(format)
        toast({
          title: 'Exportação concluída!',
          description: `Arquivo ${record.fileName} gerado com sucesso (${formatBytes(record.sizeBytes)})`,
        })
      } catch (_error) {
        console.error('Export failed:', error)
        toast({
          title: 'Erro ao exportar',
          description: error instanceof Error ? error.message : 'Não foi possível exportar o design.',
          variant: 'destructive',
        })
      }
    },
    [exportDesign, toast],
  )

  const handleDownload = React.useCallback((record: { dataUrl: string; fileName: string }) => {
    const link = document.createElement('a')
    link.href = record.dataUrl
    link.download = record.fileName
    link.click()
  }, [])

  const handleClearAll = React.useCallback(() => {
    if (confirm('Limpar todo o histórico de exportações?')) {
      clearExports()
      toast({
        title: 'Histórico limpo',
        description: 'Todas as exportações foram removidas.',
      })
    }
  }, [clearExports, toast])

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Exportar Design</DialogTitle>
            <DialogDescription>
              Exporte seu design em alta qualidade (2x pixel ratio). O histórico salva as últimas 20 exportações.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Botões de exportação */}
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => handleExport('png')} disabled={isExporting} className="flex-1">
                {isExporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Exportando...
                  </>
                ) : (
                  <>
                    <FileImage className="mr-2 h-4 w-4" />
                    Exportar PNG
                  </>
                )}
              </Button>
              <Button onClick={() => handleExport('jpeg')} disabled={isExporting} variant="secondary" className="flex-1">
                {isExporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Exportando...
                  </>
                ) : (
                  <>
                    <FileImage className="mr-2 h-4 w-4" />
                    Exportar JPEG
                  </>
                )}
              </Button>
            </div>

            {/* Histórico de exportações */}
            {exportHistory.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Histórico de Exportações ({exportHistory.length}/20)</h3>
                  <Button size="sm" variant="ghost" onClick={handleClearAll}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Limpar tudo
                  </Button>
                </div>

                <ScrollArea className="h-[400px] rounded-lg border border-border/40 bg-muted/20 p-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    {exportHistory.map((record) => (
                      <div key={record.id} className="group relative overflow-hidden rounded-lg border border-border/40 bg-card p-3 shadow-sm transition hover:border-primary/40">
                        {/* Preview */}
                        <div className="relative mb-3 aspect-video w-full cursor-pointer overflow-hidden rounded-md bg-muted" onClick={() => setSelectedPreview(record.dataUrl)}>
                          <Image src={record.dataUrl} alt={record.fileName} fill sizes="300px" className="object-contain" unoptimized />
                        </div>

                        {/* Info */}
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium">{record.fileName}</p>
                              <p className="text-xs text-muted-foreground">
                                {record.width} × {record.height} • {formatBytes(record.sizeBytes)}
                              </p>
                              <p className="text-xs text-muted-foreground">{new Date(record.createdAt).toLocaleString('pt-BR')}</p>
                            </div>
                            <Badge variant="secondary" className="shrink-0">
                              {record.format.toUpperCase()}
                            </Badge>
                          </div>

                          {/* Actions */}
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleDownload(record)} className="flex-1">
                              <Download className="mr-1 h-3 w-3" />
                              Download
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => removeExport(record.id)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {exportHistory.length === 0 && !isExporting && (
              <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 p-8 text-center">
                <FileImage className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Nenhuma exportação ainda</p>
                <p className="text-xs text-muted-foreground">Clique em "Exportar PNG" ou "Exportar JPEG" para começar</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox Preview */}
      {selectedPreview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4" onClick={() => setSelectedPreview(null)}>
          <div className="relative max-h-full max-w-full">
            <Button size="icon" variant="ghost" className="absolute -right-12 top-0 text-white hover:bg-white/10" onClick={() => setSelectedPreview(null)}>
              <X className="h-6 w-6" />
            </Button>
            <Image src={selectedPreview} alt="Preview" width={1200} height={900} className="max-h-[90vh] w-auto object-contain" unoptimized />
          </div>
        </div>
      )}
    </>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
