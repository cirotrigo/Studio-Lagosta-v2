"use client"

import * as React from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useSetPageMetadata } from '@/contexts/page-metadata'
import {
  useKnowledgeBaseEntry,
  useUpdateKnowledgeBaseEntry,
  type UpdateEntryInput,
} from '@/hooks/use-knowledge-base'
import { KnowledgeBaseForm } from '@/components/knowledge-base/knowledge-base-form'
import { useToast } from '@/hooks/use-toast'
import { Skeleton } from '@/components/ui/skeleton'
import { Card } from '@/components/ui/card'

export default function EditKnowledgeBaseEntryPage() {
  const router = useRouter()
  const params = useParams()
  const { toast } = useToast()

  const id = params.id as string
  const { data: entry, isLoading } = useKnowledgeBaseEntry(id)
  const updateMutation = useUpdateKnowledgeBaseEntry(id)

  useSetPageMetadata({
    title: entry ? `Editar: ${entry.title}` : 'Editar Entrada',
    description: 'Editar entrada da base de conhecimento',
    breadcrumbs: [
      { label: 'Base de Conhecimento', href: '/knowledge-base' },
      { label: 'Editar' },
    ],
  })

  const handleSubmit = async (data: UpdateEntryInput) => {
    try {
      await updateMutation.mutateAsync(data)
      toast({
        title: 'Entrada atualizada',
        description: 'As alterações foram salvas com sucesso.',
      })
      router.push('/knowledge-base')
    } catch (error) {
      toast({
        title: 'Erro ao atualizar entrada',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  if (isLoading) {
    return (
      <Card className="p-6 space-y-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-10 w-32" />
      </Card>
    )
  }

  if (!entry) {
    return (
      <Card className="p-12 text-center">
        <h3 className="text-lg font-semibold mb-2">Entrada não encontrada</h3>
        <p className="text-sm text-muted-foreground">
          A entrada que você está procurando não existe ou foi removida.
        </p>
      </Card>
    )
  }

  return (
    <KnowledgeBaseForm
      initialData={entry}
      onSubmit={handleSubmit}
      isLoading={updateMutation.isPending}
      onCancel={() => router.push('/knowledge-base')}
    />
  )
}
