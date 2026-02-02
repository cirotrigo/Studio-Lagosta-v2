'use client'

import * as React from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Download, Calendar, Play, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CreativeCardProps {
  id: string
  displayUrl?: string | null
  assetUrl?: string | null
  status: 'POSTING' | 'COMPLETED' | 'FAILED' | 'PENDING'
  isVideo?: boolean
  selected: boolean
  width: number
  height: number
  onToggleSelect: () => void
  onDownload: () => void
  onSchedule?: () => void
}

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi', '.mkv']

export function CreativeCard({
  id,
  displayUrl,
  assetUrl,
  status,
  isVideo,
  selected,
  width,
  height,
  onToggleSelect,
  onDownload,
  onSchedule,
}: CreativeCardProps) {
  const [imageLoaded, setImageLoaded] = React.useState(false)

  const effectiveDisplayUrl = displayUrl ?? undefined
  const resolvedAssetUrl = assetUrl ?? (status === 'COMPLETED' ? displayUrl : null)

  const isVideoAsset = React.useMemo(() => {
    if (typeof isVideo === 'boolean') return isVideo
    const candidate = (resolvedAssetUrl ?? effectiveDisplayUrl ?? '').toLowerCase()
    return VIDEO_EXTENSIONS.some((ext) => candidate.endsWith(ext))
  }, [resolvedAssetUrl, effectiveDisplayUrl, isVideo])

  const displayIsVideo = effectiveDisplayUrl
    ? VIDEO_EXTENSIONS.some((ext) => effectiveDisplayUrl.toLowerCase().endsWith(ext))
    : false

  const canOpen = status === 'COMPLETED' && resolvedAssetUrl

  // Calculate aspect ratio from dimensions
  const aspectRatio = width / height

  return (
    <div
      className={cn(
        'group relative rounded-xl bg-card overflow-hidden border transition-all',
        selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background border-primary' : 'border-border/50'
      )}
      style={{ aspectRatio: aspectRatio.toFixed(4) }}
    >
      {/* Selection checkbox */}
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onToggleSelect()
        }}
        className={cn(
          'absolute top-2 left-2 z-30 w-7 h-7 rounded-md border-2 flex items-center justify-center transition-all touch-manipulation',
          selected
            ? 'bg-primary border-primary text-primary-foreground'
            : 'bg-black/50 border-white/80 text-transparent backdrop-blur-sm'
        )}
      >
        <Check className="h-4 w-4" />
      </button>

      {/* Video indicator */}
      {isVideoAsset && (
        <div className="absolute top-2 right-2 z-20 p-1.5 rounded-full bg-black/60 backdrop-blur-sm">
          <Play className="h-3 w-3 text-white fill-white" />
        </div>
      )}

      {/* Media content layer - always rendered, pointer-events disabled so clicks pass through */}
      <div className="absolute inset-0 pointer-events-none">
        <MediaContent
          effectiveDisplayUrl={effectiveDisplayUrl}
          displayIsVideo={displayIsVideo}
          imageLoaded={imageLoaded}
          setImageLoaded={setImageLoaded}
        />
        {/* Status overlay for non-completed items */}
        {status !== 'COMPLETED' && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className={cn(
              'px-2 py-1 rounded text-xs font-medium',
              status === 'FAILED' ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground'
            )}>
              {status === 'FAILED' ? 'Falhou' : 'Processando...'}
            </span>
          </div>
        )}
      </div>

      {/* Main clickable area - PhotoSwipe link */}
      {canOpen && (
        <a
          href={resolvedAssetUrl!}
          data-pswp-width={width}
          data-pswp-height={height}
          data-pswp-type={isVideoAsset ? 'video' : 'image'}
          className="absolute inset-0 z-10 cursor-zoom-in"
        />
      )}

      {/* Action buttons - icons only */}
      {status === 'COMPLETED' && resolvedAssetUrl && (
        <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2 z-20">
          {onSchedule && (
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8 rounded-full touch-manipulation bg-black/40 border-white/30 text-white hover:bg-black/60 hover:text-white backdrop-blur-sm"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onSchedule()
              }}
            >
              <Calendar className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8 rounded-full touch-manipulation bg-black/40 border-white/30 text-white hover:bg-black/60 hover:text-white backdrop-blur-sm"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDownload()
            }}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

// Separate component for media content to avoid duplication
function MediaContent({
  effectiveDisplayUrl,
  displayIsVideo,
  imageLoaded,
  setImageLoaded,
}: {
  effectiveDisplayUrl?: string
  displayIsVideo: boolean
  imageLoaded: boolean
  setImageLoaded: (loaded: boolean) => void
}) {
  return (
    <>
      {/* Loading skeleton */}
      {!imageLoaded && effectiveDisplayUrl && (
        <div className="absolute inset-0 bg-gradient-to-r from-muted via-muted/50 to-muted animate-pulse" />
      )}

      {/* Media content */}
      {effectiveDisplayUrl ? (
        displayIsVideo ? (
          <video
            src={effectiveDisplayUrl}
            muted
            loop
            playsInline
            autoPlay
            preload="metadata"
            className="absolute inset-0 w-full h-full object-contain bg-black"
            onLoadedData={() => setImageLoaded(true)}
          />
        ) : (
          <Image
            src={effectiveDisplayUrl}
            alt="Criativo"
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-contain"
            onLoad={() => setImageLoaded(true)}
            loading="lazy"
          />
        )
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-muted text-xs text-muted-foreground">
          Sem preview
        </div>
      )}
    </>
  )
}
