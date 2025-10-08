'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { FeatureGridList } from '@/components/admin/feature-grid/feature-grid-list'
import { FeatureGridDialog } from '@/components/admin/feature-grid/feature-grid-dialog'
import { useFeatureGridItems } from '@/hooks/admin/use-admin-feature-grid'
import { Skeleton } from '@/components/ui/skeleton'

export default function FeatureGridPage() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const { data, isLoading } = useFeatureGridItems()

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Grid de Recursos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie os itens do grid de recursos exibidos no site
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Item
        </Button>
      </div>

      <Separator />

      {/* Stats */}
      {!isLoading && data?.items && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Total de Itens</p>
            <p className="text-2xl font-bold">{data.items.length}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Ativos</p>
            <p className="text-2xl font-bold">
              {data.items.filter((item) => item.isActive).length}
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Inativos</p>
            <p className="text-2xl font-bold">
              {data.items.filter((item) => !item.isActive).length}
            </p>
          </div>
        </div>
      )}

      {/* Lista de itens */}
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (
        <FeatureGridList items={data?.items || []} />
      )}

      {/* Dialog de criação */}
      <FeatureGridDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />
    </div>
  )
}
