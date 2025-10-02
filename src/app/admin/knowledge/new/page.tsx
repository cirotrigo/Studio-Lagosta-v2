'use client'

/**
 * Admin Knowledge Base - New Entry Page
 * Create new knowledge base entry
 */

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { KnowledgeForm } from '@/components/admin/knowledge/knowledge-form'
import {
  useCreateKnowledgeEntry,
  useUploadKnowledgeFile,
} from '@/hooks/admin/use-admin-knowledge'
import { useToast } from '@/hooks/use-toast'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function NewKnowledgeEntryPage() {
  const router = useRouter()
  const { toast } = useToast()

  const createMutation = useCreateKnowledgeEntry()
  const uploadMutation = useUploadKnowledgeFile()

  const handleSubmit = async (data: {
    title: string
    content: string
    tags: string[]
    status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  }) => {
    try {
      await createMutation.mutateAsync(data)
      toast({
        title: 'Entrada criada',
        description: 'A entrada foi indexada com sucesso',
      })
      router.push('/admin/knowledge')
    } catch (error: any) {
      toast({
        title: 'Erro ao criar',
        description: error.message || 'Não foi possível criar a entrada',
        variant: 'destructive',
      })
    }
  }

  const handleFileUpload = async (data: {
    title: string
    filename: string
    fileContent: string
    tags: string[]
    status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  }) => {
    try {
      await uploadMutation.mutateAsync(data)
      toast({
        title: 'Arquivo enviado',
        description: 'O arquivo foi processado e indexado',
      })
      router.push('/admin/knowledge')
    } catch (error: any) {
      toast({
        title: 'Erro ao enviar',
        description: error.message || 'Não foi possível processar o arquivo',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/knowledge">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Nova Entrada</h1>
        <p className="text-muted-foreground">
          Adicione conteúdo à base de conhecimento
        </p>
      </div>

      <div className="max-w-3xl">
        <KnowledgeForm
          mode="create"
          onSubmit={handleSubmit}
          onFileUpload={handleFileUpload}
          isLoading={createMutation.isPending || uploadMutation.isPending}
        />
      </div>
    </div>
  )
}
