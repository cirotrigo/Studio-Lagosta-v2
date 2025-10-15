"use client"

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { useToast } from '@/hooks/use-toast'
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
import { Database, FileQuestion, CheckCircle2, AlertCircle } from 'lucide-react'

interface OrphanedEntry {
  id: string
  title: string
  status: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

interface OrphanedResponse {
  totalEntries: number
  orphanedCount: number
  orphanedEntries: OrphanedEntry[]
  needsMigration: boolean
}

export default function MigrateKnowledgeBasePage() {
  const [selectedIds, setSelectedIds] = React.useState<string[]>([])
  const [showConfirm, setShowConfirm] = React.useState(false)
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data, isLoading, refetch } = useQuery<OrphanedResponse>({
    queryKey: ['orphaned-knowledge-base'],
    queryFn: () => api.get<OrphanedResponse>('/api/admin/knowledge-base/orphaned'),
  })

  const migrateMutation = useMutation({
    mutationFn: (entryIds: string[]) =>
      api.post('/api/admin/knowledge-base/orphaned', { entryIds }),
    onSuccess: (result: { message?: string }) => {
      toast({
        title: 'Migração concluída',
        description: result.message || 'Entradas migradas com sucesso',
      })
      setSelectedIds([])
      setShowConfirm(false)
      refetch()
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] })
    },
    onError: (error) => {
      toast({
        title: 'Erro na migração',
        description: error instanceof Error ? error.message : 'Tente novamente',
        variant: 'destructive',
      })
    },
  })

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    )
  }

  const toggleAll = () => {
    if (!data?.orphanedEntries) return
    if (selectedIds.length === data.orphanedEntries.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(data.orphanedEntries.map((e) => e.id))
    }
  }

  const handleMigrate = () => {
    if (selectedIds.length === 0) return
    setShowConfirm(true)
  }

  const confirmMigration = () => {
    migrateMutation.mutate(selectedIds)
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card className="p-6">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-4 w-full" />
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Migração de Base de Conhecimento</h1>
        <p className="text-muted-foreground">
          Gerencie entradas da base de conhecimento que não possuem usuário associado
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <Database className="h-5 w-5 text-blue-500" />
            <h3 className="font-semibold">Total de Entradas</h3>
          </div>
          <p className="text-3xl font-bold">{data?.totalEntries || 0}</p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <FileQuestion className="h-5 w-5 text-yellow-500" />
            <h3 className="font-semibold">Sem Usuário</h3>
          </div>
          <p className="text-3xl font-bold">{data?.orphanedCount || 0}</p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-2">
            {data?.needsMigration ? (
              <AlertCircle className="h-5 w-5 text-red-500" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            )}
            <h3 className="font-semibold">Status</h3>
          </div>
          <p className="text-lg font-medium">
            {data?.needsMigration ? 'Requer Migração' : 'Tudo OK'}
          </p>
        </Card>
      </div>

      {data && data.orphanedCount > 0 ? (
        <>
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={
                    data.orphanedEntries.length > 0 &&
                    selectedIds.length === data.orphanedEntries.length
                  }
                  onCheckedChange={toggleAll}
                />
                <h3 className="font-semibold">
                  Entradas Órfãs ({selectedIds.length} selecionadas)
                </h3>
              </div>
              <Button
                onClick={handleMigrate}
                disabled={selectedIds.length === 0 || migrateMutation.isPending}
              >
                {migrateMutation.isPending
                  ? 'Migrando...'
                  : `Migrar ${selectedIds.length} para mim`}
              </Button>
            </div>

            <div className="space-y-3">
              {data.orphanedEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <Checkbox
                    checked={selectedIds.includes(entry.id)}
                    onCheckedChange={() => toggleSelection(entry.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium truncate">{entry.title}</h4>
                      <Badge variant="outline">{entry.status}</Badge>
                    </div>
                    {entry.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {entry.tags.map((tag, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Criada em: {new Date(entry.createdAt).toLocaleDateString('pt-BR')} •
                      Atualizada: {new Date(entry.updatedAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Como funciona a migração?
            </h3>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>• Selecione as entradas que deseja migrar</li>
              <li>• As entradas selecionadas serão associadas à sua conta</li>
              <li>• Você poderá editá-las e gerenciá-las normalmente</li>
              <li>• Esta ação não pode ser desfeita automaticamente</li>
            </ul>
          </Card>
        </>
      ) : (
        <Card className="p-12 text-center">
          <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-green-500" />
          <h3 className="text-xl font-semibold mb-2">Tudo certo!</h3>
          <p className="text-muted-foreground">
            Todas as entradas da base de conhecimento já possuem um usuário associado.
          </p>
        </Card>
      )}

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar migração</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a migrar {selectedIds.length} entrada(s) para sua conta.
              As entradas serão associadas a você e aparecerão na sua base de conhecimento.
              Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmMigration}>
              Confirmar Migração
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
