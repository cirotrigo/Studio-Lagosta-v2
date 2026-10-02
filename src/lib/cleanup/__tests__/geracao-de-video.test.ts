import { describe, expect, it } from 'vitest'
import { ehGeracaoDeVideo, videoUrlRegistrado } from '../geracao-de-video'

const MP4 = 'https://x.public.blob.vercel-storage.com/videos/story-AbC123.mp4'

describe('ehGeracaoDeVideo', () => {
  it('objeto com isVideo true é vídeo', () => {
    expect(ehGeracaoDeVideo({ isVideo: true, videoUrl: MP4 })).toBe(true)
  })

  it('videoExport true também conta (a fila grava os dois)', () => {
    expect(ehGeracaoDeVideo({ videoExport: true })).toBe(true)
  })

  it('sem o campo NÃO é vídeo — é o caso comum, e a limpeza segue valendo', () => {
    expect(ehGeracaoDeVideo({ slotValues: { titulo: 'Almoço' }, source: 'compositor' })).toBe(false)
    expect(ehGeracaoDeVideo({})).toBe(false)
  })

  it('fieldValues null, undefined, array e escalar não são vídeo', () => {
    expect(ehGeracaoDeVideo(null)).toBe(false)
    expect(ehGeracaoDeVideo(undefined)).toBe(false)
    expect(ehGeracaoDeVideo([{ isVideo: true }])).toBe(false)
    expect(ehGeracaoDeVideo(true)).toBe(false)
  })

  it('string JSON é lida (simples e dupla-codificada)', () => {
    const simples = JSON.stringify({ isVideo: true })
    expect(ehGeracaoDeVideo(simples)).toBe(true)
    expect(ehGeracaoDeVideo(JSON.stringify(simples))).toBe(true)
    expect(ehGeracaoDeVideo(JSON.stringify({ source: 'arte-ia' }))).toBe(false)
  })

  it('string que não é JSON não é vídeo, e não lança', () => {
    expect(ehGeracaoDeVideo('isVideo')).toBe(false)
    expect(ehGeracaoDeVideo('')).toBe(false)
  })

  it('isVideo "true" (string) não conta — só o booleano', () => {
    expect(ehGeracaoDeVideo({ isVideo: 'true' })).toBe(false)
    expect(ehGeracaoDeVideo({ isVideo: 1 })).toBe(false)
    expect(ehGeracaoDeVideo({ isVideo: false, videoExport: false })).toBe(false)
  })
})

describe('videoUrlRegistrado', () => {
  it('devolve o MP4 registrado pelo export', () => {
    expect(videoUrlRegistrado({ isVideo: true, videoUrl: MP4 })).toBe(MP4)
    expect(videoUrlRegistrado(JSON.stringify({ videoUrl: MP4 }))).toBe(MP4)
  })

  it('sem videoUrl, vazio ou de outro tipo: null', () => {
    expect(videoUrlRegistrado({ isVideo: true })).toBeNull()
    expect(videoUrlRegistrado({ videoUrl: '  ' })).toBeNull()
    expect(videoUrlRegistrado({ videoUrl: 42 })).toBeNull()
    expect(videoUrlRegistrado(null)).toBeNull()
  })
})
