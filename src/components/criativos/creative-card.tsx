'use client'

import * as React from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Download, Trash2, Calendar, Play, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CreativeCardProps {
  id: string
  displayUrl?: string | null
  assetUrl?: string | null
  title: string
  projectName?: string
  date: string
  status: 'POSTING' | 'COMPLETED' | 'FAILED' | 'PENDING'
  isVideo?: boolean
  selected: boolean
  width: number
  height: number
  onToggleSelect: () => void
  onDownload: () => void
  onDelete: () => void
  onSchedule?: () => void
}

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi', '.mkv']

export function CreativeCard({
  id,
  displayUrl,
  assetUrl,
  title,
  projectName,
  date,
  status,
  isVideo,
  selected,
  width,
  height,
  onToggleSelect,
  onDownload,
  onDelete,
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

  return (
    <div
      className={cn(
        'group relative rounded-xl bg-card overflow-hidden border transition-all',
        selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background border-primary' : 'border-border/50 hover:border-border'
      )}
    >
      {/* Selection checkbox */}
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onToggleSelect()
        }}
        className={cn(
          'absolute top-2 left-2 z-30 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all',
          selected
            ? 'bg-primary border-primary text-primary-foreground'
            : 'bg-black/40 border-white/70 text-transparent hover:border-white backdrop-blur-sm'
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

      {/* Main clickable area - PhotoSwipe link */}
      <a
        href={resolvedAssetUrl ?? effectiveDisplayUrl ?? '#'}
        data-pswp-width={width}
        data-pswp-height={height}
        data-pswp-type={resolvedAssetUrl && isVideoAsset ? 'video' : 'image'}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'block aspect-[4/5] relative bg-muted overflow-hidden',
          canOpen ? 'cursor-zoom-in' : 'cursor-default'
        )}
        onClick={(e) => {
          // Prevent navigation if no valid asset
          if (!canOpen) {
            e.preventDefault()
          }
          // Otherwise let PhotoSwipe handle the click
        }}
      >
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
              className="absolute inset-0 w-full h-full object-cover"
              onLoadedData={() => setImageLoaded(true)}
            />
          ) : (
            <Image
              src={effectiveDisplayUrl}
              alt={title}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              onLoad={() => setImageLoaded(true)}
              loading="lazy"
            />
          )
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted text-xs text-muted-foreground">
            Sem preview
          </div>
        )}

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

        {/* Hover gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      </a>

      {/* Info section */}
      <div className="p-3 space-y-2">
        <div className="space-y-0.5">
          <h3 className="text-sm font-medium truncate">{title}</h3>
          {projectName && (
            <p className="text-xs text-muted-foreground truncate">{projectName}</p>
          )}
          <p className="text-xs text-muted-foreground">{date}</p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-1.5">
          {onSchedule && status === 'COMPLETED' && resolvedAssetUrl && (
            <Button
              size="sm"
              variant="default"
              className="flex-1 h-8 text-xs"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onSchedule()
              }}
            >
              <Calendar className="h-3.5 w-3.5 mr-1" />
              Agendar
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2"
            disabled={status !== 'COMPLETED' || !resolvedAssetUrl}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDownload()
            }}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDelete()
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
