'use client'

/**
 * Organization Knowledge Entry Detail Page
 * View full details of a knowledge base entry
 */

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useOrgKnowledgeEntry, useDeleteOrgKnowledgeEntry } from '@/hooks/use-org-knowledge'
import { useToast } from '@/hooks/use-toast'
import { usePageConfig } from '@/hooks/use-page-config'
import { ArrowLeft, Edit, Trash2, Clock, Calendar } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

export default function KnowledgeDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const id = params.id as string

  const { data: entry, isLoading } = useOrgKnowledgeEntry(id)
  const deleteMutation = useDeleteOrgKnowledgeEntry()

  usePageConfig(
    entry?.title || 'Carregando...',
    'Detalhes da entrada de conhecimento',
    [
      { label: 'Início', href: '/dashboard' },
      { label: 'Base de Conhecimento', href: '/knowledge' },
      { label: entry?.title || 'Detalhes' },
    ]
  )

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(id)

      toast({
        title: 'Entrada excluída!',
        description: 'A entrada foi removida da base de conhecimento.',
      })

      router.push('/knowledge')
    } catch (error) {
      toast({
        title: 'Erro ao excluir',
        description: error instanceof Error ? error.message : 'Não foi possível excluir a entrada',
        variant: 'destructive',
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    )
  }

  if (!entry) {
    return (
      <div className="space-y-4">
        <Card className="p-12 text-center">
          <h3 className="text-lg font-semibold mb-2">Entrada não encontrada</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Esta entrada não existe ou você não tem permissão para visualizá-la.
          </p>
          <Link href="/knowledge">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href="/knowledge">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </Link>

        <div className="flex gap-2">
          <Link href={`/knowledge/${id}/edit`}>
            <Button variant="outline">
              <Edit className="h-4 w-4 mr-2" />
              Editar
            </Button>
          </Link>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação não pode ser desfeita. A entrada será permanentemente removida da
                  base de conhecimento da organização.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Content */}
      <Card className="p-6">
        <div className="space-y-6">
          {/* Title */}
          <div>
            <h1 className="text-3xl font-bold">{entry.title}</h1>
          </div>

          {/* Metadata */}
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground border-b pb-4">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              <span>Criado em {new Date(entry.createdAt).toLocaleDateString('pt-BR')}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>Atualizado em {new Date(entry.updatedAt).toLocaleDateString('pt-BR')}</span>
            </div>
            <div>
              <span className="font-medium">Status:</span>{' '}
              <span className={
                entry.status === 'ACTIVE' ? 'text-green-600' :
                entry.status === 'DRAFT' ? 'text-yellow-600' :
                'text-gray-600'
              }>
                {entry.status === 'ACTIVE' ? 'Ativo' :
                 entry.status === 'DRAFT' ? 'Rascunho' :
                 'Arquivado'}
              </span>
            </div>
            <div>
              <span className="font-medium">Chunks:</span> {entry._count?.chunks || 0}
            </div>
          </div>

          {/* Tags */}
          {entry.tags && entry.tags.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {entry.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="bg-muted px-3 py-1 rounded-full text-sm"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Content */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Conteúdo</h3>
            <div className="prose prose-sm max-w-none bg-muted/30 p-4 rounded-lg">
              <pre className="whitespace-pre-wrap font-sans text-sm">{entry.content}</pre>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
