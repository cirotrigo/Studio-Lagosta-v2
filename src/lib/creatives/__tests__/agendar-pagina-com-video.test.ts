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
