"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useSetPageMetadata } from '@/contexts/page-metadata'
import { useCreateKnowledgeBaseEntry, type CreateEntryInput } from '@/hooks/use-knowledge-base'
import { KnowledgeBaseForm } from '@/components/knowledge-base/knowledge-base-form'
import { useToast } from '@/hooks/use-toast'

export default function NewKnowledgeBaseEntryPage() {
  const router = useRouter()
  const { toast } = useToast()
  const createMutation = useCreateKnowledgeBaseEntry()

  useSetPageMetadata({
    title: 'Nova Entrada',
    description: 'Adicionar nova entrada à base de conhecimento',
    breadcrumbs: [
      { label: 'Base de Conhecimento', href: '/knowledge-base' },
      { label: 'Nova Entrada' },
    ],
  })

  const handleSubmit = async (data: CreateEntryInput) => {
    try {
      await createMutation.mutateAsync(data)
      toast({
        title: 'Entrada criada',
        description: 'A entrada foi adicionada à base de conhecimento.',
      })
      router.push('/knowledge-base')
    } catch (error) {
      toast({
        title: 'Erro ao criar entrada',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  return (
    <KnowledgeBaseForm
      onSubmit={handleSubmit}
      isLoading={createMutation.isPending}
      onCancel={() => router.push('/knowledge-base')}
    />
  )
}
