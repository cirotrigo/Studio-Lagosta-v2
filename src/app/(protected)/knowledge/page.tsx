'use client'

/**
 * Organization Knowledge Base - Member Access
 * Allows all organization members to view and contribute
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  useOrgKnowledgeEntries,
  useCreateOrgKnowledgeEntry,
  useUploadOrgKnowledgeFile,
} from '@/hooks/use-org-knowledge'
import { useToast } from '@/hooks/use-toast'
import { usePageConfig } from '@/hooks/use-page-config'
import { Plus, Upload, BookOpen, Clock } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function OrgKnowledgePage() {
  usePageConfig('Base de Conhecimento', 'Colabore com conhecimento compartilhado da organização', [
    { label: 'Início', href: '/dashboard' },
    { label: 'Base de Conhecimento' },
  ])

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [search, setSearch] = useState('')
  const { toast } = useToast()

  // Form states
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const { data, isLoading } = useOrgKnowledgeEntries({
    page: 1,
    limit: 50,
    search: search || undefined,
  })

  const createMutation = useCreateOrgKnowledgeEntry()
  const uploadMutation = useUploadOrgKnowledgeFile()

  const handleSubmitText = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      await createMutation.mutateAsync({
        title,
        content,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        status: 'ACTIVE',
      })

      toast({
        title: 'Conhecimento adicionado!',
        description: 'A entrada foi indexada e está disponível para toda a organização.',
      })

      // Reset form
      setTitle('')
      setContent('')
      setTags('')
      setIsDialogOpen(false)
    } catch (error) {
      toast({
        title: 'Erro ao adicionar',
        description: error instanceof Error ? error.message : 'Não foi possível adicionar a entrada',
        variant: 'destructive',
      })
    }
  }

  const handleSubmitFile = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!file) return

    try {
      const fileContent = await file.text()

      await uploadMutation.mutateAsync({
        title,
        filename: file.name,
        fileContent,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        status: 'ACTIVE',
      })

      toast({
        title: 'Arquivo processado!',
        description: 'O documento foi indexado e está disponível para busca.',
      })

      // Reset form
      setTitle('')
      setFile(null)
      setTags('')
      setIsDialogOpen(false)
    } catch (error) {
      toast({
        title: 'Erro ao processar arquivo',
        description: error instanceof Error ? error.message : 'Não foi possível processar o arquivo',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Base de Conhecimento Compartilhada</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Contribua e acesse conhecimento da sua organização
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Adicionar Conhecimento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Adicionar à Base de Conhecimento</DialogTitle>
            </DialogHeader>

            <Tabs defaultValue="text" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="text">Texto</TabsTrigger>
                <TabsTrigger value="file">Arquivo</TabsTrigger>
              </TabsList>

              <TabsContent value="text">
                <form onSubmit={handleSubmitText} className="space-y-4 mt-4">
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
                      rows={8}
                      required
                    />
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

                  <Button type="submit" disabled={createMutation.isPending} className="w-full">
                    {createMutation.isPending ? 'Adicionando...' : 'Adicionar Conhecimento'}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="file">
                <form onSubmit={handleSubmitFile} className="space-y-4 mt-4">
                  <div>
                    <Label htmlFor="file-title">Título</Label>
                    <Input
                      id="file-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Ex: Manual de Procedimentos"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="file">Arquivo (TXT ou Markdown)</Label>
                    <div className="mt-2">
                      <Input
                        id="file"
                        type="file"
                        accept=".txt,.md,.markdown"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        required
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Formatos suportados: .txt, .md, .markdown
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="file-tags">Tags (separadas por vírgula)</Label>
                    <Input
                      id="file-tags"
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                      placeholder="Ex: manual, procedimentos, guia"
                    />
                  </div>

                  <Button type="submit" disabled={uploadMutation.isPending || !file} className="w-full">
                    {uploadMutation.isPending ? 'Processando...' : 'Fazer Upload'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div>
        <Input
          placeholder="Buscar na base de conhecimento..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
      </div>

      {/* Entries List */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Carregando...
        </div>
      ) : !data?.entries || data.entries.length === 0 ? (
        <Card className="p-12 text-center">
          <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhum conhecimento cadastrado</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Seja o primeiro a contribuir para a base de conhecimento da organização!
          </p>
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Primeiro Conhecimento
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.entries.map((entry) => (
            <Card key={entry.id} className="p-4 hover:shadow-lg transition-shadow">
              <div className="space-y-2">
                <h3 className="font-semibold line-clamp-1">{entry.title}</h3>
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {entry.content}
                </p>

                {entry.tags && entry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {entry.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="text-xs bg-muted px-2 py-0.5 rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(entry.updatedAt).toLocaleDateString()}
                  </div>
                  <div>
                    {entry._count?.chunks || 0} chunks
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {data && data.pagination.total > 0 && (
        <div className="text-sm text-muted-foreground text-center">
          Mostrando {data.entries.length} de {data.pagination.total} entradas
        </div>
      )}
    </div>
  )
}
