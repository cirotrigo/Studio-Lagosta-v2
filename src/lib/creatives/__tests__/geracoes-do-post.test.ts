import { describe, it, expect } from 'vitest'
import { resolverGeracoesSoDestePost } from '@/lib/creatives/geracoes-do-post'

describe('resolverGeracoesSoDestePost', () => {
  it('post de imagem única: a arte do generationId', () => {
    expect(resolverGeracoesSoDestePost({ generationId: 'g1', mediaUrls: ['https://x/a.png'] }, [])).toEqual(['g1'])
  })

  it('carrossel: todas as Generations cujo resultUrl está em mediaUrls, sem repetir a do generationId', () => {
    const ids = resolverGeracoesSoDestePost(
      { generationId: 'g1', mediaUrls: ['https://x/1.png', 'https://x/2.png', 'https://x/3.png'] },
      [
        { id: 'g1', resultUrl: 'https://x/1.png' },
        { id: 'g2', resultUrl: 'https://x/2.png' },
        { id: 'g3', resultUrl: 'https://x/3.png' },
        { id: 'alheia', resultUrl: 'https://x/outra.png' },
      ],
    )
    expect(ids.sort()).toEqual(['g1', 'g2', 'g3'])
  })

  it('arte que OUTRO post ainda usa fica de fora — por generationId ou por URL', () => {
    const ids = resolverGeracoesSoDestePost(
      { generationId: 'g1', mediaUrls: ['https://x/1.png', 'https://x/2.png'] },
      [
        { id: 'g1', resultUrl: 'https://x/1.png' },
        { id: 'g2', resultUrl: 'https://x/2.png' },
      ],
      [
        { generationId: 'g1', mediaUrls: [] },
        { generationId: null, mediaUrls: ['https://x/2.png'] },
      ],
    )
    expect(ids).toEqual([])
  })

  it('sobe a LINHAGEM: o post aponta para a melhoria, o uso está na original', () => {
    const ids = resolverGeracoesSoDestePost(
      { generationId: 'melhoria', mediaUrls: ['https://x/melhoria.png'] },
      [
        { id: 'melhoria', resultUrl: 'https://x/melhoria.png', sourceGenerationId: 'original' },
        { id: 'original', resultUrl: 'https://x/original.png', sourceGenerationId: null },
      ],
    )
    expect(ids.sort()).toEqual(['melhoria', 'original'])
  })

  it('melhoria-IRMÃ usada por outro post protege a original, mas não a melhoria deste', () => {
    const ids = resolverGeracoesSoDestePost(
      { generationId: 'melhoria-a', mediaUrls: ['https://x/a.png'] },
      [
        { id: 'melhoria-a', resultUrl: 'https://x/a.png', sourceGenerationId: 'original' },
        { id: 'melhoria-b', resultUrl: 'https://x/b.png', sourceGenerationId: 'original' },
        { id: 'original', resultUrl: 'https://x/original.png' },
      ],
      [{ generationId: 'melhoria-b', mediaUrls: ['https://x/b.png'] }],
    )
    expect(ids).toEqual(['melhoria-a'])
  })

  it('linhagem circular ou fora do pool não trava nem inventa id', () => {
    const ids = resolverGeracoesSoDestePost(
      { generationId: 'a' },
      [
        { id: 'a', sourceGenerationId: 'b' },
        { id: 'b', sourceGenerationId: 'a' },
        { id: 'c', sourceGenerationId: 'fora-do-pool' },
      ],
    )
    expect(ids.sort()).toEqual(['a', 'b'])
  })

  it('post sem arte nenhuma devolve []', () => {
    expect(resolverGeracoesSoDestePost({ generationId: null, mediaUrls: [] }, [])).toEqual([])
    expect(resolverGeracoesSoDestePost({}, [{ id: 'g9', resultUrl: 'https://x/9.png' }])).toEqual([])
  })
})
