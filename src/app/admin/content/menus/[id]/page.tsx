'use client'

import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAdminMenu } from '@/hooks/admin/use-admin-menus'
import { MenuEditor } from '@/components/admin/cms/menu-editor'
import { Skeleton } from '@/components/ui/skeleton'

export default function MenuEditPage() {
  const params = useParams()
  const router = useRouter()
  const menuId = params.id as string

  const { data, isLoading, error } = useAdminMenu(menuId)

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10" />
            <div>
              <Skeleton className="h-8 w-64 mb-2" />
              <Skeleton className="h-4 w-96" />
            </div>
          </div>
          <Skeleton className="h-10 w-24" />
        </div>

        {/* Editor Skeleton */}
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    )
  }

  if (error || !data?.menu) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <h2 className="text-2xl font-bold mb-4">Menu não encontrado</h2>
        <p className="text-muted-foreground mb-6">
          O menu que você está procurando não existe.
        </p>
        <Button onClick={() => router.push('/admin/content/menus')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar para Menus
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/admin/content/menus')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{data.menu.name}</h1>
            <p className="text-muted-foreground">
              Edite os itens e configurações do menu
            </p>
          </div>
        </div>
      </div>

      {/* Menu Editor */}
      <MenuEditor menu={data.menu} />
    </div>
  )
}
