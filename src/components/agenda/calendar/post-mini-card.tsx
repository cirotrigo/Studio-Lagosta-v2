'use client'

import { Badge } from '@/components/ui/badge'
import { Video, Layers, RefreshCw, Loader2, CheckCircle2, XCircle, ShieldCheck, ShieldAlert, Clock } from 'lucide-react'
import { cn, isExternalImage } from '@/lib/utils'
import Image from 'next/image'
import { formatPostTime } from './calendar-utils'
import { memo } from 'react'
import type { SocialPost } from '../../../../prisma/generated/client'

interface PostMiniCardProps {
  post: SocialPost & {
    Project?: {
      id: number
      name: string
      logoUrl?: string | null
      Logo?: Array<{
        fileUrl: string
      }>
    }
  }
  onClick: () => void
}

// OPTIMIZED: Memoize component to prevent re-renders
export const PostMiniCard = memo(function PostMiniCard({ post, onClick }: PostMiniCardProps) {
  const time = formatPostTime(post)

  // Helper para detectar se é vídeo
  const isVideoUrl = (url: string) => {
    const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v']
    return videoExtensions.some(ext => url.toLowerCase().includes(ext))
  }

  const firstMediaUrl = post.mediaUrls?.[0]
  const isVideo = firstMediaUrl ? isVideoUrl(firstMediaUrl) : false

  const getIcon = () => {
    switch (post.postType) {
      case 'STORY':
        return null // Story tem badge
      case 'REEL':
        return <Video className="w-3 h-3" />
      case 'CAROUSEL':
        return <Layers className="w-3 h-3" />
      default:
        return null
    }
  }

  const getStatusColor = () => {
    switch (post.status) {
      case 'SCHEDULED':
        return 'bg-primary/10 border-primary/40 hover:bg-primary/20'
      case 'POSTING':
        return 'bg-yellow-500/10 border-yellow-500/40 hover:bg-yellow-500/20'
      case 'POSTED':
        return 'bg-green-500/10 border-green-500/40 hover:bg-green-500/20'
      case 'FAILED':
        return 'bg-red-500/10 border-red-500/40 hover:bg-red-500/20'
      default:
        return 'bg-muted/10 border-border hover:bg-muted/20'
    }
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-1.5 sm:gap-2 p-1 sm:p-1.5 rounded border transition-all hover:scale-105 hover:shadow-md',
        getStatusColor()
      )}
    >
      {/* Thumbnail */}
      {post.mediaUrls && post.mediaUrls.length > 0 && post.mediaUrls[0] && (
        <div className="relative h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0 overflow-hidden rounded bg-muted">
          {isVideo ? (
            <div className="absolute inset-0 w-full h-full bg-muted flex items-center justify-center">
              <Video className="w-4 h-4 text-muted-foreground" />
            </div>
          ) : (
            <Image
              src={post.mediaUrls[0]}
              alt={post.caption || 'Prévia do post'}
              fill
              sizes="(max-width: 640px) 32px, 40px" // OPTIMIZED: Responsive sizes
              className="object-cover"
              loading="lazy"
              quality={50} // OPTIMIZED: Reduced from 60 for small thumbnails
              placeholder="blur"
              blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiNlNWU3ZWIiLz48L3N2Zz4="
              unoptimized={isExternalImage(post.mediaUrls[0])}
            />
          )}

          {/* Badge de Story */}
          {post.postType === 'STORY' && (
            <Badge className="absolute top-0.5 left-0.5 text-[7px] sm:text-[8px] px-0.5 sm:px-1 py-0 h-auto leading-tight">
              Story
            </Badge>
          )}

          {/* Badge de carrossel */}
          {post.postType === 'CAROUSEL' && post.mediaUrls.length > 1 && (
            <Badge className="absolute top-0.5 right-0.5 text-[7px] sm:text-[8px] px-0.5 sm:px-1 py-0 h-auto leading-tight">
              {post.mediaUrls.length}
            </Badge>
          )}

          {/* Logo do Projeto */}
          {(post.Project?.logoUrl || post.Project?.Logo?.[0]?.fileUrl) && (
            <div className="absolute bottom-0.5 left-0.5 w-3 h-3 sm:w-4 sm:h-4 rounded-full overflow-hidden bg-white/90 border border-border/50">
              <Image
                src={post.Project.logoUrl || post.Project.Logo![0].fileUrl}
                alt={post.Project.name}
                fill
                sizes="16px"
                className="object-contain p-0.5"
                loading="lazy"
                quality={60} // OPTIMIZED: Reduced from 75 for tiny logos
                placeholder="blur"
                blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiNmZmZmZmYiLz48L3N2Zz4="
                unoptimized={isExternalImage(post.Project.logoUrl || post.Project.Logo![0].fileUrl)}
              />
            </div>
          )}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-1 flex-wrap">
          <Badge variant="secondary" className="h-4 px-1 text-[10px]">
            <span className="mr-0.5">⏰</span> {time}
          </Badge>
          {getIcon()}
          {post.isRecurring && <RefreshCw className="w-3 h-3 text-muted-foreground" />}

          {/* Badge de Status - Publicando/Publicado/Falhou */}
          {post.status === 'POSTING' && (
            <Badge className="h-3.5 sm:h-4 px-0.5 sm:px-1 text-[8px] sm:text-[10px] bg-yellow-500 text-white hover:bg-yellow-500 flex items-center gap-0.5">
              <Loader2 className="w-2 h-2 sm:w-2.5 sm:h-2.5 animate-spin" />
              <span className="hidden sm:inline">Publicando</span>
              <span className="sm:hidden">⏳</span>
            </Badge>
          )}
          {post.status === 'POSTED' && (
            <Badge className="h-3.5 sm:h-4 px-0.5 sm:px-1 text-[8px] sm:text-[10px] bg-green-500 text-white hover:bg-green-500 flex items-center gap-0.5">
              <CheckCircle2 className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
              <span className="hidden sm:inline">Publicado</span>
              <span className="sm:hidden">✓</span>
            </Badge>
          )}
          {post.status === 'FAILED' && (
            <Badge className="h-3.5 sm:h-4 px-0.5 sm:px-1 text-[8px] sm:text-[10px] bg-red-500 text-white hover:bg-red-500 flex items-center gap-0.5">
              <XCircle className="w-2 h-2 sm:w-2.5 sm:h-2.5" />
              <span className="hidden sm:inline">Falhou</span>
              <span className="sm:hidden">✕</span>
            </Badge>
          )}

          {/* Badges de Verificação - apenas para Stories já enviados */}
          {post.postType === 'STORY' && (post.status === 'POSTED' || post.status === 'FAILED') && (
            <>
              {post.verificationStatus === 'VERIFIED' && (
                <Badge
                  className="h-3 px-1 text-[8px] bg-emerald-500 text-white hover:bg-emerald-600 flex items-center gap-0.5 font-semibold"
                  title={post.verifiedByFallback ? 'Verificado no Instagram (por timestamp)' : 'Verificado no Instagram (por TAG)'}
                >
                  <ShieldCheck className="w-2 h-2" />
                  <span className="hidden sm:inline">{post.verifiedByFallback ? 'IG ✓*' : 'IG ✓'}</span>
                  <span className="sm:hidden">✓</span>
                </Badge>
              )}
              {post.verificationStatus === 'VERIFICATION_FAILED' && (
                <Badge
                  className="h-3 px-1 text-[8px] bg-red-600 text-white hover:bg-red-700 flex items-center gap-0.5 font-semibold"
                  title="Não encontrado no Instagram após 3 tentativas"
                >
                  <ShieldAlert className="w-2 h-2" />
                  <span className="hidden sm:inline">IG ✗</span>
                  <span className="sm:hidden">✗</span>
                </Badge>
              )}
              {post.verificationStatus === 'PENDING' && (
                <Badge
                  variant="outline"
                  className="h-3 px-1 text-[8px] flex items-center gap-0.5 border-blue-400 text-blue-600"
                  title="Aguardando verificação no Instagram"
                >
                  <Clock className="w-2 h-2 animate-pulse" />
                  <span className="hidden sm:inline">Verificando...</span>
                  <span className="sm:hidden">⏱</span>
                </Badge>
              )}
            </>
          )}
        </div>
      </div>
    </button>
  )
})
