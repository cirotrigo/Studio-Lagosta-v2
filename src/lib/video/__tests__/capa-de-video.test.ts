import { describe, expect, it } from 'vitest'
import { videoDoBlob } from '../capa-de-video'

const BLOB = 'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com'

describe('videoDoBlob', () => {
  it('aceita vídeo do Blob do Studio, com nome acentuado e em outra caixa', () => {
    expect(videoDoBlob(`${BLOB}/wine-vix/videos-2026-09/l2r10s1-abc.mp4`)?.hostname).toBe(
      '2rhsgfleozgl5jbm.public.blob.vercel-storage.com',
    )
    expect(videoDoBlob(`${BLOB}/video-exports/u/1790-Sem%20t%C3%ADtulo.mp4`)).not.toBeNull()
    expect(videoDoBlob(`${BLOB.toUpperCase().replace('HTTPS', 'https')}/a.MOV`)).not.toBeNull()
  })

  it('recusa o que faria o servidor ler outro lugar', () => {
    // o host do Blob só na query ou no caminho: `includes` deixaria passar
    expect(videoDoBlob(`https://evil.com/a.mp4?x=.public.blob.vercel-storage.com`)).toBeNull()
    expect(videoDoBlob(`https://evil.com/x.public.blob.vercel-storage.com/a.mp4`)).toBeNull()
    expect(videoDoBlob(`https://public.blob.vercel-storage.com.evil.com/a.mp4`)).toBeNull()
    expect(videoDoBlob(`http://x.public.blob.vercel-storage.com/a.mp4`)).toBeNull()
    expect(videoDoBlob('file:///etc/passwd.mp4')).toBeNull()
    expect(videoDoBlob('não é url')).toBeNull()
    expect(videoDoBlob('')).toBeNull()
  })

  it('recusa o que não é vídeo', () => {
    expect(videoDoBlob(`${BLOB}/artes/story.png`)).toBeNull()
    // a extensão tem de estar no CAMINHO, não na query
    expect(videoDoBlob(`${BLOB}/artes/story.png?nome=a.mp4`)).toBeNull()
  })
})
