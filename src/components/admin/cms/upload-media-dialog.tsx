'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, X, File, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUploadMedia } from '@/hooks/admin/use-admin-media'
import { useToast } from '@/hooks/use-toast'

type UploadMediaDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UploadMediaDialog({
  open,
  onOpenChange,
}: UploadMediaDialogProps) {
  const { toast } = useToast()
  const uploadMutation = useUploadMedia()

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [alt, setAlt] = useState('')
  const [caption, setCaption] = useState('')
  const [folder, setFolder] = useState('images')

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setSelectedFile(acceptedFiles[0])
      // Auto-fill alt text from filename
      const filename = acceptedFiles[0].name.split('.')[0]
      setAlt(filename)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'],
      'video/*': ['.mp4', '.webm', '.mov'],
      'application/pdf': ['.pdf'],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
  })

  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        title: 'Erro',
        description: 'Selecione um arquivo para fazer upload',
        variant: 'destructive',
      })
      return
    }

    try {
      await uploadMutation.mutateAsync({
        file: selectedFile,
        folder,
        alt: alt || undefined,
        caption: caption || undefined,
      })

      toast({
        title: 'Upload concluído',
        description: 'O arquivo foi enviado com sucesso.',
      })

      // Reset form
      setSelectedFile(null)
      setAlt('')
      setCaption('')
      setFolder('images')
      onOpenChange(false)
    } catch (_error) {
      toast({
        title: 'Erro no upload',
        description: 'Não foi possível fazer upload do arquivo.',
        variant: 'destructive',
      })
    }
  }

  const handleRemoveFile = () => {
    setSelectedFile(null)
    setAlt('')
    setCaption('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Upload de Mídia</DialogTitle>
          <DialogDescription>
            Faça upload de imagens, vídeos ou documentos (máx. 10MB)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Dropzone */}
          {!selectedFile ? (
            <div
              {...getRootProps()}
              className={`cursor-pointer rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
                isDragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <p className="mb-2 text-sm font-medium">
                {isDragActive
                  ? 'Solte o arquivo aqui'
                  : 'Arraste um arquivo ou clique para selecionar'}
              </p>
              <p className="text-xs text-muted-foreground">
                PNG, JPG, GIF, WebP, SVG, MP4, WebM, PDF (máx. 10MB)
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border p-4">
              <File className="h-10 w-10 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRemoveFile}
                disabled={uploadMutation.isPending}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Folder Selection */}
          <div className="space-y-2">
            <Label htmlFor="folder">Pasta</Label>
            <Select value={folder} onValueChange={setFolder}>
              <SelectTrigger id="folder">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="images">Imagens</SelectItem>
                <SelectItem value="videos">Vídeos</SelectItem>
                <SelectItem value="documents">Documentos</SelectItem>
                <SelectItem value="other">Outros</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Alt Text */}
          <div className="space-y-2">
            <Label htmlFor="alt">Texto Alternativo</Label>
            <Input
              id="alt"
              placeholder="Descrição da imagem"
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              disabled={uploadMutation.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Importante para acessibilidade e SEO
            </p>
          </div>

          {/* Caption */}
          <div className="space-y-2">
            <Label htmlFor="caption">Legenda (opcional)</Label>
            <Input
              id="caption"
              placeholder="Legenda da imagem"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              disabled={uploadMutation.isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={uploadMutation.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleUpload}
            disabled={!selectedFile || uploadMutation.isPending}
          >
            {uploadMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
