'use client'

import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion, useMotionTemplate, useMotionValue } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Edit, Copy, Trash2, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface TemplateItemProps {
    template: {
        id: number
        name: string
        type: string
        dimensions: string
        thumbnailUrl: string | null
        createdAt: string
        /** Miniaturas das primeiras peças — só nas PASTAS de programação. */
        capa?: string[]
    }
    onDuplicate: (id: number, name: string) => void
    onDelete: (id: number, name: string) => void
    index: number
}

/**
 * A capa padrão de uma PASTA da programação: as primeiras peças em mosaico.
 *
 * A pasta não tem miniatura própria (nasce de `garantirPasta`, sem
 * `thumbnailUrl`), então o card ficava com "Sem preview". E mostrar só a
 * primeira peça também não resolveria: uma arte solta não diz que aquilo é a
 * semana de stories. O mosaico mostra o CONJUNTO, que é o que a pasta é.
 */
function CapaDaPasta({ capa, quantas }: { capa: string[]; quantas: number }) {
    const mostradas = capa.slice(0, 4)
    /**
     * 1 peça ocupa tudo; 2 ficam lado a lado; 3+ entram na grade 2x2.
     *
     * 🔴 A grade vai em estilo INLINE, não em classe: `grid-rows-2` NÃO gera
     * CSS neste repo (medido no navegador em 04/09/2026 — a classe nem aparece
     * na folha de estilo), e o mosaico viraria uma fileira só. Some à família
     * de classes mortas já registrada no CLAUDE.md.
     */
    const grade: React.CSSProperties = {
        gridTemplateColumns: mostradas.length === 1 ? '1fr' : '1fr 1fr',
        gridTemplateRows: mostradas.length <= 2 ? '1fr' : '1fr 1fr',
    }
    return (
        <div className="absolute inset-0">
            <div className="grid h-full w-full gap-px bg-black/20" style={grade}>
                {mostradas.map((url, i) => (
                    <div
                        key={`${url}-${i}`}
                        className="relative overflow-hidden bg-muted"
                        // Com 3 peças a primeira ocupa a linha inteira: numa
                        // grade 2x2 sobraria um quadrante vazio, e buraco na
                        // capa lê como peça que faltou.
                        style={mostradas.length === 3 && i === 0 ? { gridColumn: 'span 2' } : undefined}
                    >
                        <Image src={url} alt="" fill sizes="120px" className="object-cover" unoptimized />
                    </div>
                ))}
            </div>
            {quantas > mostradas.length && (
                <span className="absolute right-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                    +{quantas - mostradas.length}
                </span>
            )}
        </div>
    )
}

export function TemplateItem({ template, onDuplicate, onDelete, index }: TemplateItemProps) {
    const [imageLoaded, setImageLoaded] = React.useState(false)
    const [isInView, setIsInView] = React.useState(false)
    const ref = React.useRef<HTMLDivElement>(null)

    // Mouse tracking for spotlight effect
    const mouseX = useMotionValue(0)
    const mouseY = useMotionValue(0)

    function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent) {
        const { left, top } = currentTarget.getBoundingClientRect()
        mouseX.set(clientX - left)
        mouseY.set(clientY - top)
    }

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

    // Calculate aspect ratio based on type or dimensions
    const getAspectRatioClass = () => {
        switch (template.type) {
            case 'STORY': return 'aspect-[9/16]'
            case 'FEED': return 'aspect-[4/5]'
            case 'SQUARE': return 'aspect-square'
            default: return 'aspect-[4/5]'
        }
    }

    const temCapa = (template.capa?.length ?? 0) > 0

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
                'group relative rounded-xl bg-card overflow-hidden w-full',
                'border border-white/5',
            )}
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

            <Link
                href={`/templates/${template.id}/editor`}
                className={cn("relative block bg-muted overflow-hidden w-full h-full rounded-xl cursor-pointer", getAspectRatioClass())}
            >
                {!imageLoaded && (
                    <div className="absolute inset-0 bg-gradient-to-r from-muted via-muted/50 to-muted animate-pulse pointer-events-none" />
                )}

                {temCapa ? (
                    <CapaDaPasta capa={template.capa!} quantas={template.capa!.length} />
                ) : template.thumbnailUrl ? (
                    <Image
                        src={template.thumbnailUrl}
                        alt={template.name}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, (max-width: 1536px) 25vw, 20vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        onLoad={() => setImageLoaded(true)}
                        unoptimized
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                        <Layers className="w-8 h-8 text-muted-foreground opacity-40" />
                        <span className="text-xs text-muted-foreground opacity-60">Sem preview</span>
                    </div>
                )}

                {/* Hover Overlay & Info */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition-opacity duration-300 pointer-events-none z-10" />

                <div className="absolute bottom-[4.75rem] md:bottom-12 left-0 right-0 p-4 translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 pointer-coarse:translate-y-0 pointer-coarse:opacity-100 transition-all duration-300 pointer-events-none z-20">
                    <h3 className="text-white font-bold text-sm truncate drop-shadow-md">
                        {template.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 text-xs text-white/70">
                        <span>{template.type}</span>
                        <span>•</span>
                        <span>{template.dimensions}</span>
                    </div>
                </div>
            </Link>

            {/* Action Buttons - Top Right Dropdown (Always visible or on hover? Let's make it on hover for cleaner look, but accessible) */}
            {/* For UX consistency with 'clean' look, let's put actions at the bottom like GalleryItem */}

            <div className="absolute bottom-0 left-0 right-0 p-3 flex gap-2 translate-y-full group-hover:translate-y-0 opacity-0 group-hover:opacity-100 pointer-coarse:translate-y-0 pointer-coarse:opacity-100 transition-all duration-300 z-30 pointer-events-auto bg-black/40 backdrop-blur-md border-t border-white/10">
                <Button
                    asChild
                    size="sm"
                    variant="ghost"
                    className="flex-1 h-8 bg-primary/95 hover:bg-primary text-white font-medium shadow-sm rounded-md"
                    title="Editar Template"
                >
                    <Link href={`/templates/${template.id}/editor`}>
                        <Edit className="h-3.5 w-3.5 sm:mr-1" />
                        <span className="hidden sm:inline">Editar</span>
                    </Link>
                </Button>

                <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 h-8 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-md"
                    onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onDuplicate(template.id, template.name)
                    }}
                    title="Duplicar"
                >
                    <Copy className="h-3.5 w-3.5" />
                </Button>

                <Button
                    size="sm"
                    variant="ghost"
                    className="flex-0 w-8 h-8 px-0 bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 border border-red-500/20 rounded-md"
                    onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onDelete(template.id, template.name)
                    }}
                    title="Excluir"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
        </motion.div>
    )
}
