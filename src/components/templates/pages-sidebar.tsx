"use client"

import * as React from 'react'
import Image from 'next/image'
import { Plus, Copy, Trash2, ChevronLeft, ChevronRight, GripVertical, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePages, useCreatePage, useDeletePage, useDuplicatePage, useReorderPages } from '@/hooks/use-pages'
import { cn } from '@/lib/utils'
import type { DesignData } from '@/types/template'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface PagesSidebarProps {
  templateId: number
  currentPageId: string | null
  onPageChange: (pageId: string) => void
  canvasData: DesignData
}

interface SortablePageItemProps {
  page: {
    id: string
    name: string
    thumbnail: string | null
    order: number
  }
  index: number
  isActive: boolean
  onPageChange: (pageId: string) => void
  onDuplicate: (pageId: string, e: React.MouseEvent) => void
  onDelete: (pageId: string, e: React.MouseEvent) => void
  onStartEdit: (pageId: string, currentName: string, e: React.MouseEvent) => void
  editingPageId: string | null
  editingName: string
  setEditingName: (name: string) => void
  handleCancelEdit: () => void
  pagesLength: number
}

function SortablePageItem({
  page,
  index,
  isActive,
  onPageChange,
  onDuplicate,
  onDelete,
  onStartEdit,
  editingPageId,
  editingName,
  setEditingName,
  handleCancelEdit,
  pagesLength,
}: SortablePageItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: page.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative rounded-lg border transition-colors',
        isActive && 'border-primary bg-accent',
        isDragging && 'z-50 opacity-50'
      )}
    >
      {/* Drag Handle - visível sempre */}
      <div
        {...attributes}
        {...listeners}
        className="absolute left-2 top-2 z-10 cursor-grab active:cursor-grabbing touch-none"
        title="Arrastar para reordenar"
      >
        <div className="rounded bg-background/80 p-1 shadow-sm border">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      <div
        onClick={() => onPageChange(page.id)}
        className="cursor-pointer p-3 pl-10"
      >
        {/* Thumbnail */}
        <div className="mb-2 aspect-[9/16] w-full overflow-hidden rounded bg-muted relative">
          {page.thumbnail ? (
            <Image
              src={page.thumbnail}
              alt={page.name}
              fill
              className="object-cover"
              unoptimized // Para data URLs
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <ImageIcon className="h-8 w-8" />
              <span className="text-xs">Gerando preview...</span>
            </div>
          )}
        </div>

        {/* Nome */}
        {editingPageId === page.id ? (
          <input
            type="text"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onBlur={handleCancelEdit}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded border px-2 py-1 text-sm"
            autoFocus
          />
        ) : (
          <div
            className="mb-2 truncate text-sm font-medium"
            onDoubleClick={(e) => onStartEdit(page.id, page.name, e)}
          >
            {page.name}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs text-muted-foreground">Página {index + 1}</span>
          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              onClick={(e) => onDuplicate(page.id, e)}
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
            >
              <Copy className="h-3 w-3" />
            </Button>
            <Button
              onClick={(e) => onDelete(page.id, e)}
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-destructive hover:text-destructive"
              disabled={pagesLength <= 1}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function PagesSidebar({ templateId, currentPageId, onPageChange, canvasData }: PagesSidebarProps) {
  const [editingPageId, setEditingPageId] = React.useState<string | null>(null)
  const [editingName, setEditingName] = React.useState('')

  const { data: pages = [], isLoading } = usePages(templateId)
  const createPageMutation = useCreatePage()
  const deletePageMutation = useDeletePage()
  const duplicatePageMutation = useDuplicatePage()
  const reorderPagesMutation = useReorderPages()

  // Configurar sensores para drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Permitir clique sem arrastar
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Ordenar páginas por order
  const sortedPages = React.useMemo(() => {
    return [...pages].sort((a, b) => a.order - b.order)
  }, [pages])

  // Handler para drag-and-drop
  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event

      if (over && active.id !== over.id) {
        const oldIndex = sortedPages.findIndex((p) => p.id === active.id)
        const newIndex = sortedPages.findIndex((p) => p.id === over.id)

        if (oldIndex !== -1 && newIndex !== -1) {
          // Reordenar array localmente para UI responsiva
          const newOrder = arrayMove(sortedPages, oldIndex, newIndex)
          const pageIds = newOrder.map((p) => p.id)

          // Atualizar no backend
          reorderPagesMutation.mutate({ templateId, pageIds })
        }
      }
    },
    [sortedPages, templateId, reorderPagesMutation]
  )

  // Navegação entre páginas
  const currentPageIndex = sortedPages.findIndex((p) => p.id === currentPageId)
  const hasPrevious = currentPageIndex > 0
  const hasNext = currentPageIndex < sortedPages.length - 1

  const goToPrevious = React.useCallback(() => {
    if (hasPrevious) {
      onPageChange(sortedPages[currentPageIndex - 1].id)
    }
  }, [hasPrevious, sortedPages, currentPageIndex, onPageChange])

  const goToNext = React.useCallback(() => {
    if (hasNext) {
      onPageChange(sortedPages[currentPageIndex + 1].id)
    }
  }, [hasNext, sortedPages, currentPageIndex, onPageChange])

  // Adicionar nova página
  const handleAddPage = React.useCallback(async () => {
    try {
      // Gerar nome no formato: Pag.01, Pag.02, etc.
      const pageNumber = String(pages.length + 1).padStart(2, '0')
      const pageName = `Pag.${pageNumber}`

      const newPage = await createPageMutation.mutateAsync({
        templateId,
        data: {
          name: pageName,
          width: canvasData.canvas.width,
          height: canvasData.canvas.height,
          layers: [],
          background: canvasData.canvas.backgroundColor,
          order: pages.length,
        },
      })

      // Selecionar nova página
      if (newPage && typeof newPage === 'object' && 'id' in newPage) {
        onPageChange(newPage.id as string)
      }
    } catch (_error) {
      console.error('Error creating page:', _error)
    }
  }, [templateId, pages.length, canvasData, createPageMutation, onPageChange])

  // Duplicar página
  const handleDuplicatePage = React.useCallback(
    async (pageId: string, e: React.MouseEvent) => {
      e.stopPropagation()
      try {
        await duplicatePageMutation.mutateAsync({ templateId, pageId })
      } catch (_error) {
        console.error('Error duplicating page:', _error)
      }
    },
    [templateId, duplicatePageMutation]
  )

  // Deletar página
  const handleDeletePage = React.useCallback(
    async (pageId: string, e: React.MouseEvent) => {
      e.stopPropagation()

      if (pages.length <= 1) {
        alert('Não é possível deletar a última página')
        return
      }

      if (!confirm('Deseja realmente deletar esta página?')) {
        return
      }

      try {
        await deletePageMutation.mutateAsync({ templateId, pageId })

        // Se deletou a página atual, navegar para a primeira
        if (pageId === currentPageId && sortedPages.length > 0) {
          const nextPage = sortedPages[0].id === pageId ? sortedPages[1] : sortedPages[0]
          if (nextPage) {
            onPageChange(nextPage.id)
          }
        }
      } catch (_error) {
        console.error('Error deleting page:', _error)
      }
    },
    [templateId, pages.length, currentPageId, sortedPages, deletePageMutation, onPageChange]
  )

  // Iniciar edição de nome
  const handleStartEdit = React.useCallback((pageId: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingPageId(pageId)
    setEditingName(currentName)
  }, [])

  // Cancelar edição
  const handleCancelEdit = React.useCallback(() => {
    setEditingPageId(null)
    setEditingName('')
  }, [])

  // Atalhos de teclado
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // PageUp/PageDown para navegar
      if (e.key === 'PageUp' && e.ctrlKey) {
        e.preventDefault()
        goToPrevious()
      } else if (e.key === 'PageDown' && e.ctrlKey) {
        e.preventDefault()
        goToNext()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goToPrevious, goToNext])

  if (isLoading) {
    return (
      <div className="h-full w-64 border-r bg-background p-4">
        <div className="text-sm text-muted-foreground">Carregando páginas...</div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-64 flex-col border-r bg-background">
      {/* Header */}
      <div className="border-b p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Páginas</h3>
          <Button onClick={handleAddPage} size="sm" variant="ghost">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Navegação */}
        <div className="flex items-center justify-between gap-2">
          <Button onClick={goToPrevious} disabled={!hasPrevious} size="sm" variant="outline">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            {currentPageIndex + 1} / {sortedPages.length}
          </span>
          <Button onClick={goToNext} disabled={!hasNext} size="sm" variant="outline">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Lista de páginas */}
      <div className="flex-1 overflow-y-auto p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sortedPages.map((p) => p.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {sortedPages.map((page, index) => (
                <SortablePageItem
                  key={page.id}
                  page={page}
                  index={index}
                  isActive={currentPageId === page.id}
                  onPageChange={onPageChange}
                  onDuplicate={handleDuplicatePage}
                  onDelete={handleDeletePage}
                  onStartEdit={handleStartEdit}
                  editingPageId={editingPageId}
                  editingName={editingName}
                  setEditingName={setEditingName}
                  handleCancelEdit={handleCancelEdit}
                  pagesLength={pages.length}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  )
}
