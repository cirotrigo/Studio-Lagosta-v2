'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  MoreHorizontal,
  Eye,
  Copy,
  Trash2,
  CheckCircle2,
  Clock,
  Archive,
  Edit,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
import {
  useDeletePage,
  useDuplicatePage,
  useTogglePagePublish,
  type CMSPage,
} from '@/hooks/admin/use-admin-cms'
import { useToast } from '@/hooks/use-toast'

type PagesTableProps = {
  pages: CMSPage[]
  isLoading: boolean
}

const statusConfig = {
  DRAFT: {
    label: 'Rascunho',
    icon: Clock,
    variant: 'secondary' as const,
  },
  PUBLISHED: {
    label: 'Publicado',
    icon: CheckCircle2,
    variant: 'default' as const,
  },
  ARCHIVED: {
    label: 'Arquivado',
    icon: Archive,
    variant: 'outline' as const,
  },
}

export function PagesTable({ pages, isLoading }: PagesTableProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [pageToDelete, setPageToDelete] = useState<string | null>(null)

  const deleteMutation = useDeletePage()
  const duplicateMutation = useDuplicatePage()
  const togglePublishMutation = useTogglePagePublish(pageToDelete || '')

  const handleDelete = async () => {
    if (!pageToDelete) return

    try {
      await deleteMutation.mutateAsync(pageToDelete)
      toast({
        title: 'Página deletada',
        description: 'A página foi deletada com sucesso.',
      })
      setDeleteDialogOpen(false)
      setPageToDelete(null)
    } catch (error) {
      toast({
        title: 'Erro ao deletar',
        description: 'Não foi possível deletar a página.',
        variant: 'destructive',
      })
    }
  }

  const handleDuplicate = async (id: string) => {
    try {
      await duplicateMutation.mutateAsync(id)
      toast({
        title: 'Página duplicada',
        description: 'A página foi duplicada com sucesso.',
      })
    } catch (error) {
      toast({
        title: 'Erro ao duplicar',
        description: 'Não foi possível duplicar a página.',
        variant: 'destructive',
      })
    }
  }

  const handleTogglePublish = async (id: string, currentStatus: string) => {
    const shouldPublish = currentStatus !== 'PUBLISHED'

    try {
      await togglePublishMutation.mutateAsync(shouldPublish)
      toast({
        title: shouldPublish ? 'Página publicada' : 'Página despublicada',
        description: shouldPublish
          ? 'A página está agora visível no site.'
          : 'A página não está mais visível no site.',
      })
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível alterar o status da página.',
        variant: 'destructive',
      })
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  if (!pages.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center text-center">
          <h3 className="mt-4 text-lg font-semibold">Nenhuma página encontrada</h3>
          <p className="mb-4 mt-2 text-sm text-muted-foreground">
            Você ainda não criou nenhuma página. Comece criando sua primeira página.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Caminho</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Atualizado</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pages.map((page) => {
              const StatusIcon = statusConfig[page.status].icon
              return (
                <TableRow key={page.id}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{page.title}</span>
                        {page.isHome && (
                          <Badge variant="outline" className="text-xs">
                            Home
                          </Badge>
                        )}
                      </div>
                      {page.description && (
                        <span className="text-xs text-muted-foreground line-clamp-1">
                          {page.description}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs">{page.path}</code>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusConfig[page.status].variant}>
                      <StatusIcon className="mr-1 h-3 w-3" />
                      {statusConfig[page.status].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(page.updatedAt), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            router.push(`/admin/content/pages/${page.id}`)
                          }
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        {page.status === 'PUBLISHED' && (
                          <DropdownMenuItem
                            onClick={() => window.open(page.path, '_blank')}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            Visualizar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => handleTogglePublish(page.id, page.status)}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          {page.status === 'PUBLISHED' ? 'Despublicar' : 'Publicar'}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(page.id)}>
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => {
                            setPageToDelete(page.id)
                            setDeleteDialogOpen(true)
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Deletar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso irá deletar permanentemente a
              página e todas as suas seções.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deletar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
