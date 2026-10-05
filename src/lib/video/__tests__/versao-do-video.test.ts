import { describe, expect, it } from 'vitest'
import { canonicalizeLayersForPersistence } from '@/lib/shape-style'
import { paginaDoDesign, versaoDoVideo } from '../versao-do-video'

const camadas = [
  { id: 'v', type: 'video', name: 'Vídeo', position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 }, fileUrl: 'https://b/x.mp4', order: 0 },
  { id: 't', type: 'text', name: 'Título', position: { x: 40, y: 80 }, size: { width: 900, height: 120 }, content: 'Oi', style: { fontSize: 64 }, order: 1 },
]
const audio = { source: 'library', musicId: 3, startTime: 0, endTime: 12, volume: 80, fadeIn: true, fadeOut: false, fadeInDuration: 1, fadeOutDuration: 0 }
const design = { canvas: { width: 1080, height: 1920, backgroundColor: '#000000' }, layers: camadas, audio }

describe('versaoDoVideo', () => {
  it('o design gravado e a página salva dele dão a mesma versão', () => {
    // A página como o autosave a grava: camadas canonicalizadas pelo PATCH, fundo string, áudio.
    const salva = { width: 1080, height: 1920, background: '#000000', layers: canonicalizeLayersForPersistence(camadas), audio }
    expect(versaoDoVideo(paginaDoDesign(design)!)).toBe(versaoDoVideo(salva))
  })

  it('música muda a versão', () => {
    const outra = { ...design, audio: { ...audio, musicId: 4 } }
    expect(versaoDoVideo(paginaDoDesign(outra)!)).not.toBe(versaoDoVideo(paginaDoDesign(design)!))
    const semMusica = { ...design, audio: null }
    expect(versaoDoVideo(paginaDoDesign(semMusica)!)).not.toBe(versaoDoVideo(paginaDoDesign(design)!))
  })

  it('a ordem das chaves não muda a versão', () => {
    const reordenado = {
      audio: Object.fromEntries(Object.entries(audio).reverse()),
      layers: camadas.map((c) => Object.fromEntries(Object.entries(c).reverse())),
      canvas: { backgroundColor: '#000000', height: 1920, width: 1080 },
    }
    expect(versaoDoVideo(paginaDoDesign(reordenado)!)).toBe(versaoDoVideo(paginaDoDesign(design)!))
  })

  it('camada mexida muda a versão; camadas ilegíveis não têm versão', () => {
    const mexido = { ...design, layers: [camadas[0], { ...camadas[1], content: 'Olá' }] }
    expect(versaoDoVideo(paginaDoDesign(mexido)!)).not.toBe(versaoDoVideo(paginaDoDesign(design)!))
    expect(versaoDoVideo({ width: 1080, height: 1920, layers: 'lixo{' })).toBeNull()
  })
})
