/**
 * Agendamento de posts a partir de uma arte já criada.
 *
 * O post nasce como DRAFT por padrão: colocar na fila de publicação é uma ação
 * que sai para o Instagram do cliente, então precisa ser pedida explicitamente
 * com status SCHEDULED.
 */

import { db } from '@/lib/db'
import { CreativeError } from '@/lib/creatives/errors'
import { getPublicAppUrl } from '@/lib/creatives/persist'
import { PostType, PostStatus } from '@prisma/client'

/**
 * Aceita "YYYY-MM-DD HH:mm" em horário de Brasília (o jeito que a agenda é
 * pensada no dia a dia) ou um ISO com fuso explícito.
 */
export function parseBRT(input: string): Date {
  if (input.includes('T') && (input.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(input))) {
    return new Date(input)
  }
  const semFuso = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})$/.exec(input)
  if (semFuso) {
    // BRT (UTC-3) → UTC
    return new Date(`${semFuso[1]}T${semFuso[2]}:00.000-03:00`)
  }
  const d = new Date(input)
  if (Number.isNaN(d.getTime())) {
    throw new CreativeError('DATA_INVALIDA', `Data não reconhecida: "${input}". Use "YYYY-MM-DD HH:mm" (BRT).`, 400)
  }
  return d
}

export interface AgendarPostInput {
  projectId: number
  postType?: 'STORY' | 'POST' | 'REEL' | 'CAROUSEL'
  caption?: string
  /** "YYYY-MM-DD HH:mm" em BRT, ou ISO com fuso */
  scheduledDatetime: string
  /** Página da arte (de create-arte-livre / create-arte-rapida) */
  pageId?: string
  /** Imagens prontas, quando não vier de uma página */
  mediaUrls?: string[]
  /**
   * "rascunho" (padrão) só aparece na agenda; "agendado" entra na fila e
   * publica de verdade. O vocabulário é o da pessoa, não o do banco.
   */
  situacao?: 'rascunho' | 'agendado'
}

export async function agendarPost(input: AgendarPostInput) {
  const project = await db.project.findUnique({
    where: { id: input.projectId },
    select: { id: true, name: true, userId: true, instagramAccountId: true },
  })
  if (!project) {
    throw new CreativeError('PROJECT_NOT_FOUND', `Projeto não encontrado: ${input.projectId}`, 404)
  }

  if (!input.pageId && !input.mediaUrls?.length) {
    throw new CreativeError(
      'SEM_MIDIA',
      'Informe pageId (arte criada aqui) ou mediaUrls — o post precisa de imagem.',
      400,
    )
  }

  let templateId: number | null = null
  let mediaUrls = input.mediaUrls ?? []

  if (input.pageId) {
    const page = await db.page.findUnique({
      where: { id: input.pageId },
      select: { templateId: true, thumbnail: true, Template: { select: { projectId: true } } },
    })
    if (!page) {
      throw new CreativeError('PAGE_NOT_FOUND', `Página não encontrada: ${input.pageId}`, 404)
    }
    if (page.Template.projectId !== input.projectId) {
      throw new CreativeError(
        'PAGE_DE_OUTRO_PROJETO',
        `A página ${input.pageId} pertence ao projeto ${page.Template.projectId}.`,
        400,
      )
    }
    templateId = page.templateId
    // A arte já foi renderizada na criação; reusar o PNG evita re-render na fila
    if (mediaUrls.length === 0 && page.thumbnail) mediaUrls = [page.thumbnail]
  }

  const vaiPublicar = input.situacao === 'agendado'
  const status = (vaiPublicar ? 'SCHEDULED' : 'DRAFT') as PostStatus
  const quando = parseBRT(input.scheduledDatetime)

  const formatarBRT = (d: Date) =>
    d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

  if (vaiPublicar && quando.getTime() < Date.now()) {
    throw new CreativeError(
      'DATA_NO_PASSADO',
      `Esse horário já passou (${formatarBRT(quando)}). Escolha uma data à frente.`,
      400,
    )
  }
  if (vaiPublicar && !project.instagramAccountId) {
    throw new CreativeError(
      'SEM_CONTA_INSTAGRAM',
      `O projeto "${project.name}" ainda não tem conta do Instagram conectada, então não dá para publicar. Dá para deixar como rascunho na agenda.`,
      400,
    )
  }

  const post = await db.socialPost.create({
    data: {
      projectId: project.id,
      userId: project.userId,
      postType: (input.postType ?? 'STORY') as PostType,
      caption: input.caption ?? '',
      mediaUrls,
      scheduleType: 'SCHEDULED',
      scheduledDatetime: quando,
      status,
      pageId: input.pageId ?? null,
      templateId,
      renderStatus: (mediaUrls.length > 0 ? 'NOT_NEEDED' : 'PENDING') as never,
    },
    select: { id: true, status: true, postType: true, scheduledDatetime: true, mediaUrls: true },
  })

  const quandoBRT = formatarBRT(post.scheduledDatetime!)
  const tipo = post.postType === 'STORY' ? 'story' : post.postType.toLowerCase()

  return {
    postId: post.id,
    situacao: vaiPublicar ? 'agendado' : 'rascunho',
    tipo,
    quando: quandoBRT,
    imagens: post.mediaUrls,
    agendaUrl: `${getPublicAppUrl()}/projects/${project.id}?tab=agenda`,
    // Frase pronta para o modelo repetir: evita que ele traduza "DRAFT" sozinho
    mensagem: vaiPublicar
      ? `Agendado: este ${tipo} vai ser publicado no Instagram de ${project.name} em ${quandoBRT}.`
      : `Deixei como rascunho na agenda de ${project.name}, para ${quandoBRT}. Rascunho não publica — é só avisar quando quiser que eu agende de verdade.`,
  }
}
