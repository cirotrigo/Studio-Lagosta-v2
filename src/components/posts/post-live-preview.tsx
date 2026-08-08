'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { ChevronDown, ChevronLeft, ChevronRight, ImageIcon, Video as VideoIcon } from 'lucide-react'
import { cn, isExternalImage } from '@/lib/utils'
import { useProject } from '@/hooks/use-project'
import { isVideoUrl } from '@/lib/media-type'
import type { PostType } from '../../../prisma/generated/client'

/** O que cada formato declara — a mesma tabela que o recorte usa. */
export const FORMAT_LABELS: Record<PostType, { nome: string; medida: string; proporcao: string }> = {
  POST: { nome: 'Feed', medida: '1080×1350', proporcao: '4:5' },
  CAROUSEL: { nome: 'Carrossel', medida: '1080×1350', proporcao: '4:5' },
  STORY: { nome: 'Story', medida: '1080×1920', proporcao: '9:16' },
  REEL: { nome: 'Reel', medida: '1080×1920', proporcao: '9:16' },
}

interface PostLivePreviewProps {
  projectId: number
  postType: PostType
  mediaUrls: string[]
  caption: string
  /** Texto de quando o post sai, já pronto ("segunda, 11/08 às 16:00"). */
  quando?: string
}

/**
 * A prévia viva do composer: como o post fica, no formato real em que vai ao
 * ar, enquanto se escreve.
 *
 * O app desktop tem isso numa coluna própria e é metade do motivo de ele
 * parecer mais fluido — o compromisso (formato, enquadramento, tamanho da
 * legenda) fica declarado ANTES de salvar. Na web o composer era um formulário
 * sem espelho: só se via o resultado depois, na agenda.
 */
export function PostLivePreview({
  projectId,
  postType,
  mediaUrls,
  caption,
  quando,
}: PostLivePreviewProps) {
  const { data: project } = useProject(projectId)
  const [indice, setIndice] = useState(0)
  const [aberto, setAberto] = useState(false)

  const formato = FORMAT_LABELS[postType] ?? FORMAT_LABELS.POST
  const ehVertical = postType === 'STORY' || postType === 'REEL'

  // Trocar de formato ou tirar mídias pode deixar o índice apontando para o
  // vazio — sem isto a prévia fica em branco sem explicação.
  useEffect(() => {
    if (indice > mediaUrls.length - 1) setIndice(0)
  }, [mediaUrls.length, indice])

  const atual = mediaUrls[indice]
  const ehVideo = atual ? isVideoUrl(atual) : false
  const logoUrl = project?.logoUrl || (project as any)?.Logo?.[0]?.fileUrl

  return (
    <div className="space-y-3">
      {/*
        No celular a prévia começa RECOLHIDA. Aberta, um story em 9:16 toma a
        tela inteira e empurra todo o formulário para baixo da dobra — quem
        entra para criar um post não consegue nem ver o primeiro campo. No
        desktop ela está sempre à vista, na coluna da direita.

        O estado é um só e a diferença é CSS (`hidden lg:block`), não
        `useIsMobile` — que resolve depois do mount e faria a prévia piscar.
      */}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-baseline justify-between gap-2 lg:hidden"
        aria-expanded={aberto}
      >
        <span className="flex items-center gap-1 text-sm font-semibold">
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', aberto && 'rotate-180')}
          />
          Prévia
        </span>
        <span className="text-xs text-muted-foreground">
          {formato.nome} {formato.medida} ({formato.proporcao})
        </span>
      </button>

      <div className="hidden items-baseline justify-between gap-2 lg:flex">
        <h3 className="text-sm font-semibold">Prévia</h3>
        <span className="text-xs text-muted-foreground">
          {formato.nome} {formato.medida} ({formato.proporcao})
        </span>
      </div>

      <div
        className={cn(
          'mx-auto w-full max-w-[320px] overflow-hidden rounded-xl border bg-card lg:block',
          aberto ? 'block' : 'hidden',
        )}
      >
        {/* Cabeçalho, como o Instagram mostra */}
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <div
            className={cn(
              'relative flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold text-white',
              logoUrl ? 'border border-border bg-white' : 'bg-gradient-to-br from-pink-500 to-purple-500',
            )}
          >
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt={project?.name ?? ''}
                width={28}
                height={28}
                className="object-contain p-0.5"
                quality={60}
                unoptimized={isExternalImage(logoUrl)}
              />
            ) : (
              (project?.name ?? '..').substring(0, 2).toUpperCase()
            )}
          </div>
          <span className="truncate text-xs font-semibold">
            {project?.instagramUsername || project?.name || 'cliente'}
          </span>
        </div>

        {/* A arte, na proporção real */}
        <div
          className={cn(
            'relative w-full bg-muted',
            ehVertical ? 'aspect-[9/16]' : 'aspect-[4/5]',
          )}
        >
          {!atual ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <ImageIcon className="h-8 w-8 opacity-50" />
              <span className="px-6 text-center text-xs">
                Escolha a mídia para ver a prévia
              </span>
            </div>
          ) : ehVideo ? (
            <video
              key={atual}
              src={atual}
              className="absolute inset-0 h-full w-full object-cover"
              controls
              loop
              playsInline
              preload="metadata"
            />
          ) : (
            <Image
              key={atual}
              src={atual}
              alt="Prévia do post"
              fill
              sizes="320px"
              className="object-cover"
              quality={70}
              unoptimized={isExternalImage(atual)}
            />
          )}

          {ehVideo && (
            <div className="absolute left-2 top-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 backdrop-blur-sm">
              <VideoIcon className="h-3 w-3 text-white" />
              <span className="text-[10px] font-medium text-white">Vídeo</span>
            </div>
          )}

          {mediaUrls.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setIndice((i) => (i === 0 ? mediaUrls.length - 1 : i - 1))}
                className="absolute left-1 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full bg-black/50 p-1 text-white"
                aria-label="Slide anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setIndice((i) => (i === mediaUrls.length - 1 ? 0 : i + 1))}
                className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full bg-black/50 p-1 text-white"
                aria-label="Próximo slide"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <span className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                {indice + 1}/{mediaUrls.length}
              </span>
            </>
          )}
        </div>

        {/* Legenda — o corte em ~125 caracteres é o que o Instagram faz */}
        <div className="space-y-1 px-3 py-2">
          {caption?.trim() ? (
            <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">
              <span className="font-semibold">
                {project?.instagramUsername || project?.name}{' '}
              </span>
              {caption.length > 125 ? (
                <>
                  {caption.slice(0, 125)}
                  <span className="text-muted-foreground">… mais</span>
                </>
              ) : (
                caption
              )}
            </p>
          ) : (
            <p className="text-xs italic text-muted-foreground">
              {postType === 'STORY' ? 'Story sem legenda' : 'Sem legenda ainda'}
            </p>
          )}

          {quando && <p className="pt-1 text-[11px] text-muted-foreground">{quando}</p>}
        </div>
      </div>
    </div>
  )
}
