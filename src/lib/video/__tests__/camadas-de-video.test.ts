import { describe, expect, it } from 'vitest'
import {
  caixaDoMotion,
  DESVIO_TOLERADO_DO_MOTION,
  duracaoDoExport,
  ehMotion,
  fatiaDaMusica,
  pareceMotion,
  passoDoMotion,
  trechoDoVideo,
  videoDeBase,
  videoPrincipal,
  videosDaPagina,
} from '../camadas-de-video'

const foto = { id: 'foto', type: 'image' }
const video = { id: 'video', type: 'video', videoMetadata: { loop: true } }
const outroVideo = { id: 'video-2', type: 'video' }
const motion = { id: 'motion', type: 'video', videoMetadata: { overlay: true } }
const motion2 = { id: 'motion-2', type: 'video', videoMetadata: { overlay: true } }

describe('quem é o vídeo da página', () => {
  it('motion é só a camada de vídeo marcada como overlay', () => {
    expect(ehMotion(motion)).toBe(true)
    expect(ehMotion(video)).toBe(false)
    expect(ehMotion({ type: 'image', videoMetadata: { overlay: true } })).toBe(false)
    expect(ehMotion(null)).toBe(false)
  })

  it('o vídeo de base é o primeiro vídeo que não é motion, em qualquer ordem', () => {
    expect(videoDeBase([foto, motion, video, outroVideo])).toBe(video)
    expect(videoDeBase([foto, video, motion])).toBe(video)
  })

  it('página legada com dois vídeos comuns: vale o primeiro', () => {
    expect(videoPrincipal([video, outroVideo])).toBe(video)
  })

  it('motion sobre foto: não há base, e o principal é o primeiro motion', () => {
    expect(videoDeBase([foto, motion, motion2])).toBeNull()
    expect(videoPrincipal([foto, motion, motion2])).toBe(motion)
  })

  it('com vídeo de base, o principal é a base mesmo com o motion antes na lista', () => {
    expect(videoPrincipal([motion, foto, video])).toBe(video)
  })

  it('vídeo OCULTO não participa: não dita duração nem som', () => {
    const baseOculta = { ...video, visible: false }
    expect(videosDaPagina([baseOculta, motion])).toEqual([motion])
    expect(videoDeBase([baseOculta, motion])).toBeNull()
    expect(videoPrincipal([baseOculta, motion])).toBe(motion)
    expect(videoPrincipal([baseOculta, outroVideo])).toBe(outroVideo)
    expect(videoPrincipal([baseOculta])).toBeNull()
  })

  it('página sem vídeo, lista nula ou ausente', () => {
    expect(videoPrincipal([foto])).toBeNull()
    expect(videoDeBase(null)).toBeNull()
    expect(videoPrincipal(undefined)).toBeNull()
  })

  it('sugere motion pela extensão .webm, no nome e na URL', () => {
    expect(pareceMotion('TERO-story-camarao-motion.webm')).toBe(true)
    expect(pareceMotion('https://x.public.blob.vercel-storage.com/uploads/u/drive-1-logo.WEBM?download=1')).toBe(true)
    expect(pareceMotion('clipe.mp4')).toBe(false)
    expect(pareceMotion('webm-teste.mov')).toBe(false)
    expect(pareceMotion(null)).toBe(false)
  })
})

describe('trecho e duração do export', () => {
  it('sem corte: do início ao fim do arquivo', () => {
    expect(trechoDoVideo({ duration: 12 })).toEqual({ inicio: 0, duracao: 12 })
  })

  it('com corte de início e de fim', () => {
    expect(trechoDoVideo({ duration: 12, trimStart: 2, trimEnd: 7.5 })).toEqual({ inicio: 2, duracao: 5.5 })
    expect(trechoDoVideo({ duration: 12, trimStart: 2 })).toEqual({ inicio: 2, duracao: 10 })
  })

  it('duração ainda não gravada na camada: usa a do elemento, e sem nenhuma devolve null', () => {
    expect(trechoDoVideo({}, 8)).toEqual({ inicio: 0, duracao: 8 })
    expect(trechoDoVideo({}, Number.NaN)).toEqual({ inicio: 0, duracao: null })
    expect(trechoDoVideo(null)).toEqual({ inicio: 0, duracao: null })
  })

  it('a fatia da música só conta quando há música escolhida', () => {
    expect(fatiaDaMusica({ source: 'library', musicId: 3, startTime: 10, endTime: 18 })).toBe(8)
    expect(fatiaDaMusica({ source: 'mix', musicId: 3, startTime: 0, endTime: 5 })).toBe(5)
    expect(fatiaDaMusica({ source: 'original', startTime: 0, endTime: 10 })).toBeNull()
    expect(fatiaDaMusica({ source: 'library', startTime: 0, endTime: 10 })).toBeNull()
    expect(fatiaDaMusica({ source: 'library', musicId: 3, startTime: 5, endTime: 5 })).toBeNull()
    expect(fatiaDaMusica(null)).toBeNull()
  })

  it('o export dura o MENOR entre o trecho do vídeo e a fatia da música', () => {
    const musica = { source: 'library', musicId: 3, startTime: 10, endTime: 18 }
    expect(duracaoDoExport(12, musica)).toBe(8)
    expect(duracaoDoExport(5, musica)).toBe(5)
    expect(duracaoDoExport(12, { source: 'original' })).toBe(12)
    expect(duracaoDoExport(null, musica)).toBe(8)
    expect(duracaoDoExport(null, null)).toBeNull()
  })
})

describe('o motion acompanha o relógio do vídeo principal', () => {
  const motionDe = (tempo: number, pausado = false) => ({ tempo, inicio: 0, fim: 4, pausado })

  it('tocando junto, dentro da tolerância: não faz nada', () => {
    expect(passoDoMotion({ tempo: 2, inicio: 0, pausado: false }, motionDe(2.1))).toEqual({})
  })

  it('desviou além da tolerância: reposiciona', () => {
    const desvio = DESVIO_TOLERADO_DO_MOTION + 0.2
    expect(passoDoMotion({ tempo: 2, inicio: 0, pausado: false }, motionDe(2 + desvio))).toEqual({ irPara: 2 })
  })

  it('carregou depois da base: entra no tempo dela, tocando', () => {
    expect(passoDoMotion({ tempo: 3, inicio: 0, pausado: false }, motionDe(0, true))).toEqual({
      irPara: 3,
      tocar: true,
    })
  })

  it('a base tem corte de início: o motion conta a partir do início do trecho dela', () => {
    expect(passoDoMotion({ tempo: 6.5, inicio: 5, pausado: false }, motionDe(0, true))).toEqual({
      irPara: 1.5,
      tocar: true,
    })
  })

  it('o motion tem corte próprio: começa no início do trecho dele', () => {
    const cortado = { tempo: 0, inicio: 1, fim: 4, pausado: true }
    expect(passoDoMotion({ tempo: 0, inicio: 0, pausado: false }, cortado)).toEqual({ irPara: 1, tocar: true })
  })

  it('a base pausou (ou o autoplay dela está desligado): o motion para no mesmo instante', () => {
    expect(passoDoMotion({ tempo: 2, inicio: 0, pausado: true }, motionDe(2.2))).toEqual({
      pausar: true,
      irPara: 2,
    })
    expect(passoDoMotion({ tempo: 2, inicio: 0, pausado: true }, motionDe(2, true))).toEqual({})
  })

  it('a base deu a volta no loop: o motion volta ao começo', () => {
    expect(passoDoMotion({ tempo: 0.05, inicio: 0, pausado: false }, motionDe(3.9, true))).toEqual({
      irPara: 0.05,
      tocar: true,
    })
  })

  it('o motion chegou ao fim um pouco antes do relógio: segura, sem alternar tocar e pausar', () => {
    expect(passoDoMotion({ tempo: 3.8, inicio: 0, pausado: false }, motionDe(3.97))).toEqual({ pausar: true })
    expect(passoDoMotion({ tempo: 3.8, inicio: 0, pausado: false }, motionDe(3.97, true))).toEqual({})
  })

  it('a base é mais longa que o motion: ele para e segura o último quadro', () => {
    const passo = passoDoMotion({ tempo: 9, inicio: 0, pausado: false }, motionDe(3.2))
    expect(passo.pausar).toBe(true)
    expect(passo.irPara).toBeCloseTo(3.96)
    // já parado no último quadro: nada a fazer (não fica dando seek a cada quadro)
    expect(passoDoMotion({ tempo: 9, inicio: 0, pausado: false }, motionDe(3.96, true))).toEqual({})
  })
})

describe('a caixa em que o motion entra na página', () => {
  const story = { width: 1080, height: 1920 }

  it('motion na proporção da página cobre a página inteira', () => {
    expect(caixaDoMotion({ width: 1080, height: 1920 }, story)).toEqual({ size: story, position: { x: 0, y: 0 } })
    expect(caixaDoMotion({ width: 720, height: 1280 }, story).size).toEqual(story)
  })

  it('logo animada 1:1 entra solta, quadrada, com um terço da largura e no centro', () => {
    expect(caixaDoMotion({ width: 1080, height: 1080 }, story)).toEqual({
      size: { width: 360, height: 360 },
      position: { x: 360, y: 780 },
    })
  })

  it('motion alto e estreito fora da proporção cabe em um terço da altura', () => {
    const { size } = caixaDoMotion({ width: 200, height: 1000 }, { width: 1080, height: 1080 })
    expect(size).toEqual({ width: 72, height: 360 })
  })

  it('sem medida do vídeo, vale a página inteira', () => {
    expect(caixaDoMotion(null, story).size).toEqual(story)
    expect(caixaDoMotion({ width: 0, height: 0 }, story).size).toEqual(story)
  })
})
