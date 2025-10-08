'use client'

import { useState } from 'react'
import { Edit, Trash2, GripVertical, Eye, EyeOff } from 'lucide-react'
import * as Icons from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { FeatureGridDialog } from './feature-grid-dialog'
import {
  type FeatureGridItem,
  useDeleteFeatureGridItem,
  useUpdateFeatureGridItem,
} from '@/hooks/admin/use-admin-feature-grid'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type FeatureGridListProps = {
  items: FeatureGridItem[]
}

export function FeatureGridList({ items }: FeatureGridListProps) {
  const [editingItem, setEditingItem] = useState<FeatureGridItem | null>(null)
  const [deletingItem, setDeletingItem] = useState<FeatureGridItem | null>(null)

  const deleteItem = useDeleteFeatureGridItem()

  const handleDelete = async () => {
    if (!deletingItem) return

    try {
      await deleteItem.mutateAsync(deletingItem.id)
      toast.success('Item removido com sucesso')
      setDeletingItem(null)
    } catch (error) {
      toast.error('Erro ao remover item')
    }
  }

  if (items.length === 0) {
    return (
      <Card className="p-12 text-center">
        <p className="text-muted-foreground">
          Nenhum item cadastrado. Clique em "Novo Item" para começar.
        </p>
      </Card>
    )
  }

  return (
    <>
      <div className="space-y-4">
        {items.map((item) => {
          const IconComponent = (Icons as any)[item.icon] as Icons.LucideIcon

          return (
            <Card key={item.id} className="p-4">
              <div className="flex items-start gap-4">
                {/* Drag Handle */}
                <button className="mt-2 cursor-grab active:cursor-grabbing">
                  <GripVertical className="h-5 w-5 text-muted-foreground" />
                </button>

                {/* Icon */}
                <div className="mt-1 w-10 h-10 rounded-lg border bg-muted flex items-center justify-center">
                  {IconComponent && (
                    <IconComponent className={cn('h-5 w-5', item.iconColor || 'text-primary')} />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold">{item.title}</h3>
                    <Badge variant={item.isActive ? 'default' : 'secondary'}>
                      {item.isActive ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {item.description}
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span>Ordem: {item.order}</span>
                    {item.gridArea && <span>Grid: {item.gridArea}</span>}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditingItem(item)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeletingItem(item)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Edit Dialog */}
      {editingItem && (
        <FeatureGridDialog
          open={!!editingItem}
          onOpenChange={(open) => !open && setEditingItem(null)}
          item={editingItem}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingItem} onOpenChange={(open) => !open && setDeletingItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o item "{deletingItem?.title}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
