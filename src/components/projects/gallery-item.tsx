'use client'

import * as React from 'react'
import Image from 'next/image'
import { motion, useMotionTemplate, useMotionValue } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Download, Trash2, HardDrive, Loader2, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MemberAvatar } from '@/components/members/member-avatar'

interface GalleryItemProps {
  id: string
  displayUrl?: string | null
  imageUrl?: string | null
  assetUrl?: string | null
  title: string
  date: string
  templateType: 'STORY' | 'FEED' | 'SQUARE'
  selected: boolean
  hasDriveBackup?: boolean
  status: 'POSTING' | 'COMPLETED' | 'FAILED' | 'PENDING'
  progress?: number
  errorMessage?: string | null
  isVideo?: boolean
  authorClerkId?: string
  onToggleSelect: () => void
  onDownload: () => void
  onDelete: () => void
  onDriveOpen?: () => void
  onPreview?: () => void
  onSchedule?: () => void
  index: number
  pswpWidth: number
  pswpHeight: number
}

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi', '.mkv']

export function GalleryItem({
  id,
  displayUrl,
  imageUrl,
  assetUrl,
  title,
  date,
  templateType,
  selected,
  hasDriveBackup,
  status,
  progress,
  errorMessage,
  isVideo,
  authorClerkId,
  onToggleSelect,
  onDownload,
  onDelete,
  onDriveOpen,
  onPreview,
  onSchedule,
  index,
  pswpWidth,
  pswpHeight,
}: GalleryItemProps) {
  const [imageLoaded, setImageLoaded] = React.useState(false)
  const [isInView, setIsInView] = React.useState(false)
  const [imageDimensions, setImageDimensions] = React.useState({ width: pswpWidth, height: pswpHeight })
  const ref = React.useRef<HTMLDivElement>(null)

  // Mouse tracking for spotlight effect
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect()
    mouseX.set(clientX - left)
    mouseY.set(clientY - top)
  }

  const primaryDisplayUrl = displayUrl ?? imageUrl ?? null
  const resolvedAssetUrl = assetUrl ?? (status === 'COMPLETED' ? primaryDisplayUrl : null)
  const effectiveDisplayUrl = primaryDisplayUrl ?? undefined

  const isVideoAsset = React.useMemo(() => {
    if (typeof isVideo === 'boolean') return isVideo
    const candidate = (resolvedAssetUrl ?? effectiveDisplayUrl ?? '').toLowerCase()
    return VIDEO_EXTENSIONS.some((ext) => candidate.endsWith(ext))
  }, [resolvedAssetUrl, effectiveDisplayUrl, isVideo])

  const showProgress = status === 'POSTING' || status === 'PENDING'
  const clampedProgress =
    typeof progress === 'number' ? Math.max(0, Math.min(100, Math.round(progress))) : undefined
  const showFailure = status === 'FAILED'
  const displayIsVideo = effectiveDisplayUrl
    ? VIDEO_EXTENSIONS.some((ext) => effectiveDisplayUrl.toLowerCase().endsWith(ext))
    : false

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1, rootMargin: '50px' }
    )

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    if (!effectiveDisplayUrl) {
      setImageLoaded(true)
      return
    }

    const lowerDisplay = effectiveDisplayUrl.toLowerCase()
    if (VIDEO_EXTENSIONS.some((ext) => lowerDisplay.endsWith(ext))) {
      setImageLoaded(true)
      return
    }

    setImageLoaded(false)
    const img = new window.Image()
    img.src = effectiveDisplayUrl
    img.onload = () => {
      const realWidth = img.naturalWidth
      const realHeight = img.naturalHeight

      if (realWidth !== imageDimensions.width || realHeight !== imageDimensions.height) {
        setImageDimensions({ width: realWidth, height: realHeight })
      }
    }
    img.onerror = () => {
      console.warn(`Failed to load image dimensions for: ${effectiveDisplayUrl}`)
      setImageLoaded(true)
    }
    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [effectiveDisplayUrl, id, imageDimensions.width, imageDimensions.height])

  const aspectRatio = imageDimensions.width / imageDimensions.height

  const getOrientation = () => {
    if (aspectRatio > 1.5) return 'landscape'
    if (aspectRatio < 0.75) return 'portrait'
    if (aspectRatio >= 0.95 && aspectRatio <= 1.05) return 'square'
    return 'standard'
  }

  const orientation = getOrientation()
  const aspectRatioStyle = { aspectRatio: aspectRatio.toFixed(4) }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{
        duration: 0.5,
        delay: index * 0.05,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      className={cn(
        'group relative rounded-xl bg-card overflow-hidden',
        // Minimal border by default, glowing border on hover/spotlight
        'border border-white/5',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        'w-full'
      )}
      style={aspectRatioStyle}
      data-orientation={orientation}
      onMouseMove={handleMouseMove}
    >
      {/* Spotlight Effect Border */}
      <motion.div
        className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition duration-300 group-hover:opacity-100 z-10"
        style={{
          background: useMotionTemplate`
            radial-gradient(
              650px circle at ${mouseX}px ${mouseY}px,
              color-mix(in oklch, var(--primary) 40%, transparent),
              transparent 80%
            )
          `,
        }}
      />

      {/* Checkbox - Always visible for quick selection, but styled subtly */}
      <div className="absolute top-3 left-3 z-30 pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <motion.input
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          type="checkbox"
          checked={selected}
          onChange={(e) => {
            e.stopPropagation()
            onToggleSelect()
          }}
          className="h-5 w-5 rounded-md border-2 border-white shadow-lg cursor-pointer bg-black/40 backdrop-blur-sm checked:bg-primary checked:border-primary transition-all"
        />
      </div>

      {/* Badges - visible on hover or always? User requested info on hover. 
          Let's make them fade in on hover for cleaner look, or keep them as 'meta' that is always there?
          User said "informações e botões só aparecesem ao passar o mouse". So opacity-0 default.
      */}
      <div className="absolute top-3 right-3 z-30 flex flex-col gap-2 items-end pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div className="px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md text-white text-xs font-medium shadow-lg border border-white/10">
          {date}
        </div>
        {authorClerkId && (
          <div className="rounded-full ring-2 ring-white/20 shadow-lg overflow-hidden">
            <MemberAvatar clerkId={authorClerkId} size="sm" showTooltip />
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <a
        href={resolvedAssetUrl ?? effectiveDisplayUrl ?? '#'}
        data-pswp-width={imageDimensions.width}
        data-pswp-height={imageDimensions.height}
        data-pswp-type={resolvedAssetUrl && isVideoAsset ? 'video' : 'image'}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'relative block bg-muted overflow-hidden w-full h-full rounded-xl', // inner rounding
          resolvedAssetUrl && status === 'COMPLETED' ? 'cursor-zoom-in' : 'cursor-default'
        )}
        onClick={(e) => {
          const shouldHandlePreview = !resolvedAssetUrl || status !== 'COMPLETED'
          if (shouldHandlePreview) {
            e.preventDefault()
            e.stopPropagation()
            onPreview?.()
            return
          }
          console.log('PhotoSwipe: Item clicável')
        }}
      >
        {/* Skeleton */}
        {!imageLoaded && (
          <div className="absolute inset-0 bg-gradient-to-r from-muted via-muted/50 to-muted animate-pulse pointer-events-none" />
        )}

        {/* Media */}
        <div className="relative w-full h-full pointer-events-none">
          {effectiveDisplayUrl ? (
            displayIsVideo ? (
              <video
                src={effectiveDisplayUrl}
                muted
                loop
                playsInline
                autoPlay
                preload="metadata"
                className="h-full w-full object-cover"
                onLoadedData={() => setImageLoaded(true)}
              />
            ) : (
              <Image
                src={effectiveDisplayUrl}
                alt={title}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, (max-width: 1536px) 25vw, 20vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                onLoad={() => setImageLoaded(true)}
                loading="lazy"
              />
            )
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted text-xs font-medium text-muted-foreground">
              Prévia indisponível
            </div>
          )}
        </div>

        {/* Status Overlays */}
        {showProgress && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-white pointer-events-none z-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="text-sm font-medium">
              {clampedProgress != null ? `Processando ${clampedProgress}%` : 'Processando...'}
            </span>
            <div className="h-1.5 w-10/12 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${clampedProgress != null ? Math.max(clampedProgress, 5) : 25}%` }}
              />
            </div>
          </div>
        )}

        {showFailure && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 px-4 text-center text-sm text-red-100 pointer-events-none z-20">
            <Trash2 className="h-8 w-8 text-destructive opacity-50 mb-2" />
            <span className="font-medium text-destructive-foreground">Falha ao processar</span>
            {errorMessage && (
              <span className="text-xs opacity-70 line-clamp-2">{errorMessage}</span>
            )}
          </div>
        )}

        {/* Hover Overlay & Info */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10" />

        <div className="absolute bottom-12 left-0 right-0 p-4 translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-20">
          <h3 className="text-white font-bold text-sm truncate drop-shadow-md">
            {title}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] uppercase font-semibold text-white backdrop-blur-sm">
              {templateType}
            </span>
            {status === 'COMPLETED' && (
              <span className="text-[10px] text-emerald-400 font-medium tracking-wide uppercase">
                Pronto
              </span>
            )}
          </div>
        </div>
      </a>

      {/* Action Buttons */}
      <div className="absolute bottom-0 left-0 right-0 p-3 flex gap-2 translate-y-full group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300 z-30 pointer-events-auto bg-black/40 backdrop-blur-md border-t border-white/10">
        {onSchedule && status === 'COMPLETED' && resolvedAssetUrl && (
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 h-8 bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-sm rounded-md"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onSchedule()
            }}
            title="Agendar"
          >
            <Calendar className="h-3.5 w-3.5" />
          </Button>
        )}

        <Button
          size="sm"
          variant="ghost"
          className="flex-1 h-8 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-md"
          disabled={status !== 'COMPLETED' || !resolvedAssetUrl}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (status !== 'COMPLETED' || !resolvedAssetUrl) {
              onPreview?.()
              return
            }
            onDownload()
          }}
          title={status === 'COMPLETED' ? "Baixar" : "Ver Preview"}
        >
          {status === 'COMPLETED' ? <Download className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
        </Button>

        {hasDriveBackup && onDriveOpen && (
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 h-8 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-md"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDriveOpen()
            }}
            title="Drive"
          >
            <HardDrive className="h-3.5 w-3.5" />
          </Button>
        )}

        <Button
          size="sm"
          variant="ghost"
          className="flex-0 w-8 h-8 px-0 bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 border border-red-500/20 rounded-md"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onDelete()
          }}
          title="Excluir"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </motion.div>
  )
}

function EyeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}
