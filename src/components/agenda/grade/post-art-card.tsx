'use client'

import { memo } from 'react'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Layers, Video, Loader2, ImageIcon, FileEdit, Bell, Lock, Sparkles } from 'lucide-react'
import { cn, isExternalImage } from '@/lib/utils'
import { formatPostTime, isVideoUrl, aspectClassForPostType } from '../calendar/calendar-utils'
import { useImproveJobForPost } from '@/stores/improve-queue-store'
import type { SocialPost } from '../../../../prisma/generated/client'

export type PostComProjeto = SocialPost & {
  /** Derivado pela rota da agenda: a arte já foi entregue ao publicador. */
  congelado?: boolean
  Project?: {
    id: number
    name: string
    instagramUsername?: string | null
    logoUrl?: string | null
    Logo?: Array<{ fileUrl: string }>
  }
}

interface PostArtCardProps {
  post: PostComProjeto
  onClick: () => void
  /** Mostra de quem é o post. Ligado na agenda global, que mistura clientes. */
  showProject?: boolean
}

/**
 * O card da visão GRADE: a ARTE em tamanho grande, no formato real em que vai
 * ao ar.
 *
 * É o que o app desktop faz na visão LISTA e o que faltava na web — mês,
 * semana e dia mostram a arte em miniatura de poucos pixels, boa para achar um
 * post e inútil para aprovar um. Aqui dá para bater o olho na semana inteira.
 *
 * O card inteiro é um botão que leva à tela do post: toda ação (aprovar,
 * publicar, re-agendar, melhorar) mora lá, a um toque de distância. É de
 * propósito — a lista mobile antiga repetia esses botões no card, e cada
 * repetição era mais uma cópia de regra de negócio para manter em dia.
 */
export const PostArtCard = memo(function PostArtCard({
  post,
  onClick,
  showProject = false,
}: PostArtCardProps) {
  const hora = formatPostTime(post)
  const midias = (post.mediaUrls ?? []) as string[]
  const primeira = post.renderedImageUrl || midias[0]
  const ehVideo = primeira ? isVideoUrl(primeira) : false
  const ehCarrossel = post.postType === 'CAROUSEL' && midias.length > 1
  const isRascunho = post.status === 'DRAFT'

  // Editar a página devolve o post à fila de render e apaga a arte antiga.
  // Sem este estado o card ficaria vazio, sem explicação, até o cron rodar.
  const gerandoArte =
    !primeira &&
    !!post.pageId &&
    (post.renderStatus === 'PENDING' || post.renderStatus === 'RENDERING')

  const logoProjeto = post.Project?.logoUrl || post.Project?.Logo?.[0]?.fileUrl

  // Melhoria com IA em andamento: o card avisa igual à tela do post, para quem
  // pediu a melhoria e voltou para a agenda.
  const melhoriaEmAndamento = useImproveJobForPost(post.id)

  const corDaBorda = () => {
    switch (post.status) {
      case 'SCHEDULED':
        return 'border-primary/40 hover:border-primary'
      case 'POSTING':
        return 'border-yellow-500/40 hover:border-yellow-500'
      case 'POSTED':
        return 'border-green-500/40 hover:border-green-500'
      case 'FAILED':
        return 'border-red-500/40 hover:border-red-500'
      case 'DRAFT':
        // Tracejado e âmbar, igual ao card do calendário: "não vai publicar"
        // tem que se ler antes do badge.
        return 'border-dashed border-amber-500/60 hover:border-amber-500'
      default:
        return 'border-border hover:border-muted-foreground'
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group block w-full overflow-hidden rounded-lg border bg-card/40 text-left transition-colors',
        corDaBorda(),
      )}
    >
      <div
        className={cn(
          'relative w-full overflow-hidden bg-muted',
          aspectClassForPostType(post.postType),
        )}
      >
        {gerandoArte ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="px-2 text-center text-[11px] leading-tight">Gerando a arte…</span>
          </div>
        ) : ehVideo ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Video className="h-8 w-8 text-muted-foreground" />
          </div>
        ) : primeira ? (
          <Image
            src={primeira}
            alt={post.caption || 'Arte do post'}
            fill
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px"
            className="object-cover"
            loading="lazy"
            quality={60}
            placeholder="blur"
            blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiNlNWU3ZWIiLz48L3N2Zz4="
            unoptimized={isExternalImage(primeira)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
          </div>
        )}

        {/* Hora — o dado que se procura primeiro ao varrer o dia */}
        <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
          {hora}
        </span>

        {ehCarrossel && (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
            <Layers className="h-3 w-3" />
            {midias.length}
          </span>
        )}

        {/* De quem é — só na agenda global, que mistura clientes */}
        {showProject && logoProjeto && (
          <div className="absolute bottom-2 left-2 h-6 w-6 overflow-hidden rounded-full border border-border/50 bg-white/90">
            <Image
              src={logoProjeto}
              alt={post.Project?.name ?? ''}
              width={24}
              height={24}
              className="object-contain p-0.5"
              loading="lazy"
              quality={60}
              unoptimized={isExternalImage(logoProjeto)}
            />
          </div>
        )}

        {post.congelado && (
          <span
            className="absolute bottom-2 right-2 rounded bg-black/70 p-1 text-white backdrop-blur-sm"
            title="A arte já foi enviada para publicação"
          >
            <Lock className="h-3 w-3" />
          </span>
        )}

        {melhoriaEmAndamento && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5 bg-black/65 text-white backdrop-blur-[2px]">
            <Sparkles className="h-5 w-5 animate-pulse" />
            <span className="px-2 text-center text-[11px] font-semibold leading-tight">
              {melhoriaEmAndamento.status === 'pending' ? 'Na fila' : 'Melhorando com IA…'}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1 p-2">
        <Badge
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
          className={cn(
            'px-1.5 py-0 text-[10px]',
            isRascunho && 'flex items-center gap-0.5 bg-amber-500 text-white hover:bg-amber-500',
          )}
        >
          {isRascunho && <FileEdit className="h-2.5 w-2.5" />}
          {post.status === 'SCHEDULED' && 'Agendado'}
          {post.status === 'POSTING' && 'Postando'}
          {post.status === 'POSTED' && 'Postado'}
          {post.status === 'FAILED' && 'Falhou'}
          {post.status === 'DRAFT' && 'Rascunho'}
        </Badge>

        {post.publishType === 'REMINDER' && (
          <Badge
            variant="outline"
            className="flex items-center gap-0.5 px-1.5 py-0 text-[10px]"
            title="Alguém publica na mão; o sistema só avisa"
          >
            <Bell className="h-2.5 w-2.5" />
            Lembrete
          </Badge>
        )}
      </div>
    </button>
  )
})
