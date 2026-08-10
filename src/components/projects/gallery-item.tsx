'use client'

import * as React from 'react'
import Image from 'next/image'
import { motion, useMotionTemplate, useMotionValue } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Download, Trash2, HardDrive, Loader2, Calendar, Sparkles, Columns2, Star, AlertTriangle } from 'lucide-react'
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
  status: 'PROCESSING' | 'POSTING' | 'COMPLETED' | 'FAILED' | 'PENDING'
  progress?: number
  errorMessage?: string | null
  isVideo?: boolean
  authorClerkId?: string
  /** true quando a Generation tem sourceGenerationId — arte melhorada por IA. */
  isImproved?: boolean
  /** Marcada como referência de estilo — as próximas artes se inspiram nela. */
  isStyleRef?: boolean
  onToggleStyleRef?: () => void
  /**
   * Aviso da conferência automática (ex.: texto que o comparador não achou).
   * A arte saiu mesmo assim — o badge existe para pedir o olho de quem aprova.
   */
  avisoConferencia?: string | null
  onToggleSelect: () => void
  onDownload: () => void
  onDelete: () => void
  onDriveOpen?: () => void
  onPreview?: () => void
  onSchedule?: () => void
  onImprove?: () => void
  /** Abre o antes/depois — só faz sentido quando isImproved. */
  onCompare?: () => void
  index: number
  pswpWidth: number
  pswpHeight: number
}

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi', '.mkv']

/**
 * Dimensões que vão no `data-pswp-*` a partir da PROPORÇÃO medida na miniatura.
 *
 * A proporção da miniatura é confiável; o tamanho dela não (é o que o
 * otimizador do Next decidiu servir — 360px de largura numa janela pequena).
 * Quando as dimensões declaradas do criativo batem com a proporção medida,
 * usa-se elas, que são as reais e preservam o zoom. Quando não batem — caso
 * dos criativos recuperados do Drive, com Template.dimensions mentindo —, cai
 * numa caixa de 1080 de largura, que é a resolução de projeto das artes.
 */
function dimensoesParaLightbox(
  proporcaoMedida: number,
  larguraDeclarada: number,
  alturaDeclarada: number,
): [number, number] {
  const proporcaoDeclarada = larguraDeclarada / alturaDeclarada
  if (Math.abs(proporcaoDeclarada - proporcaoMedida) < 0.02) {
    return [larguraDeclarada, alturaDeclarada]
  }
  const largura = 1080
  return [largura, Math.round(largura / proporcaoMedida)]
}
// Build-cache bust: pswp-dim-fix-v3
const PSWP_FIX_VERSION = 'v3'
void PSWP_FIX_VERSION

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
  isImproved,
  isStyleRef,
  onToggleStyleRef,
  avisoConferencia,
  onToggleSelect,
  onDownload,
  onDelete,
  onDriveOpen,
  onPreview,
  onSchedule,
  onImprove,
  onCompare,
  index,
  pswpWidth,
  pswpHeight,
}: GalleryItemProps) {
  const [imageLoaded, setImageLoaded] = React.useState(false)
  const [isInView, setIsInView] = React.useState(false)
  /**
   * Proporção medida na miniatura, quando ela já carregou.
   *
   * Guardar a PROPORÇÃO e não as dimensões é o que encerra uma disputa antiga:
   * o `onLoad` gravava no estado o tamanho da miniatura (360x639 numa janela
   * pequena) e o re-render sobrescrevia o `data-pswp-*` que o código
   * imperativo tinha acabado de corrigir — o lightbox abria a arte em 360px.
   * Agora o React é a única fonte do atributo, derivado desta proporção.
   */
  const [proporcaoMedida, setProporcaoMedida] = React.useState<number | null>(null)
  const ref = React.useRef<HTMLDivElement>(null)
  // Marca que data-pswp-* já foi sincronizado com a imagem real, pra evitar
  // recursão quando o handler dispara link.click() depois de carregar a imagem
  // sob demanda (caso de criativos com Template.dimensions errado e <img>
  // ainda em loading="lazy").
  const dimensionsLockedRef = React.useRef(false)

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

  // PROCESSING é o status do banco (melhoria com IA em curso). Sem ele o
  // card ficava sem imagem e sem aviso nenhum, parecendo criativo quebrado.
  const showProgress = status === 'POSTING' || status === 'PENDING' || status === 'PROCESSING'
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

    // Sem sonda de rede aqui.
    //
    // Havia um `new window.Image()` apontando para `effectiveDisplayUrl` — a
    // arte ORIGINAL — só para ler `naturalWidth/naturalHeight`. Com 60 cards
    // isso baixava a galeria inteira em resolução cheia por trás da miniatura:
    // medido em produção, 38 MB e 54 requisições diretas de ~1 MB numa única
    // carga de página. Era essa banda que faltava para a miniatura do vizinho
    // e para a arte do lightbox aparecerem ao navegar.
    //
    // A medição já vinha de graça do `onLoad` da <Image> logo abaixo, que lê a
    // proporção da MINIATURA (mesma proporção do original, que é tudo que o
    // card usa) e ainda grava os data-pswp-*.
    setImageLoaded(false)
  }, [effectiveDisplayUrl])

  const aspectRatio = proporcaoMedida ?? pswpWidth / pswpHeight
  // Dimensões que o PhotoSwipe lê. Derivadas — nada de escrita imperativa no
  // DOM concorrendo com o render.
  const [pswpLargura, pswpAltura] = dimensoesParaLightbox(aspectRatio, pswpWidth, pswpHeight)

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
      <div className="absolute top-3 left-3 z-30 pointer-events-auto opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-opacity duration-200">
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
      <div className="absolute top-3 right-3 z-30 flex max-w-[70%] flex-col gap-2 items-end pointer-events-none opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-opacity duration-300">
        <div className="whitespace-nowrap rounded-lg border border-white/10 bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white shadow-lg backdrop-blur-md sm:px-2.5 sm:py-1 sm:text-xs">
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
        data-pswp-src={resolvedAssetUrl ?? undefined}
        data-pswp-width={pswpLargura}
        data-pswp-height={pswpAltura}
        data-pswp-type={resolvedAssetUrl && isVideoAsset ? 'video' : 'image'}
        className={cn(
          'relative block bg-muted overflow-hidden w-full h-full rounded-xl', // inner rounding
          resolvedAssetUrl && status === 'COMPLETED' ? 'cursor-zoom-in' : 'cursor-default'
        )}
        onClick={(e) => {
          // Re-trigger interno após preload — deixa o PhotoSwipe processar.
          if (dimensionsLockedRef.current) {
            return
          }

          const shouldHandlePreview = !resolvedAssetUrl || status !== 'COMPLETED'
          if (shouldHandlePreview) {
            e.preventDefault()
            e.stopPropagation()
            onPreview?.()
            return
          }

          const link = e.currentTarget as HTMLAnchorElement
          const img = link.querySelector('img') as HTMLImageElement | null

          // Miniatura já carregada: o atributo já está certo pelo render, não
          // há nada a fazer aqui.
          if (img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
            return
          }

          // Caminho lento: <img> ainda em loading="lazy" e Template.dimensions
          // pode estar mentindo. Mede a PROPORÇÃO e re-dispara o clique.
          //
          // A sonda vai na miniatura otimizada, não no original: só a
          // proporção importa aqui, e o original custa ~1 MB de espera ANTES
          // do lightbox abrir. Pelo otimizador o mesmo enquadramento sai em
          // ~30 KB (medido: 640px de largura contra 2160 do original).
          if (resolvedAssetUrl) {
            e.preventDefault()
            e.stopPropagation()
            const probe = new window.Image()
            const finish = (w: number | null, h: number | null) => {
              if (w && h && w > 0 && h > 0) {
                // Escreve no DOM e não no estado: o re-clique é síncrono logo
                // abaixo e o render do React não teria acontecido a tempo.
                const [lw, lh] = dimensoesParaLightbox(w / h, pswpWidth, pswpHeight)
                link.setAttribute('data-pswp-width', String(lw))
                link.setAttribute('data-pswp-height', String(lh))
                setProporcaoMedida(w / h)
              }
              dimensionsLockedRef.current = true
              link.click()
            }
            probe.onload = () => finish(probe.naturalWidth, probe.naturalHeight)
            // Se o otimizador recusar a origem, cai no original — melhor medir
            // devagar do que abrir com a proporção errada.
            probe.onerror = () => {
              if (probe.src.includes('/_next/image')) {
                probe.onerror = () => finish(null, null)
                probe.src = resolvedAssetUrl
                return
              }
              finish(null, null)
            }
            probe.src = `/_next/image?url=${encodeURIComponent(resolvedAssetUrl)}&w=640&q=60`
          }
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
                onLoad={(e) => {
                  setImageLoaded(true)
                  const img = e.currentTarget as HTMLImageElement
                  if (img.naturalWidth <= 0 || img.naturalHeight <= 0) return

                  // Só a proporção. O `data-pswp-*` sai do render a partir
                  // dela — é o que corrige os criativos recuperados do Drive,
                  // cujo Template.dimensions mente sobre o formato.
                  setProporcaoMedida(img.naturalWidth / img.naturalHeight)
                }}
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-opacity duration-300 pointer-events-none z-10" />

        <div className="absolute bottom-[4.75rem] md:bottom-12 left-0 right-0 p-4 translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 pointer-coarse:translate-y-0 pointer-coarse:opacity-100 transition-all duration-300 pointer-events-none z-20">
          <h3 className="text-white font-bold text-sm truncate drop-shadow-md">
            {title}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] uppercase font-semibold text-white backdrop-blur-sm">
              {templateType}
            </span>
            {isImproved && (
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/20 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                <Sparkles className="h-2.5 w-2.5" />
                melhorada
              </span>
            )}
            {avisoConferencia && (
              <span
                title={avisoConferencia}
                className="inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-200 backdrop-blur-sm"
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                conferir texto
              </span>
            )}
            {status === 'COMPLETED' && (
              <span className="text-[10px] text-emerald-400 font-medium tracking-wide uppercase">
                Pronto
              </span>
            )}
          </div>
        </div>
      </a>

      {/* Action Buttons */}
      {/* Barra de ações. `gap-1 p-2` e botões que podem encolher (`min-w-0`,
          sem padding lateral) porque no celular o card tem ~120px de largura e
          até 5 botões: com o espaçamento antigo os últimos saíam para fora da
          borda, cortados. */}
      <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-3 flex gap-1 sm:gap-2 translate-y-full group-hover:translate-y-0 opacity-0 group-hover:opacity-100 pointer-coarse:translate-y-0 pointer-coarse:opacity-100 transition-all duration-300 z-30 pointer-events-auto bg-black/40 backdrop-blur-md border-t border-white/10">
        {onSchedule && status === 'COMPLETED' && resolvedAssetUrl && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 min-w-0 flex-1 rounded-md px-0 bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-sm"
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

        {/* Estrela: marca a arte como REFERÊNCIA DE ESTILO da marca. As
            marcadas entram num rodízio e uma delas é enviada como referência a
            cada geração — por isso a estrela vive junto das ações, e não como
            enfeite: ela muda o que a IA produz depois. */}
        {onToggleStyleRef && status === 'COMPLETED' && resolvedAssetUrl && (
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              'h-8 min-w-0 flex-1 rounded-md px-0 border',
              isStyleRef
                ? 'bg-amber-400/25 hover:bg-amber-400/35 text-amber-200 border-amber-300/50'
                : 'bg-white/10 hover:bg-white/20 text-white border-white/20',
            )}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onToggleStyleRef()
            }}
            title={
              isStyleRef
                ? 'É referência de estilo — as próximas artes se inspiram nesta. Clique para tirar.'
                : 'Usar como referência de estilo das próximas artes'
            }
          >
            <Star className={cn('h-3.5 w-3.5', isStyleRef && 'fill-current')} />
          </Button>
        )}

        {onImprove && status === 'COMPLETED' && resolvedAssetUrl && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 min-w-0 flex-1 rounded-md px-0 bg-white/10 hover:bg-white/20 text-white border border-white/20"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onImprove()
            }}
            title="Melhorar com IA (25 créditos)"
          >
            <Sparkles className="h-3.5 w-3.5" />
          </Button>
        )}

        {isImproved && onCompare && status === 'COMPLETED' && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 min-w-0 flex-1 rounded-md px-0 bg-white/10 hover:bg-white/20 text-white border border-white/20"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onCompare()
            }}
            title="Antes e depois"
          >
            <Columns2 className="h-3.5 w-3.5" />
          </Button>
        )}

        <Button
          size="sm"
          variant="ghost"
          className="h-8 min-w-0 flex-1 rounded-md px-0 bg-white/10 hover:bg-white/20 text-white border border-white/20"
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
            className="h-8 min-w-0 flex-1 rounded-md px-0 bg-white/10 hover:bg-white/20 text-white border border-white/20"
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
          className="h-8 w-8 shrink-0 rounded-md px-0 bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 border border-red-500/20"
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
