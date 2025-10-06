"use client"

import * as React from 'react'
import { useSetPageMetadata } from '@/contexts/page-metadata'
import { useKnowledgeBase, useDeleteKnowledgeBaseEntry, type EntryStatus } from '@/hooks/use-knowledge-base'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { useToast } from '@/hooks/use-toast'
import { Plus, Search, FileText, Edit, Trash2, Archive } from 'lucide-react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function KnowledgeBasePage() {
  const [statusFilter, setStatusFilter] = React.useState<EntryStatus | 'ALL'>('ACTIVE')
  const [searchQuery, setSearchQuery] = React.useState('')
  const [deleteId, setDeleteId] = React.useState<string | null>(null)

  const { toast } = useToast()
  const { data: entries, isLoading } = useKnowledgeBase(
    statusFilter === 'ALL' ? undefined : statusFilter
  )
  const deleteMutation = useDeleteKnowledgeBaseEntry()

  useSetPageMetadata({
    title: 'Base de Conhecimento',
    description: 'Gerencie seus documentos e informações',
    breadcrumbs: [{ label: 'Base de Conhecimento' }],
  })

  const filteredEntries = React.useMemo(() => {
    if (!entries) return []
    if (!searchQuery) return entries

    const query = searchQuery.toLowerCase()
    return entries.filter(
      (entry) =>
        entry.title.toLowerCase().includes(query) ||
        entry.content.toLowerCase().includes(query) ||
        entry.tags.some((tag) => tag.toLowerCase().includes(query))
    )
  }, [entries, searchQuery])

  const handleDelete = async () => {
    if (!deleteId) return

    try {
      await deleteMutation.mutateAsync(deleteId)
      toast({
        title: 'Entrada removida',
        description: 'A entrada foi deletada com sucesso.',
      })
      setDeleteId(null)
    } catch (error) {
      toast({
        title: 'Erro ao remover entrada',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  const getStatusBadge = (status: EntryStatus) => {
    const variants = {
      ACTIVE: 'default',
      DRAFT: 'secondary',
      ARCHIVED: 'outline',
    } as const

    const labels = {
      ACTIVE: 'Ativo',
      DRAFT: 'Rascunho',
      ARCHIVED: 'Arquivado',
    }

    return (
      <Badge variant={variants[status]}>
        {labels[status]}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por título, conteúdo ou tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as EntryStatus | 'ALL')}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos</SelectItem>
              <SelectItem value="ACTIVE">Ativos</SelectItem>
              <SelectItem value="DRAFT">Rascunhos</SelectItem>
              <SelectItem value="ARCHIVED">Arquivados</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button asChild>
          <Link href="/knowledge-base/new">
            <Plus className="mr-2 h-4 w-4" />
            Nova Entrada
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <Card key={idx} className="p-6">
              <Skeleton className="h-6 w-3/4 mb-3" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-5/6 mb-4" />
              <Skeleton className="h-5 w-20" />
            </Card>
          ))}
        </div>
      ) : filteredEntries.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredEntries.map((entry) => (
            <Card
              key={entry.id}
              className="p-6 border border-border/40 bg-card/70 hover:bg-accent/30 transition-colors"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                    <h3 className="font-semibold text-base line-clamp-2" title={entry.title}>
                      {entry.title}
                    </h3>
                  </div>
                  {getStatusBadge(entry.status)}
                </div>

                <p className="text-sm text-muted-foreground line-clamp-3">
                  {entry.content}
                </p>

                {entry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {entry.tags.slice(0, 3).map((tag, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {entry.tags.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{entry.tags.length - 3}
                      </Badge>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(entry.updatedAt), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </span>

                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      asChild
                      className="h-8 w-8"
                    >
                      <Link href={`/knowledge-base/${entry.id}/edit`}>
                        <Edit className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-red-500 hover:text-red-600"
                      onClick={() => setDeleteId(entry.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-12 text-center">
          <Archive className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="text-lg font-semibold mb-2">
            {searchQuery ? 'Nenhum resultado encontrado' : 'Nenhuma entrada ainda'}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            {searchQuery
              ? 'Tente ajustar sua busca ou filtros'
              : 'Crie sua primeira entrada na base de conhecimento'}
          </p>
          {!searchQuery && (
            <Button asChild>
              <Link href="/knowledge-base/new">
                <Plus className="mr-2 h-4 w-4" />
                Nova Entrada
              </Link>
            </Button>
          )}
        </Card>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta entrada? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-500 hover:bg-red-600"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
