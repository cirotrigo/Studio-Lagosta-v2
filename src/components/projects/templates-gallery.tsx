'use client'

import * as React from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Archive, CalendarDays, ChevronDown, ChevronRight, FileText, PenTool, Plus, Sparkles } from 'lucide-react'
import { TemplateItem } from './template-item'
import { agruparTemplates, type SecaoDeTemplate } from '@/lib/templates/classificar'

interface Template {
    id: number
    name: string
    type: string
    dimensions: string
    thumbnailUrl: string | null
    createdAt: string
    category?: string | null
    tags?: string[]
    _count?: {
        Page: number
    }
    /** Só nas pastas de programação (semana / avulsas). */
    situacao?: { pecas: number; agendadas: number; publicadas: number; rascunhos: number; falhas: number }
}

interface TemplatesGalleryProps {
    projectId: number
    onCreateClick?: () => void
}

/**
 * A aba de templates em QUATRO seções (03/09/2026): a seção diz quem criou e
 * para quê — assinatura (a marca), modelos da equipe, programação (as pastas
 * por semana que o compositor enche) e arquivo (coletores antigos, famílias
 * geradas, sistema; recolhido). A classificação é pura, em
 * `src/lib/templates/classificar.ts`.
 */
export function TemplatesGallery({ projectId, onCreateClick }: TemplatesGalleryProps) {
    const queryClient = useQueryClient()
    const [arquivoAberto, setArquivoAberto] = React.useState(false)

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

    const grupos = React.useMemo(() => agruparTemplates(templates ?? []), [templates])

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

    const grade = (lista: Template[], comSituacao = false) => (
        <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6 gap-4 space-y-4">
            {lista.map((template, index) => (
                <div key={template.id} className="break-inside-avoid mb-4">
                    <TemplateItem index={index} template={template} onDuplicate={handleDuplicate} onDelete={handleDelete} />
                    {comSituacao && template.situacao && <SituacaoDaPasta s={template.situacao} />}
                </div>
            ))}
        </div>
    )

    return (
        <div className="space-y-10">
            {grupos.assinatura.length > 0 && (
                <Secao
                    icone={<Sparkles className="h-4 w-4" />}
                    titulo="Assinatura da marca"
                    descricao="Fonte, tamanho e cor de cada papel de texto. É o que o compositor lê para montar as peças — mexeu aqui, o próximo lote sai diferente."
                >
                    {grade(grupos.assinatura)}
                </Secao>
            )}

            <Secao
                icone={<PenTool className="h-4 w-4" />}
                titulo="Modelos da equipe"
                descricao="Layouts que vocês desenharam para reusar, sem pedir para criar."
                acao={
                    onCreateClick ? (
                        <Button size="sm" variant="outline" onClick={onCreateClick}>
                            <Plus className="mr-2 h-4 w-4" />
                            Novo modelo
                        </Button>
                    ) : null
                }
            >
                {grupos.equipe.length > 0 ? (
                    grade(grupos.equipe)
                ) : (
                    <p className="text-sm text-muted-foreground">Nenhum modelo da equipe ainda.</p>
                )}
            </Secao>

            <Secao
                icone={<CalendarDays className="h-4 w-4" />}
                titulo="Programação"
                descricao="Uma pasta por semana, com as peças pelo dia e horário em que saem. Peça sem data fica em Avulsas até ser agendada."
            >
                {grupos.programacao.length > 0 ? (
                    grade(grupos.programacao, true)
                ) : (
                    <p className="text-sm text-muted-foreground">Nenhuma semana composta ainda.</p>
                )}
            </Secao>

            {grupos.arquivo.length > 0 && (
                <Secao
                    icone={<Archive className="h-4 w-4" />}
                    titulo={`Arquivo (${grupos.arquivo.length})`}
                    descricao="Coletores antigos, famílias geradas por tema e templates de sistema. Nada aqui é apagado: posts agendados ainda apontam para estas páginas."
                    acao={
                        <Button size="sm" variant="ghost" onClick={() => setArquivoAberto((v) => !v)}>
                            {arquivoAberto ? <ChevronDown className="mr-1 h-4 w-4" /> : <ChevronRight className="mr-1 h-4 w-4" />}
                            {arquivoAberto ? 'Recolher' : 'Mostrar'}
                        </Button>
                    }
                >
                    {arquivoAberto ? grade(grupos.arquivo) : null}
                </Secao>
            )}
        </div>
    )
}

function Secao({ icone, titulo, descricao, acao, children }: { icone: React.ReactNode; titulo: string; descricao: string; acao?: React.ReactNode; children: React.ReactNode }) {
    return (
        <section>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2 text-base font-semibold">
                        {icone}
                        {titulo}
                    </h2>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{descricao}</p>
                </div>
                {acao}
            </div>
            {children}
        </section>
    )
}

function SituacaoDaPasta({ s }: { s: NonNullable<Template['situacao']> }) {
    const partes: string[] = [`${s.pecas} ${s.pecas === 1 ? 'peça' : 'peças'}`]
    if (s.agendadas) partes.push(`${s.agendadas} na agenda`)
    if (s.publicadas) partes.push(`${s.publicadas} publicada${s.publicadas === 1 ? '' : 's'}`)
    if (s.rascunhos) partes.push(`${s.rascunhos} rascunho${s.rascunhos === 1 ? '' : 's'}`)
    if (s.falhas) partes.push(`${s.falhas} com falha`)
    const semPost = s.pecas - s.agendadas - s.publicadas - s.rascunhos - s.falhas
    if (semPost > 0) partes.push(`${semPost} sem post`)
    return <p className="mt-1 px-1 text-xs text-muted-foreground">{partes.join(' · ')}</p>
}

export type { SecaoDeTemplate }
