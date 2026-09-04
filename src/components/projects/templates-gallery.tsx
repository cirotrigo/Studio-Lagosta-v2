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
    /** Miniaturas das primeiras peças, para a capa da pasta. */
    capa?: string[]
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

    // Grid, não `columns`: com um card só (a assinatura) o contêiner de
    // colunas não media a altura e o título da seção seguinte subia por cima.
    const grade = (lista: Template[]) => (
        <div className="grid grid-cols-2 gap-4 items-start sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {lista.map((template, index) => (
                <div key={template.id}>
                    <TemplateItem index={index} template={template} onDuplicate={handleDuplicate} onDelete={handleDelete} />
                    <LegendaDoCard
                        nome={template.name}
                        tipo={template.type}
                        dimensoes={template.dimensions}
                        paginas={template._count?.Page}
                        s={template.situacao}
                    />
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
                descricao="Layouts que vocês desenharam para reusar, sem pedir para criar. O botão Novo Template cria aqui."
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
                    grade(grupos.programacao)
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

/**
 * O nome do template FORA do card, sempre visível, em TODAS as quatro seções.
 *
 * Ele morava só num overlay de hover com `truncate` — e o nome não cabe na
 * largura de um card: medido a 244px, "Wine Vix — Celebrações e Datas
 * Comemorativas (3 layouts)" precisava de 434px, ou seja 51% ficava
 * invisível. O ARQUIVO é a seção que mais sofre (nome com mediana de 36 e
 * máximo de 56 caracteres, contra 12 da equipe).
 *
 * 🔴 `line-clamp-3`, não `line-clamp-2`: com duas linhas o nome longo do
 * arquivo continua cortado nos cards estreitos (171px no celular, 206px no
 * `sm`). As duas classes existem na folha — medido, não suposto.
 *
 * A segunda linha diz o que cada seção tem a dizer: a PASTA de programação
 * mostra a situação das peças (é o que a API manda em `situacao`); qualquer
 * outro template mostra o tamanho e quantas páginas tem.
 */
function LegendaDoCard({
    nome,
    tipo,
    dimensoes,
    paginas,
    s,
}: {
    nome: string
    tipo: string
    dimensoes: string
    paginas?: number
    s?: Template['situacao']
}) {
    const partes: string[] = []
    if (s) {
        partes.push(`${s.pecas} ${s.pecas === 1 ? 'peça' : 'peças'}`)
        if (s.agendadas) partes.push(`${s.agendadas} na agenda`)
        if (s.publicadas) partes.push(`${s.publicadas} publicada${s.publicadas === 1 ? '' : 's'}`)
        if (s.rascunhos) partes.push(`${s.rascunhos} rascunho${s.rascunhos === 1 ? '' : 's'}`)
        if (s.falhas) partes.push(`${s.falhas} com falha`)
        const semPost = s.pecas - s.agendadas - s.publicadas - s.rascunhos - s.falhas
        if (semPost > 0) partes.push(`${semPost} sem post`)
    } else {
        partes.push(dimensoes)
        if (typeof paginas === 'number') partes.push(`${paginas} ${paginas === 1 ? 'página' : 'páginas'}`)
    }
    const rotuloDoTipo = tipo === 'STORY' ? 'Story' : tipo === 'FEED' ? 'Feed' : 'Quadrado'
    return (
        <div className="mt-2 px-1">
            <p className="text-sm font-medium leading-snug line-clamp-3" title={nome}>
                {nome}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
                {s ? `${rotuloDoTipo} · ${partes.join(' · ')}` : partes.join(' · ')}
            </p>
        </div>
    )
}

export type { SecaoDeTemplate }
