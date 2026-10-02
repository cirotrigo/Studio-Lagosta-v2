import { describe, expect, it } from 'vitest'
import { planoDeSom, volumeEm } from '../plano-de-som'

const urls = { original: 'o.mp3', instrumental: 'i.mp3', vocals: null }
const trilha = { source: 'library', musicId: 7, startTime: 10, endTime: 25, volume: 60 }

describe('planoDeSom', () => {
  it('sem trilha, sem fatia ou sem arquivo não há som', () => {
    expect(planoDeSom({ duracao: 12 }, null, urls)).toBeNull()
    expect(planoDeSom({ duracao: 12 }, { source: 'original', musicId: 7 }, urls)).toBeNull()
    expect(planoDeSom({ duracao: 12 }, { ...trilha, endTime: 10 }, urls)).toBeNull()
    expect(planoDeSom({ duracao: 12 }, trilha, { original: null })).toBeNull()
  })

  it('a música começa no startTime e dura o menor entre a fatia e a página', () => {
    expect(planoDeSom({ duracao: 12 }, trilha, urls)).toEqual({
      src: 'o.mp3',
      inicio: 10,
      duracao: 12,
      volume: 0.6,
      fadeIn: 0,
      fadeOut: 0,
    })
    expect(planoDeSom({ duracao: null }, trilha, urls)?.duracao).toBe(15)
    expect(planoDeSom({ duracao: 30 }, trilha, urls)?.duracao).toBe(15)
  })

  it('a versão pedida cai na original quando o stem não existe; no mix vale volumeMusic', () => {
    expect(planoDeSom({ duracao: 12 }, { ...trilha, audioVersion: 'instrumental' }, urls)?.src).toBe('i.mp3')
    expect(planoDeSom({ duracao: 12 }, { ...trilha, audioVersion: 'vocals' }, urls)?.src).toBe('o.mp3')
    expect(planoDeSom({ duracao: 12 }, { ...trilha, source: 'mix', volumeMusic: 30 }, urls)?.volume).toBe(0.3)
  })

  it('volumeEm aplica os fades nas pontas', () => {
    const plano = planoDeSom(
      { duracao: 10 },
      { ...trilha, volume: 100, fadeIn: true, fadeInDuration: 2, fadeOut: true, fadeOutDuration: 1 },
      urls,
    )!
    expect(volumeEm(plano, 0)).toBe(0)
    expect(volumeEm(plano, 1)).toBeCloseTo(0.5)
    expect(volumeEm(plano, 5)).toBe(1)
    expect(volumeEm(plano, 9.5)).toBeCloseTo(0.5)
    expect(volumeEm(plano, 10)).toBe(0)
  })
})

// ── Fase 4: de onde sai o som original ──────────────────────────────────────
import { trechosDeVideo, trechosOriginais } from '../plano-de-som'

const foto = (id: string, order: number, duracao?: number) => ({
  id, type: 'image', order, ...(duracao !== undefined ? { clipe: { duracao } } : {}),
})
const video = (id: string, order: number, meta: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id, type: 'video', order, fileUrl: `https://x/${id}.mp4`, videoMetadata: meta, ...extra,
})

describe('trechosDeVideo / trechosOriginais (Fase 4)', () => {
  it('página legada: o vídeo de base em 0, com o trim dele — o comando de sempre', () => {
    const layers = [video('v', 0, { duration: 6, trimStart: 1, trimEnd: 4 })]
    expect(trechosDeVideo(layers)).toEqual([{ id: 'v', fileUrl: 'https://x/v.mp4', trimStart: 1, inicio: 0, duracao: 3 }])
    // Duração desconhecida fica 0 (o `-t` do export corta) e o trecho continua valendo
    expect(trechosDeVideo([video('v', 0, { trimStart: 2 })])).toEqual([
      { id: 'v', fileUrl: 'https://x/v.mp4', trimStart: 2, inicio: 0, duracao: 0 },
    ])
  })

  it('sequência: cada clipe de vídeo na posição dele; foto e motion não têm som', () => {
    const layers = [
      foto('a', 0, 2),
      video('v1', 1, { duration: 5, trimStart: 1, trimEnd: 3 }, { clipe: {} }),
      video('m', 2, { duration: 2, overlay: true }, { clipe: {} }),
      video('v2', 3, { duration: 4 }, { clipe: {} }),
    ]
    expect(trechosDeVideo(layers)).toEqual([
      { id: 'v1', fileUrl: 'https://x/v1.mp4', trimStart: 1, inicio: 2, duracao: 2 },
      { id: 'v2', fileUrl: 'https://x/v2.mp4', trimStart: 0, inicio: 6, duracao: 4 },
    ])
    // Motion sobre foto: nenhum som original
    expect(trechosDeVideo([{ id: 'f', type: 'image', order: 0 }, video('m', 1, { duration: 2, overlay: true })])).toEqual([])
    // Vídeo sem arquivo não entra
    expect(trechosDeVideo([{ ...video('v', 0, { duration: 3 }, { clipe: {} }), fileUrl: undefined }])).toEqual([])
  })

  it('só toca com a trilha em original/mix, e para onde a página para (a música pode encurtá-la)', () => {
    const layers = [foto('a', 0, 2), video('v1', 1, { duration: 4 }, { clipe: {} }), video('v2', 2, { duration: 4 }, { clipe: {} })]
    expect(trechosOriginais(layers, { source: 'library', musicId: 1 })).toEqual([])
    expect(trechosOriginais(layers, { source: 'mute' })).toEqual([])
    expect(trechosOriginais(layers, null)).toEqual([])
    expect(trechosOriginais(layers, { source: 'original' })).toEqual(trechosDeVideo(layers))
    // Música de 7 s numa página de 10 s: o 2º clipe (6–10) é cortado em 7, o 1º fica inteiro
    const cortados = trechosOriginais(layers, { source: 'mix', musicId: 1, startTime: 0, endTime: 7 })
    expect(cortados).toEqual([
      { id: 'v1', fileUrl: 'https://x/v1.mp4', trimStart: 0, inicio: 2, duracao: 4 },
      { id: 'v2', fileUrl: 'https://x/v2.mp4', trimStart: 0, inicio: 6, duracao: 1 },
    ])
    // Música que acaba antes do clipe: o clipe sai da lista
    expect(trechosOriginais(layers, { source: 'mix', musicId: 1, startTime: 0, endTime: 5 }).map((t) => t.id)).toEqual(['v1'])
  })
})
