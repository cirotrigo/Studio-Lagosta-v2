'use client'

import { useState } from 'react'
import { LocalFileUploader } from '@/components/posts/local-file-uploader'
import type { ImageSource } from '@/lib/ai-creative-generator/layout-types'

interface LocalUploadTabProps {
  projectId: number
  onImageSelected: (image: ImageSource) => void
}

export function LocalUploadTab({
  projectId,
  onImageSelected,
}: LocalUploadTabProps) {
  const [uploadedFile, setUploadedFile] = useState<{ url: string; pathname: string } | null>(null)

  const handleUploadComplete = (files: Array<{ url: string; pathname: string }>) => {
    if (files.length > 0) {
      const file = files[0]
      setUploadedFile(file)

      // Criar ImageSource com tipo 'local-upload'
      const imageSource: ImageSource = {
        type: 'local-upload' as any, // Adicionar tipo local-upload
        url: file.url,
        pathname: file.pathname,
      }

      onImageSelected(imageSource)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Faça upload de uma imagem do seu computador para usar no criativo.
      </p>

      <LocalFileUploader
        maxFiles={1}
        mediaMode="images"
        onUploadComplete={handleUploadComplete}
      />

      {uploadedFile && (
        <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
          <p className="text-xs text-green-700 dark:text-green-400 font-medium">
            ✓ Imagem enviada com sucesso
          </p>
          <p className="text-xs text-green-600 dark:text-green-500 mt-1">
            Você pode continuar editando ou selecionar outra imagem
          </p>
        </div>
      )}
    </div>
  )
}
