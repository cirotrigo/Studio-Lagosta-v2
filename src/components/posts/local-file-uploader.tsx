'use client'

import React, { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { UploadIcon, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import Image from 'next/image'
import { upload } from '@vercel/blob/client'
import { resizeToInstagramFeed, isImageFile, isVideoFile } from '@/lib/images/client-resize'

interface UploadedFile {
  id: string
  url: string
  pathname: string
  name: string
  size: number
  preview: string
}

interface LocalFileUploaderProps {
  onUploadComplete: (files: UploadedFile[]) => void
  maxFiles: number
  mediaMode?: 'images' | 'videos' | 'both'
}

export function LocalFileUploader({
  onUploadComplete,
  maxFiles,
  mediaMode = 'both'
}: LocalFileUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])

  const handleUpload = useCallback(async (acceptedFiles: File[]) => {
    if (uploadedFiles.length + acceptedFiles.length > maxFiles) {
      toast.error(`Máximo de ${maxFiles} arquivos`)
      return
    }

    setUploading(true)

    try {
      const newFiles: UploadedFile[] = []

      for (const file of acceptedFiles) {
        // Validate file size (max 50MB)
        if (file.size > 50 * 1024 * 1024) {
          throw new Error(`O arquivo "${file.name}" é muito grande. O tamanho máximo é 50MB.`)
        }

        let fileToUpload = file

        // Auto-resize images to Instagram feed format (4:5 ratio - 1080x1350)
        // Only resize images, not videos
        // Only resize when mode is 'images' (for POST and CAROUSEL types)
        if (isImageFile(file) && mediaMode === 'images') {
          try {
            console.log('[Upload] Resizing image for Instagram feed:', file.name)
            fileToUpload = await resizeToInstagramFeed(file)
            console.log('[Upload] Image resized successfully')
          } catch (resizeError) {
            console.warn('[Upload] Failed to resize image, using original:', resizeError)
            // Continue with original file if resize fails
          }
        }

        // 1. Upload directly to Vercel Blob using client-side upload
        // Generate unique filename to prevent conflicts
        const timestamp = Date.now()
        const randomString = Math.random().toString(36).substring(2, 8)
        const uniqueName = `${timestamp}-${randomString}-${fileToUpload.name}`

        console.log('[Upload] Starting direct upload for:', uniqueName)

        const blob = await upload(uniqueName, fileToUpload, {
          access: 'public',
          handleUploadUrl: '/api/upload/signed-url',
        })

        console.log('[Upload] Upload successful:', blob.url)

        // 2. Create preview from original file (better quality for preview)
        const preview = URL.createObjectURL(file)

        newFiles.push({
          id: crypto.randomUUID(),
          url: blob.url,
          pathname: blob.pathname,
          name: file.name,
          size: file.size,
          preview,
        })
      }

      const updated = [...uploadedFiles, ...newFiles]
      setUploadedFiles(updated)
      onUploadComplete(updated)
      toast.success(`${newFiles.length} arquivo(s) enviado(s)`)
    } catch (error) {
      console.error('Upload error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Erro ao fazer upload'
      toast.error(errorMessage)
    } finally {
      setUploading(false)
    }
  }, [uploadedFiles, maxFiles, onUploadComplete, mediaMode])

  // Configure accepted file types based on mediaMode
  const acceptedFiles = React.useMemo(() => {
    if (mediaMode === 'images') {
      return {
        'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
      }
    }
    if (mediaMode === 'videos') {
      return {
        'video/*': ['.mp4', '.mov', '.avi', '.webm'],
      }
    }
    // both
    return {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif'],
      'video/*': ['.mp4', '.mov', '.avi', '.webm'],
    }
  }, [mediaMode])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleUpload,
    accept: acceptedFiles,
    maxFiles,
    disabled: uploading || uploadedFiles.length >= maxFiles,
  })

  const handleRemove = (id: string) => {
    const updated = uploadedFiles.filter((f) => f.id !== id)
    setUploadedFiles(updated)
    onUploadComplete(updated)
  }

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <Card
        {...getRootProps()}
        className={`
          p-8 text-center border-2 border-dashed cursor-pointer
          transition-colors
          ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
          ${uploading ? 'opacity-50 cursor-not-allowed' : 'hover:border-primary'}
        `}
      >
        <input {...getInputProps()} />

        {uploading ? (
          <>
            <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Processando e fazendo upload...
            </p>
          </>
        ) : (
          <>
            <UploadIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="font-semibold mb-2">
              {isDragActive ? 'Solte aqui!' :
               mediaMode === 'images' ? 'Arraste imagens ou clique para selecionar' :
               mediaMode === 'videos' ? 'Arraste vídeos ou clique para selecionar' :
               'Arraste imagens/vídeos ou clique para selecionar'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {mediaMode === 'images' ? 'Imagens' :
               mediaMode === 'videos' ? 'Vídeos' :
               'Imagens/vídeos'} até 50MB • Máximo {maxFiles} arquivo(s)
            </p>
          </>
        )}
      </Card>

      {/* Preview */}
      {uploadedFiles.length > 0 && (
        <div>
          <h4 className="font-medium text-sm mb-2">
            Arquivos ({uploadedFiles.length}/{maxFiles})
          </h4>
          <div className="grid grid-cols-4 gap-2">
            {uploadedFiles.map((file) => (
              <div key={file.id} className="relative group aspect-[4/5]">
                <Image
                  src={file.preview}
                  alt={file.name}
                  fill
                  className="object-cover rounded-lg"
                />
                <Button
                  size="icon"
                  variant="destructive"
                  className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleRemove(file.id)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
