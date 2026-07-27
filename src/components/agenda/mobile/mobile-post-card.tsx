'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Eye, Edit, RefreshCw, Video, Layers, MoreHorizontal, Trash2, Copy, Loader2, CheckCircle2, XCircle, ShieldCheck, ShieldAlert, Clock, Bell, ExternalLink, FileEdit, CalendarCheck } from 'lucide-react'
import { cn, isExternalImage } from '@/lib/utils'
import Image from 'next/image'
import { useState } from 'react'
import { formatPostTime } from '../calendar/calendar-utils'
import { usePostActions } from '@/hooks/use-post-actions'
import { ApprovePostsDialog } from '../post-actions/approve-posts-dialog'
import { toast } from 'sonner'
import type { SocialPost } from '../../../../prisma/generated/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface MobilePostCardProps {
  post: SocialPost & {
    Project?: {
      id: number
      name: string
      instagramUsername?: string | null
      logoUrl?: string | null
      Logo?: Array<{
        fileUrl: string
      }>
    }
  }
  onPreview: () => void
  onEdit: () => void
}

export function MobilePostCard({ post, onPreview, onEdit }: MobilePostCardProps) {
  const time = formatPostTime(post)
  const { deletePost, duplicatePost } = usePostActions(post.projectId)
  const [approveOpen, setApproveOpen] = useState(false)

  const isRascunho = post.status === 'DRAFT'
  const contaLabel = post.Project?.instagramUsername || post.Project?.name || 'do cliente'

  // Helper para detectar se é vídeo
  const isVideoUrl = (url: string) => {
    const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v']
    return videoExtensions.some(ext => url.toLowerCase().includes(ext))
  }

  const firstMediaUrl = post.mediaUrls?.[0]
  const isVideo = firstMediaUrl ? isVideoUrl(firstMediaUrl) : false

  const handleDelete = async () => {
    if (!confirm('Tem certeza que deseja excluir este post?')) return

    try {
      await deletePost.mutateAsync(post.id)
      toast.success('Post excluído com sucesso!')
    } catch (_error) {
      toast.error('Erro ao excluir post')
    }
  }

  const handleDuplicate = async () => {
    try {
      await duplicatePost.mutateAsync({ postId: post.id })
      toast.success('Post duplicado para amanhã!')
    } catch (_error) {
      toast.error('Erro ao duplicar post')
    }
  }

  const getStatusColor = () => {
    switch (post.status) {
      case 'SCHEDULED':
        return 'border-primary/40 bg-primary/5'
      case 'POSTING':
        return 'border-yellow-500/40 bg-yellow-500/5'
      case 'POSTED':
        return 'border-green-500/40 bg-green-500/5'
      case 'FAILED':
        return 'border-red-500/40 bg-red-500/5'
      case 'DRAFT':
        // Tracejado e âmbar, igual ao card do calendário: "não vai publicar"
        // tem que se ler antes do badge.
        return 'border-dashed border-amber-500/60 bg-amber-500/5'
      default:
        return 'border-border bg-card'
    }
  }

  const getTypeIcon = () => {
    switch (post.postType) {
      case 'REEL':
        return <Video className="w-4 h-4" />
      case 'CAROUSEL':
        return <Layers className="w-4 h-4" />
      default:
        return null
    }
  }

  return (
    <div
      className={cn(
        'border rounded-lg p-3 transition-all',
        getStatusColor()
      )}
    >
      {/* Header do card */}
      <div className="flex items-start gap-3 mb-2">
        {/* Thumbnail */}
        {post.mediaUrls && post.mediaUrls.length > 0 && post.mediaUrls[0] && (
          <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded bg-muted">
            {isVideo ? (
              <div className="absolute inset-0 w-full h-full bg-muted flex items-center justify-center">
                <Video className="w-6 h-6 text-muted-foreground" />
              </div>
            ) : (
              <Image
                src={post.mediaUrls[0]}
                alt={post.caption || 'Prévia do post'}
                fill
                sizes="64px"
                className="object-cover"
                loading="lazy"
                quality={55} // OPTIMIZED: Reduced from 60 for mobile thumbnails
                placeholder="blur"
                blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiNlNWU3ZWIiLz48L3N2Zz4="
                unoptimized={isExternalImage(post.mediaUrls[0])}
              />
            )}

            {/* Badge de carrossel */}
            {post.postType === 'CAROUSEL' && post.mediaUrls.length > 1 && (
              <Badge className="absolute bottom-1 right-1 text-[10px] px-1 py-0 h-auto">
                {post.mediaUrls.length}
              </Badge>
            )}

            {/* Logo do Projeto */}
            {(post.Project?.logoUrl || post.Project?.Logo?.[0]?.fileUrl) && (
              <div className="absolute bottom-1 left-1 w-5 h-5 rounded-full overflow-hidden bg-white/90 border border-border/50">
                <Image
                  src={post.Project.logoUrl || post.Project.Logo![0].fileUrl}
                  alt={post.Project.name}
                  fill
                  sizes="20px"
                  className="object-contain p-0.5"
                  loading="lazy"
                  quality={60} // OPTIMIZED: Reduced from 75 for small logos
                  placeholder="blur"
                  blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiNmZmZmZmYiLz48L3N2Zz4="
                  unoptimized={isExternalImage(post.Project.logoUrl || post.Project.Logo![0].fileUrl)}
                />
              </div>
            )}
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant="secondary" className="text-xs">
              <span className="mr-1">⏰</span> {time}
            </Badge>

            {post.postType === 'STORY' && (
              <Badge className="text-xs">Story</Badge>
            )}

            {getTypeIcon()}

            {post.isRecurring && (
              <RefreshCw className="w-3 h-3 text-muted-foreground" />
            )}

            {/* Badge de Rascunho - ainda não entrou na fila de publicação */}
            {post.status === 'DRAFT' && (
              <Badge
                className="text-[10px] sm:text-xs bg-amber-500 text-white hover:bg-amber-500 flex items-center gap-0.5 sm:gap-1 px-1.5 py-0.5"
                title="Rascunho: aparece na agenda mas não publica até ser aprovado"
              >
                <FileEdit className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                <span>Rascunho</span>
              </Badge>
            )}

            {/* Badge de Status - Publicando/Publicado/Falhou */}
            {post.status === 'POSTING' && (
              <Badge className="text-[10px] sm:text-xs bg-yellow-500 text-white hover:bg-yellow-500 flex items-center gap-0.5 sm:gap-1 px-1.5 py-0.5">
                <Loader2 className="w-2.5 h-2.5 sm:w-3 sm:h-3 animate-spin" />
                <span>Publicando</span>
              </Badge>
            )}
            {post.status === 'POSTED' && (
              <Badge className="text-[10px] sm:text-xs bg-green-500 text-white hover:bg-green-500 flex items-center gap-0.5 sm:gap-1 px-1.5 py-0.5">
                <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                <span>Publicado</span>
              </Badge>
            )}
            {post.status === 'FAILED' && (
              <Badge className="text-[10px] sm:text-xs bg-red-500 text-white hover:bg-red-500 flex items-center gap-0.5 sm:gap-1 px-1.5 py-0.5">
                <XCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                <span>Falhou</span>
              </Badge>
            )}

            {/* Badge de Lembrete - publicação manual */}
            {post.publishType === 'REMINDER' && (
              <Badge
                className={cn(
                  "text-[9px] text-white flex items-center gap-0.5 px-1.5 py-0.5 font-semibold",
                  post.reminderSentAt
                    ? "bg-green-500 hover:bg-green-600"
                    : "bg-amber-500 hover:bg-amber-600"
                )}
                title={
                  post.reminderSentAt
                    ? `Lembrete enviado em ${new Date(post.reminderSentAt).toLocaleString('pt-BR')}`
                    : "Lembrete agendado - aguardando disparo"
                }
              >
                <Bell className="w-2.5 h-2.5" />
                <span>{post.reminderSentAt ? 'Lembrete ✓' : 'Lembrete'}</span>
              </Badge>
            )}

            {/* Badges de Verificação - apenas para Stories já enviados e NÃO lembretes */}
            {post.postType === 'STORY' && post.publishType !== 'REMINDER' && (post.status === 'POSTED' || post.status === 'FAILED') && (
              <>
                {post.verificationStatus === 'VERIFIED' && (
                  <Badge
                    className="text-[9px] bg-emerald-500 text-white hover:bg-emerald-600 flex items-center gap-0.5 px-1.5 py-0.5 font-semibold"
                    title={post.verifiedByFallback ? 'Verificado no Instagram (por timestamp)' : 'Verificado no Instagram (por TAG)'}
                  >
                    <ShieldCheck className="w-2.5 h-2.5" />
                    <span>{post.verifiedByFallback ? 'Instagram ✓*' : 'Instagram ✓'}</span>
                  </Badge>
                )}
                {post.verificationStatus === 'VERIFICATION_FAILED' && (
                  <Badge
                    className="text-[9px] bg-red-600 text-white hover:bg-red-700 flex items-center gap-0.5 px-1.5 py-0.5 font-semibold"
                    title="Não encontrado no Instagram após 3 tentativas"
                  >
                    <ShieldAlert className="w-2.5 h-2.5" />
                    <span>Instagram ✗</span>
                  </Badge>
                )}
                {post.verificationStatus === 'PENDING' && (
                  <Badge
                    variant="outline"
                    className="text-[9px] flex items-center gap-0.5 px-1.5 py-0.5 border-blue-400 text-blue-600"
                    title="Aguardando verificação no Instagram"
                  >
                    <Clock className="w-2.5 h-2.5 animate-pulse" />
                    <span>Verificando...</span>
                  </Badge>
                )}
              </>
            )}
          </div>

          {/* Caption preview */}
          {post.caption && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {post.caption}
            </p>
          )}

          {post.status === 'FAILED' && post.errorMessage && (
            <div className="mt-2 border border-red-300 bg-red-50 dark:bg-red-950/20 rounded p-2">
              <div className="text-[10px] font-semibold text-red-700 dark:text-red-300 mb-0.5 flex items-center gap-1">
                <XCircle className="w-3 h-3" />
                Motivo da falha
              </div>
              <p className="text-[11px] text-red-700 dark:text-red-200 line-clamp-3 whitespace-pre-wrap">
                {post.errorMessage}
              </p>
            </div>
          )}
        </div>

        {/* Menu dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onPreview}>
              <Eye className="w-4 h-4 mr-2" />
              Ver detalhes
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit} disabled={post.status === 'POSTED' || post.status === 'POSTING'}>
              <Edit className="w-4 h-4 mr-2" />
              Editar post
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDuplicate}>
              <Copy className="w-4 h-4 mr-2" />
              Duplicar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleDelete}
              className="text-red-600 focus:text-red-600"
              disabled={deletePost.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Ações rápidas */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t">
        {/* Botão para ver no Instagram - aparece quando post está publicado e tem URL */}
        {post.status === 'POSTED' && (post.publishedUrl || post.latePlatformUrl || post.verifiedPermalink) && (
          <Button
            variant="default"
            size="sm"
            className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
            onClick={() => {
              const url = post.verifiedPermalink || post.publishedUrl || post.latePlatformUrl
              if (url) window.open(url, '_blank', 'noopener,noreferrer')
            }}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Instagram
          </Button>
        )}

        {/* Aprovar vira a ação principal do rascunho: é o que falta para ele
            sair no Instagram, e sem isso a única saída seria "Publicar agora",
            que é outra coisa. */}
        {isRascunho && (
          <Button
            size="sm"
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => setApproveOpen(true)}
          >
            <CalendarCheck className="w-4 h-4 mr-2" />
            Aprovar
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onPreview}
        >
          <Eye className="w-4 h-4 mr-2" />
          Preview
        </Button>

        {!isRascunho && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onEdit}
            disabled={post.status === 'POSTED' || post.status === 'POSTING'}
          >
            <Edit className="w-4 h-4 mr-2" />
            Editar
          </Button>
        )}
      </div>

      {approveOpen && (
        <ApprovePostsDialog
          posts={[post]}
          projectId={post.projectId}
          contaLabel={contaLabel}
          open={approveOpen}
          onClose={() => setApproveOpen(false)}
        />
      )}
    </div>
  )
}
