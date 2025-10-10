'use client'

import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { useAdminComponent, useUpdateComponent } from '@/hooks/admin/use-admin-components'

export default function ComponentEditPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const componentId = params.id as string

  const { data, isLoading, error } = useAdminComponent(componentId)
  const updateMutation = useUpdateComponent(componentId)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [contentJson, setContentJson] = useState('')

  // Inicializar estados quando os dados carregarem
  useState(() => {
    if (data?.component) {
      setName(data.component.name)
      setDescription(data.component.description || '')
      setContentJson(JSON.stringify(data.component.content, null, 2))
    }
  })

  const handleSave = async () => {
    try {
      // Validar JSON
      let parsedContent
      try {
        parsedContent = JSON.parse(contentJson)
      } catch (_e) {
        toast({
          title: 'Erro no JSON',
          description: 'O conteúdo JSON é inválido. Verifique a sintaxe.',
          variant: 'destructive',
        })
        return
      }

      await updateMutation.mutateAsync({
        name,
        description: description || undefined,
        content: parsedContent,
      })

      toast({
        title: 'Componente atualizado',
        description: 'As alterações foram salvas com sucesso.',
      })
    } catch (_error) {
      toast({
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar as alterações.',
        variant: 'destructive',
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10" />
            <div>
              <Skeleton className="h-8 w-64 mb-2" />
              <Skeleton className="h-4 w-96" />
            </div>
          </div>
          <Skeleton className="h-10 w-24" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (error || !data?.component) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <h2 className="text-2xl font-bold mb-4">Componente não encontrado</h2>
        <p className="text-muted-foreground mb-6">
          O componente que você está procurando não existe.
        </p>
        <Button onClick={() => router.push('/admin/content/components')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar para Componentes
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/admin/content/components')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{data.component.name}</h1>
            <p className="text-muted-foreground">
              Edite o componente reutilizável
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Salvar Alterações
            </>
          )}
        </Button>
      </div>

      {/* Editor */}
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* Content Editor */}
        <Card>
          <CardHeader>
            <CardTitle>Conteúdo do Componente</CardTitle>
            <CardDescription>
              Edite o JSON que define o conteúdo padrão deste componente
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={contentJson}
              onChange={(e) => setContentJson(e.target.value)}
              className="font-mono text-sm min-h-[500px]"
              placeholder="{}"
            />
          </CardContent>
        </Card>

        {/* Settings */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Configurações</CardTitle>
              <CardDescription>Informações básicas do componente</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="component-name">Nome</Label>
                <Input
                  id="component-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome do componente"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="component-desc">Descrição</Label>
                <Textarea
                  id="component-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva o componente..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Tipo</Label>
                <Input value={data.component.type} disabled />
              </div>

              <div className="space-y-2">
                <Label>Slug</Label>
                <Input value={data.component.slug} disabled />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Informações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Global:</span>
                <span className="font-medium">
                  {data.component.isGlobal ? 'Sim' : 'Não'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Criado em:</span>
                <span className="font-medium">
                  {new Date(data.component.createdAt).toLocaleDateString('pt-BR')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Atualizado em:</span>
                <span className="font-medium">
                  {new Date(data.component.updatedAt).toLocaleDateString('pt-BR')}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
