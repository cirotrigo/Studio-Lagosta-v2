'use client'

import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  MoreVertical,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  useReorderSections,
  useDeleteSection,
  useToggleSectionVisibility,
  useDuplicateSection,
  type CMSSection,
} from '@/hooks/admin/use-admin-cms'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

type SectionsListProps = {
  sections: CMSSection[]
  isLoading: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  pageId: string
}

const sectionTypeLabels: Record<string, string> = {
  HERO: 'Hero',
  BENTO_GRID: 'Grade de Recursos',
  FAQ: 'FAQ',
  AI_STARTER: 'Compatibilidade IA',
  PRICING: 'Preços',
  CTA: 'Call to Action',
  CUSTOM: 'Personalizado',
}

function SortableSection({
  section,
  isSelected,
  onSelect,
  onDelete,
  onDuplicate,
  onToggleVisibility,
}: {
  section: CMSSection
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
  onDuplicate: () => void
  onToggleVisibility: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative flex items-center gap-2 rounded-lg border p-3 transition-colors',
        isSelected && 'border-primary bg-accent',
        !section.isVisible && 'opacity-60',
        isDragging && 'z-50 shadow-lg'
      )}
    >
      {/* Drag Handle */}
      <button
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Section Info */}
      <div className="flex-1 cursor-pointer" onClick={onSelect}>
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm">{section.name}</span>
          {!section.isVisible && (
            <Badge variant="outline" className="text-xs">
              Oculto
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {sectionTypeLabels[section.type] || section.type}
        </p>
      </div>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onToggleVisibility}>
            {section.isVisible ? (
              <>
                <EyeOff className="mr-2 h-4 w-4" />
                Ocultar
              </>
            ) : (
              <>
                <Eye className="mr-2 h-4 w-4" />
                Exibir
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDuplicate}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDelete} className="text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Deletar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function SectionsList({
  sections,
  isLoading,
  selectedId,
  onSelect,
  pageId,
}: SectionsListProps) {
  const { toast } = useToast()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [sectionToDelete, setSectionToDelete] = useState<string | null>(null)

  const reorderMutation = useReorderSections(pageId)
  const deleteMutation = useDeleteSection(pageId)
  const toggleVisibilityMutation = useToggleSectionVisibility(pageId)
  const duplicateMutation = useDuplicateSection(pageId)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = sections.findIndex((s) => s.id === active.id)
      const newIndex = sections.findIndex((s) => s.id === over.id)

      const reordered = arrayMove(sections, oldIndex, newIndex)
      const updates = reordered.map((section, index) => ({
        id: section.id,
        order: index,
      }))

      try {
        await reorderMutation.mutateAsync(updates)
        toast({
          title: 'Ordem atualizada',
          description: 'A ordem das seções foi atualizada.',
        })
      } catch (_error) {
        toast({
          title: 'Erro ao reordenar',
          description: 'Não foi possível reordenar as seções.',
          variant: 'destructive',
        })
      }
    }
  }

  const handleDelete = async () => {
    if (!sectionToDelete) return

    try {
      await deleteMutation.mutateAsync(sectionToDelete)
      toast({
        title: 'Seção deletada',
        description: 'A seção foi deletada com sucesso.',
      })
      setDeleteDialogOpen(false)
      setSectionToDelete(null)
    } catch (_error) {
      toast({
        title: 'Erro ao deletar',
        description: 'Não foi possível deletar a seção.',
        variant: 'destructive',
      })
    }
  }

  const handleDuplicate = async (id: string) => {
    try {
      await duplicateMutation.mutateAsync(id)
      toast({
        title: 'Seção duplicada',
        description: 'A seção foi duplicada com sucesso.',
      })
    } catch (_error) {
      toast({
        title: 'Erro ao duplicar',
        description: 'Não foi possível duplicar a seção.',
        variant: 'destructive',
      })
    }
  }

  const handleToggleVisibility = async (id: string) => {
    try {
      await toggleVisibilityMutation.mutateAsync(id)
      toast({
        title: 'Visibilidade atualizada',
        description: 'A visibilidade da seção foi atualizada.',
      })
    } catch (_error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar a visibilidade.',
        variant: 'destructive',
      })
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    )
  }

  if (!sections.length) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Nenhuma seção criada ainda
      </div>
    )
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sections.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {sections.map((section) => (
              <SortableSection
                key={section.id}
                section={section}
                isSelected={selectedId === section.id}
                onSelect={() => onSelect(section.id)}
                onDelete={() => {
                  setSectionToDelete(section.id)
                  setDeleteDialogOpen(true)
                }}
                onDuplicate={() => handleDuplicate(section.id)}
                onToggleVisibility={() => handleToggleVisibility(section.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso irá deletar permanentemente a
              seção.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
