import { describe, expect, it } from 'vitest'
import { arteDaPagina, ehArteDaPagina } from '../arte-da-pagina'
import { postDeVideo } from '@/lib/posts/post-de-video'

describe('arteDaPagina', () => {
  // A página tem a arte (PNG do compositor), o export de vídeo e a Generation
  // `post-schedule` que `ensurePostGeneration` cria para o post de vídeo — as
  // duas com MP4 e as duas MAIS NOVAS que a arte.
  const geracoes = [
    { id: 'arte', resultUrl: 'https://b/pg1-1.png', fieldValues: { pageId: 'pg1', source: 'compositor' }, createdAt: '2026-10-01T10:00:00Z' },
    { id: 'export', resultUrl: 'https://b/video.mp4', fieldValues: { isVideo: true, videoExport: true, videoDaPagina: { pageId: 'pg1' } }, createdAt: '2026-10-02T10:00:00Z' },
    { id: 'post-schedule', resultUrl: 'https://b/video.mp4', fieldValues: { source: 'post-schedule', pageId: 'pg1', postId: 'p1' }, createdAt: '2026-10-03T10:00:00Z' },
    { id: 'outra-pagina', resultUrl: 'https://b/pg2.png', fieldValues: { pageId: 'pg2' }, createdAt: '2026-10-04T10:00:00Z' },
  ]

  it('a arte é a imagem mais recente da página — nunca o vídeo', () => {
    expect(arteDaPagina(geracoes, 'pg1')?.id).toBe('arte')
  })

  it('export de vídeo e MP4 não são arte', () => {
    expect(ehArteDaPagina(geracoes[1], 'pg1')).toBe(false)
    expect(ehArteDaPagina(geracoes[2], 'pg1')).toBe(false)
    expect(ehArteDaPagina(geracoes[0], 'pg1')).toBe(true)
  })

  it('entre duas imagens, vale a mais nova', () => {
    const nova = { id: 'nova', resultUrl: 'https://b/pg1-2.png', fieldValues: { pageId: 'pg1' }, createdAt: '2026-10-05T10:00:00Z' }
    expect(arteDaPagina([...geracoes, nova], 'pg1')?.id).toBe('nova')
  })

  it('sem resultado não é arte, e a mais nova sem URL não esconde a válida anterior', () => {
    const semUrl = { id: 'em-producao', resultUrl: null, fieldValues: { pageId: 'pg1' }, createdAt: '2026-10-06T10:00:00Z' }
    expect(ehArteDaPagina(semUrl, 'pg1')).toBe(false)
    expect(arteDaPagina([...geracoes, semUrl], 'pg1')?.id).toBe('arte')
  })
})

describe('postDeVideo', () => {
  it('a marca vale mesmo com a mídia limpa; mídia de vídeo vale sem a marca', () => {
    expect(postDeVideo({ videoDaPagina: true, mediaUrls: [] })).toBe(true)
    expect(postDeVideo({ videoDaPagina: false, mediaUrls: ['https://b/x.mp4?v=1'] })).toBe(true)
    expect(postDeVideo({ videoDaPagina: false, mediaUrls: ['https://b/x.png'] })).toBe(false)
    expect(postDeVideo({ mediaUrls: [] })).toBe(false)
  })
})
