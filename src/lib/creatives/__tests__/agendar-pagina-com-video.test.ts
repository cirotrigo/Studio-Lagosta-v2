/**
 * Página com vídeo não vira post como IMAGEM (02/10/2026): sem mídia trazida
 * por quem chama, a arte sairia do `thumbnail` ou do render do cron — um quadro
 * parado. A trava mora em `resolverAgendamento`, o ponto por onde todo
 * agendamento por PÁGINA passa (agenda das páginas, bancada, conector, lote).
 *
 * O que NÃO pode ser travado: agendar por `mediaUrls` ou só por `generationId`
 * — é assim que o MP4 exportado desta mesma página vai para a agenda.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const banco = vi.hoisted(() => {
  const posts: Array<Record<string, unknown>> = []
  const estado = { camadas: null as unknown, thumbnail: null as string | null, paginasLidas: 0 }
  return { posts, estado }
})

const MP4 = 'https://blob.test/video-exportado.mp4'

// A trava da agenda do projeto (H4) roda a criação numa transação; aqui ela só repassa o banco falso.
vi.mock('@/lib/trava-por-chave', async () => {
  const { db } = await import('@/lib/db')
  return { chaveDaAgenda: (id: number) => `agenda-slot:${id}`, comTravaPorChave: async (_chave: string, fazer: (tx: unknown) => unknown) => fazer(db) }
})
vi.mock('@/lib/db', () => ({
  db: {
    project: { findUnique: async () => ({ id: 8, name: 'Lagosta Criativa', userId: 'dono-interno', instagramAccountId: null }) },
    page: {
      findUnique: async () => {
        banco.estado.paginasLidas++
        return {
          templateId: 77,
          thumbnail: banco.estado.thumbnail,
          layers: banco.estado.camadas,
          width: 1080,
          height: 1920,
          background: '#000000',
          Template: { projectId: 8 },
        }
      },
    },
    generation: {
      findFirst: async ({ where }: { where: { id?: string } }) =>
        where.id ? { id: where.id, resultUrl: MP4, fieldValues: { isVideo: true }, sourcePageId: null } : null,
    },
    socialPost: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const post = { id: `post-${banco.posts.length + 1}`, ...data }
        banco.posts.push(post)
        return post
      },
    },
    knowledgeBaseEntry: { findFirst: async () => null },
  },
}))
vi.mock('@prisma/client', async () => await import('../../../../prisma/generated/client'))
vi.mock('@/lib/creatives/persist', () => ({ getPublicAppUrl: () => 'https://studio.test' }))
vi.mock('@/lib/creatives/ingerir-midia', () => ({ ingerirMidiaExterna: async (urls: string[]) => ({ urls, falhas: [] }) }))
vi.mock('@/lib/aprendizado/sinal-de-agendamento', () => ({
  registrarSlotDoPost: async () => true,
  registrarCopyDoPost: async () => true,
  fecharSugestaoDeSlot: async () => true,
}))
vi.mock('@/lib/aprendizado/sinal-de-legenda', () => ({ registrarLegendaDoPost: async () => true }))
vi.mock('@/lib/posts/artes-do-post', () => ({ registrarArtesDoPost: async () => ({ artes: [] }) }))
vi.mock('@/lib/compositor/pastas', () => ({ moverPaginaParaSemana: async () => ({ falhou: false }) }))

import { agendarPost, resolverAgendamento } from '../agendar'

const foto = { id: 'foto', type: 'image' }
const video = { id: 'video', type: 'video', videoMetadata: { loop: true } }
const motion = { id: 'motion', type: 'video', videoMetadata: { overlay: true } }
const base = { projectId: 8, postType: 'STORY' as const, scheduledDatetime: '2026-10-10 10:00' }

beforeEach(() => {
  banco.posts.length = 0
  banco.estado.camadas = [foto]
  banco.estado.thumbnail = null
  banco.estado.paginasLidas = 0
})

describe('página com vídeo não é agendada como imagem', () => {
  it('por pageId: recusa com PAGINA_COM_VIDEO (422) e não cria post', async () => {
    banco.estado.camadas = [foto, video]
    await expect(agendarPost({ ...base, pageId: 'p1' })).rejects.toMatchObject({ code: 'PAGINA_COM_VIDEO', status: 422 })
    expect(banco.posts).toEqual([])
  })

  it('o thumbnail do Blob não abre a porta: ele é o quadro parado', async () => {
    banco.estado.camadas = [foto, video]
    banco.estado.thumbnail = 'https://blob.test/quadro.png'
    await expect(agendarPost({ ...base, pageId: 'p1' })).rejects.toMatchObject({ code: 'PAGINA_COM_VIDEO' })
    expect(banco.posts).toEqual([])
  })

  it('só motion sobre foto, e camadas dupla-codificadas: recusa igual', async () => {
    banco.estado.camadas = [foto, motion]
    await expect(resolverAgendamento({ ...base, pageId: 'p1' })).rejects.toMatchObject({ code: 'PAGINA_COM_VIDEO' })
    banco.estado.camadas = JSON.stringify(JSON.stringify([foto, video]))
    await expect(resolverAgendamento({ ...base, pageId: 'p1' })).rejects.toMatchObject({ code: 'PAGINA_COM_VIDEO' })
  })

  it('pageId + generationId sem mídia: a arte ainda sairia da página — recusa', async () => {
    banco.estado.camadas = [foto, video]
    await expect(agendarPost({ ...base, pageId: 'p1', generationId: 'gen-mp4' })).rejects.toMatchObject({ code: 'PAGINA_COM_VIDEO' })
    expect(banco.posts).toEqual([])
  })

  it('camadas ilegíveis: a trava não recusa — segue como sempre, com o PNG já renderizado', async () => {
    // Recusar aqui seria um modo de falha novo num caminho que funcionava; sem
    // thumbnail, quem lança é o render.
    banco.estado.camadas = '[{"type":"video"'
    banco.estado.thumbnail = 'https://blob.test/quadro.png'
    await expect(agendarPost({ ...base, pageId: 'p1' })).resolves.toBeTruthy()
    expect(banco.posts).toHaveLength(1)
  })
})

describe('o que a trava NÃO alcança', () => {
  it('o MP4 exportado da mesma página, só por generationId: agenda (a página nem é lida)', async () => {
    banco.estado.camadas = [foto, video]
    await agendarPost({ ...base, generationId: 'gen-mp4' })
    expect(banco.posts[0]).toMatchObject({ mediaUrls: [MP4], generationId: 'gen-mp4', pageId: null, renderStatus: 'NOT_NEEDED' })
    expect(banco.estado.paginasLidas).toBe(0)
  })

  it('o MP4 por mediaUrls, mesmo informando a página: agenda, sem render da página', async () => {
    banco.estado.camadas = [foto, video]
    banco.estado.thumbnail = 'https://blob.test/quadro.png'
    await agendarPost({ ...base, pageId: 'p1', mediaUrls: [MP4] })
    expect(banco.posts[0]).toMatchObject({ mediaUrls: [MP4], pageId: 'p1', renderStatus: 'NOT_NEEDED' })
  })

  it('vídeo OCULTO: a página é uma imagem e agenda como sempre', async () => {
    banco.estado.camadas = [foto, { ...video, visible: false }]
    await agendarPost({ ...base, pageId: 'p1' })
    expect(banco.posts[0]).toMatchObject({ pageId: 'p1', renderStatus: 'PENDING' })
  })

  it('página sem vídeo: agenda como sempre, com o thumbnail do render', async () => {
    banco.estado.thumbnail = 'https://blob.test/arte.png'
    await agendarPost({ ...base, pageId: 'p1' })
    expect(banco.posts[0]).toMatchObject({ pageId: 'p1', mediaUrls: ['https://blob.test/arte.png'], renderStatus: 'RENDERED' })
  })
})

/**
 * G4.6 (27/10/2026) — grade de fotos com célula vazia ao agendar pela página: AVISA ("a grade tem N células vazias"),
 * nunca bloqueia. `''` e ausente são a mesma célula vazia; célula oculta não conta. Banco falso deste arquivo — nada de
 * agendamento real, Zernio ou upload.
 */
describe('G4.6 — célula vazia de grade ao agendar: aviso, não bloqueio', () => {
  const BLOB = 'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com'
  const cel = (id: string, fileUrl?: string, extra: Record<string, unknown> = {}) => ({
    id, type: 'image', name: id, ...(fileUrl === undefined ? {} : { fileUrl }), metadata: { grade: { id: 'g1' }, groupId: 'g1' }, ...extra,
  })

  it('duas vazias ("" e ausente) e uma oculta: o resolver avisa "A grade tem 2 células vazias" e segue', async () => {
    banco.estado.camadas = [cel('c0', `${BLOB}/a.jpg`), cel('c1', ''), cel('c2'), cel('c3', '', { visible: false })]
    banco.estado.thumbnail = `${BLOB}/render.png`
    const r = await resolverAgendamento({ ...base, pageId: 'p1' })
    expect(r.avisos).toContain('A grade tem 2 células vazias: elas saem sem foto na arte publicada.')
    expect(banco.posts).toEqual([])
  })

  it('agendarPost como rascunho (banco falso): cria o post e devolve o aviso junto', async () => {
    banco.estado.camadas = [cel('c0', `${BLOB}/a.jpg`), cel('c1', '')]
    banco.estado.thumbnail = `${BLOB}/render.png`
    const r = await agendarPost({ ...base, pageId: 'p1' })
    expect(banco.posts).toHaveLength(1)
    expect(r.aviso).toContain('A grade tem 1 célula vazia')
  })

  it('grade cheia e foto avulsa vazia: sem aviso de grade', async () => {
    banco.estado.camadas = [cel('c0', `${BLOB}/a.jpg`), { id: 'avulsa', type: 'image', fileUrl: '' }]
    banco.estado.thumbnail = `${BLOB}/render.png`
    const r = await resolverAgendamento({ ...base, pageId: 'p1' })
    expect(r.avisos.join(' ')).not.toMatch(/grade/)
  })
})
