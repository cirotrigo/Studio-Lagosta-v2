'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { FileText, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TemplateItem } from './template-item'

interface Template {
    id: number
    name: string
    type: string
    dimensions: string
    thumbnailUrl: string | null
    createdAt: string
    _count?: {
        Page: number
    }
}

interface TemplatesGalleryProps {
    projectId: number
    onCreateClick?: () => void
}

export function TemplatesGallery({ projectId, onCreateClick }: TemplatesGalleryProps) {
    const queryClient = useQueryClient()

    const { data: templates, isLoading } = useQuery<Template[]>({
        queryKey: ['templates', projectId],
        queryFn: () => api.get(`/api/projects/${projectId}/templates`),
        enabled: !isNaN(projectId),
    })

    const deleteMutation = useMutation({
        mutationFn: (id: number) => api.delete(`/api/templates/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['templates', projectId] })
            toast.success('Template deletado com sucesso!')
        },
        onError: () => {
            toast.error('Erro ao deletar template')
        },
    })

    const duplicateMutation = useMutation({
        mutationFn: (id: number) => api.post(`/api/templates/${id}/duplicate`, {}),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['templates', projectId] })
            toast.success('Template duplicado com sucesso!')
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : 'Erro ao duplicar template')
        },
    })

    const handleDelete = (id: number, name: string) => {
        if (confirm(`Tem certeza que deseja excluir o template "${name}"?`)) {
            deleteMutation.mutate(id)
        }
    }

    const handleDuplicate = (id: number, name: string) => {
        if (confirm(`Duplicar o template "${name}"?`)) {
            duplicateMutation.mutate(id)
        }
    }

    if (isLoading) {
        return (
            <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6 gap-4 space-y-4">
                {Array.from({ length: 8 }).map((_, index) => (
                    <div key={`skeleton-${index}`} className="break-inside-avoid mb-4">
                        <Card className="overflow-hidden rounded-xl bg-muted">
                            <Skeleton className="aspect-[4/5] w-full" />
                        </Card>
                    </div>
                ))}
            </div>
        )
    }

    if (!templates || templates.length === 0) {
        return (
            <Card className="p-12 text-center rounded-xl border-dashed border-2 bg-transparent">
                <div className="flex flex-col items-center gap-4">
                    <div className="p-4 bg-muted/50 rounded-full ring-1 ring-white/10">
                        <FileText className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-lg mb-2">Nenhum template ainda</h3>
                        <p className="text-muted-foreground mb-4 max-w-sm mx-auto">
                            Crie seu primeiro template para começar a produzir seus criativos com identidade visual consistente.
                        </p>
                        {onCreateClick && (
                            <Button onClick={onCreateClick} variant="default" className="shadow-lg hover:shadow-primary/20">
                                <Plus className="w-4 h-4 mr-2" />
                                Criar Primeiro Template
                            </Button>
                        )}
                    </div>
                </div>
            </Card>
        )
    }

    return (
        <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6 gap-4 space-y-4">
            {templates.map((template, index) => (
                <div key={template.id} className="break-inside-avoid mb-4">
                    <TemplateItem
                        index={index}
                        template={template}
                        onDuplicate={handleDuplicate}
                        onDelete={handleDelete}
                    />
                </div>
            ))}
        </div>
    )
}
