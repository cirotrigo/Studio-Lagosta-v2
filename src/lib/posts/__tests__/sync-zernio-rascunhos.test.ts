/**
 * Rascunho do Zernio na agenda do Studio (11/11/2026).
 *
 * O Ciro sobe a arte como RASCUNHO no Zernio e a Roberta aprova na agenda do Studio. Antes, o sync só listava
 * `scheduled` e `published`: o rascunho nunca chegava. Aqui: a importação, as transições nos dois sentidos, o
 * rascunho apagado por lá, e a aprovação — que tira AQUELE post de rascunho no Zernio, sem criar um segundo.
 * E a volta: "voltar para rascunho" SEGURA o post no Zernio (a arte mora lá) em vez de apagar, fechando o ciclo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => ({ posts: [] as any[] }))
const zernio = vi.hoisted(() => ({
  porStatus: {} as Record<string, any[]>,
  listPosts: null as any,
  getPost: null as any,
  updatePost: null as any,
  createPost: null as any,
  deletePost: null as any,
}))

function casa(l: any, where: any): boolean {
  return Object.entries(where).every(([k, c]: [string, any]) => {
    if (k === 'OR') return c.some((w: any) => casa(l, w))
    if (k === 'NOT') return !casa(l, c)
    const v = l[k]
    if (c === null) return v === null || v === undefined
    if (typeof c !== 'object') return v === c
    if ('in' in c) return c.in.includes(v)
    if ('startsWith' in c) return typeof v === 'string' && v.startsWith(c.startsWith)
    let ok = true
    if ('not' in c) ok &&= c.not === null ? v !== null && v !== undefined : v !== c.not
    if ('notIn' in c) ok &&= !c.notIn.includes(v)
    return ok
  })
}

vi.mock('@/lib/db', () => ({
  db: {
    project: { findUnique: async () => ({ name: 'Bacana', instagramAccountId: 'ig' }) },
    socialPost: {
      findMany: async ({ where }: any) => banco.posts.filter((p) => casa(p, where)),
      create: async ({ data }: any) => {
        const post = { id: `local-${banco.posts.length + 1}`, pageId: null, ...data }
        banco.posts.push(post)
        return post
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0
        banco.posts = banco.posts.map((p) => (casa(p, where) ? (count++, { ...p, ...data }) : p))
        return { count }
      },
      update: async ({ where, data }: any) => {
        banco.posts = banco.posts.map((p) => (p.id === where.id ? { ...p, ...data } : p))
      },
      deleteMany: async ({ where }: any) => {
        const antes = banco.posts.length
        banco.posts = banco.posts.filter((p) => !casa(p, where))
        return { count: antes - banco.posts.length }
      },
    },
  },
}))
vi.mock('@/lib/later/client', () => ({
  getLaterClient: () => ({
    listPosts: (...a: unknown[]) => zernio.listPosts(...a),
    getPost: (...a: unknown[]) => zernio.getPost(...a),
    updatePost: (...a: unknown[]) => zernio.updatePost(...a),
    createPost: (...a: unknown[]) => zernio.createPost(...a),
    deletePost: (...a: unknown[]) => zernio.deletePost(...a),
  }),
}))
vi.mock('@/lib/aprendizado/sinal-de-agendamento', () => ({ fecharSugestaoDeSlot: async () => undefined, registrarSlotDoPost: async () => undefined }))
vi.mock('@/lib/aprendizado/sinal-de-legenda', () => ({ registrarEdicaoDeLegenda: async () => undefined }))
vi.mock('@/lib/posts/campanha-vigencia', () => ({ avisosDeCampanhaVencida: async () => new Map() }))

import { LaterNotFoundError } from '@/lib/later/errors'
import { sincronizarZernio } from '../sync-zernio'
import { processarAprovacao } from '../agenda-acoes'

const CONTA = '695566904207e06f4ca83584'
const BACANA = { id: 5, laterAccountId: CONTA, userId: 'dono' }
// Sempre no futuro: 17:30 de Brasília de daqui a dois dias.
const DAQUI_A_DOIS_DIAS = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
const QUANDO = `${DAQUI_A_DOIS_DIAS}T20:30:00.000Z`
const QUANDO_BRT = `${DAQUI_A_DOIS_DIAS}T17:30:00`
const CDN_ZERNIO = 'https://media.zernio.com/temp/story.png'

const noZernio = (extra: Record<string, unknown> = {}) => ({
  id: 'z1',
  status: 'draft',
  text: '',
  publishAt: QUANDO,
  media: [{ type: 'image', url: CDN_ZERNIO }],
  platforms: [{ platform: 'instagram', accountId: { _id: CONTA }, platformSpecificData: { contentType: 'story' } }],
  ...extra,
})

const local = (extra: Record<string, unknown> = {}) => ({
  id: 'local-1', projectId: 5, laterPostId: 'z1', status: 'DRAFT', lateStatus: 'draft', caption: '', postType: 'STORY',
  publishType: 'DIRECT', verificationStatus: 'PENDING', verificationAttempts: 0, scheduledDatetime: new Date(QUANDO),
  mediaUrls: [CDN_ZERNIO], pageId: null, renderStatus: 'NOT_NEEDED', videoDaPagina: false, campaignId: null,
  generationId: null, sugestaoId: null, lastSyncAt: null, ...extra,
})

const cron = () => sincronizarZernio({ projects: [BACANA], statuses: ['draft', 'scheduled', 'published'] })

beforeEach(() => {
  banco.posts = []
  zernio.porStatus = {}
  zernio.listPosts = vi.fn(async ({ status, page }: any) => (page === 1 ? zernio.porStatus[status] ?? [] : []))
  zernio.getPost = vi.fn(async () => { throw new LaterNotFoundError('Post not found') })
  zernio.updatePost = vi.fn(async () => noZernio({ status: 'scheduled' }))
  zernio.createPost = vi.fn()
  zernio.deletePost = vi.fn(async () => undefined)
})

describe('sync: importa o rascunho do Zernio', () => {
  it('lista `draft` e o rascunho entra como rascunho, no dia e hora marcados, com a arte e o tipo', async () => {
    zernio.porStatus.draft = [noZernio()]
    const r = await cron()

    expect(zernio.listPosts).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft', page: 1 }))
    expect(r).toMatchObject({ imported: 1, updated: 0, removed: 0 })
    expect(banco.posts).toHaveLength(1)
    expect(banco.posts[0]).toMatchObject({
      projectId: 5, laterPostId: 'z1', status: 'DRAFT', lateStatus: 'draft', postType: 'STORY',
      mediaUrls: [CDN_ZERNIO], scheduledDatetime: new Date(QUANDO), scheduleType: 'SCHEDULED', renderStatus: 'NOT_NEEDED',
    })
  })

  it('tipo: duas mídias sem contentType é carrossel; uma imagem é post de feed; um vídeo é reel', async () => {
    const feed = { platforms: [{ platform: 'instagram', accountId: CONTA }] }
    zernio.porStatus.draft = [
      noZernio({ id: 'carrossel', ...feed, media: [{ type: 'image', url: 'a' }, { type: 'image', url: 'b' }] }),
      noZernio({ id: 'feed', ...feed }),
      noZernio({ id: 'reel', ...feed, media: [{ type: 'video', url: 'v' }] }),
    ]
    await cron()
    expect(Object.fromEntries(banco.posts.map((p) => [p.laterPostId, p.postType]))).toEqual({
      carrossel: 'CAROUSEL', feed: 'POST', reel: 'REEL',
    })
  })

  it('post de conta que não é de nenhum projeto fica de fora', async () => {
    zernio.porStatus.draft = [noZernio({ platforms: [{ platform: 'instagram', accountId: 'outra-conta' }] })]
    expect(await cron()).toMatchObject({ imported: 0, skipped: 1 })
    expect(banco.posts).toHaveLength(0)
  })

  it('o mesmo post nas listagens de rascunho e de agendado (mudou no meio da rodada) entra uma vez só, agendado', async () => {
    zernio.porStatus.draft = [noZernio()]
    zernio.porStatus.scheduled = [noZernio({ status: 'scheduled' })]
    await cron()
    expect(banco.posts).toHaveLength(1)
    expect(banco.posts[0]).toMatchObject({ status: 'SCHEDULED', lateStatus: 'scheduled' })
  })

  it('rota manual: lista rascunho e agendado só da conta do projeto', async () => {
    await sincronizarZernio({ projects: [BACANA], statuses: ['draft', 'scheduled'], accountId: CONTA })
    expect(zernio.listPosts.mock.calls.map(([p]: any) => [p.status, p.accountId])).toEqual([['draft', CONTA], ['scheduled', CONTA]])
  })
})

describe('sync: transições', () => {
  it('rascunho que virou agendado no Zernio passa a SCHEDULED', async () => {
    banco.posts = [local()]
    zernio.porStatus.scheduled = [noZernio({ status: 'scheduled' })]
    expect(await cron()).toMatchObject({ updated: 1, removed: 0 })
    expect(banco.posts[0]).toMatchObject({ status: 'SCHEDULED', lateStatus: 'scheduled' })
    expect(zernio.getPost).not.toHaveBeenCalled()
  })

  it('agendado que voltou a rascunho no Zernio passa a DRAFT, com a data de lá', async () => {
    const novaData = new Date(new Date(QUANDO).getTime() + 3_600_000)
    banco.posts = [local({ status: 'SCHEDULED', lateStatus: 'scheduled' })]
    zernio.porStatus.draft = [noZernio({ publishAt: novaData.toISOString() })]
    await cron()
    expect(banco.posts[0]).toMatchObject({ status: 'DRAFT', lateStatus: 'draft', scheduledDatetime: novaData })
  })

  it('arte trocada no rascunho do Zernio chega à agenda', async () => {
    banco.posts = [local()]
    zernio.porStatus.draft = [noZernio({ media: [{ type: 'image', url: 'https://media.zernio.com/temp/nova.png' }] })]
    await cron()
    expect(banco.posts[0].mediaUrls).toEqual(['https://media.zernio.com/temp/nova.png'])
  })

  it('post AGENDADO não tem a data mexida pelo sync (comportamento de sempre)', async () => {
    const dataLocal = new Date(new Date(QUANDO).getTime() - 3_600_000)
    banco.posts = [local({ status: 'SCHEDULED', lateStatus: 'scheduled', scheduledDatetime: dataLocal, caption: 'a' })]
    zernio.porStatus.scheduled = [noZernio({ status: 'scheduled', text: 'b' })]
    await cron()
    expect(banco.posts[0]).toMatchObject({ status: 'SCHEDULED', caption: 'b', scheduledDatetime: dataLocal })
  })

  it('listagem velha não desfaz a aprovação feita no Studio durante a rodada', async () => {
    // A linha corrente já foi aprovada; o sync ainda a leu como rascunho, de uma listagem de antes.
    banco.posts = [local({ status: 'SCHEDULED', lateStatus: 'scheduled' })]
    zernio.porStatus.draft = [noZernio({ text: 'legenda nova' })]
    const { db } = await import('@/lib/db')
    vi.spyOn(db.socialPost, 'findMany').mockImplementationOnce((async () => [local()]) as any)
    await cron()
    expect(banco.posts[0]).toMatchObject({ status: 'SCHEDULED', lateStatus: 'scheduled' })
  })
})

describe('sync: rascunho apagado no Zernio', () => {
  it('sumiu da listagem e o Zernio responde 404: sai da agenda (a arte morreu junto)', async () => {
    banco.posts = [local()]
    expect(await cron()).toMatchObject({ removed: 1 })
    expect(zernio.getPost).toHaveBeenCalledWith('z1')
    expect(banco.posts).toHaveLength(0)
  })

  it('com arte nossa (post do Studio que virou rascunho por lá): volta a ser rascunho comum do Studio', async () => {
    banco.posts = [local({ pageId: 'p1', mediaUrls: ['https://abc.public.blob.vercel-storage.com/arte.png'] })]
    await cron()
    expect(banco.posts[0]).toMatchObject({ status: 'DRAFT', laterPostId: null, lateStatus: null })
  })

  it('erro que não é 404 não apaga nada', async () => {
    banco.posts = [local()]
    zernio.getPost = vi.fn(async () => { throw Object.assign(new Error('Internal error'), { statusCode: 500 }) })
    expect(await cron()).toMatchObject({ removed: 0 })
    expect(banco.posts).toHaveLength(1)
  })

  it('sumiu da listagem mas existe em outro estado (publicado antigo): segue o estado de lá', async () => {
    banco.posts = [local()]
    zernio.getPost = vi.fn(async () => noZernio({ status: 'published' }))
    await cron()
    expect(banco.posts[0]).toMatchObject({ status: 'POSTED', lateStatus: 'published' })
  })

  it('rascunho nativo do Studio (sem laterPostId) e post de outro projeto não são tocados', async () => {
    banco.posts = [
      local({ id: 'nativo', laterPostId: null, lateStatus: null, pageId: 'p1' }),
      local({ id: 'alheio', projectId: 99, laterPostId: 'z-alheio' }),
    ]
    const antes = JSON.stringify(banco.posts)
    await cron()
    expect(zernio.getPost).not.toHaveBeenCalled()
    expect(JSON.stringify(banco.posts)).toBe(antes)
  })
})

describe('aprovar na agenda um rascunho que veio do Zernio', () => {
  const aprovar = () => processarAprovacao({ projectId: 5, postIds: ['local-1'], action: 'APPROVE' })

  it('tira o MESMO post de rascunho no Zernio, na mesma data, e não cria outro nem pede render', async () => {
    banco.posts = [local()]
    const r = await aprovar()

    expect(zernio.updatePost).toHaveBeenCalledTimes(1)
    expect(zernio.updatePost).toHaveBeenCalledWith('z1', { isDraft: false, scheduledFor: QUANDO_BRT, timezone: 'America/Sao_Paulo' })
    expect(zernio.createPost).not.toHaveBeenCalled()
    expect(r.processados).toEqual(['local-1'])
    expect(banco.posts[0]).toMatchObject({
      status: 'SCHEDULED', lateStatus: 'scheduled', laterPostId: 'z1', renderStatus: 'NOT_NEEDED', scheduledDatetime: new Date(QUANDO),
    })
  })

  it('Zernio fora do ar: nada muda e o motivo volta', async () => {
    banco.posts = [local()]
    zernio.updatePost = vi.fn(async () => { throw new Error('502') })
    const r = await aprovar()
    expect(r.processados).toEqual([])
    expect(r.ignorados[0].motivo).toMatch(/Não foi possível agendar/)
    expect(banco.posts[0]).toMatchObject({ status: 'DRAFT', lateStatus: 'draft' })
  })

  it('Zernio aceita a chamada mas o post continua rascunho por lá: não marca agendado', async () => {
    banco.posts = [local()]
    zernio.updatePost = vi.fn(async () => noZernio())
    const r = await aprovar()
    expect(r.ignorados[0].motivo).toMatch(/não confirmou/)
    expect(banco.posts[0].status).toBe('DRAFT')
  })

  it('rascunho apagado no Zernio (404): não aprova', async () => {
    banco.posts = [local()]
    zernio.updatePost = vi.fn(async () => { throw new LaterNotFoundError('Post not found') })
    const r = await aprovar()
    expect(r.ignorados[0].motivo).toMatch(/apagado no Zernio/)
    expect(banco.posts[0].status).toBe('DRAFT')
  })

  it('rascunho nativo do Studio: aprova como sempre, sem falar com o Zernio', async () => {
    banco.posts = [local({ laterPostId: null, lateStatus: null, mediaUrls: ['https://blob.test/arte.png'] })]
    await aprovar()
    expect(zernio.updatePost).not.toHaveBeenCalled()
    expect(banco.posts[0]).toMatchObject({ status: 'SCHEDULED', laterPostId: null })
  })
})

describe('voltar para rascunho um post que veio do Zernio', () => {
  const voltar = () => processarAprovacao({ projectId: 5, postIds: ['local-1'], action: 'REVERT' })
  const agendado = (extra: Record<string, unknown> = {}) => local({ status: 'SCHEDULED', lateStatus: 'scheduled', ...extra })

  beforeEach(() => {
    zernio.updatePost = vi.fn(async (_id: string, corpo: any) => noZernio({ status: corpo.isDraft ? 'draft' : 'scheduled' }))
  })

  it('SEGURA o post no Zernio (isDraft: true) em vez de apagar, e mantém id, arte e horário', async () => {
    banco.posts = [agendado()]
    const r = await voltar()

    expect(zernio.updatePost).toHaveBeenCalledTimes(1)
    expect(zernio.updatePost).toHaveBeenCalledWith('z1', { isDraft: true })
    expect(zernio.deletePost).not.toHaveBeenCalled()
    expect(r.processados).toEqual(['local-1'])
    expect(banco.posts[0]).toMatchObject({
      status: 'DRAFT', lateStatus: 'draft', laterPostId: 'z1', mediaUrls: [CDN_ZERNIO], scheduledDatetime: new Date(QUANDO), renderStatus: 'NOT_NEEDED',
    })
  })

  it('a menos de 5 minutos do horário: não segura, e diz por quê', async () => {
    banco.posts = [agendado({ scheduledDatetime: new Date(Date.now() + 3 * 60_000) })]
    const r = await voltar()
    expect(zernio.updatePost).not.toHaveBeenCalled()
    expect(r.ignorados[0].motivo).toMatch(/publica em instantes/)
    expect(banco.posts[0]).toMatchObject({ status: 'SCHEDULED', lateStatus: 'scheduled' })
  })

  it('já em publicação no Zernio: não segura', async () => {
    banco.posts = [agendado({ lateStatus: 'publishing' })]
    const r = await voltar()
    expect(zernio.updatePost).not.toHaveBeenCalled()
    expect(r.ignorados[0].motivo).toMatch(/já saiu para publicação/)
    expect(banco.posts[0].status).toBe('SCHEDULED')
  })

  it('404 do Zernio: nada muda aqui (não dá para saber se publicou)', async () => {
    banco.posts = [agendado()]
    zernio.updatePost = vi.fn(async () => { throw new LaterNotFoundError('Post not found') })
    const r = await voltar()
    expect(r.processados).toEqual([])
    expect(r.ignorados[0].motivo).toMatch(/sumiu da fila/)
    expect(banco.posts[0]).toMatchObject({ status: 'SCHEDULED', lateStatus: 'scheduled', laterPostId: 'z1' })
  })

  it('Zernio fora do ar: nada muda e o motivo volta', async () => {
    banco.posts = [agendado()]
    zernio.updatePost = vi.fn(async () => { throw new Error('502') })
    const r = await voltar()
    expect(r.ignorados[0].motivo).toMatch(/Não foi possível tirar o post da fila/)
    expect(banco.posts[0]).toMatchObject({ status: 'SCHEDULED', lateStatus: 'scheduled' })
  })

  it('Zernio aceita a chamada mas o post segue agendado por lá: não marca rascunho', async () => {
    banco.posts = [agendado()]
    zernio.updatePost = vi.fn(async () => noZernio({ status: 'scheduled' }))
    const r = await voltar()
    expect(r.ignorados[0].motivo).toMatch(/não confirmou/)
    expect(banco.posts[0].status).toBe('SCHEDULED')
  })

  it('post NATIVO do Studio (arte em host nosso): apaga do Zernio e zera o laterPostId, como sempre', async () => {
    banco.posts = [agendado({ pageId: 'p1', renderStatus: 'RENDERED', mediaUrls: ['https://abc.public.blob.vercel-storage.com/arte.png'] })]
    await voltar()
    expect(zernio.deletePost).toHaveBeenCalledWith('z1')
    expect(zernio.updatePost).not.toHaveBeenCalled()
    expect(banco.posts[0]).toMatchObject({ status: 'DRAFT', laterPostId: null, lateStatus: null, renderStatus: 'PENDING' })
  })

  it('ciclo completo: rascunho → agendado → rascunho → agendado, sempre o MESMO post do Zernio, e o sync concorda', async () => {
    const aprovar = () => processarAprovacao({ projectId: 5, postIds: ['local-1'], action: 'APPROVE' })
    banco.posts = [local()]

    expect((await aprovar()).processados).toEqual(['local-1'])
    expect(banco.posts[0]).toMatchObject({ status: 'SCHEDULED', lateStatus: 'scheduled' })
    expect((await voltar()).processados).toEqual(['local-1'])
    expect(banco.posts[0]).toMatchObject({ status: 'DRAFT', lateStatus: 'draft' })

    // O cron seguinte encontra o post em rascunho nos dois lados: nada muda, nada é conferido nem apagado.
    zernio.porStatus.draft = [noZernio()]
    banco.posts[0].lastSyncAt = new Date(Date.now() - 600_000)
    expect(await cron()).toMatchObject({ imported: 0, updated: 0, removed: 0 })
    expect(zernio.getPost).not.toHaveBeenCalled()
    expect(banco.posts[0]).toMatchObject({ status: 'DRAFT', lateStatus: 'draft', laterPostId: 'z1' })

    expect((await aprovar()).processados).toEqual(['local-1'])
    expect(banco.posts).toHaveLength(1)
    expect(banco.posts[0]).toMatchObject({ status: 'SCHEDULED', lateStatus: 'scheduled', laterPostId: 'z1', mediaUrls: [CDN_ZERNIO] })
    expect(zernio.updatePost.mock.calls.map(([id, corpo]: any) => [id, corpo.isDraft])).toEqual([['z1', false], ['z1', true], ['z1', false]])
    expect(zernio.createPost).not.toHaveBeenCalled()
    expect(zernio.deletePost).not.toHaveBeenCalled()
  })

  it('sync com listagem de ANTES do revert não rearma o post: linha mexida durante a rodada fica para a próxima', async () => {
    banco.posts = [agendado()]
    // A listagem (velha) ainda diz `scheduled`; no meio dela, o Studio segura o post.
    zernio.listPosts = vi.fn(async ({ status, page }: any) => {
      if (status !== 'scheduled' || page !== 1) return []
      await new Promise((r) => setTimeout(r, 5))
      await voltar()
      return [noZernio({ status: 'scheduled' })]
    })
    await cron()
    expect(banco.posts[0]).toMatchObject({ status: 'DRAFT', lateStatus: 'draft' })
  })
})
