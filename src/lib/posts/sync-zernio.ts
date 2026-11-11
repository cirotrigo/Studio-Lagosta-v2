/**
 * Zernio → banco: traz para a agenda os posts criados fora do Studio (painel do
 * Zernio, MCP do Zernio) e acompanha as mudanças de estado deles.
 *
 * Uma função só para o cron (`/api/cron/sync-zernio`, a cada 10 min) e para a
 * rota manual por projeto: as duas tinham cópias que já divergiam.
 *
 * RASCUNHO (11/11/2026): o Ciro produz a arte no computador e, quando não tem
 * certeza dela, sobe como rascunho no Zernio para a Roberta aprovar na agenda
 * do Studio. Por isso `draft` entra na listagem. Três coisas decorrem disso:
 *
 *  - rascunho importado entra como DRAFT com `laterPostId` e `lateStatus:
 *    'draft'`; quem o aprova é `processarAprovacao`, que tira o post de
 *    rascunho NO Zernio (nunca cria um segundo);
 *  - a data, a legenda e a arte do rascunho seguem o Zernio enquanto ele for
 *    rascunho: é lá que o Ciro corrige;
 *  - rascunho apagado no Zernio some da listagem em silêncio. Os que sumiram
 *    são conferidos um a um (`getPost`) e só o 404 remove a linha local: não é
 *    FAILED porque nada ia publicar, e avisar falha no WhatsApp seria ruído.
 */

import { db } from '@/lib/db'
import { getLaterClient, LaterNotFoundError } from '@/lib/later'
import { ehHostProprio } from '@/lib/creatives/ingerir-midia'
import {
  PostStatus,
  PostType,
  ScheduleType,
  PublishType,
  VerificationStatus,
  RenderStatus,
} from '../../../prisma/generated/client'

export interface ProjetoDoSync {
  id: number
  laterAccountId: string | null
  userId: string
}

export interface ResultadoDoSync {
  imported: number
  updated: number
  skipped: number
  /** Rascunhos que sumiram do Zernio (404 confirmado) e saíram da agenda. */
  removed: number
  total: number
}

const POR_PAGINA = 50
/** Publicados: só os mais recentes. Rascunho: teto alto, mas que existe, para o cron não estourar. */
const TETO_DE_PAGINAS: Record<string, number> = { published: 3, draft: 10 }
/** `getPost` por rodada na conferência dos rascunhos que sumiram da listagem. */
const TETO_DE_CONFERENCIAS = 20

const CAMPOS_DO_EXISTENTE = {
  id: true,
  laterPostId: true,
  status: true,
  lateStatus: true,
  caption: true,
  postType: true,
  publishType: true,
  verificationStatus: true,
  verificationAttempts: true,
  scheduledDatetime: true,
  mediaUrls: true,
  pageId: true,
  lastSyncAt: true,
} as const

function mapZernioStatus(status: string): PostStatus {
  switch (status) {
    case 'draft': return PostStatus.DRAFT
    case 'scheduled': return PostStatus.SCHEDULED
    case 'publishing': return PostStatus.POSTING
    case 'published': return PostStatus.POSTED
    case 'failed': return PostStatus.FAILED
    default: return PostStatus.SCHEDULED
  }
}

/** Sem `contentType`, o feed do Zernio é post simples: duas mídias fazem carrossel, um vídeo só é reel. */
function mapZernioPostType(platformData: any, media: any[]): PostType {
  switch (platformData?.platformSpecificData?.contentType) {
    case 'story': return PostType.STORY
    case 'reel':
    case 'reels': return PostType.REEL
    case 'carousel': return PostType.CAROUSEL
  }
  if (media.length > 1) return PostType.CAROUSEL
  return media[0]?.type === 'video' ? PostType.REEL : PostType.POST
}

const mesmasUrls = (a: string[], b: string[]) => a.length === b.length && a.every((url, i) => url === b[i])

const eh404 = (error: any) => error instanceof LaterNotFoundError || error?.statusCode === 404

export async function sincronizarZernio(params: {
  projects: ProjetoDoSync[]
  /** Estados do Zernio a listar, na ordem. */
  statuses: string[]
  /** Rota manual: restringe a listagem à conta do projeto. */
  accountId?: string
}): Promise<ResultadoDoSync> {
  const { projects, statuses, accountId } = params
  const inicio = new Date()
  const client = getLaterClient()

  const accountToProject = new Map<string, ProjetoDoSync>()
  for (const project of projects) {
    if (project.laterAccountId) accountToProject.set(project.laterAccountId, project)
  }

  // Por id: um post que muda de estado entre duas listagens aparece nas duas, e
  // vale a última (a mais fresca). Sem isto ele seria criado duas vezes.
  const zernioPosts = new Map<string, any>()
  let rascunhosCompletos = statuses.includes('draft')
  for (const status of statuses) {
    const teto = TETO_DE_PAGINAS[status] ?? Infinity
    for (let page = 1; ; page++) {
      if (page > teto) {
        if (status === 'draft') rascunhosCompletos = false
        break
      }
      const posts = await client.listPosts({ limit: POR_PAGINA, status, page, ...(accountId ? { accountId } : {}) })
      if (!posts || posts.length === 0) break
      for (const post of posts) zernioPosts.set(post.id, post)
      if (posts.length < POR_PAGINA) break
    }
  }

  const ids = [...zernioPosts.keys()]
  const existentes = ids.length
    ? await db.socialPost.findMany({ where: { laterPostId: { in: ids } }, select: CAMPOS_DO_EXISTENTE })
    : []
  const porLaterId = new Map(existentes.map((post) => [post.laterPostId, post]))

  const resultado: ResultadoDoSync = { imported: 0, updated: 0, skipped: 0, removed: 0, total: ids.length }

  for (const zPost of zernioPosts.values()) {
    const existing = porLaterId.get(zPost.id)
    if (existing) {
      resultado[(await atualizarExistente(existing, zPost, inicio)) ? 'updated' : 'skipped']++
    } else {
      resultado[(await importarNovo(zPost, accountToProject)) ? 'imported' : 'skipped']++
    }
  }

  // Só com a listagem de rascunhos INTEIRA dá para dizer que um rascunho sumiu.
  if (rascunhosCompletos) {
    const sumidos = await db.socialPost.findMany({
      where: {
        projectId: { in: projects.map((project) => project.id) },
        status: PostStatus.DRAFT,
        lateStatus: 'draft',
        laterPostId: { not: null, notIn: ids },
      },
      select: CAMPOS_DO_EXISTENTE,
      orderBy: { lastSyncAt: { sort: 'asc', nulls: 'first' } },
      take: TETO_DE_CONFERENCIAS,
    })

    for (const post of sumidos) {
      try {
        const atual = await client.getPost(post.laterPostId!)
        if (atual.status !== 'draft') {
          if (await atualizarExistente(post, atual)) resultado.updated++
        } else {
          // Ainda é rascunho por lá (listagem atrasada): só roda a fila da conferência.
          await db.socialPost.updateMany({ where: { id: post.id }, data: { lastSyncAt: new Date() } })
        }
      } catch (error) {
        if (!eh404(error)) {
          console.error(`[Sync Zernio] Falha ao conferir o rascunho ${post.laterPostId}:`, error)
          continue
        }
        const guarda = { id: post.id, status: PostStatus.DRAFT, laterPostId: post.laterPostId }
        // A arte guardada no Zernio morreu com o post: a linha não serve mais. Arte
        // nossa (post do Studio que virou rascunho por lá) sobrevive, e o post
        // volta a ser um rascunho comum do Studio.
        if (post.mediaUrls.length > 0 && post.mediaUrls.every(ehHostProprio)) {
          await db.socialPost.updateMany({ where: guarda, data: { laterPostId: null, lateStatus: null } })
        } else {
          await db.socialPost.deleteMany({ where: guarda })
        }
        resultado.removed++
      }
    }
  }

  return resultado
}

type Existente = Awaited<ReturnType<typeof db.socialPost.findMany<{ select: typeof CAMPOS_DO_EXISTENTE }>>>[number]

function dadosDoInstagram(zPost: any) {
  // O Zernio guarda o resultado da publicação por plataforma.
  const ig = zPost.platforms?.find((p: any) => p.platform === 'instagram')
  const publishedAtRaw = ig?.publishedAt || zPost.publishedAt
  return {
    ig,
    publishedAt: publishedAtRaw ? new Date(publishedAtRaw) : null,
    platformPostUrl: ig?.platformPostUrl || zPost.permalink || null,
    platformPostId: ig?.platformPostId || zPost.platformPostId || null,
  }
}

async function atualizarExistente(existing: Existente, zPost: any, listadoDesde?: Date): Promise<boolean> {
  // Aprovar e voltar para rascunho no Studio gravam `lastSyncAt` depois de acertar o Zernio. Linha mexida DEPOIS que
  // esta rodada começou a listar é mais nova que a listagem: fica para a próxima rodada.
  if (listadoDesde && existing.lastSyncAt && existing.lastSyncAt > listadoDesde) return false

  const { publishedAt, platformPostUrl, platformPostId } = dadosDoInstagram(zPost)

  // A story can be already marked `published` locally but still have
  // verificationStatus=PENDING when the post was written outside the sync
  // path (e.g. manual recreate after Zernio dropped it). Compute the
  // verification patch independently of caption/status drift so we don't
  // leave stories stuck as "verificando" forever.
  const needsVerification =
    zPost.status === 'published' &&
    existing.postType === PostType.STORY &&
    existing.publishType === PublishType.DIRECT &&
    existing.verificationStatus !== VerificationStatus.VERIFIED

  // Enquanto o post é (ou acabou de deixar de ser) rascunho no Zernio, a data é
  // a de lá. Post agendado/publicado segue como sempre: a data não é tocada.
  const quando = zPost.publishAt ? new Date(zPost.publishAt) : null
  const envolveRascunho = zPost.status === 'draft' || existing.lateStatus === 'draft'
  const mudouData =
    envolveRascunho && quando !== null && existing.scheduledDatetime?.getTime() !== quando.getTime()

  // Arte trocada num rascunho que nasceu no Zernio (sem página do Studio):
  // aprovar olhando a arte velha seria aprovar outra coisa.
  const midias: string[] = zPost.media?.map((m: any) => m.url).filter(Boolean) || []
  const mudouArte =
    zPost.status === 'draft' && existing.pageId === null && midias.length > 0 && !mesmasUrls(existing.mediaUrls, midias)

  const hasChanges =
    existing.lateStatus !== zPost.status ||
    (zPost.text && existing.caption !== zPost.text) ||
    needsVerification ||
    mudouData ||
    mudouArte

  if (!hasChanges) return false

  // Condicional ao `lateStatus` LIDO: uma aprovação feita no Studio enquanto esta
  // rodada listava não é desfeita por uma listagem velha.
  const { count } = await db.socialPost.updateMany({
    where: { id: existing.id, lateStatus: existing.lateStatus },
    data: {
      lateStatus: zPost.status,
      status: mapZernioStatus(zPost.status),
      caption: zPost.text || existing.caption,
      lastSyncAt: new Date(),
      ...(mudouData ? { scheduledDatetime: quando, scheduleType: ScheduleType.SCHEDULED } : {}),
      // A arte de galeria ligada ao post era a da imagem anterior.
      ...(mudouArte ? { mediaUrls: midias, generationId: null } : {}),
      ...(publishedAt ? { latePublishedAt: publishedAt, sentAt: publishedAt } : {}),
      ...(platformPostUrl ? { publishedUrl: platformPostUrl, latePlatformUrl: platformPostUrl } : {}),
      ...(platformPostId ? { instagramMediaId: platformPostId } : {}),
      ...(needsVerification
        ? {
            verificationStatus: VerificationStatus.VERIFIED,
            verificationAttempts: Math.max(existing.verificationAttempts || 0, 1),
            verifiedByFallback: true,
            verifiedStoryId: platformPostId,
            verifiedPermalink: platformPostUrl,
            verifiedTimestamp: publishedAt || new Date(),
            lastVerificationAt: new Date(),
            nextVerificationAt: null,
            verificationError: null,
          }
        : {}),
    },
  })
  return count > 0
}

async function importarNovo(zPost: any, accountToProject: Map<string, ProjetoDoSync>): Promise<boolean> {
  let project: ProjetoDoSync | undefined
  for (const pl of zPost.platforms || []) {
    // accountId can be a string or an object { _id: "..." }
    const accId = typeof pl.accountId === 'object' && pl.accountId ? pl.accountId._id : pl.accountId
    if (accId && accountToProject.has(accId)) {
      project = accountToProject.get(accId)
      break
    }
  }
  if (!project) return false

  const { ig, publishedAt, platformPostUrl, platformPostId } = dadosDoInstagram(zPost)
  const media: any[] = zPost.media || []
  const postType = mapZernioPostType(ig, media)
  const isPublished = zPost.status === 'published'

  const verificationData =
    isPublished && postType === PostType.STORY
      ? {
          verificationStatus: VerificationStatus.VERIFIED,
          verificationAttempts: 1,
          verifiedByFallback: true,
          verifiedStoryId: platformPostId,
          verifiedPermalink: platformPostUrl,
          verifiedTimestamp: publishedAt || new Date(),
          lastVerificationAt: new Date(),
        }
      : {
          verificationStatus: postType === PostType.STORY ? VerificationStatus.PENDING : VerificationStatus.SKIPPED,
        }

  await db.socialPost.create({
    data: {
      projectId: project.id,
      userId: project.userId,
      laterPostId: zPost.id,
      postType,
      caption: zPost.text || '',
      mediaUrls: media.map((m) => m.url).filter(Boolean),
      scheduleType: zPost.publishAt ? ScheduleType.SCHEDULED : ScheduleType.IMMEDIATE,
      scheduledDatetime: zPost.publishAt ? new Date(zPost.publishAt) : null,
      status: mapZernioStatus(zPost.status),
      lateStatus: zPost.status,
      publishType: PublishType.DIRECT,
      renderStatus: RenderStatus.NOT_NEEDED,
      lastSyncAt: new Date(),
      ...verificationData,
      ...(publishedAt ? { sentAt: publishedAt, latePublishedAt: publishedAt } : {}),
      ...(platformPostUrl ? { publishedUrl: platformPostUrl, latePlatformUrl: platformPostUrl } : {}),
      ...(platformPostId ? { instagramMediaId: platformPostId } : {}),
    },
  })
  return true
}
