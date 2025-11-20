'use client'

import type { DriveFolderType, DriveProjectInfo } from '@/types/drive'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface DriveFolderToggleProps {
  project?: DriveProjectInfo
  value: DriveFolderType
  onChange: (value: DriveFolderType) => void
}

export function DriveFolderToggle({ project, value, onChange }: DriveFolderToggleProps) {
  if (!project) return null

  const hasImagesFolder = Boolean(project.googleDriveImagesFolderId)
  const hasVideosFolder = Boolean(project.googleDriveVideosFolderId)

  if (!hasImagesFolder && !hasVideosFolder) {
    return null
  }

  if (!hasVideosFolder || !hasImagesFolder) {
    return null
  }

  const folders: Array<{ type: DriveFolderType; label: string }> = [
    {
      type: 'images',
      label: project.googleDriveImagesFolderName || 'Fotos',
    },
    {
      type: 'videos',
      label: project.googleDriveVideosFolderName || 'Vídeos',
    },
  ]

  return (
    <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card/60 p-1 text-sm">
      {folders.map((folder) => (
        <Button
          key={folder.type}
          size="sm"
          variant="ghost"
          className={cn(
            'rounded-full px-4 font-medium transition-colors',
            value === folder.type
              ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary hover:text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => onChange(folder.type)}
        >
          {folder.label.toUpperCase()}
        </Button>
      ))}
    </div>
  )
}
