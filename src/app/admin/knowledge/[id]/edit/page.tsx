'use client'

/**
 * Admin Knowledge Base - Edit Entry Page
 * Edit existing knowledge base entry
 */

import { use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { KnowledgeForm } from '@/components/admin/knowledge/knowledge-form'
import {
  useKnowledgeEntry,
  useUpdateKnowledgeEntry,
} from '@/hooks/admin/use-admin-knowledge'
import { useToast } from '@/hooks/use-toast'
import { ArrowLeft } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function EditKnowledgeEntryPage({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()
  const { toast } = useToast()

  const { data: entry, isLoading } = useKnowledgeEntry(id)
  const updateMutation = useUpdateKnowledgeEntry(id)

  const handleSubmit = async (data: {
    title: string
    content: string
    tags: string[]
    status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  }) => {
    try {
      await updateMutation.mutateAsync(data)
      toast({
        title: 'Entrada atualizada',
        description: 'As alterações foram salvas com sucesso',
      })
      router.push(`/admin/knowledge/${id}`)
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar',
        description: error.message || 'Não foi possível atualizar a entrada',
        variant: 'destructive',
      })
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!entry) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Entrada não encontrada</p>
        <Link href="/admin/knowledge">
          <Button variant="ghost" className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/knowledge/${id}`}>
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Editar Entrada</h1>
        <p className="text-muted-foreground">
          Atualize o conteúdo da base de conhecimento
        </p>
      </div>

      <div className="max-w-3xl">
        <KnowledgeForm
          mode="edit"
          initialData={{
            title: entry.title,
            content: entry.content,
            tags: entry.tags,
            status: entry.status,
          }}
          onSubmit={handleSubmit}
          isLoading={updateMutation.isPending}
        />
      </div>
    </div>
  )
}
