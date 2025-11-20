'use client'

import { Upload, Download, Trash2, FolderPlus, RefreshCw, CheckSquare, MoveRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

interface DriveToolbarProps {
  disabled?: boolean
  isAdmin: boolean
  selectedCount: number
  totalItems: number
  onCreateFolder: () => void
  onUpload: () => void
  onDownload: () => void
  onDelete: () => void
  onMove: () => void
  onSelectAll: () => void
  onClearSelection: () => void
  onRefresh: () => void
}

export function DriveToolbar({
  disabled,
  isAdmin,
  selectedCount,
  totalItems,
  onCreateFolder,
  onUpload,
  onDownload,
  onDelete,
  onMove,
  onSelectAll,
  onClearSelection,
  onRefresh,
}: DriveToolbarProps) {
  const hasSelection = selectedCount > 0

  return (
    <div className={cn('flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card/70 p-3 shadow-sm', disabled && 'opacity-75')}> 
      <Button size="sm" variant="secondary" onClick={onCreateFolder} disabled={disabled}>
        <FolderPlus className="mr-2 h-4 w-4" /> Nova pasta
      </Button>
      {isAdmin && (
        <Button size="sm" onClick={onUpload} disabled={disabled}>
          <Upload className="mr-2 h-4 w-4" /> Upload
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={onDownload} disabled={Boolean(disabled) || totalItems === 0}>
        <Download className="mr-2 h-4 w-4" /> Download ZIP
      </Button>
      {isAdmin && (
        <Button size="sm" variant="destructive" onClick={onDelete} disabled={!hasSelection}>
          <Trash2 className="mr-2 h-4 w-4" /> Deletar
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={onMove} disabled={!hasSelection}>
        <MoveRight className="mr-2 h-4 w-4" /> Mover
      </Button>
      <Separator orientation="vertical" className="mx-2 hidden h-6 sm:block" />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {hasSelection ? `${selectedCount} selecionado${selectedCount > 1 ? 's' : ''}` : `${totalItems} itens`}
      </div>
      <Button size="sm" variant="ghost" onClick={hasSelection ? onClearSelection : onSelectAll} disabled={!totalItems}>
        <CheckSquare className="mr-2 h-4 w-4" />
        {hasSelection ? 'Limpar seleção' : 'Selecionar todos'}
      </Button>
      <div className="ml-auto flex items-center gap-2">
        <Button size="icon" variant="ghost" onClick={onRefresh} disabled={disabled}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
