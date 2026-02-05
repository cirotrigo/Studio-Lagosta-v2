'use client'

import * as React from 'react'
import Image from 'next/image'
import { FileImage, Folder, MoreHorizontal, Eye, Download as DownloadIcon, MoveRight, Trash2, Video, FileText, Wand2, Sparkles } from 'lucide-react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { GoogleDriveItem } from '@/types/google-drive'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import type { TemplateListItem } from '@/hooks/use-templates'
import { motion, useMotionTemplate, useMotionValue } from 'framer-motion'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface DriveItemProps {
  item: GoogleDriveItem
  selected: boolean
  onToggleSelect: () => void
  onOpen: (item: GoogleDriveItem) => void
  onDownload: (item: GoogleDriveItem) => void
  onMove: (item: GoogleDriveItem) => void
  onDelete?: (item: GoogleDriveItem) => void
  templates: TemplateListItem[]
  onOpenInTemplate: (item: GoogleDriveItem, templateId: number) => void
  onEditWithAI?: (item: GoogleDriveItem) => void
}

const MIME_FOLDER = 'application/vnd.google-apps.folder'

function formatBytes(size?: number) {
  if (!size) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  const value = size / 1024 ** exponent
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

export function DriveItem({
  item,
  selected,
  onToggleSelect,
  onOpen,
  onDownload,
  onMove,
  onDelete,
  templates,
  onOpenInTemplate,
  onEditWithAI,
}: DriveItemProps) {
  const isFolder = item.kind === 'folder' || item.mimeType === MIME_FOLDER
  const resolvedFileId = item.shortcutDetails?.targetId ?? item.id
  const thumbnailUrl = isFolder ? undefined : `/api/drive/thumbnail/${resolvedFileId}`
  const isImage = item.mimeType?.startsWith('image/')
  const isVideo = item.mimeType?.startsWith('video/')
  const isAIGenerated = item.name.toLowerCase().includes('ia-')
  const fullResourceSrc = !isFolder && resolvedFileId ? `/api/google-drive/image/${resolvedFileId}` : null

  const [cardAspectRatio, setCardAspectRatio] = React.useState(1)
  const [lightboxDimensions, setLightboxDimensions] = React.useState(() => ({
    width: isVideo ? 1920 : 1600,
    height: isVideo ? 1080 : 1600,
  }))

  const pswpWidth = Math.max(1, lightboxDimensions.width)
  const pswpHeight = Math.max(1, lightboxDimensions.height)
  const enableLightbox = Boolean(fullResourceSrc && (isImage || isVideo))
  const [previewLoaded, setPreviewLoaded] = React.useState(!thumbnailUrl)

  // Mobile touch support: first tap shows actions, second tap opens lightbox
  const [isTouchActive, setIsTouchActive] = React.useState(false)
  const cardRef = React.useRef<HTMLDivElement>(null)
  const isTouchDeviceRef = React.useRef(false)

  // Detect touch device on mount (avoids SSR mismatch)
  React.useEffect(() => {
    isTouchDeviceRef.current = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  }, [])

  // On touch devices, only enable PhotoSwipe when action bar is visible (second tap)
  const shouldEnablePswp = !isTouchDeviceRef.current || isTouchActive

  // Close action bar when tapping outside
  React.useEffect(() => {
    if (!isTouchActive) return

    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setIsTouchActive(false)
      }
    }

    document.addEventListener('touchstart', handleClickOutside, { passive: true })
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('touchstart', handleClickOutside)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isTouchActive])

  // Handle first tap to show actions on touch devices
  const handleCardTap = React.useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isTouchDeviceRef.current) return // Desktop: let hover handle it

    // Don't interfere with button clicks inside action bar
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('[role="menuitem"]') || target.closest('[data-action-bar]')) return

    if (!isTouchActive) {
      e.preventDefault()
      e.stopPropagation()
      setIsTouchActive(true)
    }
    // If already active, let the normal click/tap behavior happen (open lightbox, etc.)
  }, [isTouchActive])

  // Spotlight effect
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect()
    mouseX.set(clientX - left)
    mouseY.set(clientY - top)
  }

  React.useEffect(() => {
    if (!isImage) {
      setCardAspectRatio(isFolder ? 1 : 0.8) // Folders square, standard files vertical-ish
      setLightboxDimensions({
        width: isVideo ? 1920 : 1600,
        height: isVideo ? 1080 : 1600,
      })
    }
  }, [isImage, isVideo, isFolder])

  const updateDimensionsFromPreview = React.useCallback(
    (width: number, height: number) => {
      if (!width || !height || !isImage) return
      const ratio = width / height
      setCardAspectRatio(ratio || 1)
      const targetHeight = 2000
      setLightboxDimensions({
        width: Math.max(1, Math.round(ratio * targetHeight)),
        height: targetHeight,
      })
    },
    [isImage],
  )

  const templateOptions = React.useMemo(() => templates.slice(0, 20), [templates])

  const handleDoubleClick = React.useCallback(() => {
    onOpen(item)
  }, [item, onOpen])

  const {
    attributes,
    listeners,
    setNodeRef: setDragNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: item.id,
    data: { item },
  })

  const { isOver, setNodeRef: setDropNodeRef } = useDroppable({
    id: `folder-${item.id}`,
    disabled: !isFolder,
    data: { item },
  })

  // Merge refs
  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = node
      setDragNodeRef(node)
      if (isFolder) {
        setDropNodeRef(node)
      }
    },
    [isFolder, setDragNodeRef, setDropNodeRef],
  )

  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.6 : undefined,
  }

  return (
    <motion.div
      ref={setRefs}
      style={style}
      className={cn(
        'group relative flex flex-col rounded-xl overflow-hidden bg-card border border-white/5 transition-all',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        isOver && isFolder && 'ring-2 ring-primary bg-primary/10',
        isTouchActive && 'touch-active',
        'w-full'
      )}
      data-touch-active={isTouchActive || undefined}
      onDoubleClick={handleDoubleClick}
      onMouseMove={handleMouseMove}
      onClick={handleCardTap}
      {...attributes}
      {...listeners}
    >
      {/* Spotlight Effect */}
      <motion.div
        className={cn(
          "pointer-events-none absolute -inset-px rounded-xl opacity-0 transition duration-300 group-hover:opacity-100 z-10",
          isTouchActive && "opacity-100"
        )}
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

      <div
        className="relative w-full overflow-hidden bg-muted/40 cursor-pointer"
        style={{ aspectRatio: cardAspectRatio }}
      >
        {enableLightbox ? (
          <a
            href={fullResourceSrc ?? undefined}
            {...(shouldEnablePswp ? {
              'data-pswp-src': fullResourceSrc ?? undefined,
              'data-pswp-width': String(pswpWidth),
              'data-pswp-height': String(pswpHeight),
              'data-pswp-type': isVideo ? 'video' : 'image',
              'data-pswp-media-type': item.mimeType,
            } : {})}
            className="block h-full w-full"
            onClick={(event) => {
              if (!previewLoaded) {
                event.preventDefault()
              }
            }}
          >
            {thumbnailUrl ? (
              <Image
                src={thumbnailUrl}
                alt={item.name}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
                unoptimized
                className="object-cover transition duration-500 group-hover:scale-105"
                onLoadingComplete={(img) => {
                  setPreviewLoaded(true)
                  if (img.naturalWidth && img.naturalHeight) {
                    updateDimensionsFromPreview(img.naturalWidth, img.naturalHeight)
                  }
                }}
                onError={() => setPreviewLoaded(true)}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground p-8">
                <FileImage className="h-12 w-12 opacity-50" />
              </div>
            )}
          </a>
        ) : thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt={item.name}
            fill
            sizes="200px"
            unoptimized
            className="object-cover transition duration-500 group-hover:scale-105"
            onLoadingComplete={(img) => {
              setPreviewLoaded(true)
              if (img.naturalWidth && img.naturalHeight) {
                updateDimensionsFromPreview(img.naturalWidth, img.naturalHeight)
              }
            }}
            onError={() => setPreviewLoaded(true)}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center text-muted-foreground gap-2 p-2 bg-muted/20">
            {isFolder ? (
              <div
                className="flex h-full w-full flex-col items-center justify-center gap-2"
                title={item.name}
              >
                <Folder className="h-12 w-12 text-primary/70" />
                <p className="px-1 text-[10px] font-medium text-foreground text-center line-clamp-3 break-words leading-tight opacity-90">
                  {item.name}
                </p>
              </div>
            ) : isVideo ? (
              <Video className="h-12 w-12 opacity-50" />
            ) : (
              <FileIcon mimeType={item.mimeType} className="h-12 w-12 opacity-50" />
            )}
            {/* Show name centrally if no image */}
            {!isFolder && !thumbnailUrl && (
              <span className="text-xs text-center line-clamp-2 px-2 opacity-70 break-all">
                {item.name}
              </span>
            )}
          </div>
        )}

        {/* Video Badge */}
        {!isFolder && isVideo && (
          <div className="absolute top-2 right-2 z-20 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold uppercase text-white backdrop-blur-sm pointer-events-none">
            Vídeo
          </div>
        )}

        {/* AI Generated Badge */}
        {!isFolder && isAIGenerated && !isVideo && (
          <div className="absolute top-2 right-2 z-20 flex items-center gap-1 rounded-full bg-gradient-to-r from-purple-600/80 to-blue-600/80 px-2 py-1 text-[10px] font-semibold uppercase text-white backdrop-blur-sm pointer-events-none">
            <Sparkles className="h-3 w-3" />
            IA
          </div>
        )}

        {/* Checkbox - Reveal on hover or touch */}
        <div
          className={cn(
            "absolute top-2 left-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200",
            isTouchActive && "opacity-100"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelect()}
            className="data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground border-white/50 bg-black/40 backdrop-blur-sm h-5 w-5 sm:h-4 sm:w-4"
          />
        </div>

        {/* Overlay Info - Reveal on hover or touch */}
        <div className={cn(
          "absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10",
          isTouchActive && "opacity-100"
        )} />

        <div className={cn(
          "absolute bottom-12 left-0 right-0 p-4 translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-20",
          isTouchActive && "translate-y-0 opacity-100"
        )}>
          <h3 className="text-white font-medium text-sm leading-snug line-clamp-2 drop-shadow-sm mb-1 break-anywhere">
            {item.name}
          </h3>
          <div className="flex items-center justify-between text-[11px] text-white/70">
            <span>{formatBytes(item.size)}</span>
            <span>{item.modifiedTime ? format(new Date(item.modifiedTime), 'dd MMM', { locale: ptBR }) : '-'}</span>
          </div>
        </div>

        {/* Action Bar - Reveal on hover or touch */}
        <div
          data-action-bar
          className={cn(
            "absolute bottom-0 left-0 right-0 p-2 sm:p-2 flex gap-1.5 sm:gap-1 items-center translate-y-full group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300 z-30 pointer-events-auto bg-black/60 backdrop-blur-md border-t border-white/10",
            isTouchActive && "translate-y-0 opacity-100"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {isFolder ? (
            <Button variant="ghost" size="sm" className="flex-1 h-10 sm:h-8 text-white hover:bg-white/20 hover:text-white active:bg-white/30" onClick={() => onOpen(item)}>
              <Eye className="h-4 w-4 mr-1" /> Abrir
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="icon" className="h-10 w-10 sm:h-8 sm:w-8 text-white hover:bg-white/20 hover:text-white active:bg-white/30 rounded-md" onClick={() => onOpen(item)} title="Visualizar">
                <Eye className="h-5 w-5 sm:h-4 sm:w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-10 w-10 sm:h-8 sm:w-8 text-white hover:bg-white/20 hover:text-white active:bg-white/30 rounded-md" onClick={() => onDownload(item)} title="Baixar">
                <DownloadIcon className="h-5 w-5 sm:h-4 sm:w-4" />
              </Button>
              {isImage && onEditWithAI && (
                <Button variant="ghost" size="icon" className="h-10 w-10 sm:h-8 sm:w-8 text-white hover:bg-white/20 hover:text-white active:bg-white/30 rounded-md" onClick={() => onEditWithAI(item)} title="Editar com IA">
                  <Wand2 className="h-5 w-5 sm:h-4 sm:w-4" />
                </Button>
              )}
            </>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10 sm:h-8 sm:w-8 text-white hover:bg-white/20 hover:text-white active:bg-white/30 rounded-md ml-auto">
                <MoreHorizontal className="h-5 w-5 sm:h-4 sm:w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {isFolder ? (
                <DropdownMenuItem onSelect={() => onOpen(item)}>
                  <Eye className="mr-2 h-4 w-4" /> Abrir
                </DropdownMenuItem>
              ) : (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Eye className="mr-2 h-4 w-4" /> Abrir
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-48">
                    <DropdownMenuItem onSelect={() => onOpen(item)}>
                      Visualizar arquivo
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {templateOptions.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Abrir no Template</div>
                        {templateOptions.map((t) => (
                          <DropdownMenuItem key={t.id} onSelect={() => onOpenInTemplate(item, t.id)}>
                            {t.name}
                          </DropdownMenuItem>
                        ))}
                      </>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {!isFolder && (
                <DropdownMenuItem onSelect={() => onDownload(item)}>
                  <DownloadIcon className="mr-2 h-4 w-4" /> Download
                </DropdownMenuItem>
              )}
              {!isFolder && isImage && onEditWithAI && (
                <DropdownMenuItem onSelect={() => onEditWithAI(item)}>
                  <Wand2 className="mr-2 h-4 w-4" /> Editar com IA
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => onMove(item)}>
                <MoveRight className="mr-2 h-4 w-4" /> Mover para...
              </DropdownMenuItem>
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => onDelete(item)} className="text-red-500 focus:text-red-500">
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </motion.div>
  )
}

function FileIcon({ mimeType, className }: { mimeType?: string, className?: string }) {
  if (mimeType?.includes('pdf')) return <FileText className={className} />
  if (mimeType?.includes('image')) return <FileImage className={className} />
  if (mimeType?.includes('video')) return <Video className={className} />
  return <FileText className={className} />
}
