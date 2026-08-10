'use client'

/**
 * Organization Knowledge Entry Edit Page
 * Edit existing knowledge base entry
 */

import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useOrgKnowledgeEntry, useUpdateOrgKnowledgeEntry } from '@/hooks/use-org-knowledge'
import { useToast } from '@/hooks/use-toast'
import { usePageConfig } from '@/hooks/use-page-config'
import { ArrowLeft, Save } from 'lucide-react'

/**
 * ISO do banco → "AAAA-MM-DD" para o input, lido em Brasília: a validade é
 * gravada como fim do dia BRT (03:00 UTC do dia seguinte), então fatiar o ISO
 * cru mostraria o dia seguinte no campo.
 */
function paraCampoDeData(iso: string): string {
  const data = new Date(iso)
  if (Number.isNaN(data.getTime())) return ''
  return new Date(data.getTime() - 3 * 3600_000).toISOString().slice(0, 10)
}

export default function KnowledgeEditPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const id = params.id as string

  const { data: entry, isLoading } = useOrgKnowledgeEntry(id)
  const updateMutation = useUpdateOrgKnowledgeEntry(id)

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [status, setStatus] = useState<'ACTIVE' | 'DRAFT' | 'ARCHIVED'>('ACTIVE')
  // "AAAA-MM-DD" para o <input type="date">; vazio = sem prazo.
  const [validade, setValidade] = useState('')

  usePageConfig(
    `Editar: ${entry?.title || 'Carregando...'}`,
    'Editar entrada de conhecimento',
    [
      { label: 'Início', href: '/studio' },
      { label: 'Base de Conhecimento', href: '/knowledge' },
      { label: entry?.title || 'Carregando...', href: `/knowledge/${id}` },
      { label: 'Editar' },
    ]
  )

  // Load entry data into form
  useEffect(() => {
    if (entry) {
      setTitle(entry.title)
      setContent(entry.content)
      setTags(entry.tags?.join(', ') || '')
      setStatus(entry.status)
      setValidade(entry.expiresAt ? paraCampoDeData(entry.expiresAt) : '')
    }
  }, [entry])

  const handleStatusChange = (value: 'ACTIVE' | 'DRAFT' | 'ARCHIVED') => {
    setStatus(value)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      await updateMutation.mutateAsync({
        title,
        content,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        status,
        // Sempre enviado: string vazia é o pedido explícito de LIMPAR o prazo.
        expiresAt: validade || null,
      })

      toast({
        title: 'Entrada atualizada!',
        description: 'As alterações foram salvas com sucesso.',
      })

      router.push(`/knowledge/${id}`)
    } catch (error) {
      toast({
        title: 'Erro ao atualizar',
        description: error instanceof Error ? error.message : 'Não foi possível atualizar a entrada',
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
            Esta entrada não existe ou você não tem permissão para editá-la.
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
        <Link href={`/knowledge/${id}`}>
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Cancelar
          </Button>
        </Link>
      </div>

      {/* Form */}
      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Processo de Onboarding"
              required
            />
          </div>

          <div>
            <Label htmlFor="content">Conteúdo</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Descreva o conhecimento em detalhes..."
              rows={15}
              required
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {updateMutation.isPending && 'Ao salvar, o conteúdo será reindexado automaticamente.'}
            </p>
          </div>

          <div>
            <Label htmlFor="tags">Tags (separadas por vírgula)</Label>
            <Input
              id="tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Ex: processo, rh, onboarding"
            />
          </div>

          <div>
            <Label htmlFor="validade">Vale até (opcional)</Label>
            <Input
              id="validade"
              type="date"
              value={validade}
              onChange={(e) => setValidade(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              O dia escolhido conta inteiro. Depois dele a entrada para sozinha de alimentar textos e
              sugestões. Limpe o campo para a entrada voltar a valer para sempre.
            </p>
            {entry.category === 'CAMPANHAS' && !validade && (
              <p className="mt-1.5 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-600 dark:text-amber-400">
                Campanha sem data de fim continua alimentando os textos para sempre — inclusive
                depois de acabar.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={handleStatusChange}>
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Ativo</SelectItem>
                <SelectItem value="DRAFT">Rascunho</SelectItem>
                <SelectItem value="ARCHIVED">Arquivado</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Apenas entradas ativas são usadas pelo RAG no chat
            </p>
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="submit"
              disabled={updateMutation.isPending}
              className="flex-1"
            >
              <Save className="h-4 w-4 mr-2" />
              {updateMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
            <Link href={`/knowledge/${id}`} className="flex-1">
              <Button type="button" variant="outline" className="w-full">
                Cancelar
              </Button>
            </Link>
          </div>
        </form>
      </Card>
    </div>
  )
}
