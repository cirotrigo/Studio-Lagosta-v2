'use client'

import * as React from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Download, Trash2, HardDrive, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PENDING'
  progress?: number
  errorMessage?: string | null
  isVideo?: boolean
  onToggleSelect: () => void
  onDownload: () => void
  onDelete: () => void
  onDriveOpen?: () => void
  onPreview?: () => void
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
  onToggleSelect,
  onDownload,
  onDelete,
  onDriveOpen,
  onPreview,
  index,
  pswpWidth,
  pswpHeight,
}: GalleryItemProps) {
  const [imageLoaded, setImageLoaded] = React.useState(false)
  const [isInView, setIsInView] = React.useState(false)
  // Inicializar com as dimensões do template para evitar flicker
  const [imageDimensions, setImageDimensions] = React.useState({ width: pswpWidth, height: pswpHeight })
  const ref = React.useRef<HTMLDivElement>(null)

  const primaryDisplayUrl = displayUrl ?? imageUrl ?? null
  const resolvedAssetUrl = assetUrl ?? (status === 'COMPLETED' ? primaryDisplayUrl : null)
  const effectiveDisplayUrl = primaryDisplayUrl ?? undefined

  const isVideoAsset = React.useMemo(() => {
    if (typeof isVideo === 'boolean') return isVideo
    const candidate = (resolvedAssetUrl ?? effectiveDisplayUrl ?? '').toLowerCase()
    return VIDEO_EXTENSIONS.some((ext) => candidate.endsWith(ext))
  }, [resolvedAssetUrl, effectiveDisplayUrl, isVideo])

  const showProgress = status === 'PROCESSING' || status === 'PENDING'
  const clampedProgress =
    typeof progress === 'number' ? Math.max(0, Math.min(100, Math.round(progress))) : undefined
  const showFailure = status === 'FAILED'
  const displayIsVideo = effectiveDisplayUrl
    ? VIDEO_EXTENSIONS.some((ext) => effectiveDisplayUrl.toLowerCase().endsWith(ext))
    : false

  // Intersection Observer para animações
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

  // Carregar dimensões reais da imagem para garantir precisão
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
      // Atualizar apenas se as dimensões reais forem diferentes
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

  // Calcular aspect ratio real da imagem
  const aspectRatio = imageDimensions.width / imageDimensions.height

  // Detectar orientação da imagem
  const getOrientation = () => {
    if (aspectRatio > 1.5) return 'landscape'
    if (aspectRatio < 0.75) return 'portrait'
    if (aspectRatio >= 0.95 && aspectRatio <= 1.05) return 'square'
    return 'standard'
  }

  const orientation = getOrientation()

  // Determinar grid spans baseado na orientação
  const getGridSpan = () => {
    switch (orientation) {
      case 'portrait':
        // Portrait ocupa 1 col x 2 rows
        return { colSpan: 'col-span-1', rowSpan: 'row-span-2' }
      case 'landscape':
        // Landscape ocupa 2 cols x 1 row
        return { colSpan: 'col-span-2', rowSpan: 'row-span-1' }
      case 'square':
        // Square ocupa 1 col x 1 row
        return { colSpan: 'col-span-1', rowSpan: 'row-span-1' }
      default:
        return { colSpan: 'col-span-1', rowSpan: 'row-span-1' }
    }
  }

  const gridSpan = getGridSpan()

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
        'group relative rounded-xl overflow-hidden bg-card transition-all duration-300',
        'border border-border/50 shadow-sm hover:shadow-xl hover:shadow-primary/5',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        gridSpan.colSpan,
        gridSpan.rowSpan
      )}
      data-orientation={orientation}
    >
      {/* Checkbox */}
      <div className="absolute top-3 left-3 z-20 pointer-events-auto">
        <motion.input
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          type="checkbox"
          checked={selected}
          onChange={(e) => {
            e.stopPropagation()
            onToggleSelect()
          }}
          className="h-5 w-5 rounded-md border-2 border-white shadow-lg cursor-pointer bg-black/20 backdrop-blur-sm checked:bg-primary checked:border-primary transition-all"
        />
      </div>

      {/* Data/hora badge */}
      <div className="absolute top-3 right-3 z-20 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md text-white text-xs font-medium shadow-lg pointer-events-none">
        {date}
      </div>

      {/* Container da imagem/vídeo */}
      <a
        href={resolvedAssetUrl ?? effectiveDisplayUrl ?? '#'}
        data-pswp-width={imageDimensions.width}
        data-pswp-height={imageDimensions.height}
        data-pswp-type={resolvedAssetUrl && isVideoAsset ? 'video' : 'image'}
        target={
          !resolvedAssetUrl || status !== 'COMPLETED' || isVideoAsset ? undefined : '_blank'
        }
        rel="noopener noreferrer"
        className={cn(
          'relative block bg-muted overflow-hidden w-full h-full',
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
          console.log('Gallery item clicked:', {
            displayUrl: effectiveDisplayUrl,
            assetUrl: resolvedAssetUrl,
            width: imageDimensions.width,
            height: imageDimensions.height,
            isVideo: isVideoAsset,
          })
        }}
      >
        {/* Skeleton loader */}
        {!imageLoaded && (
          <div className="absolute inset-0 bg-gradient-to-r from-muted via-muted/50 to-muted animate-pulse pointer-events-none" />
        )}

        {/* Imagem ou Vídeo */}
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
                className="object-cover transition-transform duration-400 group-hover:scale-105"
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

        {showProgress && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-white pointer-events-none">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm font-medium">
              {clampedProgress != null ? `Processando ${clampedProgress}%` : 'Processando...'}
            </span>
            <div className="h-1.5 w-10/12 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white"
                style={{ width: `${clampedProgress != null ? Math.max(clampedProgress, 5) : 25}%` }}
              />
            </div>
          </div>
        )}

        {showFailure && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 px-4 text-center text-sm text-red-100 pointer-events-none">
            <span className="font-medium">Falha ao processar</span>
            {errorMessage ? (
              <span className="text-xs opacity-80 line-clamp-3">{errorMessage}</span>
            ) : null}
          </div>
        )}

        {/* Overlay com gradiente no hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

        {/* Título e informações na parte inferior (hover) */}
        <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300 pointer-events-none">
          <h3 className="text-white font-semibold text-sm truncate drop-shadow-lg">
            {title}
          </h3>
          <p className="text-white/80 text-xs mt-1 drop-shadow-md">
            {templateType === 'STORY' ? '9:16 Story' : templateType === 'FEED' ? '4:5 Feed' : '1:1 Square'}
          </p>
        </div>
      </a>

      {/* Botões de ação flutuantes (aparecem no hover) */}
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/90 via-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 pointer-events-none">
        <div className="flex items-center justify-center gap-2 pointer-events-auto">
          {hasDriveBackup && onDriveOpen && (
            <Button
              size="sm"
              variant="secondary"
              className="flex-1 bg-white/95 hover:bg-white text-black font-medium shadow-lg"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onDriveOpen()
              }}
            >
              <HardDrive className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            className="flex-1 bg-white/95 hover:bg-white text-black font-medium shadow-lg"
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
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="flex-1 bg-red-500/95 hover:bg-red-500 shadow-lg"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDelete()
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  )
}
