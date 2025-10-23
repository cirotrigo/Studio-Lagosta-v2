'use client'

/**
 * Admin Knowledge Base Migration
 * Migrate entries from old workspaceId to Clerk organization IDs
 */

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { usePageConfig } from '@/hooks/use-page-config'
import { ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface MigrationData {
  summary: {
    total: number
    withWorkspace: number
    withoutWorkspace: number
    workspaceCount: number
  }
  workspaceGroups: Record<string, Array<{
    id: string
    title: string
    workspaceId: string | null
    userId: string | null
    status: string
    _count: { chunks: number }
  }>>
  orphanedEntries: Array<{
    id: string
    title: string
    workspaceId: string | null
    userId: string | null
    status: string
    _count: { chunks: number }
  }>
}

export default function KnowledgeMigratePage() {
  usePageConfig('Migração de Base de Conhecimento', 'Migrar registros para organizações do Clerk', [
    { label: 'Admin', href: '/admin' },
    { label: 'Base de Conhecimento', href: '/admin/knowledge' },
    { label: 'Migração' },
  ])

  const [data, setData] = useState<MigrationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [migrating, setMigrating] = useState(false)
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>('')
  const [targetOrgId, setTargetOrgId] = useState('')
  const { toast } = useToast()

  const fetchMigrationData = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/knowledge/migrate-workspace')
      if (!response.ok) throw new Error('Erro ao carregar dados')
      const result = await response.json()
      setData(result)
    } catch (error) {
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Erro ao carregar dados',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void fetchMigrationData()
  }, [fetchMigrationData])

  const handleMigrate = async () => {
    if (!targetOrgId.trim()) {
      toast({
        title: 'Erro',
        description: 'Informe o ID da organização de destino',
        variant: 'destructive',
      })
      return
    }

    if (!targetOrgId.startsWith('org_')) {
      toast({
        title: 'Erro',
        description: 'O ID deve ser um Clerk organization ID (formato: org_...)',
        variant: 'destructive',
      })
      return
    }

    try {
      setMigrating(true)

      const response = await fetch('/api/admin/knowledge/migrate-workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromWorkspaceId: selectedWorkspace || null,
          toOrgId: targetOrgId.trim(),
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Erro ao migrar')
      }

      const result = await response.json()

      toast({
        title: 'Migração concluída!',
        description: result.message,
      })

      // Reload data
      await fetchMigrationData()
      setTargetOrgId('')
      setSelectedWorkspace('')
    } catch (error) {
      toast({
        title: 'Erro na migração',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      })
    } finally {
      setMigrating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Carregando dados de migração...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Erro ao carregar dados</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Sobre a Migração</AlertTitle>
        <AlertDescription>
          Esta ferramenta migra registros da base de conhecimento do workspaceId antigo (ID local do banco)
          para o orgId do Clerk. Após a migração, os registros ficarão disponíveis para todos os membros
          da organização.
        </AlertDescription>
      </Alert>

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Total de Registros</p>
          <p className="text-2xl font-bold">{data.summary.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Com WorkspaceId</p>
          <p className="text-2xl font-bold">{data.summary.withWorkspace}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Órfãos (sem workspace)</p>
          <p className="text-2xl font-bold text-orange-500">{data.summary.withoutWorkspace}</p>
        </Card>
      </div>

      {/* Migration Form */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Migrar Registros</h3>

        <div className="space-y-4">
          <div>
            <Label htmlFor="source">De (WorkspaceId Origem)</Label>
            <select
              id="source"
              value={selectedWorkspace}
              onChange={(e) => setSelectedWorkspace(e.target.value)}
              className="w-full mt-1 p-2 border rounded-md bg-background"
            >
              <option value="">Registros órfãos (sem workspace)</option>
              {Object.keys(data.workspaceGroups).map((wsId) => (
                <option key={wsId} value={wsId}>
                  {wsId} ({data.workspaceGroups[wsId].length} registros)
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Selecione o workspace de origem ou deixe vazio para migrar registros órfãos
            </p>
          </div>

          <div className="flex items-center justify-center py-2">
            <ArrowRight className="h-6 w-6 text-muted-foreground" />
          </div>

          <div>
            <Label htmlFor="target">Para (Clerk Organization ID)</Label>
            <Input
              id="target"
              value={targetOrgId}
              onChange={(e) => setTargetOrgId(e.target.value)}
              placeholder="org_2abcd1234xyz"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Formato: org_... (obtido do Clerk Dashboard ou via /api/debug/org)
            </p>
          </div>

          <Button
            onClick={handleMigrate}
            disabled={migrating || !targetOrgId.trim()}
            className="w-full"
          >
            {migrating ? 'Migrando...' : 'Migrar Registros'}
          </Button>
        </div>
      </Card>

      {/* Preview: Workspace Groups */}
      {Object.keys(data.workspaceGroups).length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Registros por Workspace</h3>
          {Object.entries(data.workspaceGroups).map(([wsId, entries]) => (
            <Card key={wsId} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-mono text-sm">{wsId}</p>
                <span className="text-sm text-muted-foreground">{entries.length} registros</span>
              </div>
              <div className="space-y-1">
                {entries.slice(0, 3).map((entry) => (
                  <div key={entry.id} className="text-sm flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    <span className="truncate">{entry.title}</span>
                    <span className="text-muted-foreground">({entry._count.chunks} chunks)</span>
                  </div>
                ))}
                {entries.length > 3 && (
                  <p className="text-xs text-muted-foreground">
                    ... e mais {entries.length - 3} registros
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Preview: Orphaned Entries */}
      {data.orphanedEntries.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Registros Órfãos (sem workspace)</h3>
          <Card className="p-4">
            <div className="space-y-1">
              {data.orphanedEntries.map((entry) => (
                <div key={entry.id} className="text-sm flex items-center gap-2">
                  <AlertCircle className="h-3 w-3 text-orange-500" />
                  <span className="truncate">{entry.title}</span>
                  <span className="text-muted-foreground">({entry._count.chunks} chunks)</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Help */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Como obter o Organization ID?</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>1. Acesse /api/debug/org enquanto logado na organização desejada</p>
          <p>2. Copie o valor do campo "orgId"</p>
          <p>3. Cole aqui e execute a migração</p>
        </AlertDescription>
      </Alert>
    </div>
  )
}
