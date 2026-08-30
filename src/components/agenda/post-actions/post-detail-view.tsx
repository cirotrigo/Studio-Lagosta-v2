'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FeedbackDeArte } from '@/components/creatives/feedback-de-arte'
import {
  Send,
  Edit,
  Paintbrush,
  MoreHorizontal,
  Trash2,
  Clock,
  RefreshCw,
  Copy,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Video as VideoIcon,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Bell,
  XCircle,
  CalendarCheck,
  FileEdit,
  Undo2,
  Loader2,
  Sparkles,
  Lock,
} from 'lucide-react'
import Link from 'next/link'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { usePostActions } from '@/hooks/use-post-actions'
import { usePostApproval } from '@/hooks/use-post-approval'
import { usePostStatusPolling } from '@/hooks/use-post-status-polling'
import { useProject } from '@/hooks/use-project'
import { useImproveJobForPost } from '@/stores/improve-queue-store'
import { RescheduleDialog } from './reschedule-dialog'
import { DuplicateDialog } from './duplicate-dialog'
import { ApprovePostsDialog } from './approve-posts-dialog'
import { ImproveCreativeModal } from '@/components/creatives/improve-creative-modal'
import { toast } from 'sonner'
import { getPostDate, formatPostDateTimeBR } from '../calendar/calendar-utils'
import { descreverJanela } from '@/lib/posts/freeze-window'
import { publicarLembreteHref } from '@/lib/agenda-routes'
import type { SocialPost } from '../../../../prisma/generated/client'
import Image from 'next/image'
import { cn, isExternalImage } from '@/lib/utils'

interface PostDetailViewProps {
  post: SocialPost
  /** Volta para a agenda. */
  onBack: () => void
  /** Abre o composer. Ausente = post que não se edita por aqui. */
  onEdit?: (post: SocialPost) => void
}

const isVideoUrl = (url: string) => {
  const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v']
  return videoExtensions.some((ext) => url.toLowerCase().includes(ext))
}

/**
 * A tela de um post — o corpo que era o `PostPreviewModal` (923 linhas de
 * regra de negócio: janela de congelamento, melhoria com IA, aprovação,
 * verificação no Instagram), agora em tela cheia.
 *
 * O que mudou junto com a casca:
 *
 * - **Publicar/aprovar/voltar para rascunho NÃO saem mais da tela.** No modal
 *   toda ação terminava em `onClose()` porque não havia para onde olhar
 *   depois; aqui o estado muda à vista. Só excluir volta para a agenda — o
 *   post deixou de existir.
 * - **O polling de "Publicando…" sobrevive.** No modal ele morria no instante
 *   em que a ação o fechava, então a confirmação nunca chegava a quem
 *   publicou.
 * - **A arte aparece no formato real do post** (4:5 no feed, 9:16 no story).
 *   O modal desenhava feed em quadrado e cortava a prévia por conta própria.
 */
export function PostDetailView({ post, onBack, onEdit }: PostDetailViewProps) {
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [approveOpen, setApproveOpen] = useState(false)
  const [improveOpen, setImproveOpen] = useState(false)
  const [publicarAgoraOpen, setPublicarAgoraOpen] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [isPolling, setIsPolling] = useState(false)
  const { publishNow, deletePost } = usePostActions(post.projectId)
  const { revertToDraft } = usePostApproval(post.projectId)
  const { data: project } = useProject(post.projectId)
  const queryClient = useQueryClient()

  const isRascunho = post.status === 'DRAFT'
  const contaLabel = project?.instagramUsername || project?.name || 'do cliente'

  /*
    Lembrete: o sistema não publica — alguém publica na mão, pelo celular.
    "Publicar agora" aqui não pode armar a publicação automática (o executor
    ignora lembretes de propósito); ele leva para a tela de publicação manual,
    que entrega arte, legenda e primeiro comentário prontos para o Instagram.
  */
  const ehLembrete = post.publishType === 'REMINDER'

  /**
   * As mutações compartilhadas invalidam as LISTAS. Numa tela que continua
   * aberta depois da ação, é esta chave que precisa recarregar.
   */
  const recarregarPost = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['social-post', post.id] })
  }, [queryClient, post.id])

  usePostStatusPolling({
    postId: post.id,
    enabled: isPolling && post.status === 'POSTING',
    onSuccess: (publishedUrl) => {
      setIsPolling(false)
      recarregarPost()
      toast.success('Post confirmado como publicado!', {
        description: publishedUrl ? 'Visualize no Instagram' : undefined,
        action: publishedUrl
          ? {
            label: 'Ver Post',
            onClick: () => window.open(publishedUrl, '_blank'),
          }
          : undefined,
      })
    },
    onFailure: (errorMessage) => {
      setIsPolling(false)
      recarregarPost()
      toast.error('Falha ao publicar', { description: errorMessage })
    },
  })

  const isTemplateBased = !!post.pageId && post.postType === 'STORY'
  const mediaUrls = (post.mediaUrls?.length
    ? post.mediaUrls
    : post.renderedImageUrl
      ? [post.renderedImageUrl]
      : []) as string[]
  const isCarousel = post.postType === 'CAROUSEL' && mediaUrls.length > 1
  const isStory = post.postType === 'STORY' || post.postType === 'REEL'
  const gerandoArte =
    mediaUrls.length === 0 &&
    !!post.pageId &&
    (post.renderStatus === 'PENDING' || post.renderStatus === 'RENDERING')

  // Proporção real do formato: 9:16 em story/reel, 4:5 no feed e no carrossel.
  const aspectClass = isStory ? 'aspect-[9/16]' : 'aspect-[4/5]'

  /*
    Melhoria com IA em andamento. A arte só troca quando a fila termina, um
    minuto ou mais depois — antes disto o modal fechava e a tela seguia
    idêntica, sem nada dizendo que havia algo acontecendo.

    Em carrossel a melhoria age num slide só, então o aviso acompanha o slide
    certo: `applyToPostMediaIndex` ausente significa o primeiro.
  */
  const melhoriaEmAndamento = useImproveJobForPost(post.id)
  const slideEmMelhoria = melhoriaEmAndamento?.applyToPostMediaIndex ?? 0
  const melhorandoEsteSlide =
    !!melhoriaEmAndamento && slideEmMelhoria === currentImageIndex

  const currentMediaUrl = mediaUrls[currentImageIndex]
  const isCurrentMediaVideo = currentMediaUrl ? isVideoUrl(currentMediaUrl) : false

  const handlePrevImage = useCallback(() => {
    setCurrentImageIndex((prev) => (prev === 0 ? mediaUrls.length - 1 : prev - 1))
  }, [mediaUrls.length])

  const handleNextImage = useCallback(() => {
    setCurrentImageIndex((prev) => (prev === mediaUrls.length - 1 ? 0 : prev + 1))
  }, [mediaUrls.length])

  // Pré-carrega vizinhos do carrossel
  useEffect(() => {
    if (!isCarousel || mediaUrls.length <= 1) return

    const nextIndex = (currentImageIndex + 1) % mediaUrls.length
    const prevIndex = currentImageIndex === 0 ? mediaUrls.length - 1 : currentImageIndex - 1

    for (const index of [nextIndex, prevIndex]) {
      if (mediaUrls[index] && !isVideoUrl(mediaUrls[index])) {
        const img = new window.Image()
        img.src = mediaUrls[index]
      }
    }
  }, [currentImageIndex, mediaUrls, isCarousel])

  // Navegação por teclado no carrossel
  useEffect(() => {
    if (!isCarousel) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handlePrevImage()
      else if (e.key === 'ArrowRight') handleNextImage()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isCarousel, handlePrevImage, handleNextImage])

  // Swipe no carrossel
  const [touchStart, setTouchStart] = useState(0)
  const [touchEnd, setTouchEnd] = useState(0)

  const handleTouchStart = (e: React.TouchEvent) => setTouchStart(e.touches[0].clientX)
  const handleTouchMove = (e: React.TouchEvent) => setTouchEnd(e.touches[0].clientX)
  const handleTouchEnd = () => {
    if (!isCarousel) return
    const minSwipeDistance = 50
    const distance = touchStart - touchEnd
    if (distance > minSwipeDistance) handleNextImage()
    else if (distance < -minSwipeDistance) handlePrevImage()
  }

  /**
   * Até quando esta arte ainda aceita alteração. O servidor recusa melhoria e
   * ignora invalidação em post já entregue ao publicador — a interface precisa
   * dizer isso ANTES, senão a pessoa gasta 25 créditos para descobrir.
   */
  const janela = descreverJanela(post as { congelado?: boolean; scheduledDatetime?: Date | null })

  /**
   * Melhorar com IA vale para RASCUNHO e AGENDADO (decisão de 01/08/2026 — a
   * melhoria virou etapa do acabamento da criação, não pós-aprovação), com
   * uma Generation vinculada e uma imagem atual. Posts antigos sem
   * generationId não mostram o botão; post já entregue ao publicador também
   * não, porque a arte dele não muda mais.
   */
  const canImprove =
    (post.status === 'SCHEDULED' || post.status === 'DRAFT') &&
    !!post.generationId &&
    mediaUrls.length > 0 &&
    !isCurrentMediaVideo &&
    !janela.congelado

  /**
   * "Publicar agora" abre o diálogo de confirmação — a ação manda o post para
   * o Instagram do cliente na hora, fora do horário combinado, e isso não
   * pode acontecer num toque acidental (no celular o botão fica no rodapé,
   * bem onde o polegar descansa).
   */
  const handlePublishNow = () => {
    setPublicarAgoraOpen(true)
  }

  const confirmarPublicarAgora = async () => {
    try {
      await publishNow.mutateAsync(post.id)
      const message =
        post.status === 'FAILED'
          ? 'Tentando novamente! Aguardando confirmação...'
          : 'Post enviado! Aguardando confirmação...'
      toast.success(message, { description: 'O status será atualizado automaticamente' })
      setIsPolling(true)
      recarregarPost()
    } catch (_error) {
      toast.error(post.status === 'FAILED' ? 'Erro ao tentar novamente' : 'Erro ao publicar post')
    }
  }

  const handleDelete = async () => {
    const pergunta = isRascunho
      ? 'Excluir este rascunho? Ele some da agenda e não dá para desfazer.'
      : 'Tem certeza que deseja deletar este post?'
    if (!confirm(pergunta)) return

    try {
      await deletePost.mutateAsync(post.id)
      toast.success(isRascunho ? 'Rascunho excluído' : 'Post deletado')
      // Único caso em que a tela some: o post deixou de existir.
      onBack()
    } catch (_error) {
      toast.error(isRascunho ? 'Erro ao excluir rascunho' : 'Erro ao deletar post')
    }
  }

  /** Tira o post da fila de publicação e devolve para revisão. */
  const handleVoltarParaRascunho = async () => {
    if (
      !confirm(
        `Voltar este post para rascunho?\n\nEle sai da fila e não publica em ${formatPostDateTimeBR(post)}. Continua na agenda até você aprovar de novo.`,
      )
    ) {
      return
    }

    try {
      const resultado = await revertToDraft.mutateAsync([post.id])

      if (resultado.processados.length > 0) {
        recarregarPost()
        toast.success('Voltou para rascunho', {
          description: 'Não vai publicar até ser aprovado de novo.',
        })
        return
      }

      toast.error(resultado.ignorados[0]?.motivo ?? 'Não foi possível voltar para rascunho.')
    } catch (_error) {
      toast.error('Não foi possível voltar para rascunho.')
    }
  }

  const referenceDate = getPostDate(post)
  const scheduledTimeLabel = referenceDate
    ? referenceDate.toLocaleDateString('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
    : post.scheduleType === 'IMMEDIATE'
      ? 'Enviando agora'
      : 'Horário não definido'

  const getPostTypeBadge = () => {
    switch (post.postType) {
      case 'STORY':
        return <Badge>Story</Badge>
      case 'REEL':
        return <Badge variant="secondary">Reel</Badge>
      case 'CAROUSEL':
        return <Badge variant="outline">Carrossel</Badge>
      default:
        return <Badge variant="outline">Post</Badge>
    }
  }

  const logoUrl = project?.logoUrl || (project as any)?.Logo?.[0]?.fileUrl

  return (
    /*
      Tela de app: cabeçalho e ações fixos, só o meio rola.
      `position: sticky` NÃO serve aqui — o `glass-panel` do layout protegido
      tem `overflow: clip`, e qualquer overflow diferente de `visible` num
      ancestral desliga o sticky dos descendentes. As barras simplesmente
      rolavam junto, sem erro nenhum no console.
      A altura vem de quem monta (a rota estica até o rodapé da janela; o
      Dialog do editor limita), e este componente só precisa de um pai que
      seja `flex flex-col` com altura definida.
    */
    <div className="flex min-h-0 flex-1 flex-col">
      {/*
        Cabeçalho da tela: voltar, de quem é e quando sai. Fica grudado no topo
        porque numa tela rolável a saída não pode depender de rolar de volta.
      */}
      <header className="flex shrink-0 items-center gap-3 border-b bg-background px-4 py-3 sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label="Voltar para a agenda"
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div
            className={cn(
              'relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold text-white',
              logoUrl ? 'border-2 border-border bg-white' : 'bg-gradient-to-br from-pink-500 to-purple-500',
            )}
          >
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={project?.name ?? ''}
                width={32}
                height={32}
                className="object-contain p-0.5"
                priority
                quality={70}
                unoptimized={isExternalImage(logoUrl)}
              />
            ) : (
              (project?.name ?? '..').substring(0, 2).toUpperCase()
            )}
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">
              {project?.instagramUsername || project?.name || 'Carregando...'}
            </p>
            <p className="truncate text-xs text-muted-foreground">{scheduledTimeLabel}</p>
          </div>
        </div>

        <div className="shrink-0">{getPostTypeBadge()}</div>
      </header>

      {/*
        Duas colunas no desktop (arte à esquerda, tudo que se lê à direita);
        uma só no celular, com a arte primeiro. O layout é CSS puro — o
        `useIsMobile` só resolve depois do mount e faria o telefone piscar o
        desenho de desktop a cada abertura.
      */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:py-6">
        <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
          {/* Arte */}
          <div className="space-y-3">
            {mediaUrls.length > 0 && mediaUrls[0] && (
              <div className="group relative">
                <div
                  className={cn(
                    'relative mx-auto w-full overflow-hidden rounded-lg bg-muted',
                    aspectClass,
                    /*
                      A altura vem da largura (é o que `aspect-ratio` faz), então
                      o teto no celular é uma largura máxima — não um `max-h`.
                      Story a 300px sai com 533px de altura e ainda sobra tela
                      para os avisos e a barra de ações; a largura cheia daria
                      667px e empurraria tudo para fora. `max-h-[…dvh]` seria
                      pior que inútil: unidade `dvh` em valor arbitrário não
                      gera regra nenhuma nesta build (armadilha registrada na
                      Fase 1), e a classe morreria em silêncio.
                    */
                    'max-w-[300px] lg:max-w-none',
                    isCarousel && 'cursor-pointer select-none',
                  )}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                >
                  {isCurrentMediaVideo ? (
                    <>
                      <video
                        key={currentImageIndex}
                        src={currentMediaUrl}
                        // `contain`: vídeo fora da proporção do formato aparece
                        // inteiro, com faixa neutra — nunca cortado.
                        className="absolute inset-0 h-full w-full object-contain"
                        controls
                        loop
                        playsInline
                        preload="metadata"
                      >
                        Seu navegador não suporta vídeos.
                      </video>
                      <div className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 backdrop-blur-sm">
                        <VideoIcon className="h-3 w-3 text-white" />
                        <span className="text-xs font-medium text-white">Vídeo</span>
                      </div>
                    </>
                  ) : (
                    <Image
                      key={currentImageIndex}
                      src={currentMediaUrl || ''}
                      alt={post.caption || 'Prévia do post'}
                      fill
                      sizes="(max-width: 1024px) 90vw, 380px"
                      /*
                        `contain`, nunca `cover`: quem aprova precisa ver a arte
                        INTEIRA. Arte fora da proporção do formato ganha faixa
                        neutra (o bg-muted do contêiner) em vez de perder borda
                        — cortar o pé de um feed esconde exatamente o texto e a
                        logo que se quer conferir.
                      */
                      className="object-contain transition-opacity duration-300"
                      priority={currentImageIndex === 0}
                      loading={currentImageIndex === 0 ? undefined : 'lazy'}
                      quality={80}
                      placeholder="blur"
                      blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiNlNWU3ZWIiLz48L3N2Zz4="
                      unoptimized={isExternalImage(currentMediaUrl || '')}
                    />
                  )}

                  {isCarousel && (
                    <>
                      {/*
                        No toque não existe hover: as setas ficam visíveis no
                        celular e só aparecem no hover a partir do desktop.
                      */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100"
                        onClick={handlePrevImage}
                        aria-label="Imagem anterior"
                      >
                        <ChevronLeft className="h-6 w-6" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100"
                        onClick={handleNextImage}
                        aria-label="Próxima imagem"
                      >
                        <ChevronRight className="h-6 w-6" />
                      </Button>

                      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                        {/*
                          O ponto visível vai num <span>, não no <button>.
                          O globals.css força `min-height/min-width: 44px` em
                          TODO button abaixo de 768px (alvo de toque), então
                          um botão estilizado como bolinha de 6px virava uma
                          BOLA BRANCA de 44px no celular. Assim a área de
                          toque continua com os 44px e o indicador volta a
                          ser um ponto.
                        */}
                        {mediaUrls.map((_, index) => (
                          <button
                            key={index}
                            onClick={() => setCurrentImageIndex(index)}
                            className="flex items-center justify-center p-1"
                            aria-label={`Ir para imagem ${index + 1}`}
                          >
                            <span
                              className={cn(
                                'block h-1.5 rounded-full transition-all',
                                index === currentImageIndex
                                  ? 'w-6 bg-white'
                                  : 'w-1.5 bg-white/50 hover:bg-white/75',
                              )}
                            />
                          </button>
                        ))}
                      </div>

                      <Badge className="absolute right-2 top-2">
                        {currentImageIndex + 1}/{mediaUrls.length}
                      </Badge>
                    </>
                  )}

                  {post.isRecurring && (
                    <Badge
                      className={cn('absolute left-2', isCurrentMediaVideo ? 'bottom-2' : 'top-2')}
                      variant="secondary"
                    >
                      <RefreshCw className="mr-1 h-3 w-3" />
                      Recorrente
                    </Badge>
                  )}

                  {/* Melhorando: a arte antiga fica por baixo, escurecida —
                      some seria pior, porque é ela que ainda vai ao ar caso a
                      melhoria falhe. */}
                  {melhorandoEsteSlide && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/65 text-white backdrop-blur-[2px]">
                      <Sparkles className="h-7 w-7 animate-pulse" />
                      <span className="text-sm font-semibold">
                        {melhoriaEmAndamento?.status === 'pending'
                          ? 'Na fila para melhorar…'
                          : 'Melhorando com IA…'}
                      </span>
                      <span className="max-w-[85%] text-center text-xs text-white/80">
                        A arte nova aparece aqui sozinha quando ficar pronta. Pode sair desta
                        tela — a fila continua.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Arte na fila de render — é o estado logo depois de editar a
                página no editor: a arte antiga foi descartada e a nova ainda
                não saiu. Sem este aviso a tela abre vazia, sem explicação. */}
            {gerandoArte && (
              <div
                className={cn(
                  'relative mx-auto flex w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-dashed bg-muted text-muted-foreground',
                  aspectClass,
                  'max-w-[300px] lg:max-w-none',
                )}
              >
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-sm font-medium">Gerando a arte…</span>
                <span className="px-6 text-center text-xs">
                  O template mudou. A arte nova aparece aqui em até 2 minutos.
                </span>
              </div>
            )}

            {/*
              Revisão pela agenda (29/08/2026): a MESMA barra da galeria e da
              bancada, logo abaixo da arte — "Gostei" aprova em um clique;
              "Preciso melhorar" vira o pedido de correção estruturado (chips
              foto/copy/horário + foto do acervo apontada) que a sessão
              corretora lê depois com ver-feedback-das-artes. Só existe com
              generationId — feedback sem arte por trás não ensina nada.
            */}
            {post.generationId && (
              <div className="mx-auto w-full max-w-[300px] rounded-lg border bg-card p-3 lg:max-w-none">
                <FeedbackDeArte
                  generationId={post.generationId}
                  superficie="agenda"
                  projectId={post.projectId}
                />
              </div>
            )}
          </div>

          {/* Informações */}
          <div className="space-y-4">
            {/* Situação */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className={cn(
                  isRascunho && 'flex items-center gap-1 bg-amber-500 text-white hover:bg-amber-500',
                )}
                variant={
                  post.status === 'SCHEDULED'
                    ? 'default'
                    : post.status === 'POSTING'
                      ? 'default'
                      : post.status === 'POSTED'
                        ? 'secondary'
                        : post.status === 'FAILED'
                          ? 'destructive'
                          : 'outline'
                }
              >
                {isRascunho && <FileEdit className="h-3 w-3" />}
                {post.status === 'SCHEDULED' && 'Agendado'}
                {post.status === 'POSTING' && 'Postando...'}
                {post.status === 'POSTED' && 'Postado'}
                {post.status === 'FAILED' && 'Falhou'}
                {post.status === 'DRAFT' && 'Rascunho'}
              </Badge>

              {/* Num rascunho este badge diria "Agendado" (o modo de
                  agendamento) logo ao lado do status "Rascunho" — duas
                  palavras se contradizendo na mesma linha. */}
              <Badge variant="outline" className="text-xs">
                {post.scheduleType === 'IMMEDIATE' && 'Imediato'}
                {post.scheduleType === 'SCHEDULED' && (isRascunho ? 'Horário marcado' : 'Agendado')}
                {post.scheduleType === 'RECURRING' && 'Recorrente'}
              </Badge>

              {/* Lembrete: alguém publica na mão */}
              {post.publishType === 'REMINDER' && (
                <Badge
                  className={cn(
                    'flex items-center gap-1 text-xs font-semibold text-white',
                    post.reminderSentAt
                      ? 'bg-green-500 hover:bg-green-600'
                      : 'bg-amber-500 hover:bg-amber-600',
                  )}
                  title={
                    post.reminderSentAt
                      ? `Lembrete enviado em ${new Date(post.reminderSentAt).toLocaleString('pt-BR')}`
                      : 'Lembrete agendado - aguardando disparo do webhook'
                  }
                >
                  <Bell className="h-3 w-3" />
                  <span>{post.reminderSentAt ? 'Lembrete Enviado ✓' : 'Lembrete Agendado'}</span>
                </Badge>
              )}

              {/* Verificação no Instagram — só story enviado e não lembrete */}
              {isStory &&
                post.publishType !== 'REMINDER' &&
                (post.status === 'POSTED' || post.status === 'FAILED') && (
                  <>
                    {post.verificationStatus === 'VERIFIED' && (
                      <Badge
                        className="flex items-center gap-1 bg-emerald-500 text-xs font-semibold text-white hover:bg-emerald-600"
                        title={
                          post.verifiedByFallback
                            ? 'Verificado no Instagram (por timestamp)'
                            : 'Verificado no Instagram (por TAG)'
                        }
                      >
                        <ShieldCheck className="h-3 w-3" />
                        <span>{post.verifiedByFallback ? 'Instagram ✓*' : 'Instagram ✓'}</span>
                      </Badge>
                    )}
                    {post.verificationStatus === 'VERIFICATION_FAILED' && (
                      <Badge
                        className="flex items-center gap-1 bg-red-600 text-xs font-semibold text-white hover:bg-red-700"
                        title="Não encontrado no Instagram após 3 tentativas"
                      >
                        <ShieldAlert className="h-3 w-3" />
                        <span>Instagram ✗</span>
                      </Badge>
                    )}
                    {post.verificationStatus === 'PENDING' && (
                      <Badge
                        variant="outline"
                        className="flex items-center gap-1 border-blue-400 text-xs text-blue-600"
                        title="Aguardando verificação no Instagram"
                      >
                        <Clock className="h-3 w-3 animate-pulse" />
                        <span>Verificando...</span>
                      </Badge>
                    )}
                  </>
                )}

              {/*
                Janela de congelamento: até quando editar a arte ainda vale.
                Só faz sentido enquanto o post pode publicar — em rascunho a
                entrega nem está marcada, e em publicado/falhou a pergunta já
                não se coloca.
              */}
              {post.status === 'SCHEDULED' && (
                <Badge
                  variant="outline"
                  className={cn(
                    'flex items-center gap-1 text-xs',
                    janela.congelado
                      ? 'border-slate-400 text-slate-600 dark:text-slate-300'
                      : janela.iminente
                        ? 'border-amber-400 text-amber-700 dark:text-amber-400'
                        : 'border-emerald-400 text-emerald-700 dark:text-emerald-400',
                  )}
                  title={janela.mensagem}
                >
                  {janela.congelado ? <Lock className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                  <span>{janela.rotulo}</span>
                </Badge>
              )}
            </div>

            {/* Legenda */}
            {post.caption && (
              <div className="whitespace-pre-wrap rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                {post.caption}
              </div>
            )}

            {/*
              Congelado é a explicação de por que editar a arte deixou de ter
              efeito. Sem este aviso a pessoa edita, vê a agenda atualizar e o
              Instagram publicar a versão antiga — o defeito que a janela veio
              corrigir.
            */}
            {post.status === 'SCHEDULED' && janela.congelado && (
              <div className="rounded-md border border-slate-300 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/40">
                <div className="mb-1 flex items-center gap-2 font-semibold">
                  <Lock className="h-4 w-4" />
                  A arte já foi enviada para publicação
                </div>
                <p className="text-muted-foreground">
                  Editar o template a partir de agora não muda mais o que vai ao ar. Para trocar a
                  arte, volte o post para rascunho e agende de novo.
                </p>
              </div>
            )}

            {/* Rascunho: o estado mais fácil de confundir com "vai publicar" */}
            {isRascunho && (
              <div className="rounded-md border border-amber-400/60 bg-amber-50 p-3 text-sm dark:bg-amber-950/20">
                <div className="mb-1 flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
                  <FileEdit className="h-4 w-4" />
                  Este post ainda não vai publicar
                </div>
                <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-200/90">
                  Está guardado como rascunho para revisão. Se você aprovar, ele publica no
                  Instagram de <strong>{contaLabel}</strong> em {formatPostDateTimeBR(post)}.
                </p>
              </div>
            )}

            {post.status === 'FAILED' && post.errorMessage && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm dark:bg-red-950/20">
                <div className="mb-1 flex items-center gap-2 font-semibold text-red-700 dark:text-red-300">
                  <XCircle className="h-4 w-4" />
                  Motivo da falha
                </div>
                <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-red-700 dark:text-red-200">
                  {post.errorMessage}
                </pre>
              </div>
            )}

            {post.status === 'POSTED' &&
              !post.publishedUrl &&
              !post.latePlatformUrl &&
              !post.verifiedPermalink && (
                <div className="rounded-md bg-green-50 py-2 text-center text-sm italic text-green-600 dark:bg-green-950/20 dark:text-green-400">
                  ✓ Post publicado com sucesso!
                </div>
              )}
          </div>
        </div>
      </div>

      {/*
        Ações sempre à vista, no rodapé da tela — o padrão de app que evita
        caçar botão no meio do scroll. Vale para as duas larguras: no celular
        porque a arte sozinha já enche a tela, no desktop porque o story em
        9:16 empurra tudo para baixo do dobra.
      */}
      <div className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
        {/*
          A largura útil no celular é de 261px (o shell aninha três paddings).
          Não cabem quatro botões: com `flex-wrap` eles ou empilham em três
          linhas de 173px — um terço da tela — ou, com o mínimo menor, se
          sobrepõem com o texto vazando. Então aqui vale a regra de app: no
          celular fica a ação PRINCIPAL, em linha cheia, e o resto desce para
          o menu `⋯`. A partir de `sm` todos voltam a ser botões, e os itens
          repetidos somem do menu.
        */}
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2">
          {post.status === 'POSTED' &&
            (post.publishedUrl || post.latePlatformUrl || post.verifiedPermalink) && (
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  const url = post.verifiedPermalink || post.publishedUrl || post.latePlatformUrl
                  if (url) window.open(url, '_blank', 'noopener,noreferrer')
                }}
                className="w-full flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 sm:w-auto sm:min-w-[9rem]"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                <span>Ver {isStory ? 'Story' : 'Post'} no Instagram</span>
              </Button>
            )}

          {post.status !== 'POSTED' && post.status !== 'POSTING' && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="hidden flex-1 sm:flex sm:min-w-[9rem]"
                onClick={() => setRescheduleOpen(true)}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Re-agendar
              </Button>

              {/* No rascunho o que falta é aprovar, não publicar na hora:
                  "Publicar agora" ignoraria o horário combinado. Ele
                  continua no menu, para quem realmente quiser. */}
              {isRascunho ? (
                <Button
                  size="sm"
                  /*
                    O `dark:` é obrigatório aqui. A variante padrão do Button
                    declara `dark:bg-zinc-100 dark:text-zinc-900`, e o
                    tailwind-merge NÃO considera isso conflitante com um
                    `bg-emerald-600` sem prefixo — são grupos diferentes para
                    ele. As duas classes sobrevivem, e no tema escuro (o que
                    a equipe usa) a do `dark:` vence: o botão de APROVAR
                    saía BRANCO, igual aos secundários. Mesma família do
                    `sm:max-w-*`: regra com modificador vence regra sem.
                  */
                  className="w-full flex-1 bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:text-white dark:hover:bg-emerald-700 sm:w-auto sm:min-w-[9rem]"
                  onClick={() => setApproveOpen(true)}
                >
                  <CalendarCheck className="mr-2 h-4 w-4" />
                  Aprovar
                </Button>
              ) : ehLembrete ? (
                /* Lembrete: publicar é manual. O botão leva à tela que entrega
                   arte, legenda e comentário prontos — nunca ao publicador. */
                <Button
                  variant="default"
                  size="sm"
                  className="w-full flex-1 sm:w-auto sm:min-w-[9rem]"
                  asChild
                >
                  <Link href={publicarLembreteHref(post.projectId, post.id)}>
                    <Send className="mr-2 h-4 w-4" />
                    Publicar agora
                  </Link>
                </Button>
              ) : post.status === 'SCHEDULED' && janela.congelado ? null : (
                /* Post congelado (já entregue ao publicador) não ganha
                   "Publicar agora": o aviso acima explica o caminho certo.
                   FAILED continua com "Tentar novamente" — é o retry. */
                <Button
                  variant="default"
                  size="sm"
                  className="w-full flex-1 sm:w-auto sm:min-w-[9rem]"
                  onClick={handlePublishNow}
                  disabled={publishNow.isPending}
                >
                  <Send className="mr-2 h-4 w-4" />
                  {post.status === 'FAILED' ? 'Tentar novamente' : 'Publicar Agora'}
                </Button>
              )}
            </>
          )}

          {/* Melhorar com IA — vale para rascunho e agendado; o servidor
              reforça a mesma regra. Em carrossel age no slide visível. */}
          {canImprove && (
            <Button
              variant="outline"
              size="sm"
              className="hidden flex-1 sm:flex sm:min-w-[9rem] lg:flex-none"
              onClick={() => setImproveOpen(true)}
              // Já tem melhoria em andamento: pedir de novo não gera uma
              // segunda arte (o servidor deduplica), só confunde.
              disabled={!!melhoriaEmAndamento}
              title={
                melhoriaEmAndamento
                  ? 'Já existe uma melhoria em andamento para este post'
                  : isCarousel
                    ? `Melhora só o slide ${currentImageIndex + 1} — os outros ficam como estão`
                    : undefined
              }
            >
              <Sparkles className={cn('mr-2 h-4 w-4', melhoriaEmAndamento && 'animate-pulse')} />
              {melhoriaEmAndamento
                ? 'Melhorando…'
                : isCarousel
                  ? `Melhorar slide ${currentImageIndex + 1}`
                  : 'Melhorar com IA'}
            </Button>
          )}

          {isTemplateBased && post.templateId ? (
            /*
              Post congelado: editar o template daqui não muda a arte que vai
              ao ar, porque ela já está no publicador. Deixar o botão clicável
              mandava a pessoa ao editor, salvar, e voltar achando que
              resolveu — a interface prometia o que o sistema não podia
              cumprir. O caminho certo está no aviso acima.
            */
            janela.congelado ? (
              <Button
                variant="outline"
                size="sm"
                className="hidden flex-1 sm:flex sm:min-w-[9rem] lg:flex-none"
                disabled
                title="A arte já foi enviada para publicação. Volte o post para rascunho para poder editá-la."
              >
                <Lock className="mr-2 h-4 w-4" />
                Editar Template
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="hidden flex-1 sm:flex sm:min-w-[9rem] lg:flex-none"
                asChild
              >
                <Link href={`/templates/${post.templateId}/editor?pageId=${post.pageId}&from=agenda`}>
                  <Paintbrush className="mr-2 h-4 w-4" />
                  Editar Template
                </Link>
              </Button>
            )
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="hidden flex-1 sm:flex sm:min-w-[9rem] lg:flex-none"
              onClick={() => onEdit?.(post)}
              disabled={!onEdit || post.status === 'POSTED' || post.status === 'POSTING'}
            >
              <Edit className="mr-2 h-4 w-4" />
              Editar
            </Button>
          )}

          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              {/* ml-auto só age quando o wrap joga o botão para a segunda
                  linha: em vez de órfão à esquerda, ele alinha à direita */}
              <Button variant="outline" size="icon" className="ml-auto shrink-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top">
              {/*
                As três secundárias, só enquanto são botões escondidos (abaixo
                de `sm`). Sem isto elas simplesmente não existiriam no celular
                — e re-agendar é das coisas mais pedidas justamente de lá.
              */}
              {post.status !== 'POSTED' && post.status !== 'POSTING' && (
                <DropdownMenuItem className="sm:hidden" onClick={() => setRescheduleOpen(true)}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Re-agendar
                </DropdownMenuItem>
              )}

              {canImprove && (
                <DropdownMenuItem className="sm:hidden" onClick={() => setImproveOpen(true)}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {isCarousel ? `Melhorar slide ${currentImageIndex + 1}` : 'Melhorar com IA'}
                </DropdownMenuItem>
              )}

              {isTemplateBased && post.templateId ? (
                janela.congelado ? (
                  <DropdownMenuItem className="sm:hidden" disabled>
                    <Lock className="mr-2 h-4 w-4" />
                    Editar Template
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem className="sm:hidden" asChild>
                    <Link
                      href={`/templates/${post.templateId}/editor?pageId=${post.pageId}&from=agenda`}
                    >
                      <Paintbrush className="mr-2 h-4 w-4" />
                      Editar Template
                    </Link>
                  </DropdownMenuItem>
                )
              ) : (
                <DropdownMenuItem
                  className="sm:hidden"
                  onClick={() => onEdit?.(post)}
                  disabled={!onEdit || post.status === 'POSTED' || post.status === 'POSTING'}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator className="sm:hidden" />

              {isRascunho &&
                (ehLembrete ? (
                  /* Rascunho de lembrete: publicar é manual mesmo assim. */
                  <DropdownMenuItem asChild>
                    <Link href={publicarLembreteHref(post.projectId, post.id)}>
                      <Send className="mr-2 h-4 w-4" />
                      Publicar agora
                    </Link>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={handlePublishNow} disabled={publishNow.isPending}>
                    <Send className="mr-2 h-4 w-4" />
                    Publicar agora
                  </DropdownMenuItem>
                ))}

              {post.status === 'SCHEDULED' && (
                <DropdownMenuItem
                  onClick={handleVoltarParaRascunho}
                  disabled={revertToDraft.isPending}
                >
                  <Undo2 className="mr-2 h-4 w-4" />
                  Voltar para rascunho
                </DropdownMenuItem>
              )}

              <DropdownMenuItem onClick={() => setDuplicateOpen(true)}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDelete}
                className="text-red-600 focus:text-red-600"
                disabled={deletePost.isPending}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {isRascunho ? 'Excluir rascunho' : 'Deletar'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Melhorar com IA — só chega aqui com post rascunho ou agendado */}
      {canImprove && post.generationId && (
        <ImproveCreativeModal
          generation={{
            id: post.generationId,
            projectId: post.projectId,
            // A arte que se melhora é a que está NO POST, não o resultUrl da
            // Generation — o cron pode ter re-renderizado depois dela. Em
            // carrossel é o slide que está NA TELA: mandar sempre o primeiro
            // melhorava a imagem errada.
            resultUrl: currentMediaUrl,
            templateName: isCarousel
              ? `${isStory ? 'Story' : 'Post'} agendado, slide ${currentImageIndex + 1}/${mediaUrls.length} — ${formatPostDateTimeBR(post)}`
              : `${isStory ? 'Story' : 'Post'} agendado — ${formatPostDateTimeBR(post)}`,
            applyToPostId: post.id,
            // Só este slide é substituído; os outros ficam intactos
            applyToPostMediaIndex: currentImageIndex,
          }}
          open={improveOpen}
          onOpenChange={(next) => {
            setImproveOpen(next)
            // Fechou: a melhoria pode ter trocado a arte deste slide.
            if (!next) recarregarPost()
          }}
        />
      )}

      {/*
        Confirmação de "Publicar agora". O texto diz o que de fato acontece:
        a publicação é ARMADA e sai nos próximos minutos — não é instantânea
        (o publicador tem a fila dele), e não espera o horário combinado.
      */}
      <AlertDialog open={publicarAgoraOpen} onOpenChange={setPublicarAgoraOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {post.status === 'FAILED' ? 'Tentar publicar de novo?' : 'Publicar agora?'}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {isRascunho && (
                <span className="block font-medium text-foreground">
                  Este rascunho ainda não foi aprovado.
                </span>
              )}
              <span className="block">
                Confirmando, a publicação é armada na hora e o post sai no Instagram de{' '}
                <strong>{contaLabel}</strong> nos próximos minutos
                {post.status !== 'FAILED' && getPostDate(post)
                  ? ` — sem esperar ${formatPostDateTimeBR(post)}`
                  : ''}
                .
              </span>
              <span className="block">Depois de armada, não dá para desfazer por aqui.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarPublicarAgora}>
              {post.status === 'FAILED' ? 'Tentar novamente' : 'Publicar agora'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RescheduleDialog
        post={post}
        open={rescheduleOpen}
        onClose={() => {
          setRescheduleOpen(false)
          recarregarPost()
        }}
      />

      <DuplicateDialog post={post} open={duplicateOpen} onClose={() => setDuplicateOpen(false)} />

      {/* Confirmação de aprovação — sai para a conta do cliente */}
      {approveOpen && (
        <ApprovePostsDialog
          posts={[post]}
          projectId={post.projectId}
          contaLabel={contaLabel}
          open={approveOpen}
          onClose={() => setApproveOpen(false)}
          onApproved={recarregarPost}
        />
      )}
    </div>
  )
}
