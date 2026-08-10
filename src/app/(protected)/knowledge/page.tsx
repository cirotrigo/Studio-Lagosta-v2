'use client'

/**
 * Organization Knowledge Base - Member Access
 * Allows all organization members to view and contribute
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  useOrgKnowledgeEntries,
  useCreateOrgKnowledgeEntry,
  useUploadOrgKnowledgeFile,
  useDeleteOrgKnowledgeEntry,
} from '@/hooks/use-org-knowledge'
import { useToast } from '@/hooks/use-toast'
import { usePageConfig } from '@/hooks/use-page-config'
import { Plus, BookOpen, Clock, CalendarClock, Eye, Edit, Trash2, MoreVertical } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { KnowledgeCategory } from '@prisma/client'
import { useProjects } from '@/hooks/use-project'
import { ProjectSelector } from '@/app/(protected)/drive/_components/project-selector'
import { useProjectSelectionStore } from '@/stores/project-selection'

export default function OrgKnowledgePage() {
  usePageConfig('Base de Conhecimento', 'Colabore com conhecimento compartilhado da organização', [
    { label: 'Início', href: '/studio' },
    { label: 'Base de Conhecimento' },
  ])

  const categories: KnowledgeCategory[] = [
    'ESTABELECIMENTO_INFO',
    'HORARIOS',
    'CARDAPIO',
    'DELIVERY',
    'POLITICAS',
    'TOM_DE_VOZ',
    'CAMPANHAS',
    'DIFERENCIAIS',
    'FAQ',
  ]

  const router = useRouter()
  const searchParams = useSearchParams()
  const projectIdParam = searchParams.get('projectId')
  const initialProjectFromQuery = useMemo(() => {
    const parsed = projectIdParam ? Number(projectIdParam) : null
    return parsed && !Number.isNaN(parsed) ? parsed : null
  }, [projectIdParam])

  const persistedProjectId = useProjectSelectionStore(state => state.lastProjectId)
  const setPersistedProjectId = useProjectSelectionStore(state => state.setLastProjectId)
  const hasProjectSelectionHydrated = useProjectSelectionStore(state => state.hasHydrated)

  const { data: projects, isLoading: isLoadingProjects } = useProjects()
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(initialProjectFromQuery)

  // Seleciona projeto inicial (query param válido ou primeiro da lista)
  useEffect(() => {
    if (!projects || projects.length === 0) return
    if (!hasProjectSelectionHydrated && !initialProjectFromQuery) return

    const isValidProject = (id: number | null) =>
      id != null && projects.some(p => p.id === id)

    if (initialProjectFromQuery && isValidProject(initialProjectFromQuery)) {
      if (selectedProjectId !== initialProjectFromQuery) {
        setSelectedProjectId(initialProjectFromQuery)
      }
      if (persistedProjectId !== initialProjectFromQuery) {
        setPersistedProjectId(initialProjectFromQuery)
      }
      return
    }

    if (selectedProjectId != null && isValidProject(selectedProjectId)) {
      if (persistedProjectId !== selectedProjectId) {
        setPersistedProjectId(selectedProjectId)
      }
      return
    }

    if (isValidProject(persistedProjectId)) {
      setSelectedProjectId(persistedProjectId)
      return
    }

    const fallbackId = projects[0].id
    setSelectedProjectId(fallbackId)
    setPersistedProjectId(fallbackId)
  }, [
    projects,
    selectedProjectId,
    initialProjectFromQuery,
    persistedProjectId,
    hasProjectSelectionHydrated,
    setPersistedProjectId,
  ])

  const hasProject = selectedProjectId != null && !Number.isNaN(selectedProjectId ?? NaN)
  const selectedProject = useMemo(
    () => projects?.find(p => p.id === selectedProjectId),
    [projects, selectedProjectId]
  )
  const handleProjectChange = useCallback((projectId: number | null) => {
    setSelectedProjectId(projectId)
    if (projectId != null) {
      setPersistedProjectId(projectId)
    }
  }, [setPersistedProjectId])

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [search, setSearch] = useState('')
  const { toast } = useToast()

  // Form states
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [category, setCategory] = useState<KnowledgeCategory>('ESTABELECIMENTO_INFO')
  // "AAAA-MM-DD" vindo do <input type="date">; vazio significa "vale sempre".
  const [validade, setValidade] = useState('')

  const { data, isLoading } = useOrgKnowledgeEntries(
    {
      page: 1,
      limit: 50,
      search: search || undefined,
      projectId: hasProject ? selectedProjectId! : 0,
      category: undefined,
    },
    { enabled: hasProject }
  )

  const createMutation = useCreateOrgKnowledgeEntry()
  const uploadMutation = useUploadOrgKnowledgeFile()
  const deleteMutation = useDeleteOrgKnowledgeEntry()

  const handleSubmitText = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      await createMutation.mutateAsync({
        projectId: selectedProjectId!,
        category,
        title,
        content,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        status: 'ACTIVE',
        expiresAt: validade || null,
      })

      toast({
        title: 'Conhecimento adicionado!',
        description: validade
          ? `A entrada foi indexada e vale até ${formatarDataBR(validade)} — depois disso ela sai sozinha dos textos.`
          : 'A entrada foi indexada e está disponível para toda a organização.',
      })

      // Reset form
      setTitle('')
      setContent('')
      setTags('')
      setValidade('')
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
        projectId: selectedProjectId!,
        category,
        title,
        filename: file.name,
        fileContent,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        status: 'ACTIVE',
        expiresAt: validade || null,
      })

      toast({
        title: 'Arquivo processado!',
        description: validade
          ? `O documento foi indexado e vale até ${formatarDataBR(validade)}.`
          : 'O documento foi indexado e está disponível para busca.',
      })

      // Reset form
      setTitle('')
      setFile(null)
      setTags('')
      setValidade('')
      setIsDialogOpen(false)
    } catch (error) {
      toast({
        title: 'Erro ao processar arquivo',
        description: error instanceof Error ? error.message : 'Não foi possível processar o arquivo',
        variant: 'destructive',
      })
    }
  }

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Tem certeza que deseja excluir "${title}"?`)) {
      return
    }

    try {
      await deleteMutation.mutateAsync(id)

      toast({
        title: 'Entrada excluída!',
        description: 'A entrada foi removida da base de conhecimento.',
      })
    } catch (error) {
      toast({
        title: 'Erro ao excluir',
        description: error instanceof Error ? error.message : 'Não foi possível excluir a entrada',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Projeto selecionado</p>
            <p className="font-semibold">
              {selectedProject?.name ?? (isLoadingProjects ? 'Carregando...' : 'Nenhum projeto')}
            </p>
          </div>
          <ProjectSelector
            projects={projects || []}
            value={selectedProjectId}
            onChange={handleProjectChange}
            isLoading={isLoadingProjects}
          />
        </div>
      </Card>

      {!hasProject ? (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">
            Nenhum projeto disponível. Crie um projeto ou aguarde o carregamento para gerenciar a base de conhecimento.
          </p>
        </Card>
      ) : (
        <>
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
                <Button className="gap-2" disabled={!hasProject}>
                  <Plus className="h-4 w-4" />
                  Adicionar Conhecimento
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Adicionar à Base de Conhecimento</DialogTitle>
                  <DialogDescription>
                    Adicione conhecimento em formato de texto ou faça upload de um arquivo para compartilhar com sua organização.
                  </DialogDescription>
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
                        <Label htmlFor="category">Categoria</Label>
                        <Select value={category} onValueChange={(val) => setCategory(val as KnowledgeCategory)}>
                          <SelectTrigger id="category">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map((cat) => (
                              <SelectItem key={cat} value={cat}>
                                {cat === 'TOM_DE_VOZ' ? 'TOM DE VOZ (legado)' : cat.replace(/_/g, ' ')}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {category === 'TOM_DE_VOZ' && <TomDeVozLegacyNotice />}
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

                      <ValidadeField
                        id="validade"
                        value={validade}
                        onChange={setValidade}
                        category={category}
                      />

                      <Button type="submit" disabled={createMutation.isPending || !hasProject} className="w-full">
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
                        <Label htmlFor="file-category">Categoria</Label>
                        <Select value={category} onValueChange={(val) => setCategory(val as KnowledgeCategory)}>
                          <SelectTrigger id="file-category">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map((cat) => (
                              <SelectItem key={cat} value={cat}>
                                {cat === 'TOM_DE_VOZ' ? 'TOM DE VOZ (legado)' : cat.replace(/_/g, ' ')}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {category === 'TOM_DE_VOZ' && <TomDeVozLegacyNotice />}
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

                      <ValidadeField
                        id="file-validade"
                        value={validade}
                        onChange={setValidade}
                        category={category}
                      />

                      <Button type="submit" disabled={uploadMutation.isPending || !file || !hasProject} className="w-full">
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
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold line-clamp-1 flex-1">{entry.title}</h3>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/knowledge/${entry.id}`)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Ver detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => router.push(`/knowledge/${entry.id}/edit`)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(entry.id, entry.title)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {entry.category === 'TOM_DE_VOZ' && (
                      <p className="rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-600 dark:text-amber-400">
                        Categoria legado — a identidade agora vive no DNA da marca (aba Marca do projeto).
                      </p>
                    )}

                    {entry.expiresAt && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarClock className="h-3 w-3" />
                        {new Date(entry.expiresAt).getTime() <= Date.now()
                          ? `Venceu em ${formatarDataBR(entry.expiresAt)} — já não alimenta os textos`
                          : `Vale até ${formatarDataBR(entry.expiresAt)}`}
                      </p>
                    )}

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
        </>
      )}
    </div>
  )
}

/**
 * Data que veio como "AAAA-MM-DD" (o valor do input) ou como ISO completo (o
 * `expiresAt` do banco), sempre lida no fuso de Brasília — a entrada gravada
 * como fim do dia 31 é 03:00 UTC do dia 1º, e formatar em UTC mostraria o dia
 * seguinte.
 */
function formatarDataBR(valor: string): string {
  const data = /^\d{4}-\d{2}-\d{2}$/.test(valor) ? new Date(`${valor}T12:00:00-03:00`) : new Date(valor)
  return Number.isNaN(data.getTime())
    ? valor
    : data.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

/**
 * Validade da entrada. O aviso de CAMPANHAS sem prazo é o mesmo que a tool
 * `criar-entrada-base` dá no chat — e, como lá, é aviso e nunca veto: existe
 * campanha permanente ("Quinta do Vinho, toda quinta").
 */
function ValidadeField({
  id,
  value,
  onChange,
  category,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  category: KnowledgeCategory
}) {
  return (
    <div>
      <Label htmlFor={id}>Vale até (opcional)</Label>
      <Input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} />
      <p className="mt-1 text-xs text-muted-foreground">
        O dia escolhido conta inteiro. Depois dele a entrada para sozinha de alimentar textos e
        sugestões. Deixe em branco para informação permanente.
      </p>
      {category === 'CAMPANHAS' && !value && (
        <p className="mt-1.5 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-600 dark:text-amber-400">
          Campanha sem data de fim continua alimentando os textos para sempre — inclusive depois de
          acabar. Se ela tem prazo, preencha aqui.
        </p>
      )}
    </div>
  )
}

/**
 * TOM_DE_VOZ é legado: a base é buscada por relevância e identidade precisa
 * entrar INCONDICIONALMENTE no prompt — por isso ela vive no DNA da marca.
 * Espelha o aviso que a tool `criar-entrada-base` do MCP já dá no chat.
 * A categoria não sai do enum porque entradas antigas existem.
 */
function TomDeVozLegacyNotice() {
  return (
    <p className="mt-1.5 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-600 dark:text-amber-400">
      Tom de voz é categoria legado: a identidade da marca agora vive no{' '}
      <strong>DNA da marca</strong> (aba Marca do projeto), que entra em todo prompt de geração.
      Entradas criadas aqui só aparecem em buscas por relevância — prefira preencher o DNA.
    </p>
  )
}
