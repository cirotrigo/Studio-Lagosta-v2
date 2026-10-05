import { describe, expect, it } from 'vitest'
import { MOTIVO_VIDEO_REMOVIDO, falharPostDeVideoSemMidia } from '../post-de-video'

interface PostFalso {
  id: string
  laterPostId: string | null
  status: string
  updatedAt: Date
  mediaUrls: string[]
  errorMessage?: string
}

/** Banco falso: o `updateMany` confere TODO o where, como o Postgres. */
function bancoCom(post: PostFalso) {
  return {
    post,
    socialPost: {
      async updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }) {
        const w = args.where as { id: string; laterPostId: null; status: string; updatedAt: Date; mediaUrls: { isEmpty: true } }
        const casa =
          post.id === w.id &&
          post.laterPostId === w.laterPostId &&
          post.status === w.status &&
          post.updatedAt.getTime() === w.updatedAt.getTime() &&
          (w.mediaUrls.isEmpty ? post.mediaUrls.length === 0 : true)
        if (!casa) return { count: 0 }
        Object.assign(post, args.data)
        return { count: 1 }
      },
    },
  }
}

describe('falharPostDeVideoSemMidia (executor)', () => {
  const lido = { id: 'p1', status: 'SCHEDULED', updatedAt: new Date('2026-10-03T10:00:00Z') }

  it('post ainda como foi lido (sem mídia, mesma revisão): falha e devolve true', async () => {
    const banco = bancoCom({ ...lido, laterPostId: null, mediaUrls: [] })
    expect(await falharPostDeVideoSemMidia(banco, lido)).toBe(true)
    expect(banco.post.status).toBe('FAILED')
    expect(banco.post.errorMessage).toBe(MOTIVO_VIDEO_REMOVIDO)
  })

  it('a substituição repôs o MP4 entre a leitura e a escrita: nada muda e não há aviso', async () => {
    const banco = bancoCom({ ...lido, laterPostId: null, mediaUrls: ['https://b/novo.mp4'], updatedAt: new Date('2026-10-03T10:00:05Z') })
    expect(await falharPostDeVideoSemMidia(banco, lido)).toBe(false)
    expect(banco.post.status).toBe('SCHEDULED')
  })

  it('mídia ainda vazia mas o post mudou de revisão: não marca (a decisão foi sobre outro post)', async () => {
    const banco = bancoCom({ ...lido, laterPostId: null, mediaUrls: [], updatedAt: new Date('2026-10-03T10:00:05Z') })
    expect(await falharPostDeVideoSemMidia(banco, lido)).toBe(false)
    expect(banco.post.status).toBe('SCHEDULED')
  })
})
