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
  /** DRAFT (padrão) fica só na agenda; SCHEDULED entra na fila de publicação */
  status?: 'DRAFT' | 'SCHEDULED'
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

  const status = (input.status ?? 'DRAFT') as PostStatus
  const quando = parseBRT(input.scheduledDatetime)

  if (status === 'SCHEDULED' && quando.getTime() < Date.now()) {
    throw new CreativeError(
      'DATA_NO_PASSADO',
      `Não dá para agendar no passado: ${quando.toISOString()}.`,
      400,
    )
  }
  if (status === 'SCHEDULED' && !project.instagramAccountId) {
    throw new CreativeError(
      'SEM_CONTA_INSTAGRAM',
      `O projeto "${project.name}" não tem conta do Instagram conectada — dá para deixar como DRAFT, mas não publicar.`,
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

  return {
    agendado: true,
    postId: post.id,
    status: post.status,
    postType: post.postType,
    scheduledDatetime: post.scheduledDatetime,
    mediaUrls: post.mediaUrls,
    agendaUrl: `${getPublicAppUrl()}/projects/${project.id}?tab=agenda`,
    aviso:
      post.status === 'DRAFT'
        ? 'Criado como rascunho: aparece na agenda mas NÃO será publicado. Reenvie com status "SCHEDULED" para entrar na fila.'
        : undefined,
  }
}
