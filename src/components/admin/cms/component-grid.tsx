'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  MoreVertical,
  Trash2,
  Copy,
  Edit,
  Globe,
  Eye,
  Code,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { Badge } from '@/components/ui/badge'
import { useDeleteComponent } from '@/hooks/admin/use-admin-components'
import { useToast } from '@/hooks/use-toast'
import type { CMSComponent } from '@/hooks/admin/use-admin-components'

type ComponentGridProps = {
  components: CMSComponent[]
  viewMode: 'grid' | 'list'
}

export function ComponentGrid({ components, viewMode }: ComponentGridProps) {
  const router = useRouter()
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const { toast } = useToast()
  const deleteMutation = useDeleteComponent()

  const handleDelete = async () => {
    if (!deleteId) return

    try {
      await deleteMutation.mutateAsync(deleteId)
      toast({
        title: 'Componente excluído',
        description: 'O componente foi excluído com sucesso.',
      })
      setDeleteId(null)
    } catch (_error) {
      toast({
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir o componente.',
        variant: 'destructive',
      })
    }
  }

  const handleEdit = (id: string) => {
    router.push(`/admin/content/components/${id}`)
  }

  const handleView = (_component: CMSComponent) => {
    // TODO: Implement component preview
    toast({
      title: 'Em breve',
      description: 'Funcionalidade de visualização em desenvolvimento.',
    })
  }

  const handleDuplicate = (_component: CMSComponent) => {
    // TODO: Implement duplicate
    toast({
      title: 'Em breve',
      description: 'Funcionalidade de duplicar em desenvolvimento.',
    })
  }

  if (viewMode === 'grid') {
    return (
      <>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {components.map((component) => (
            <ComponentCard
              key={component.id}
              component={component}
              onEdit={handleEdit}
              onView={handleView}
              onDelete={setDeleteId}
              onDuplicate={handleDuplicate}
            />
          ))}
        </div>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir este componente? Esta ação não pode
                ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    )
  }

  // List view
  return (
    <div className="rounded-lg border">
      <div className="divide-y">
        {components.map((component) => (
          <ComponentListItem
            key={component.id}
            component={component}
            onEdit={handleEdit}
            onView={handleView}
            onDelete={setDeleteId}
            onDuplicate={handleDuplicate}
          />
        ))}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este componente? Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

type ComponentItemProps = {
  component: CMSComponent
  onEdit: (id: string) => void
  onView: (component: CMSComponent) => void
  onDelete: (id: string) => void
  onDuplicate: (component: CMSComponent) => void
}

function ComponentCard({ component, onEdit, onView, onDelete, onDuplicate }: ComponentItemProps) {
  return (
    <div className="group relative overflow-hidden rounded-lg border bg-card transition-all hover:shadow-md">
      {/* Preview */}
      <div className="aspect-video bg-muted p-4 relative">
        {component.thumbnail ? (
          <Image
            src={component.thumbnail}
            alt={component.name}
            fill
            className="object-cover rounded"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Code className="h-12 w-12 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="truncate font-semibold">{component.name}</h3>
            {component.description && (
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {component.description}
              </p>
            )}
          </div>
          {component.isGlobal && (
            <Badge variant="secondary" className="flex-shrink-0">
              <Globe className="mr-1 h-3 w-3" />
              Global
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline">{component.type}</Badge>
          <span className="text-xs text-muted-foreground">
            {format(new Date(component.createdAt), 'dd/MM/yyyy', {
              locale: ptBR,
            })}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onView(component)}>
              <Eye className="mr-2 h-4 w-4" />
              Visualizar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(component.id)}>
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDuplicate(component)}>
              <Copy className="mr-2 h-4 w-4" />
              Duplicar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(component.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

function ComponentListItem({
  component,
  onEdit,
  onView,
  onDelete,
  onDuplicate,
}: ComponentItemProps) {
  return (
    <div className="flex items-center gap-4 p-4 hover:bg-muted/50">
      {/* Thumbnail */}
      <div className="h-16 w-24 flex-shrink-0 overflow-hidden rounded-md bg-muted relative">
        {component.thumbnail ? (
          <Image
            src={component.thumbnail}
            alt={component.name}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Code className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="mb-1 flex items-center gap-2">
          <h3 className="truncate font-semibold">{component.name}</h3>
          {component.isGlobal && (
            <Badge variant="secondary" className="flex-shrink-0">
              <Globe className="mr-1 h-3 w-3" />
              Global
            </Badge>
          )}
        </div>
        {component.description && (
          <p className="line-clamp-1 text-sm text-muted-foreground">
            {component.description}
          </p>
        )}
        <div className="mt-1 flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {component.type}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Criado em{' '}
            {format(new Date(component.createdAt), "d 'de' MMMM 'de' yyyy", {
              locale: ptBR,
            })}
          </span>
        </div>
      </div>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onView(component)}>
            <Eye className="mr-2 h-4 w-4" />
            Visualizar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onEdit(component.id)}>
            <Edit className="mr-2 h-4 w-4" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDuplicate(component)}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onDelete(component.id)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
