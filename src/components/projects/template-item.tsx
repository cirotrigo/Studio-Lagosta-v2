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
 * A capa em mosaico: as primeiras peças do template.
 *
 * Vale para a PASTA de programação (que não tem miniatura própria, e para a
 * qual uma arte solta não diria que aquilo é a semana de stories) e para
 * qualquer template SEM `thumbnailUrl`, que antes ficava com "Sem preview" —
 * na prática o ARQUIVO, onde 61 de 67 cards estavam assim.
 *
 * A API só manda `capa` quando ela é para ser usada, então aqui o mosaico
 * vence sem precisar saber de que seção o card é.
 */
function CapaEmMosaico({ capa, quantas }: { capa: string[]; quantas: number }) {
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
                {/*
                  * O esqueleto só faz sentido enquanto uma imagem ÚNICA carrega:
                  * `imageLoaded` só vira true no `onLoad` do ramo do
                  * thumbnailUrl, então nos ramos do mosaico e do "Sem preview"
                  * ele pulsava para sempre por baixo do conteúdo.
                  */}
                {!imageLoaded && !temCapa && template.thumbnailUrl && (
                    <div className="absolute inset-0 bg-gradient-to-r from-muted via-muted/50 to-muted animate-pulse pointer-events-none" />
                )}

                {temCapa ? (
                    <CapaEmMosaico capa={template.capa!} quantas={template.capa!.length} />
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

                {/*
                  * O nome, o tipo e as dimensões saíram daqui: eles agora vivem
                  * na legenda ABAIXO do card, sempre visível e sem `truncate`.
                  * 🔴 Não é só duplicata — em tela de toque este bloco não é de
                  * hover (`pointer-coarse:opacity-100` o deixa permanentemente
                  * visível), então no celular o nome apareceria DUAS VEZES ao
                  * mesmo tempo, um deles cortado.
                  */}
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
