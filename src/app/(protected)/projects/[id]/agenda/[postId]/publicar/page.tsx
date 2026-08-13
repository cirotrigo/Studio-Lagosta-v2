'use client'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowLeft,
  Bell,
  Check,
  Copy,
  Download,
  Instagram,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { usePageMetadata } from '@/contexts/page-metadata'
import { usePost } from '@/hooks/use-post'
import { useProject } from '@/hooks/use-project'
import { agendaHref, postHref } from '@/lib/agenda-routes'
import { aspectClassForPostType, isVideoUrl } from '@/components/agenda/calendar/calendar-utils'
import { cn, isExternalImage } from '@/lib/utils'

/**
 * Extensão do arquivo salvo, lida do tipo real do blob (a URL pode não ter
 * extensão nenhuma — as do Blob da Vercel costumam ter, mas não é garantido).
 */
function extensaoDoArquivo(url: string, mimeType: string): string {
  if (mimeType.includes('png')) return 'png'
  if (mimeType.includes('webp')) return 'webp'
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg'
  if (mimeType.includes('mp4')) return 'mp4'
  if (mimeType.includes('quicktime')) return 'mov'
  const match = url.split('?')[0].match(/\.(\w{2,4})$/)
  return match ? match[1].toLowerCase() : 'jpg'
}

/**
 * Publicação manual de um lembrete — `/projects/[id]/agenda/[postId]/publicar`.
 *
 * O sistema NÃO publica post com `publishType: REMINDER`: o cron manda o aviso
 * no WhatsApp e alguém publica pelo celular. Esta tela é o kit dessa pessoa,
 * na ordem em que ela usa: salvar a(s) arte(s) no rolo, copiar a legenda (e o
 * primeiro comentário, quando existe) e abrir o Instagram para colar.
 *
 * Mobile-first de verdade: é uma tela que se usa NO celular, na hora de
 * publicar. As artes aparecem INTEIRAS (contain sobre fundo neutro, nunca
 * corte) na proporção real do formato.
 */
export default function PublicarLembretePage({
  params,
}: {
  params: Promise<{ id: string; postId: string }>
}) {
  const { id, postId } = use(params)
  const projectId = parseInt(id, 10)
  const router = useRouter()

  const { data: post, isLoading, isError } = usePost(projectId, postId)
  const { data: project } = useProject(projectId)

  const { updateMetadata } = usePageMetadata()
  useEffect(() => {
    updateMetadata({ showBreadcrumbs: false })
    return () => updateMetadata({ showBreadcrumbs: true })
  }, [updateMetadata])

  const voltar = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.push(postHref(projectId, postId))
  }, [router, projectId, postId])

  const midias = useMemo(() => {
    if (!post) return [] as string[]
    if (post.mediaUrls?.length) return post.mediaUrls as string[]
    return post.renderedImageUrl ? [post.renderedImageUrl] : []
  }, [post])

  const [baixando, setBaixando] = useState(false)
  const [copiado, setCopiado] = useState<'legenda' | 'comentario' | null>(null)

  /**
   * Baixa cada mídia por fetch + blob, como a galeria de criativos faz — um
   * <a download> com a URL remota não funciona cross-origin, o navegador
   * navegaria em vez de salvar.
   */
  const salvarArtes = useCallback(async () => {
    if (midias.length === 0 || baixando) return
    setBaixando(true)
    let salvas = 0

    try {
      for (const [indice, url] of midias.entries()) {
        try {
          const resposta = await fetch(url)
          if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`)
          const blob = await resposta.blob()
          const blobUrl = URL.createObjectURL(blob)

          const link = document.createElement('a')
          link.href = blobUrl
          link.download = `arte-${indice + 1}.${extensaoDoArquivo(url, blob.type)}`
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          URL.revokeObjectURL(blobUrl)

          salvas += 1
          // Pequena pausa entre downloads, senão o navegador engole os últimos
          if (indice < midias.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 400))
          }
        } catch {
          // A falha de uma não derruba as outras; o balanço sai no toast
        }
      }
    } finally {
      setBaixando(false)
    }

    if (salvas === midias.length) {
      toast.success(
        midias.length === 1 ? 'Arte salva no aparelho' : `As ${salvas} artes foram salvas`,
        { description: 'No iPhone, salve no app Fotos para aparecer no rolo.' },
      )
    } else if (salvas > 0) {
      toast.error(`Só ${salvas} de ${midias.length} artes baixaram. Tente de novo as que faltaram.`)
    } else {
      toast.error('Não deu para baixar a arte. Confira a conexão e tente de novo.')
    }
  }, [midias, baixando])

  const copiarTexto = useCallback(
    async (texto: string, qual: 'legenda' | 'comentario') => {
      try {
        await navigator.clipboard.writeText(texto)
        setCopiado(qual)
        window.setTimeout(() => setCopiado((atual) => (atual === qual ? null : atual)), 2500)
        toast.success(qual === 'legenda' ? 'Legenda copiada' : 'Primeiro comentário copiado')
      } catch {
        toast.error('Não deu para copiar. Selecione o texto e copie manualmente.')
      }
    },
    [],
  )

  /**
   * Tenta o app do Instagram (`instagram://`); se em ~1,5s a página continuar
   * visível, é porque o app não abriu (desktop, ou app não instalado) e o
   * site entra no lugar.
   */
  const abrirInstagram = useCallback(() => {
    let abriuOApp = false
    const aoOcultar = () => {
      abriuOApp = true
      document.removeEventListener('visibilitychange', aoOcultar)
    }
    document.addEventListener('visibilitychange', aoOcultar)

    window.setTimeout(() => {
      document.removeEventListener('visibilitychange', aoOcultar)
      if (!abriuOApp && document.visibilityState === 'visible') {
        window.open('https://www.instagram.com', '_blank', 'noopener,noreferrer')
      }
    }, 1500)

    window.location.href = 'instagram://app'
  }, [])

  if (isLoading) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Carregando o post…</p>
      </div>
    )
  }

  if (isError || !post) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-lg font-semibold">Este post não está mais aqui</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Ele pode ter sido excluído, ou o link pertence a outro cliente.
        </p>
        <Button variant="outline" asChild>
          <Link href={agendaHref(projectId)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Ver a agenda
          </Link>
        </Button>
      </div>
    )
  }

  const contaLabel = project?.instagramUsername || project?.name || 'do cliente'
  const aspectClass = aspectClassForPostType(post.postType)

  // Horário sempre em BRT: quem publica está no fuso de Brasília, e o
  // combinado com o cliente é nesse relógio — não no do aparelho.
  const quando = post.scheduledDatetime ? new Date(post.scheduledDatetime) : null
  const horarioBRT =
    quando && !Number.isNaN(quando.getTime())
      ? quando.toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          weekday: 'long',
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null

  return (
    /* Mesma casca das outras telas da agenda: o painel do layout tem p-4 e
       overflow clip; a margem negativa e a altura vão inline porque as
       classes equivalentes não geram CSS nesta build (armadilha registrada). */
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 10rem)', margin: '-1rem' }}>
      <header className="flex shrink-0 items-center gap-3 border-b bg-background px-4 py-3 sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={voltar}
          aria-label="Voltar para o post"
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold leading-tight">Publicar no Instagram</h1>
          <p className="truncate text-xs text-muted-foreground">
            Publicação manual — {contaLabel}
          </p>
        </div>
        <Badge variant="outline" className="flex shrink-0 items-center gap-1 text-xs">
          <Bell className="h-3 w-3" />
          Lembrete
        </Badge>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        <div className="mx-auto w-full max-w-md space-y-4 lg:max-w-2xl">
          {horarioBRT && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <span className="font-semibold">Combinado para {horarioBRT}</span>
              <span className="text-muted-foreground"> (horário de Brasília).</span>
            </div>
          )}

          {/* As artes, inteiras. `contain` sobre fundo neutro: publicar uma
              arte cortada é pior que sobrar faixa na prévia. */}
          {midias.length > 0 ? (
            <div className="space-y-3">
              {midias.map((url, indice) => (
                <div
                  key={`${url}-${indice}`}
                  className={cn(
                    'relative mx-auto w-full max-w-[340px] overflow-hidden rounded-lg bg-muted lg:max-w-[380px]',
                    aspectClass,
                  )}
                >
                  {isVideoUrl(url) ? (
                    <video
                      src={url}
                      className="absolute inset-0 h-full w-full object-contain"
                      controls
                      loop
                      playsInline
                      preload="metadata"
                    >
                      Seu navegador não suporta vídeos.
                    </video>
                  ) : (
                    <Image
                      src={url}
                      alt={`Arte ${indice + 1} do post`}
                      fill
                      sizes="(max-width: 1024px) 90vw, 380px"
                      className="object-contain"
                      priority={indice === 0}
                      quality={85}
                      unoptimized={isExternalImage(url)}
                    />
                  )}

                  {/* Numeração do carrossel: a ordem de subida importa */}
                  {midias.length > 1 && (
                    <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
                      {indice + 1}/{midias.length}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed bg-muted/30 p-4 text-center text-sm text-muted-foreground">
              Este post ainda está sem arte. Confira na tela do post antes de publicar.
            </div>
          )}

          {midias.length > 0 && (
            <Button className="w-full" onClick={salvarArtes} disabled={baixando}>
              {baixando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {midias.length === 1 ? 'Salvar arte no rolo' : `Salvar as ${midias.length} artes no rolo`}
            </Button>
          )}

          {/* Legenda — prévia do que vai para a área de transferência */}
          {post.caption && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Legenda</h2>
              <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                {post.caption}
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => copiarTexto(post.caption, 'legenda')}
              >
                {copiado === 'legenda' ? (
                  <Check className="mr-2 h-4 w-4" />
                ) : (
                  <Copy className="mr-2 h-4 w-4" />
                )}
                {copiado === 'legenda' ? 'Legenda copiada' : 'Copiar legenda'}
              </Button>
            </section>
          )}

          {/* Primeiro comentário — quando o post tem um */}
          {post.firstComment && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Primeiro comentário</h2>
              <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                {post.firstComment}
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => copiarTexto(post.firstComment!, 'comentario')}
              >
                {copiado === 'comentario' ? (
                  <Check className="mr-2 h-4 w-4" />
                ) : (
                  <Copy className="mr-2 h-4 w-4" />
                )}
                {copiado === 'comentario' ? 'Comentário copiado' : 'Copiar 1º comentário'}
              </Button>
            </section>
          )}

          {/* Observação de quem agendou — vai no aviso do WhatsApp também */}
          {post.reminderExtraInfo && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Observação</h2>
              <div className="whitespace-pre-wrap rounded-md border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                {post.reminderExtraInfo}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* O passo final sempre à mão, no rodapé — como a barra de ações da
          tela do post */}
      <div className="shrink-0 border-t bg-background px-4 py-3 sm:px-6">
        <div className="mx-auto w-full max-w-md lg:max-w-2xl">
          <Button
            className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600"
            onClick={abrirInstagram}
          >
            <Instagram className="mr-2 h-4 w-4" />
            Abrir o Instagram
          </Button>
          <p className="mt-1.5 text-center text-xs text-muted-foreground">
            Se o app não abrir, o site do Instagram abre no lugar.
          </p>
        </div>
      </div>
    </div>
  )
}
