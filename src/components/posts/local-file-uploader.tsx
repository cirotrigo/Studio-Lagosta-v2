'use client'

import React, { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { UploadIcon, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import Image from 'next/image'
import { upload } from '@vercel/blob/client'
import {
  cropToPostType,
  isImageFile,
  isVideoFile,
  readImageSize,
  type CropPostType,
  type CropRegion,
} from '@/lib/images/client-resize'
import { CropDialog, centeredCrop, matchesPostRatio } from './crop/crop-dialog'

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
  /** Formato de destino do recorte. Sem ele, nada é recortado. */
  postType?: CropPostType
}

/** Imagem esperando a pessoa escolher o enquadramento */
interface PendingCrop {
  file: File
  previewUrl: string
  naturalSize: { width: number; height: number }
}

export function LocalFileUploader({
  onUploadComplete,
  maxFiles,
  mediaMode = 'both',
  postType,
}: LocalFileUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  // Fila de enquadramento: uma imagem por vez, na ordem em que foram soltas
  const [cropQueue, setCropQueue] = useState<PendingCrop[]>([])
  const [cropTotal, setCropTotal] = useState(0)

  const uploadFiles = useCallback(async (
    entries: Array<{ file: File; crop?: CropRegion }>,
  ) => {
    if (entries.length === 0) return
    setUploading(true)

    try {
      const newFiles: UploadedFile[] = []

      for (const { file, crop } of entries) {
        // Validate file size (max 50MB)
        if (file.size > 50 * 1024 * 1024) {
          throw new Error(`O arquivo "${file.name}" é muito grande. O tamanho máximo é 50MB.`)
        }

        let fileToUpload = file

        // Imagem vai para o formato do post. Com `crop`, é o enquadramento que
        // a pessoa escolheu; sem ele, o corte pelo centro (padrão de quem não
        // quis escolher). Vídeo nunca é tocado.
        const isImage = isImageFile(file)

        if (isImage && postType) {
          try {
            const originalSize = file.size
            fileToUpload = await cropToPostType(file, postType, crop)
            console.log('[Upload] Imagem enquadrada:', {
              name: file.name,
              postType,
              escolhido: !!crop,
              originalSize,
              newSize: fileToUpload.size,
            })
          } catch (resizeError) {
            console.error('[Upload] Falha ao enquadrar, subindo original:', resizeError)
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

        // 2. Create preview from the uploaded file (resized if applicable)
        // This shows the user exactly what was uploaded
        const preview = URL.createObjectURL(fileToUpload)

        newFiles.push({
          id: crypto.randomUUID(),
          url: blob.url,
          pathname: blob.pathname,
          name: file.name,
          size: fileToUpload.size, // Use resized file size
          preview,
        })
      }

      // Forma funcional: entre soltar o arquivo e terminar o upload passa o
      // enquadramento, e a lista capturada no closure já estaria velha
      setUploadedFiles((prev) => {
        const updated = [...prev, ...newFiles]
        onUploadComplete(updated)
        return updated
      })
      toast.success(`${newFiles.length} arquivo(s) enviado(s)`)
    } catch (error) {
      console.error('Upload error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Erro ao fazer upload'
      toast.error(errorMessage)
    } finally {
      setUploading(false)
    }
  }, [onUploadComplete, postType])

  /**
   * Ao soltar arquivos: o que precisa de enquadramento entra na fila; o resto
   * (vídeo, imagem já na proporção, ou post sem formato definido) sobe direto.
   */
  const handleDrop = useCallback(async (acceptedFiles: File[]) => {
    if (uploadedFiles.length + acceptedFiles.length > maxFiles) {
      toast.error(`Máximo de ${maxFiles} arquivos`)
      return
    }

    const direto: Array<{ file: File; crop?: CropRegion }> = []
    const paraEnquadrar: PendingCrop[] = []

    for (const file of acceptedFiles) {
      if (!postType || !isImageFile(file)) {
        direto.push({ file })
        continue
      }
      try {
        const naturalSize = await readImageSize(file)
        if (matchesPostRatio(naturalSize, postType)) {
          // Já está no formato: enquadrar não mudaria nada
          direto.push({ file })
        } else {
          paraEnquadrar.push({ file, previewUrl: URL.createObjectURL(file), naturalSize })
        }
      } catch {
        // Não deu para ler as dimensões — segue pelo caminho antigo
        direto.push({ file })
      }
    }

    if (direto.length > 0) await uploadFiles(direto)
    if (paraEnquadrar.length > 0) {
      setCropTotal(paraEnquadrar.length)
      setCropQueue(paraEnquadrar)
    }
  }, [uploadedFiles.length, maxFiles, postType, uploadFiles])

  const encerrarItemDaFila = useCallback(() => {
    setCropQueue((fila) => {
      if (fila[0]) URL.revokeObjectURL(fila[0].previewUrl)
      const resto = fila.slice(1)
      if (resto.length === 0) setCropTotal(0)
      return resto
    })
  }, [])

  const handleCropConfirm = useCallback(async (crop: CropRegion) => {
    const atual = cropQueue[0]
    if (!atual) return
    encerrarItemDaFila()
    await uploadFiles([{ file: atual.file, crop }])
  }, [cropQueue, encerrarItemDaFila, uploadFiles])

  /** Desistiu do enquadramento desta imagem: ela não entra no post */
  const handleCropCancel = useCallback(() => {
    encerrarItemDaFila()
  }, [encerrarItemDaFila])

  /** "Usar o centro nas demais": sobe a fila inteira com o corte central */
  const handleCropSkipRemaining = useCallback(async () => {
    const pendentes = cropQueue
    setCropQueue([])
    setCropTotal(0)
    pendentes.forEach((item) => URL.revokeObjectURL(item.previewUrl))
    await uploadFiles(
      pendentes.map((item) => ({
        file: item.file,
        crop: postType ? centeredCrop(item.naturalSize, postType) : undefined,
      })),
    )
  }, [cropQueue, postType, uploadFiles])

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
    onDrop: handleDrop,
    accept: acceptedFiles,
    maxFiles,
    disabled: uploading || uploadedFiles.length >= maxFiles,
  })

  const handleRemove = (id: string) => {
    const updated = uploadedFiles.filter((f) => f.id !== id)
    setUploadedFiles(updated)
    onUploadComplete(updated)
  }

  const cropAtual = cropQueue[0]

  return (
    <div className="space-y-4">
      {/* Enquadramento — uma imagem por vez, na ordem em que foram soltas */}
      {cropAtual && postType && (
        <CropDialog
          open
          src={cropAtual.previewUrl}
          naturalSize={cropAtual.naturalSize}
          postType={postType}
          stepLabel={
            cropTotal > 1 ? `Imagem ${cropTotal - cropQueue.length + 1} de ${cropTotal}` : undefined
          }
          onSkipRemaining={cropQueue.length > 1 ? handleCropSkipRemaining : undefined}
          onCancel={handleCropCancel}
          onConfirm={handleCropConfirm}
        />
      )}

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
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
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
