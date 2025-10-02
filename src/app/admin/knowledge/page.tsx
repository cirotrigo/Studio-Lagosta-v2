'use client'

/**
 * Admin Knowledge Base - Main Page
 * List and manage knowledge base entries
 */

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { KnowledgeList } from '@/components/admin/knowledge/knowledge-list'
import {
  useKnowledgeEntries,
  useDeleteKnowledgeEntry,
} from '@/hooks/admin/use-admin-knowledge'
import { useToast } from '@/hooks/use-toast'
import { Plus } from 'lucide-react'

export default function AdminKnowledgePage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const { toast } = useToast()

  const { data, isLoading } = useKnowledgeEntries({
    page,
    limit: 20,
    search: search || undefined,
    status: status as any,
  })

  const deleteMutation = useDeleteKnowledgeEntry()

  const handleDelete = async (entryId: string) => {
    try {
      await deleteMutation.mutateAsync(entryId)
      toast({
        title: 'Entrada excluída',
        description: 'A entrada foi removida com sucesso',
      })
    } catch (error) {
      toast({
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir a entrada',
        variant: 'destructive',
      })
    }
  }

  const handleReindex = async (entryId: string) => {
    try {
      const response = await fetch(`/api/admin/knowledge/${entryId}/reindex`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Reindex failed')

      toast({
        title: 'Reindexação concluída',
        description: 'Os chunks e vetores foram atualizados',
      })
    } catch {
      toast({
        title: 'Erro ao reindexar',
        description: 'Não foi possível reindexar a entrada',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Base de Conhecimento</h1>
          <p className="text-muted-foreground">
            Gerencie o conteúdo que será usado no RAG do chat
          </p>
        </div>
        <Link href="/admin/knowledge/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Nova Entrada
          </Button>
        </Link>
      </div>

      <KnowledgeList
        entries={data?.entries || []}
        isLoading={isLoading}
        onDelete={handleDelete}
        onReindex={handleReindex}
        onSearch={setSearch}
        onStatusFilter={setStatus}
        currentPage={data?.pagination.page || 1}
        totalPages={data?.pagination.totalPages || 1}
        onPageChange={setPage}
      />
    </div>
  )
}
