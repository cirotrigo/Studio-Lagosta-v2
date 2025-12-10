'use client'

/**
 * Knowledge Base Entry Form
 * Create or edit knowledge base entries with text or file upload
 */

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Upload } from 'lucide-react'
import type { KnowledgeCategory } from '@prisma/client'

const MAX_CONTENT_LENGTH = 50000

const KNOWLEDGE_CATEGORIES: KnowledgeCategory[] = [
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

const entrySchema = z.object({
  projectId: z.number().int().positive('projectId é obrigatório'),
  category: z.enum(KNOWLEDGE_CATEGORIES),
  title: z.string().min(1, 'Título é obrigatório').max(500),
  content: z.string().min(1, 'Conteúdo é obrigatório').max(MAX_CONTENT_LENGTH, `O conteúdo não pode exceder ${MAX_CONTENT_LENGTH.toLocaleString()} caracteres`),
  tags: z.string().optional(),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).default('ACTIVE'),
})

type EntryFormData = z.infer<typeof entrySchema>

interface KnowledgeFormProps {
  mode?: 'create' | 'edit'
  projectId: number
  initialData?: {
    projectId?: number
    category?: KnowledgeCategory
    title: string
    content: string
    tags: string[]
    status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  }
  onSubmit: (data: {
    projectId: number
    category: KnowledgeCategory
    title: string
    content: string
    tags: string[]
    status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  }) => Promise<void>
  onFileUpload?: (data: {
    projectId: number
    category: KnowledgeCategory
    title: string
    filename: string
    fileContent: string
    tags: string[]
    status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  }) => Promise<void>
  isLoading?: boolean
}

export function KnowledgeForm({
  mode = 'create',
  projectId,
  initialData,
  onSubmit,
  onFileUpload,
  isLoading = false,
}: KnowledgeFormProps) {
  const [uploadMode, setUploadMode] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const { toast } = useToast()

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<EntryFormData>({
    resolver: zodResolver(entrySchema),
    defaultValues: {
      projectId: initialData?.projectId ?? projectId,
      category: initialData?.category || KNOWLEDGE_CATEGORIES[0],
      title: initialData?.title || '',
      content: initialData?.content || '',
      tags: initialData?.tags.join(', ') || '',
      status: initialData?.status || 'ACTIVE',
    },
  })

  const tagsValue = watch('tags')
  const statusValue = watch('status')
  const categoryValue = watch('category')
  const contentValue = watch('content')

  const contentLength = contentValue?.length || 0
  const isContentOverLimit = contentLength > MAX_CONTENT_LENGTH

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const ext = file.name.toLowerCase().split('.').pop()
    if (ext !== 'txt' && ext !== 'md') {
      toast({
        title: 'Formato inválido',
        description: 'Apenas arquivos TXT e MD são suportados',
        variant: 'destructive',
      })
      return
    }

    setSelectedFile(file)
    setValue('title', file.name.replace(/\.(txt|md)$/i, ''))
  }

  const handleFormSubmit = async (data: EntryFormData) => {
    const tags = data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : []

    if (uploadMode && selectedFile && onFileUpload) {
      // File upload mode
      const fileContent = await selectedFile.text()
      await onFileUpload({
        projectId: data.projectId,
        category: data.category,
        title: data.title,
        filename: selectedFile.name,
        fileContent,
        tags,
        status: data.status,
      })
    } else {
      // Text entry mode
      await onSubmit({
        projectId: data.projectId,
        category: data.category,
        title: data.title,
        content: data.content,
        tags,
        status: data.status,
      })
    }
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {mode === 'create' && onFileUpload && (
        <div className="flex gap-2 border-b pb-4">
          <Button
            type="button"
            variant={!uploadMode ? 'default' : 'outline'}
            onClick={() => {
              setUploadMode(false)
              setSelectedFile(null)
            }}
          >
            Texto
          </Button>
          <Button
            type="button"
            variant={uploadMode ? 'default' : 'outline'}
            onClick={() => setUploadMode(true)}
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Arquivo
          </Button>
        </div>
      )}

      {uploadMode && mode === 'create' ? (
        <div className="space-y-4">
          <div>
            <Label htmlFor="file">Arquivo (TXT ou MD)</Label>
            <Input
              id="file"
              type="file"
              accept=".txt,.md"
              onChange={handleFileSelect}
              disabled={isLoading}
            />
            {selectedFile && (
              <p className="text-sm text-muted-foreground mt-2">
                Arquivo selecionado: {selectedFile.name}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <Label htmlFor="projectId">Projeto</Label>
              <Input
                id="projectId"
                type="number"
                min={1}
                {...register('projectId', { valueAsNumber: true })}
                disabled={isLoading || Boolean(initialData?.projectId)}
              />
              {errors.projectId && (
                <p className="text-sm text-destructive mt-1">{errors.projectId.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="category">Categoria</Label>
              <Select
                value={categoryValue}
                onValueChange={(value) => setValue('category', value as KnowledgeCategory)}
                disabled={isLoading}
              >
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KNOWLEDGE_CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>
                      {cat.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category && (
                <p className="text-sm text-destructive mt-1">{errors.category.message}</p>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center mb-2">
            <Label htmlFor="content">Conteúdo</Label>
            <div className={`text-xs ${isContentOverLimit ? 'text-destructive' : 'text-muted-foreground'}`}>
              {contentLength.toLocaleString()} / {MAX_CONTENT_LENGTH.toLocaleString()} caracteres
              {isContentOverLimit && (
                <span className="ml-2 font-medium">
                  (excede o limite em {(contentLength - MAX_CONTENT_LENGTH).toLocaleString()})
                </span>
              )}
            </div>
          </div>
          <Textarea
            id="content"
            {...register('content')}
            rows={10}
            disabled={isLoading}
            className={`font-mono text-sm ${isContentOverLimit ? 'border-destructive' : ''}`}
          />
          {errors.content && (
            <p className="text-sm text-destructive mt-1">{errors.content.message}</p>
          )}
          {isContentOverLimit && (
            <p className="text-sm text-destructive mt-1">
              O conteúdo excede o limite máximo. Considere dividir em múltiplas entradas.
            </p>
          )}
        </div>
      )}

      <div>
        <Label htmlFor="title">Título</Label>
        <Input
          id="title"
          {...register('title')}
          disabled={isLoading}
        />
        {errors.title && (
          <p className="text-sm text-destructive mt-1">{errors.title.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="tags">Tags (separadas por vírgula)</Label>
        <Input
          id="tags"
          {...register('tags')}
          placeholder="exemplo, documentação, api"
          disabled={isLoading}
        />
        {tagsValue && (
          <div className="flex flex-wrap gap-2 mt-2">
            {tagsValue.split(',').map((tag, i) => {
              const trimmed = tag.trim()
              return trimmed ? (
                <Badge key={i} variant="secondary">
                  {trimmed}
                </Badge>
              ) : null
            })}
          </div>
        )}
      </div>

      <div>
        <Label htmlFor="status">Status</Label>
        <Select
          value={statusValue}
          onValueChange={(value) => setValue('status', value as 'ACTIVE' | 'DRAFT' | 'ARCHIVED')}
          disabled={isLoading}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Ativo</SelectItem>
            <SelectItem value="DRAFT">Rascunho</SelectItem>
            <SelectItem value="ARCHIVED">Arquivado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isLoading || isContentOverLimit}>
          {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {mode === 'create' ? 'Criar e Indexar' : 'Salvar Alterações'}
        </Button>
      </div>
    </form>
  )
}
