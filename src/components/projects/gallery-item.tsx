'use client'

import * as React from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Download, Trash2, HardDrive } from 'lucide-react'
import { cn } from '@/lib/utils'

interface GalleryItemProps {
  id: string
  imageUrl: string
  title: string
  date: string
  templateType: 'STORY' | 'FEED' | 'SQUARE'
  selected: boolean
  hasDriveBackup?: boolean
  onToggleSelect: () => void
  onDownload: () => void
  onDelete: () => void
  onDriveOpen?: () => void
  index: number
  pswpWidth: number
  pswpHeight: number
}

export function GalleryItem({
  id,
  imageUrl,
  title,
  date,
  templateType,
  selected,
  hasDriveBackup,
  onToggleSelect,
  onDownload,
  onDelete,
  onDriveOpen,
  index,
  pswpWidth,
  pswpHeight,
}: GalleryItemProps) {
  const [imageLoaded, setImageLoaded] = React.useState(false)
  const [isInView, setIsInView] = React.useState(false)
  const [imageDimensions, setImageDimensions] = React.useState({ width: pswpWidth, height: pswpHeight })
  const ref = React.useRef<HTMLDivElement>(null)

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

  // Carregar dimensões reais da imagem
  React.useEffect(() => {
    const img = new window.Image()
    img.src = imageUrl
    img.onload = () => {
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight })
    }
  }, [imageUrl, id])

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

  // Calcular aspect ratio numérico para inline style
  const getAspectRatioValue = () => {
    return aspectRatio.toString()
  }

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

      {/* Container da imagem - Link para PhotoSwipe */}
      <a
        href={imageUrl}
        data-pswp-width={imageDimensions.width}
        data-pswp-height={imageDimensions.height}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block bg-muted overflow-hidden w-full h-full cursor-zoom-in"
        onClick={(e) => {
          // Prevenir navegação padrão se PhotoSwipe não interceptar
          const hasPhotoSwipe = document.querySelector('.pswp')
          if (!hasPhotoSwipe) {
            console.log('PhotoSwipe not initialized, allowing default behavior')
          }
        }}
      >
        {/* Skeleton loader */}
        {!imageLoaded && (
          <div className="absolute inset-0 bg-gradient-to-r from-muted via-muted/50 to-muted animate-pulse pointer-events-none" />
        )}

        {/* Imagem */}
        <div className="relative w-full h-full pointer-events-none">
          <Image
            src={imageUrl}
            alt={title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, (max-width: 1536px) 25vw, 20vw"
            className="object-cover transition-transform duration-400 group-hover:scale-105"
            onLoad={() => setImageLoaded(true)}
            loading="lazy"
          />
        </div>

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
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
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
