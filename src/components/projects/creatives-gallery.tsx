'use client'

import * as React from 'react'
import Image from 'next/image'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useOrganization } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api-client'
import { ROTULO_QUALIDADE, type QualidadeArte } from '@/lib/ai/qualidade-arte'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { usePhotoSwipe } from '@/hooks/use-photoswipe'
import { GalleryItem } from './gallery-item'
import { MemberFilter } from '../filters/member-filter'
import { Eye, Download, RefreshCw, Grid3X3, List, Search, Trash2, HardDrive, Calendar, Sparkles, SlidersHorizontal, CheckSquare } from 'lucide-react'
import { ORIGENS_DO_FILTRO, ROTULO_DA_ORIGEM, type CanalDaArte, type OrigemDoFiltro } from '@/lib/creatives/canal'
import { cn } from '@/lib/utils'
import { PostComposer, type PostFormData } from '@/components/posts/post-composer'
import { WEEKDAY_OPTIONS } from '@/lib/weekday-options'
import { duplicarParaBancada } from '@/lib/creatives/duplicar-para-bancada'
import { useBancadaStore } from '@/stores/bancada-store'
import { useAnexarItensAoPlano } from '@/hooks/use-planos'
import { ImproveCreativeModal } from '@/components/creatives/improve-creative-modal'
import { GerarArteIaModal } from '@/components/creatives/gerar-arte-ia-modal'
import {
  CompareImprovementDialog,
  type CompareTarget,
} from '@/components/creatives/compare-improvement-dialog'
import {
  FeedbackDeArte,
  FeedbackDeArteFlutuante,
} from '@/components/creatives/feedback-de-arte'

interface TemplateInfo {
  id: number
  name: string
  type: string
  dimensions: string
}

interface GenerationRecord {
  id: string
  status: 'PROCESSING' | 'POSTING' | 'COMPLETED' | 'FAILED'
  templateId: number
  fieldValues: Record<string, unknown>
  sourceGenerationId?: string | null
  /** Marcada como referência de estilo — vira a inspiração das próximas artes. */
  styleRefAt?: string | null
  resultUrl: string | null
  googleDriveFileId?: string | null
  googleDriveBackupUrl?: string | null
  projectId: number
  templateName?: string | null
  projectName?: string | null
  authorName?: string | null
  /** Por qual canal a arte entrou — ver `creatives/canal.ts`. Nulo no histórico. */
  canal?: CanalDaArte | null
  createdBy: string
  createdAt: string
  completedAt?: string | null
  Template?: TemplateInfo
}

interface GenerationsResponse {
  generations: GenerationRecord[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos os status' },
  { value: 'COMPLETED', label: 'Concluídos' },
  { value: 'POSTING', label: 'Processando' },
  { value: 'FAILED', label: 'Falharam' },
]

/**
 * A grade é `grid` (ordem por LINHA), não `columns` (ordem por COLUNA).
 *
 * Com `columns-*` o CSS preenche a primeira coluna inteira antes de passar
 * para a segunda: numa lista de 58 itens em 5 colunas, a linha de cima
 * mostrava os itens #1, #13, #25, #37 e #49 — ou seja, as artes mais recentes
 * NÃO ficavam em cima, e o "próximo" do lightbox (que segue a ordem do DOM) ia
 * para o card de BAIXO em vez do card à direita. Era isso que fazia a
 * navegação parecer quebrada mesmo com as setas funcionando.
 *
 * `items-start` é obrigatório: sem ele o item estica até a altura da linha e a
 * `aspect-ratio` do card é ignorada, deformando a arte.
 */
const GRID_DENSITY_CONFIG = {
  compact: { label: 'Compacto', columnsClass: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5', gapClass: 'gap-2' },
  cozy: { label: 'Médio', columnsClass: 'grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4', gapClass: 'gap-3' },
  comfortable: { label: 'Amplo', columnsClass: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3', gapClass: 'gap-4' },
} as const

type GridDensity = keyof typeof GRID_DENSITY_CONFIG

const GRID_DENSITY_OPTIONS: { value: GridDensity; label: string }[] = [
  { value: 'compact', label: GRID_DENSITY_CONFIG.compact.label },
  { value: 'cozy', label: GRID_DENSITY_CONFIG.cozy.label },
  { value: 'comfortable', label: GRID_DENSITY_CONFIG.comfortable.label },
]


type ViewMode = 'grid' | 'list'
type PreviewState = {
  id: string
  url: string
  templateName?: string | null
  isVideo?: boolean
  posterUrl?: string | null
} | null

type ProgressOverride = {
  progress: number
  status: GenerationRecord['status'] | 'PENDING'
  errorMessage?: string | null
}

const STATUS_LABELS: Record<ProgressOverride['status'], string> = {
  COMPLETED: 'Concluído',
  PROCESSING: 'Gerando com IA',
  POSTING: 'Processando',
  FAILED: 'Falhou',
  PENDING: 'Pendente',
}

const STATUS_COLORS: Record<ProgressOverride['status'], string> = {
  COMPLETED: 'bg-emerald-500',
  PROCESSING: 'bg-primary',
  POSTING: 'bg-amber-500',
  FAILED: 'bg-destructive',
  PENDING: 'bg-slate-400',
}

const STATUS_ORDER: ProgressOverride['status'][] = ['COMPLETED', 'PROCESSING', 'POSTING', 'PENDING', 'FAILED']

function getStringField(values: Record<string, unknown>, key: string): string | undefined {
  const value = values?.[key]
  return typeof value === 'string' ? value : undefined
}

function getNumberField(values: Record<string, unknown>, key: string): number | undefined {
  const value = values?.[key]
  return typeof value === 'number' ? value : undefined
}

function getBooleanField(values: Record<string, unknown>, key: string): boolean | undefined {
  const value = values?.[key]
  return typeof value === 'boolean' ? value : undefined
}

/**
 * Extensão do arquivo baixado.
 *
 * O tipo REAL vem do blob que acabou de ser buscado; a URL é só o segundo
 * palpite, e vale apenas quando o trecho após o último ponto parece mesmo uma
 * extensão. Sem essa checagem, URL sem extensão no caminho devolve pedaço do
 * endereço e o nome do arquivo sai quebrado (`criativo-x.com/arte/9`).
 */
function inferDownloadExtension(
  url: string,
  blobType: string | null | undefined,
  isVideo: boolean,
): string {
  const normalized = (blobType ?? '').toLowerCase()
  if (normalized.includes('mp4')) return 'mp4'
  if (normalized.includes('webm')) return 'webm'
  if (normalized.includes('quicktime') || normalized.includes('mov')) return 'mov'
  if (normalized.includes('gif')) return 'gif'
  if (normalized.includes('png')) return 'png'
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg'
  if (normalized.includes('webp')) return 'webp'

  try {
    const { pathname } = new URL(url, window.location.origin)
    const candidate = pathname.split('.').pop()
    if (candidate && candidate !== pathname && /^[a-z0-9]{2,6}$/i.test(candidate)) {
      return candidate.toLowerCase()
    }
  } catch {
    // URL inválida: cai no default por tipo de mídia
  }

  return isVideo ? 'mp4' : 'png'
}

export function CreativesGallery({ projectId }: { projectId: number }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { organization } = useOrganization()

  const [searchTerm, setSearchTerm] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<'all' | GenerationRecord['status']>('all')
  const [memberFilter, setMemberFilter] = React.useState<string | null>(null)
  /** Origem da arte: canal por onde entrou, ou melhorada com IA. Filtra no servidor. */
  const [origemFilter, setOrigemFilter] = React.useState<'all' | OrigemDoFiltro>('all')
  const [weekdayFilter, setWeekdayFilter] = React.useState<Set<number>>(new Set())
  const [viewMode, setViewMode] = React.useState<ViewMode>('grid')
  const [gridDensity, setGridDensity] = React.useState<GridDensity>('cozy')
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [onlyWithResult, setOnlyWithResult] = React.useState(true)
  const [preview, setPreview] = React.useState<PreviewState>(null)
  const [progressOverrides, setProgressOverrides] = React.useState<Record<string, ProgressOverride>>({})
  const [isComposerOpen, setIsComposerOpen] = React.useState(false)
  const [schedulingGeneration, setSchedulingGeneration] = React.useState<GenerationRecord | null>(null)
  const [improvingGeneration, setImprovingGeneration] = React.useState<GenerationRecord | null>(null)
  // "Melhorar de novo" reabre o modal com o pedido anterior pré-preenchido.
  const [improveInitialRequest, setImproveInitialRequest] = React.useState<string | null>(null)
  /**
   * Vindo do antes/depois ("melhorar de novo"), a arte É uma melhoria e o modo
   * padrão é "só o que eu pedir" — explícito, para não depender de a lista
   * carregada trazer `sourceGenerationId` (05/09/2026).
   */
  const [improveEhMelhoria, setImproveEhMelhoria] = React.useState(false)
  const [compareTarget, setCompareTarget] = React.useState<CompareTarget | null>(null)
  const [gerarArteAberto, setGerarArteAberto] = React.useState(false)
  // Painel de filtros no celular. A partir de lg ele é sempre exibido por CSS,
  // então este estado não vale nada lá — não precisa ser sincronizado.
  const [filtrosAbertos, setFiltrosAbertos] = React.useState(false)

  // Quantos filtros estão mexidos, para o botão avisar que há corte ativo
  // mesmo com o painel fechado.
  const filtrosAtivos =
    (statusFilter === 'all' ? 0 : 1) +
    (memberFilter ? 1 : 0) +
    (origemFilter === 'all' ? 0 : 1) +
    weekdayFilter.size +
    (onlyWithResult ? 0 : 1)

  // Serializa weekdays ordenados pra estabilidade do queryKey
  const weekdaysParam = React.useMemo(
    () => Array.from(weekdayFilter).sort().join(','),
    [weekdayFilter]
  )

  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<GenerationsResponse>({
    queryKey: ['generations', projectId, memberFilter, weekdaysParam, origemFilter],
    enabled: !!projectId,
    initialPageParam: 1,
    queryFn: ({ pageParam = 1 }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        pageSize: '60',
      })
      if (memberFilter) {
        params.set('createdBy', memberFilter)
      }
      if (weekdaysParam) {
        params.set('weekdays', weekdaysParam)
      }
      if (origemFilter !== 'all') {
        params.set('origem', origemFilter)
      }
      return api.get(`/api/projects/${projectId}/generations?${params.toString()}`)
    },
    getNextPageParam: (lastPage) =>
      lastPage.pagination.page < lastPage.pagination.totalPages
        ? lastPage.pagination.page + 1
        : undefined,
    staleTime: 10_000,
    // Enquanto houver arte sendo gerada (melhoria ou geração por IA), a
    // galeria se atualiza sozinha — é onde a pessoa acompanha o resultado, e
    // sem isso ela precisaria recarregar a página para ver a arte chegar.
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) =>
        page.generations.some((g) => g.status === 'PROCESSING'),
      )
        ? 8_000
        : false,
  })

  const allGenerations = React.useMemo(
    () => data?.pages.flatMap((page) => page.generations) ?? [],
    [data?.pages]
  )

  const totalGenerationsServer = data?.pages[0]?.pagination.total ?? 0

  // Mutation para deletar
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/generations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generations', projectId] })
      toast({ title: 'Criativo removido', description: 'A geração foi deletada com sucesso.' })
    },
    onError: () => {
      toast({ title: 'Erro ao deletar', description: 'Não foi possível deletar este criativo.', variant: 'destructive' })
    },
  })

  /**
   * Estrela: marca a arte como referência de estilo da marca.
   *
   * O estado otimista é local e não invalida a lista: a query é infinita e
   * paginada, e refazê-la a cada clique jogaria o scroll do usuário para o
   * topo no meio da curadoria — que é justamente quando ele está clicando
   * várias estrelas seguidas.
   */
  const [styleRefLocal, setStyleRefLocal] = React.useState<Record<string, boolean>>({})

  const styleRefMutation = useMutation({
    mutationFn: ({ id, marcada }: { id: string; marcada: boolean }) =>
      api.patch(`/api/generations/${id}`, { styleRef: marcada }),
    onMutate: ({ id, marcada }) => {
      setStyleRefLocal((atual) => ({ ...atual, [id]: marcada }))
      return { id, anterior: styleRefLocal[id] }
    },
    onSuccess: (_data, { marcada }) => {
      // A tela de gestão (Modelos › Artes de referência) lê de outra query.
      // Sem invalidar aqui, marcar na galeria e ir conferir lá mostrava
      // "nenhuma arte marcada" — o dado certo escondido atrás do cache.
      queryClient.invalidateQueries({ queryKey: ['style-references', projectId] })
      toast({
        title: marcada ? 'Virou referência' : 'Saiu das referências',
        description: marcada
          ? 'As próximas artes desta marca vão se inspirar nela — em rodízio com as outras marcadas.'
          : 'Ela não será mais enviada como referência.',
      })
    },
    onError: (_e, { id }, contexto) => {
      // Desfaz o otimismo: estrela acesa sem gravação é pior que estrela apagada.
      setStyleRefLocal((atual) => ({ ...atual, [id]: contexto?.anterior ?? false }))
      toast({
        title: 'Não deu para marcar',
        description: 'Tente de novo em instantes.',
        variant: 'destructive',
      })
    },
  })

  const router = useRouter()
  const adicionarNaBancada = useBancadaStore((s) => s.adicionar)
  const anexarAoPlano = useAnexarItensAoPlano(projectId)

  /**
   * Duplicar na bancada — o par do "Gerar de novo": o MESMO briefing (copy,
   * foto, pedido), aberto para a pessoa escolher OUTRA referência antes de
   * pagar de novo. A referência antiga fica para trás de propósito — ver
   * `duplicarParaBancada`.
   *
   * Vai para o PLANO, como o duplicar da fila: o seletor de modelos do editor
   * só existe em card do plano. Falha de rede degrada para card local, dita.
   */
  const handleDuplicar = React.useCallback(
    (generation: GenerationRecord) => {
      const item = duplicarParaBancada(generation.fieldValues)
      if (!item) {
        toast({
          title: 'Esta arte não tem como ser duplicada',
          description: 'Só arte criada por IA carrega o briefing completo.',
          variant: 'destructive',
        })
        return
      }
      const base = {
        projectId,
        tipo: 'peca' as const,
        trilha: item.trilha,
        formato: item.formato,
        copy: item.copy,
        pedido: item.pedido,
        instrucaoImagem: item.instrucaoImagem,
        referencias: item.referencias.map((r) => ({
          papel: r.papel,
          driveFileId: r.driveFileId,
          url: r.url,
          label: r.label,
          thumbUrl: r.thumbUrl,
        })),
      }
      const cena = base.referencias.find((r) => r.papel === 'subject')
      anexarAoPlano.mutate(
        [
          {
            quando: null,
            tema: item.pedido.trim() || item.copy[0] || null,
            copyProposta: item.copy,
            fotoDriveId: cena?.driveFileId ?? null,
            fotoUrl: cena?.url ?? null,
            formato: item.formato,
            via: 'ia',
          },
        ],
        {
          onSuccess: (r) => {
            adicionarNaBancada({
              ...base,
              itemDePlanoId: r.criados[0],
              planoId: r.plano.id,
              situacaoNoPlano: 'proposto',
            })
            toast({
              title: 'Copiado para a bancada',
              description: 'Mesma copy e foto — escolha a nova referência e gere.',
            })
            router.push(`/projects/${projectId}/bancada`)
          },
          onError: () => {
            adicionarNaBancada(base)
            toast({
              title: 'Copiado só neste navegador',
              description:
                'Não consegui gravar na fila da equipe — a via pelo editor fica indisponível até sincronizar.',
              variant: 'destructive',
            })
            router.push(`/projects/${projectId}/bancada`)
          },
        },
      )
    },
    [adicionarNaBancada, anexarAoPlano, projectId, router, toast],
  )

  /**
   * "Gerar de novo", com o modelo escolhido por quem olhou a arte.
   *
   * A conferência automática NUNCA regera sozinha (regra de 10/08/2026): ela
   * põe o selo "conferir texto" e a peça sai. Este é o caminho de quem
   * conferiu e não gostou — um clique, e a escolha do modelo é dela.
   */
  const refazerMutation = useMutation({
    mutationFn: ({ id, qualidade }: { id: string; qualidade: QualidadeArte }) =>
      api.post<{ generation: { id: string }; reaproveitada?: boolean; creditosCobrados?: number }>(
        `/api/projects/${projectId}/arte-ia/${id}/refazer`,
        { qualidade },
      ),
    onSuccess: (data, { qualidade }) => {
      // A arte nova é OUTRA Generation e entra no topo da lista.
      queryClient.invalidateQueries({ queryKey: ['creatives', projectId] })
      toast({
        title: data.reaproveitada ? 'Já estava gerando' : 'Gerando de novo',
        description: data.reaproveitada
          ? 'Havia um pedido idêntico em andamento — este não foi cobrado de novo.'
          : `${ROTULO_QUALIDADE[qualidade].titulo.toLowerCase()} · ${ROTULO_QUALIDADE[qualidade].detalhe} A arte nova aparece aqui quando ficar pronta.`,
      })
    },
    onError: () => {
      toast({
        title: 'Não deu para gerar de novo',
        description: 'Tente de novo em instantes.',
        variant: 'destructive',
      })
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => api.post<{ deletedCount: number }>('/api/generations/bulk-delete', { ids }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['generations', projectId] })
      setSelectedIds(new Set())
      toast({
        title: 'Criativos removidos',
        description: `${data.deletedCount} criativo(s) deletado(s) com sucesso.`
      })
    },
    onError: () => {
      toast({
        title: 'Erro ao deletar',
        description: 'Não foi possível deletar os criativos selecionados.',
        variant: 'destructive'
      })
    },
  })

  // Listeners para Webhooks/Eventos de Progresso (Simulado ou Real)
  React.useEffect(() => {
    const handleQueued = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail
      if (!detail) return
      if (detail.projectId != null && detail.projectId !== projectId) return
      const generationId = (typeof detail.generationId === 'string' ? detail.generationId : typeof detail.generationID === 'string' ? detail.generationID : undefined) as string | undefined
      if (!generationId) return

      setProgressOverrides((prev) => {
        const nextStatus: ProgressOverride['status'] = (typeof detail.status === 'string' ? detail.status : 'PENDING') as ProgressOverride['status']
        const nextProgress =
          typeof detail.progress === 'number'
            ? Math.max(0, Math.min(100, detail.progress))
            : prev[generationId]?.progress ?? 0

        const previous = prev[generationId]
        if (previous && previous.progress === nextProgress && previous.status === nextStatus) {
          return prev
        }

        return {
          ...prev,
          [generationId]: {
            progress: nextProgress,
            status: nextStatus,
            errorMessage: (typeof detail.errorMessage === 'string' ? detail.errorMessage : previous?.errorMessage) ?? null,
          },
        }
      })

      queryClient.invalidateQueries({ queryKey: ['generations', projectId] })
    }

    const handleProgress = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail
      if (!detail) return
      if (detail.projectId != null && detail.projectId !== projectId) return
      const generationId = (typeof detail.generationId === 'string' ? detail.generationId : typeof detail.generationID === 'string' ? detail.generationID : undefined) as string | undefined
      if (!generationId) return

      setProgressOverrides((prev) => {
        const previous = prev[generationId]
        const nextStatus: ProgressOverride['status'] =
          (typeof detail.status === 'string' ? detail.status : previous?.status ?? 'POSTING') as ProgressOverride['status']
        const nextProgress =
          typeof detail.progress === 'number'
            ? Math.max(0, Math.min(100, detail.progress))
            : previous?.progress ?? 0

        const nextErrorMessage = typeof detail.errorMessage === 'string' ? detail.errorMessage : previous?.errorMessage ?? null

        if (
          previous &&
          previous.progress === nextProgress &&
          previous.status === nextStatus &&
          previous.errorMessage === nextErrorMessage
        ) {
          return prev
        }

        return {
          ...prev,
          [generationId]: {
            progress: nextProgress,
            status: nextStatus,
            errorMessage: nextErrorMessage,
          },
        }
      })
    }

    const handleCompleted = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail
      if (!detail) return
      if (detail.projectId != null && detail.projectId !== projectId) return
      const generationId = (typeof detail.generationId === 'string' ? detail.generationId : typeof detail.generationID === 'string' ? detail.generationID : undefined) as string | undefined
      if (!generationId) return

      setProgressOverrides((prev) => {
        const previous = prev[generationId]
        if (previous && previous.progress === 100 && previous.status === 'COMPLETED') {
          return prev
        }
        return {
          ...prev,
          [generationId]: {
            progress: 100,
            status: 'COMPLETED',
          },
        }
      })

      queryClient.invalidateQueries({ queryKey: ['generations', projectId] })
    }

    const handleFailed = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail
      if (!detail) return
      if (detail.projectId != null && detail.projectId !== projectId) return
      const generationId = (typeof detail.generationId === 'string' ? detail.generationId : typeof detail.generationID === 'string' ? detail.generationID : undefined) as string | undefined
      if (!generationId) return

      setProgressOverrides((prev) => ({
        ...prev,
        [generationId]: {
          progress:
            typeof detail.progress === 'number'
              ? Math.max(0, Math.min(100, detail.progress))
              : 100,
          status: 'FAILED' as const,
          errorMessage: (typeof detail.errorMessage === 'string' ? detail.errorMessage : prev[generationId]?.errorMessage) ?? null,
        },
      }))

      queryClient.invalidateQueries({ queryKey: ['generations', projectId] })
    }

    window.addEventListener('video-export-queued', handleQueued as EventListener)
    window.addEventListener('video-export-progress', handleProgress as EventListener)
    window.addEventListener('video-export-completed', handleCompleted as EventListener)
    window.addEventListener('video-export-failed', handleFailed as EventListener)

    return () => {
      window.removeEventListener('video-export-queued', handleQueued as EventListener)
      window.removeEventListener('video-export-progress', handleProgress as EventListener)
      window.removeEventListener('video-export-completed', handleCompleted as EventListener)
      window.removeEventListener('video-export-failed', handleFailed as EventListener)
    }
  }, [projectId, queryClient])

  // Limpar overrides quando os dados chegam atualizados
  React.useEffect(() => {
    if (allGenerations.length === 0) return
    setProgressOverrides((prev) => {
      let mutated = false
      const next: Record<string, ProgressOverride> = { ...prev }
      for (const generation of allGenerations) {
        if (!next[generation.id]) continue
        if (generation.status === 'COMPLETED' || generation.status === 'FAILED') {
          delete next[generation.id]
          mutated = true
        }
      }
      return mutated ? next : prev
    })
  }, [allGenerations])

  const filtered = React.useMemo(() => {
    return allGenerations.filter((generation) => {
      const fieldValues = (generation.fieldValues ?? {}) as Record<string, unknown>
      const thumbnailValue = getStringField(fieldValues, 'thumbnailUrl')

      const matchesStatus = statusFilter === 'all' || generation.status === statusFilter
      const matchesResult =
        !onlyWithResult ||
        Boolean(
          generation.resultUrl ||
          (thumbnailValue && thumbnailValue.length > 0)
        )
      const query = searchTerm.trim().toLowerCase()
      const matchesSearch =
        !query ||
        generation.templateName?.toLowerCase().includes(query) ||
        generation.Template?.name?.toLowerCase().includes(query) ||
        generation.id.toLowerCase().includes(query)
      return matchesStatus && matchesResult && matchesSearch
    })
  }, [allGenerations, statusFilter, searchTerm, onlyWithResult])

  const shouldEnablePhotoSwipe = viewMode === 'grid' && !isLoading && !isError && filtered.length > 0

  const gridDensityConfig = GRID_DENSITY_CONFIG[gridDensity]

  /**
   * A arte que está aberta no lightbox — é dela que a barra de feedback fala.
   *
   * O id vem do `data-generation-id` do próprio card (o PhotoSwipe entrega o
   * `<a>` do slide ativo), e não de um índice na lista: a lista se refiltra
   * embaixo do lightbox aberto e um índice apontaria para a arte errada.
   */
  const [arteAberta, setArteAberta] = React.useState<string | null>(null)

  usePhotoSwipe({
    gallerySelector: '#creatives-gallery',
    childSelector: 'a[data-pswp-src]',
    dependencies: [filtered.length, isLoading, viewMode, gridDensity],
    enabled: shouldEnablePhotoSwipe,
    onSlideAtivo: React.useCallback((elemento: HTMLElement | null) => {
      setArteAberta(elemento?.dataset?.generationId ?? null)
    }, []),
  })

  const getGenerationMeta = React.useCallback(
    (generation: GenerationRecord) => {
      const fieldValues = (generation.fieldValues ?? {}) as Record<string, unknown>
      const override = progressOverrides[generation.id]
      const thumbnailUrl = getStringField(fieldValues, 'thumbnailUrl')
      const videoUrl = getStringField(fieldValues, 'videoUrl')
      const serverProgress = getNumberField(fieldValues, 'progress')
      const isVideoFlag = getBooleanField(fieldValues, 'isVideo')
      const errorMessage = getStringField(fieldValues, 'errorMessage')

      const status =
        override?.status ??
        (generation.status as ProgressOverride['status'])

      const rawProgress =
        override?.progress ??
        serverProgress ??
        (generation.status === 'COMPLETED' || generation.status === 'FAILED' ? 100 : undefined)

      const progress =
        typeof rawProgress === 'number'
          ? Math.max(0, Math.min(100, rawProgress))
          : undefined

      const displayUrl =
        isVideoFlag === true
          ? thumbnailUrl ?? generation.resultUrl ?? null
          : generation.resultUrl ?? thumbnailUrl ?? null

      const assetUrl =
        status === 'COMPLETED'
          ? generation.resultUrl ?? videoUrl ?? null
          : null

      return {
        displayUrl,
        assetUrl,
        isVideo: Boolean(isVideoFlag),
        status,
        progress,
        errorMessage: override?.errorMessage ?? errorMessage ?? null,
        thumbnailUrl,
      }
    },
    [progressOverrides]
  )

  const toggleSelection = React.useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleDownload = React.useCallback(
    async (generation: GenerationRecord) => {
      const fieldValues = (generation.fieldValues ?? {}) as Record<string, unknown>
      const videoUrl = getStringField(fieldValues, 'videoUrl')
      const assetUrl = generation.resultUrl ?? videoUrl

      if (!assetUrl) {
        toast({
          title: 'Preview indisponível',
          description: 'Este criativo ainda não possui arquivo gerado.',
          variant: 'destructive',
        })
        return
      }

      try {
        const response = await fetch(assetUrl)
        const blob = await response.blob()
        const blobUrl = URL.createObjectURL(blob)

        const extension = inferDownloadExtension(
          assetUrl,
          blob.type,
          getBooleanField(fieldValues, 'isVideo') === true,
        )

        const link = document.createElement('a')
        link.href = blobUrl
        link.download = `criativo-${generation.id}.${extension}`
        document.body.appendChild(link)
        link.click()

        document.body.removeChild(link)
        URL.revokeObjectURL(blobUrl)
      } catch {
        toast({
          title: 'Erro ao baixar',
          description: 'Não foi possível baixar o criativo.',
          variant: 'destructive',
        })
      }
    },
    [toast]
  )

  const handleBulkDownload = React.useCallback(async () => {
    if (selectedIds.size === 0) return

    const generationsToDownload = filtered.filter((item) => {
      const values = (item.fieldValues ?? {}) as Record<string, unknown>
      const assetUrl = item.resultUrl ?? getStringField(values, 'videoUrl')
      return selectedIds.has(item.id) && assetUrl
    })

    if (generationsToDownload.length === 0) {
      toast({ title: 'Nenhum arquivo disponível', description: 'Selecione criativos concluídos para baixar.', variant: 'destructive' })
      return
    }

    // Download sequencial com delay
    for (const generation of generationsToDownload) {
      const fieldValues = (generation.fieldValues ?? {}) as Record<string, unknown>
      const videoUrl = getStringField(fieldValues, 'videoUrl')
      const assetUrl = generation.resultUrl ?? videoUrl
      if (!assetUrl) continue

      try {
        const response = await fetch(assetUrl)
        const blob = await response.blob()
        const blobUrl = URL.createObjectURL(blob)

        const link = document.createElement('a')
        link.href = blobUrl
        const extension = inferDownloadExtension(
          assetUrl,
          blob.type,
          getBooleanField(fieldValues, 'isVideo') === true,
        )
        link.download = `criativo-${generation.id}.${extension}`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(blobUrl)

        // Pequeno delay entre downloads
        await new Promise(resolve => setTimeout(resolve, 300))
      } catch {
        console.error(`Erro ao baixar criativo ${generation.id}`)
      }
    }

    toast({ title: 'Downloads iniciados', description: `${generationsToDownload.length} arquivo(s) sendo baixado(s).` })
  }, [filtered, selectedIds, toast])

  const handleDelete = React.useCallback((generation: GenerationRecord) => {
    const driveWarning = generation.googleDriveBackupUrl
      ? ' O backup no Google Drive também será removido.'
      : ''
    if (!confirm(`Deseja realmente remover este criativo?${driveWarning}`)) return
    deleteMutation.mutate(generation.id)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(generation.id)
      return next
    })
  }, [deleteMutation])

  const handleBulkDelete = React.useCallback(() => {
    if (selectedIds.size === 0) return

    if (!confirm(`Deseja realmente remover ${selectedIds.size} criativo(s) selecionado(s)? Os backups no Google Drive (quando existirem) também serão removidos.`)) {
      return
    }

    bulkDeleteMutation.mutate(Array.from(selectedIds))
  }, [selectedIds, bulkDeleteMutation])

  const todasSelecionadas = filtered.length > 0 && filtered.every((g) => selectedIds.has(g.id))
  const toggleSelectAll = React.useCallback(() => {
    setSelectedIds((prev) => {
      if (filtered.length > 0 && filtered.every((g) => prev.has(g.id))) return new Set()
      return new Set(filtered.map((g) => g.id))
    })
  }, [filtered])

  const handleSchedule = React.useCallback((generation: GenerationRecord) => {
    setSchedulingGeneration(generation)
    setIsComposerOpen(true)
  }, [])

  const handleImprove = React.useCallback((generation: GenerationRecord) => {
    setImproveInitialRequest(null)
    setImproveEhMelhoria(false)
    setImprovingGeneration(generation)
  }, [])

  const handleCompare = React.useCallback((generation: GenerationRecord) => {
    if (!generation.sourceGenerationId) return
    const userRequest = generation.fieldValues?.userRequest
    setCompareTarget({
      id: generation.id,
      resultUrl: generation.resultUrl,
      templateName: generation.templateName ?? generation.Template?.name,
      sourceGenerationId: generation.sourceGenerationId,
      userRequest: typeof userRequest === 'string' ? userRequest : null,
    })
  }, [])

  // "Melhorar de novo": fecha o antes/depois e reabre o modal de melhoria
  // sobre a arte MELHORADA (nova iteração), com o pedido anterior no campo.
  const handleImproveAgain = React.useCallback(
    (target: CompareTarget) => {
      setCompareTarget(null)
      const generation = allGenerations.find((g) => g.id === target.id)
      if (!generation) return
      setImproveInitialRequest(target.userRequest ?? null)
      // Quem chega pelo antes/depois está iterando uma MELHORIA: o modo
      // padrão é "só o que eu pedir", explícito, sem depender da lista.
      setImproveEhMelhoria(true)
      setImprovingGeneration(generation)
    },
    [allGenerations],
  )

  const handleCloseComposer = React.useCallback(() => {
    setIsComposerOpen(false)
    setSchedulingGeneration(null)
  }, [])

  const composerInitialData = React.useMemo(() => {
    if (!schedulingGeneration) return undefined

    const dimensions = schedulingGeneration.Template?.dimensions || '1080x1080'
    const [widthStr, heightStr] = dimensions.split('x')
    const width = parseInt(widthStr, 10) || 1080
    const height = parseInt(heightStr, 10) || 1080
    const aspectRatio = width / height

    const meta = getGenerationMeta(schedulingGeneration)

    // Detect post type based on dimensions (and media kind — o usuário pode
    // trocar no composer; isto é só o default)
    let postType: 'POST' | 'STORY' | 'REEL' | 'CAROUSEL' = 'POST'
    if (meta.isVideo) {
      // Vídeo vertical → STORY (fluxo padrão da agência); demais formatos de
      // vídeo → REEL (como POST iria sem contentType e o Zernio infere feed)
      postType = aspectRatio < 0.7 ? 'STORY' : 'REEL'
    } else if (aspectRatio < 0.7) {
      // Vertical - Story (9:16)
      postType = 'STORY'
    }
    const mediaUrl = meta.assetUrl ?? meta.displayUrl

    if (!mediaUrl) return undefined

    return {
      postType,
      mediaUrls: [mediaUrl],
      generationIds: [schedulingGeneration.id],
      caption: '',
      scheduleType: 'SCHEDULED' as const,
    } as Partial<PostFormData>
  }, [schedulingGeneration, getGenerationMeta])

  const statusSummary = React.useMemo(() => {
    return filtered.reduce<Record<ProgressOverride['status'], number>>(
      (acc, generation) => {
        const meta = getGenerationMeta(generation)
        acc[meta.status] += 1
        return acc
      },
      { COMPLETED: 0, PROCESSING: 0, POSTING: 0, FAILED: 0, PENDING: 0 }
    )
  }, [filtered, getGenerationMeta])

  const totalGenerations = totalGenerationsServer
  const showGridSummary = shouldEnablePhotoSwipe

  const isEmpty = !isLoading && filtered.length === 0

  return (
    <>
      <Card className="flex flex-col gap-3 p-3 mb-4 sm:gap-4 sm:p-4 sm:mb-6 max-w-full overflow-hidden">
        {/* Sempre à vista: busca, o botão que abre os filtros no celular e o
            atualizar. O resto desce para o painel colapsável abaixo. */}
        <div className="flex items-center gap-2 w-full">
          {/* `sm:max-w-sm`, não `lg:max-w-sm`: nesta build a variante `lg:` de
              max-width não gera CSS nenhum (o input saía com a largura toda).
              Ver a nota sobre classes mortas na memória do projeto. */}
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por template ou ID"
              className="pl-8 w-full"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <Button
            variant={filtrosAbertos ? 'default' : 'outline'}
            size="icon"
            className="relative shrink-0 lg:hidden"
            aria-expanded={filtrosAbertos}
            aria-controls="creatives-filters"
            title="Filtros"
            onClick={() => setFiltrosAbertos((aberto) => !aberto)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {filtrosAtivos > 0 && (
              <span className="absolute right-0 top-0 flex h-4 w-4 translate-x-1 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                {filtrosAtivos}
              </span>
            )}
          </Button>
          <Button variant="ghost" size="icon" className="shrink-0" title="Atualizar" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Filtros: escondidos no celular até abrir; sempre à vista a partir de
            lg, onde cabem sem empurrar o grid para fora da tela. */}
        <div
          id="creatives-filters"
          className={cn(
            'flex-col gap-3 lg:flex',
            filtrosAbertos ? 'flex' : 'hidden',
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={origemFilter} onValueChange={(value) => setOrigemFilter(value as typeof origemFilter)}>
              <SelectTrigger className="w-full sm:w-[190px]" title="Por onde a arte entrou">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as origens</SelectItem>
                {ORIGENS_DO_FILTRO.map((origem) => (
                  <SelectItem key={origem} value={origem}>
                    {ROTULO_DA_ORIGEM[origem]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {organization && (
              <MemberFilter
                organizationId={organization.id}
                value={memberFilter}
                onChange={setMemberFilter}
                items={allGenerations}
              />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Dia:</span>
            {/* flex-wrap: com 7 chips a fila estourava a largura no celular e
                Sáb/Dom ficavam cortados fora da borda do card. */}
            <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-border/60 bg-background/80 px-1 py-1 shadow-sm">
              {WEEKDAY_OPTIONS.map((option) => {
                const active = weekdayFilter.has(option.value)
                return (
                  <button
                    key={option.value}
                    type="button"
                    title={option.label}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-medium transition-colors sm:px-3',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    onClick={() =>
                      setWeekdayFilter((prev) => {
                        const next = new Set(prev)
                        if (next.has(option.value)) next.delete(option.value)
                        else next.add(option.value)
                        return next
                      })
                    }
                  >
                    {option.short}
                  </button>
                )
              })}
            </div>
            {weekdayFilter.size > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => setWeekdayFilter(new Set())}
              >
                Limpar
              </Button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch id="only-result" checked={onlyWithResult} onCheckedChange={setOnlyWithResult} />
              <label htmlFor="only-result" className="whitespace-nowrap">Somente com arquivo</label>
            </div>
            {/* Grade/lista mora aqui, junto da densidade: é preferência de
                exibição, e mantê-la na barra de ações fazia os cinco controles
                quebrarem em três linhas no celular. */}
            <div className="flex items-center gap-1">
              <Button variant={viewMode === 'grid' ? 'default' : 'outline'} size="icon" title="Grade" onClick={() => setViewMode('grid')}>
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button variant={viewMode === 'list' ? 'default' : 'outline'} size="icon" title="Lista" onClick={() => setViewMode('list')}>
                <List className="h-4 w-4" />
              </Button>
            </div>
            {viewMode === 'grid' && (
              <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-border/60 bg-background/80 px-1 py-1 shadow-sm">
                {GRID_DENSITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      'rounded-full px-2.5 py-1 text-xs font-medium transition-colors sm:px-3',
                      gridDensity === option.value
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                    onClick={() => setGridDensity(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Ações. Os rótulos só entram a partir de xl: entre 768 e 1024 (iPad)
            os cinco botões com texto não cabiam na linha e transbordavam. */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {/* Selecionar TODAS as artes filtradas — o que a barra oferece
                (baixar/excluir em lote) já existia, mas exigia marcar uma a
                uma. A seleção alcança o que está carregado na tela; com mais
                páginas por vir, o rótulo diz quantas e o botão "carregar
                mais" continua sendo o caminho para alcançar o resto. */}
            <Button
              variant="outline"
              size="sm"
              disabled={filtered.length === 0}
              onClick={toggleSelectAll}
              title={
                todasSelecionadas
                  ? 'Desmarcar todas'
                  : hasNextPage
                    ? `Selecionar as ${filtered.length} carregadas (há mais para carregar)`
                    : `Selecionar todas (${filtered.length})`
              }
            >
              <CheckSquare className="h-4 w-4" />
              <span className="ml-2 hidden xl:inline">{todasSelecionadas ? 'Desmarcar' : 'Selecionar todas'}</span>
              {!todasSelecionadas && filtered.length > 0 && <span className="ml-1">({filtered.length})</span>}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={selectedIds.size === 0}
              onClick={handleBulkDownload}
              title="Baixar selecionados"
            >
              <Download className="h-4 w-4" />
              <span className="ml-2 hidden xl:inline">Baixar</span>
              {/* A contagem só entra quando há seleção: "(0)" fixo em quatro
                  botões era o que fazia a barra quebrar em três linhas no
                  celular, sem informar nada. */}
              {selectedIds.size > 0 && <span className="ml-1">({selectedIds.size})</span>}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={selectedIds.size === 0}
              onClick={handleBulkDelete}
              title="Excluir selecionados"
            >
              <Trash2 className="h-4 w-4 text-red-500" />
              <span className="ml-2 hidden xl:inline">Excluir</span>
              {selectedIds.size > 0 && <span className="ml-1">({selectedIds.size})</span>}
            </Button>
            <Button size="sm" onClick={() => setGerarArteAberto(true)} title="Gerar com IA">
              <Sparkles className="h-4 w-4" />
              <span className="ml-2">Gerar com IA</span>
            </Button>
          </div>
        </div>
      </Card>

      {showGridSummary && (
        <div className="mb-4 rounded-xl border border-border/50 bg-muted/30 px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium text-foreground">
              Mostrando {filtered.length} de {totalGenerations} criativos
            </span>
            <span className="hidden text-xs text-muted-foreground lg:inline">
              Ajuste a densidade para visualizar mais cards no grid
            </span>
          </div>
          {/* A legenda por status só ganha espaço onde ele sobra — no celular
              eram mais 5 linhas antes da primeira arte. */}
          <div className="mt-2 hidden flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground sm:flex">
            {STATUS_ORDER.map((status) => (
              <span key={status} className="flex items-center gap-1">
                <span className={cn('h-2.5 w-2.5 rounded-full', STATUS_COLORS[status])} />
                <span className="uppercase tracking-wide">{STATUS_LABELS[status]}</span>
                <span className="font-semibold text-foreground normal-case">{statusSummary[status]}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, idx) => (
            <div key={idx} className="rounded-xl overflow-hidden border border-border/50 bg-card">
              <Skeleton className="w-full aspect-[9/16]" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Não foi possível carregar os criativos. Tente novamente.
        </Card>
      ) : isEmpty ? (
        <Card className="p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-full bg-muted p-4">
              <Eye className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Nenhum criativo encontrado</h3>
              <p className="text-sm text-muted-foreground">
                Exporte um template através do editor Konva para vê-lo listado aqui.
              </p>
            </div>
          </div>
        </Card>
      ) : viewMode === 'grid' ? (
        <div
          id="creatives-gallery"
          className={cn('grid w-full items-start', gridDensityConfig.columnsClass, gridDensityConfig.gapClass)}
        >
          {filtered.map((generation, index) => {
            const selected = selectedIds.has(generation.id)
            const templateLabel = generation.Template?.name || generation.templateName || 'Template'
            // Prefer fieldValues.finalSize (escrito pela rota de melhoria de IA com
            // as dimensões REAIS da imagem gerada) sobre Template.dimensions —
            // criativos recuperados do Drive frequentemente têm Template default
            // 1080x1350 mesmo quando o asset é 1080x1920. Sem isso, PhotoSwipe
            // abre stories no formato feed e o usuário vê slides achatados.
            const fv = (generation.fieldValues ?? null) as Record<string, unknown> | null
            const finalSize =
              typeof fv?.finalSize === 'string' && /^\d+x\d+$/.test(fv.finalSize)
                ? (fv.finalSize as string)
                : null
            const dimensions = finalSize || generation.Template?.dimensions || '1080x1080'

            // Parsear dimensões do template
            const [widthStr, heightStr] = dimensions.split('x')
            const width = parseInt(widthStr, 10) || 1080
            const height = parseInt(heightStr, 10) || 1080

            let templateType: 'STORY' | 'FEED' | 'SQUARE' = 'SQUARE'
            const aspectRatio = width / height

            if (aspectRatio < 0.7) {
              templateType = 'STORY'
            } else if (aspectRatio < 0.95) {
              templateType = 'FEED'
            } else {
              templateType = 'SQUARE'
            }

            const meta = getGenerationMeta(generation)

            const previewPayload =
              meta.assetUrl ?? meta.displayUrl
                ? {
                  id: generation.id,
                  url: (meta.assetUrl ?? meta.displayUrl) as string,
                  templateName: templateLabel,
                  isVideo: meta.isVideo && Boolean(meta.assetUrl),
                  posterUrl: meta.thumbnailUrl ?? meta.displayUrl ?? undefined,
                }
                : null

            return (
              <div key={generation.id}>
                <GalleryItem
                  id={generation.id}
                  displayUrl={meta.displayUrl ?? null}
                  assetUrl={meta.assetUrl}
                  title={templateLabel}
                  date={new Intl.DateTimeFormat('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(new Date(generation.createdAt))}
                  templateType={templateType}
                  selected={selected}
                  hasDriveBackup={Boolean(generation.googleDriveBackupUrl)}
                  status={meta.status}
                  progress={meta.progress}
                  errorMessage={meta.errorMessage ?? undefined}
                  isVideo={meta.isVideo}
                  authorClerkId={generation.createdBy}
                  canal={generation.canal ?? null}
                  onToggleSelect={() => toggleSelection(generation.id)}
                  onDownload={() => handleDownload(generation)}
                  onDelete={() => handleDelete(generation)}
                  onSchedule={() => handleSchedule(generation)}
                  onImprove={() => handleImprove(generation)}
                  isImproved={Boolean(generation.sourceGenerationId)}
                  isStyleRef={styleRefLocal[generation.id] ?? Boolean(generation.styleRefAt)}
                  avisoConferencia={
                    // Texto A MAIS com dado (endereço de outro estado) vem
                    // com a conferência VERDE — por isso passa na frente.
                    getStringField(generation.fieldValues, 'textoAMaisAlerta') ??
                    getStringField(generation.fieldValues, 'textCheckAlert') ??
                    // Frase copiada da arte de referência: vem com o texto
                    // APROVADO e explica o número, então passa na frente dele.
                    getStringField(generation.fieldValues, 'vazamentoAlerta') ??
                    // Número sem lastro aparece com o texto APROVADO — se não
                    // entrasse aqui, o caso mais comum ficaria invisível.
                    getStringField(generation.fieldValues, 'numerosAlerta') ??
                    // Trilha imagem: o prato pode ter mudado.
                    getStringField(generation.fieldValues, 'cenaAlerta') ??
                    (getBooleanField(generation.fieldValues, 'qaEntregueComRessalva')
                      ? getStringField(generation.fieldValues, 'qaMotivo')
                      : undefined)
                  }
                  /* Só arte criada por IA pode ser refeita: a rota reconstitui
                     o pedido a partir do fieldValues, e arte de template ou de
                     upload não tem prompt nem referências para reconstituir. */
                  onRefazer={
                    getStringField(generation.fieldValues, 'source') === 'arte-ia'
                      ? (qualidade) => refazerMutation.mutate({ id: generation.id, qualidade })
                      : undefined
                  }
                  /* O par do refazer: mesmo briefing, referência nova — abre a
                     bancada preenchida. Mesmo gate: só arte-ia tem briefing. */
                  onDuplicar={
                    getStringField(generation.fieldValues, 'source') === 'arte-ia'
                      ? () => handleDuplicar(generation)
                      : undefined
                  }
                  refazendo={
                    refazerMutation.isPending && refazerMutation.variables?.id === generation.id
                  }
                  onToggleStyleRef={() =>
                    styleRefMutation.mutate({
                      id: generation.id,
                      marcada: !(styleRefLocal[generation.id] ?? Boolean(generation.styleRefAt)),
                    })
                  }
                  onCompare={
                    generation.sourceGenerationId ? () => handleCompare(generation) : undefined
                  }
                  onPreview={() => {
                    if (previewPayload) {
                      setPreview(previewPayload)
                    }
                  }}
                  onDriveOpen={
                    generation.googleDriveBackupUrl
                      ? () => window.open(generation.googleDriveBackupUrl ?? '', '_blank', 'noopener,noreferrer')
                      : undefined
                  }
                  index={index}
                  pswpWidth={width}
                  pswpHeight={height}
                />
              </div>
            )
          })}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <ScrollArea className="h-[600px]">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] table-fixed text-sm">
              <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="w-32 px-4 py-2 text-left">Criativo</th>
                  <th className="px-4 py-2 text-left">Template</th>
                  <th className="w-32 px-4 py-2 text-left">Status</th>
                  <th className="w-44 px-4 py-2 text-left">Gerado em</th>
                  <th className="w-48 px-4 py-2 text-left">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((generation) => {
                  const selected = selectedIds.has(generation.id)
                  const templateLabel = generation.Template?.name || generation.templateName || 'Template'
                  const meta = getGenerationMeta(generation)
                  const previewUrl = meta.assetUrl ?? meta.displayUrl ?? null
                  const canPreview = Boolean(previewUrl)
                  const canDownload = meta.status === 'COMPLETED' && Boolean(meta.assetUrl)
                  const statusLabel =
                    meta.status === 'COMPLETED'
                      ? 'Concluído'
                      : meta.status === 'FAILED'
                        ? 'Falhou'
                        : meta.status === 'PENDING'
                          ? 'Pendente'
                          : 'Processando'
                  return (
                    <tr key={generation.id} className={cn('border-b border-border/30', selected && 'bg-primary/5')}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleSelection(generation.id)}
                            className="h-4 w-4 rounded border-border/60"
                          />
                          <span className="font-mono text-xs text-muted-foreground truncate">{generation.id.slice(0, 8)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium truncate">{templateLabel}</span>
                          {generation.Template?.dimensions && (
                            <span className="text-xs text-muted-foreground">{generation.Template.dimensions}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <Badge variant={meta.status === 'COMPLETED' ? 'secondary' : meta.status === 'FAILED' ? 'destructive' : 'outline'}>
                            {statusLabel}
                          </Badge>
                          {meta.progress != null && meta.status !== 'COMPLETED' && (
                            <span className="text-xs text-muted-foreground">{meta.progress}%</span>
                          )}
                          {meta.status === 'FAILED' && meta.errorMessage && (
                            <span className="text-xs text-red-500 line-clamp-2">{meta.errorMessage}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Intl.DateTimeFormat('pt-BR', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(generation.createdAt))}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setPreview(
                                canPreview
                                  ? {
                                    id: generation.id,
                                    url: previewUrl!,
                                    templateName: templateLabel,
                                    isVideo: meta.isVideo && Boolean(meta.assetUrl),
                                    posterUrl: meta.thumbnailUrl ?? meta.displayUrl ?? undefined,
                                  }
                                  : null
                              )
                            }
                            disabled={!canPreview}
                          >
                            <Eye className="mr-1 h-4 w-4" />
                            Ver
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownload(generation)}
                            disabled={!canDownload}
                          >
                            <Download className="mr-1 h-4 w-4" />
                            Baixar
                          </Button>
                          {canDownload && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleSchedule(generation)}
                            >
                              <Calendar className="mr-1 h-4 w-4" />
                              Agendar
                            </Button>
                          )}
                          {generation.googleDriveBackupUrl && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => window.open(generation.googleDriveBackupUrl ?? '', '_blank', 'noopener,noreferrer')}
                            >
                              <HardDrive className="mr-1 h-4 w-4" />
                              Drive
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(generation)}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                            Remover
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </ScrollArea>
        </Card>
      )}

      {hasNextPage && !isEmpty && (
        <div className="mt-6 flex justify-center">
          <Button
            onClick={() => fetchNextPage()}
            variant="outline"
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Carregar mais ({totalGenerations - allGenerations.length} restantes)
          </Button>
        </div>
      )}

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{preview?.templateName || 'Preview'}</DialogTitle>
          </DialogHeader>
          {preview?.url ? (
            preview.isVideo ? (
              <video
                src={preview.url}
                controls
                playsInline
                poster={preview.posterUrl ?? undefined}
                className="h-auto w-full rounded-md"
              />
            ) : (
              <Image
                src={preview.url}
                alt={preview.templateName ?? 'Preview'}
                width={1024}
                height={1024}
                className="h-auto w-full rounded-md"
              />
            )
          ) : (
            <div className="rounded-md border border-dashed border-border/50 p-12 text-center text-sm text-muted-foreground">
              Nenhum preview disponível para esta geração.
            </div>
          )}
          {/* Mesmo rodapé do lightbox: esta prévia é a outra porta pela qual a
              arte abre grande (vídeo, arte ainda sem asset final). */}
          {preview?.id && preview?.url && (
            <FeedbackDeArte generationId={preview.id} superficie="galeria" />
          )}
        </DialogContent>
      </Dialog>

      {/* Post Composer Modal for Scheduling */}
      {composerInitialData && (
        <PostComposer
          projectId={projectId}
          open={isComposerOpen}
          onClose={handleCloseComposer}
          initialData={composerInitialData}
        />
      )}

      <GerarArteIaModal
        projectId={projectId}
        open={gerarArteAberto}
        onOpenChange={setGerarArteAberto}
      />

      {/* Improve Creative Modal */}
      <ImproveCreativeModal
        generation={
          improvingGeneration
            ? {
                id: improvingGeneration.id,
                projectId: improvingGeneration.projectId,
                resultUrl: improvingGeneration.resultUrl,
                templateName: improvingGeneration.templateName ?? improvingGeneration.Template?.name,
                initialUserRequest: improveInitialRequest,
                // De onde a arte veio decide o modo padrão da melhoria
                // (05/09/2026): melhoria anterior refina, compositor/canvas
                // preserva, o resto redesenha. O "melhorar de novo" do
                // antes/depois força `ehMelhoria` — a arte ali É uma melhoria.
                origem: {
                  source: getStringField(improvingGeneration.fieldValues, 'source'),
                  ehMelhoria: improveEhMelhoria || !!improvingGeneration.sourceGenerationId,
                },
              }
            : null
        }
        open={!!improvingGeneration}
        onOpenChange={(next) => {
          if (!next) {
            setImprovingGeneration(null)
            setImproveInitialRequest(null)
            setImproveEhMelhoria(false)
          }
        }}
      />

      {/* Antes/depois de uma melhoria com IA */}
      <CompareImprovementDialog
        target={compareTarget}
        open={!!compareTarget}
        onOpenChange={(next) => {
          if (!next) setCompareTarget(null)
        }}
        onImproveAgain={handleImproveAgain}
      />

      {/* Barra "Gostei / Preciso melhorar" sobre o lightbox. Fica no rodapé
          porque topo e laterais são do PhotoSwipe (fechar, contador, setas). */}
      <FeedbackDeArteFlutuante generationId={arteAberta} superficie="galeria" />
    </>
  )
}
