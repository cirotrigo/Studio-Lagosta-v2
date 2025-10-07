'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAdminMenus } from '@/hooks/admin/use-admin-menus'
import { MenusList } from '@/components/admin/cms/menus-list'
import { CreateMenuDialog } from '@/components/admin/cms/create-menu-dialog'
import { Skeleton } from '@/components/ui/skeleton'

export default function AdminMenusPage() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const { data, isLoading } = useAdminMenus()

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Menus</h1>
          <p className="text-muted-foreground">
            Gerencie os menus de navegação do seu site
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Menu
        </Button>
      </div>

      {/* Menus List */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : (
        <MenusList menus={data?.menus || []} />
      )}

      {/* Create Dialog */}
      <CreateMenuDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
      />
    </div>
  )
}
