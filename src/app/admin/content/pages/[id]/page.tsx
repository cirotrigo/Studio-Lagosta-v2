'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Eye, Save, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAdminPage } from '@/hooks/admin/use-admin-cms'
import { PageEditor } from '@/components/admin/cms/page-editor'
import { PageSettings } from '@/components/admin/cms/page-settings'
import { Skeleton } from '@/components/ui/skeleton'

type PageProps = {
  params: Promise<{ id: string }>
}

export default function AdminEditPagePage({ params }: PageProps) {
  const router = useRouter()
  const { id } = use(params)
  const { data, isLoading, error } = useAdminPage(id)

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="flex-1">
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (error || !data?.page) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <h2 className="text-2xl font-bold">Página não encontrada</h2>
        <p className="text-muted-foreground">
          A página que você está procurando não existe.
        </p>
        <Button onClick={() => router.push('/admin/content/pages')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar para Páginas
        </Button>
      </div>
    )
  }

  const page = data.page

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/admin/content/pages')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{page.title}</h1>
            <p className="text-sm text-muted-foreground">{page.path}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {page.status === 'PUBLISHED' && (
            <Button
              variant="outline"
              onClick={() => window.open(page.path, '_blank')}
            >
              <Eye className="mr-2 h-4 w-4" />
              Visualizar
            </Button>
          )}
          <Button>
            <Save className="mr-2 h-4 w-4" />
            Salvar
          </Button>
        </div>
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs defaultValue="editor" className="w-full">
        <TabsList>
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="mr-2 h-4 w-4" />
            Configurações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="editor" className="mt-6">
          <PageEditor page={page} />
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <PageSettings page={page} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
