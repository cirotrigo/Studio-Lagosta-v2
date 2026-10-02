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
