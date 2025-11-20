'use client'

import * as React from 'react'
import { useDropzone } from 'react-dropzone'
import { UploadCloud } from 'lucide-react'

interface DriveDropZoneProps {
  folderId?: string | null
  projectId?: number | null
  isAdmin: boolean
  onFilesDropped: (files: File[]) => void
  children: React.ReactNode
  isUploading?: boolean
}

export function DriveDropZone({ folderId, projectId, isAdmin, onFilesDropped, children, isUploading }: DriveDropZoneProps) {
  const dropDisabled = !isAdmin || !folderId || !projectId || Boolean(isUploading)
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop: (accepted) => {
      if (!dropDisabled && accepted.length) {
        onFilesDropped(accepted)
      }
    },
    disabled: dropDisabled,
  })

  const rootProps = getRootProps({ className: 'relative' })

  return (
    <div {...rootProps}>
      <input {...getInputProps()} />
      {children}
      {isDragActive && !dropDisabled && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-primary/60 bg-primary/10 text-primary">
          <UploadCloud className="mb-2 h-8 w-8" />
          Solte os arquivos para enviar
        </div>
      )}
    </div>
  )
}
