'use client'

/**
 * Admin Knowledge Base - View Entry Details
 * Display entry details and chunks
 */

import { use } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useKnowledgeEntry } from '@/hooks/admin/use-admin-knowledge'
import { ArrowLeft, Edit } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function KnowledgeEntryDetailsPage({ params }: PageProps) {
  const { id } = use(params)
  const { data: entry, isLoading } = useKnowledgeEntry(id)

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'Ativo'
      case 'DRAFT':
        return 'Rascunho'
      case 'ARCHIVED':
        return 'Arquivado'
      default:
        return status
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
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
      <div className="flex justify-between items-start">
        <div>
          <Link href="/admin/knowledge">
            <Button variant="ghost" size="sm" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">{entry.title}</h1>
          <div className="flex gap-2 items-center mt-2">
            <Badge>{getStatusLabel(entry.status)}</Badge>
            <span className="text-sm text-muted-foreground">
              {entry.chunks.length} chunk{entry.chunks.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <Link href={`/admin/knowledge/${id}/edit`}>
          <Button>
            <Edit className="w-4 h-4 mr-2" />
            Editar
          </Button>
        </Link>
      </div>

      {/* Tags */}
      {entry.tags.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Tags</h3>
          <div className="flex flex-wrap gap-2">
            {entry.tags.map((tag, i) => (
              <Badge key={i} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <Card>
        <CardHeader>
          <CardTitle>Conteúdo Original</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap font-mono text-sm bg-muted p-4 rounded-lg overflow-x-auto">
            {entry.content}
          </pre>
        </CardContent>
      </Card>

      {/* Chunks */}
      <Card>
        <CardHeader>
          <CardTitle>Chunks Indexados ({entry.chunks.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {entry.chunks.map((chunk) => (
            <div
              key={chunk.id}
              className="border rounded-lg p-4 bg-muted/50 space-y-2"
            >
              <div className="flex justify-between items-start">
                <div className="text-sm font-medium">
                  Chunk #{chunk.ordinal + 1}
                </div>
                <div className="text-xs text-muted-foreground">
                  {chunk.tokens} tokens
                </div>
              </div>
              <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
                {chunk.content}
              </pre>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle>Metadados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">ID:</span>
            <span className="font-mono">{entry.id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Criado em:</span>
            <span>{new Date(entry.createdAt).toLocaleString('pt-BR')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Atualizado em:</span>
            <span>{new Date(entry.updatedAt).toLocaleString('pt-BR')}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
