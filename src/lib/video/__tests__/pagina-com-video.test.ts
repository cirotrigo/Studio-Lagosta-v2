import { describe, expect, it } from 'vitest'
import { videoNaPagina } from '../pagina-com-video'

const foto = { id: 'foto', type: 'image' }
const texto = { id: 'titulo', type: 'text', content: 'Happy hour' }
const video = { id: 'video', type: 'video', videoMetadata: { loop: true } }
const motion = { id: 'motion', type: 'video', videoMetadata: { overlay: true } }

describe('a página pode virar post como imagem?', () => {
  it('vídeo visível: não', () => {
    expect(videoNaPagina([foto, video, texto])).toBe('tem-video')
    // `visible` ausente é visível — é o default de quase toda camada
    expect(videoNaPagina([{ ...video, visible: true }])).toBe('tem-video')
  })

  it('só motion sobre foto também é vídeo: o JPEG perderia a animação', () => {
    expect(videoNaPagina([foto, motion])).toBe('tem-video')
  })

  it('vídeo OCULTO não conta: ele não entra na imagem', () => {
    expect(videoNaPagina([foto, { ...video, visible: false }, texto])).toBe('sem-video')
    expect(videoNaPagina([foto, { ...motion, visible: false }])).toBe('sem-video')
    // um oculto e um visível: o visível decide
    expect(videoNaPagina([{ ...video, visible: false }, motion])).toBe('tem-video')
  })

  it('sem vídeo (ou sem camada nenhuma): sim', () => {
    expect(videoNaPagina([foto, texto])).toBe('sem-video')
    expect(videoNaPagina([])).toBe('sem-video')
    expect(videoNaPagina('[]')).toBe('sem-video')
  })

  it('lê Page.layers nas três codificações do banco', () => {
    const camadas = [foto, video]
    expect(videoNaPagina(JSON.stringify(camadas))).toBe('tem-video')
    expect(videoNaPagina(JSON.stringify(JSON.stringify(camadas)))).toBe('tem-video')
    expect(videoNaPagina(JSON.stringify(JSON.stringify([foto, texto])))).toBe('sem-video')
  })

  it('camadas ilegíveis NÃO viram "sem vídeo"', () => {
    expect(videoNaPagina(null)).toBe('ilegivel')
    expect(videoNaPagina(undefined)).toBe('ilegivel')
    expect(videoNaPagina('[{"type":"video"')).toBe('ilegivel')
    expect(videoNaPagina({ type: 'video' })).toBe('ilegivel')
  })

  it('entrada nula no array não derruba a leitura', () => {
    expect(videoNaPagina([null, foto])).toBe('sem-video')
    expect(videoNaPagina([null, video])).toBe('tem-video')
  })
})
