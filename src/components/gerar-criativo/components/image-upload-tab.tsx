'use client'

import { useState, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Upload, Loader2, Camera } from 'lucide-react'
import { toast } from 'sonner'

interface ImageUploadTabProps {
  projectId: number
  onImageSelected: (url: string, pathname?: string) => void
}

export function ImageUploadTab({ projectId, onImageSelected }: ImageUploadTabProps) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Failed to upload file')
      }

      return response.json() as Promise<{ url: string; pathname: string }>
    },
    onSuccess: (data) => {
      onImageSelected(data.url, data.pathname)
      toast.success('Imagem enviada com sucesso!')
    },
    onError: (error) => {
      console.error('Upload error:', error)
      toast.error('Erro ao enviar imagem. Tente novamente.')
    },
  })

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return

    const file = files[0]
    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem')
      return
    }

    uploadMutation.mutate(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFileSelect(e.dataTransfer.files)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  return (
    <div className="space-y-4">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center transition-colors
          ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
          ${uploadMutation.isPending ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        {uploadMutation.isPending ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Enviando...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Arraste uma imagem ou clique para selecionar
            </p>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => inputRef.current?.click()}
          disabled={uploadMutation.isPending}
        >
          <Upload className="w-4 h-4 mr-2" />
          Escolher Arquivo
        </Button>

        <Button
          variant="outline"
          className="flex-1"
          onClick={() => {
            if (inputRef.current) {
              inputRef.current.setAttribute('capture', 'environment')
              inputRef.current.click()
              inputRef.current.removeAttribute('capture')
            }
          }}
          disabled={uploadMutation.isPending}
        >
          <Camera className="w-4 h-4 mr-2" />
          Camera
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
      />
    </div>
  )
}
