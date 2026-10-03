import { describe, expect, it } from 'vitest'
import { passoDoMotion, passoDoVideo } from '../camadas-de-video'

const video = (over: Partial<Parameters<typeof passoDoVideo>[1]> = {}) => ({
  tempo: 0,
  inicio: 2,
  fim: 6,
  pausado: true,
  readyState: 4,
  seeking: false,
  ...over,
})

describe('passoDoVideo', () => {
  it('relógio parado: o quadro é o do instante da página (0 = início do trecho)', () => {
    expect(passoDoVideo({ t: 0, tocando: false }, video({ tempo: 2 }))).toEqual({ aguardando: false })
    expect(passoDoVideo({ t: 1, tocando: false }, video({ tempo: 2 }))).toEqual({ irPara: 3, aguardando: false })
    expect(passoDoVideo({ t: 0, tocando: false }, video({ tempo: 2, pausado: false }))).toEqual({
      pausar: true,
      aguardando: false,
    })
  })

  it('relógio tocando: toca de onde está quando o desvio é pequeno; reposiciona quando é grande', () => {
    expect(passoDoVideo({ t: 1, tocando: true }, video({ tempo: 3.1 }))).toEqual({ tocar: true, aguardando: false })
    expect(passoDoVideo({ t: 1, tocando: true }, video({ tempo: 3.1, pausado: false }))).toEqual({ aguardando: false })
    expect(passoDoVideo({ t: 1, tocando: true }, video({ tempo: 2 }))).toEqual({
      irPara: 3,
      tocar: true,
      aguardando: false,
    })
    expect(passoDoVideo({ t: 1, tocando: true }, video({ tempo: 2, pausado: false }))).toEqual({
      irPara: 3,
      aguardando: false,
    })
  })

  it('na janela de uma transição: o que sai segura o último quadro, o que entra espera parado no início', () => {
    // Os dois lados recebem o relógio LOCAL como o VideoNode e o export o montam:
    // { t: max(0, tLocal), tocando: tocando && tLocal >= 0 }. Trecho 2–6 s.
    // Sai: 0,2 s depois do corte (tLocal 4,2 > os 4 s do trecho)
    expect(passoDoVideo({ t: 4.2, tocando: true }, video({ tempo: 5.97, pausado: false }))).toEqual({
      pausar: true,
      aguardando: false,
    })
    // Entra: 0,2 s antes do corte (tLocal −0,2) — parado no início do trecho
    expect(passoDoVideo({ t: 0, tocando: false }, video({ tempo: 2 }))).toEqual({ aguardando: false })
    expect(passoDoVideo({ t: 0, tocando: false }, video({ tempo: 2.5, pausado: false }))).toEqual({
      pausar: true,
      irPara: 2,
      aguardando: false,
    })
  })

  it('passado o fim do trecho, segura o último quadro', () => {
    expect(passoDoVideo({ t: 10, tocando: true }, video({ tempo: 5.98, pausado: false }))).toEqual({
      pausar: true,
      aguardando: false,
    })
    expect(passoDoVideo({ t: 10, tocando: true }, video({ tempo: 2 }))).toEqual({
      irPara: 5.96,
      aguardando: false,
    })
  })

  it('aguardando: sem o quadro decodificado ou no meio de um seek', () => {
    expect(passoDoVideo({ t: 0, tocando: false }, video({ tempo: 2, readyState: 1 })).aguardando).toBe(true)
    expect(passoDoVideo({ t: 0, tocando: false }, video({ tempo: 2, seeking: true })).aguardando).toBe(true)
    // sem readyState informado (elemento falso) conta como pronto
    expect(passoDoVideo({ t: 0, tocando: false }, { tempo: 2, inicio: 2, fim: 6, pausado: true }).aguardando).toBe(false)
  })

  it('passoDoMotion continua sendo o caso do vídeo principal como relógio', () => {
    // principal em 5 com trecho começando em 2 → t = 3 da página
    expect(
      passoDoMotion({ tempo: 5, inicio: 2, pausado: false }, { tempo: 0, inicio: 0, fim: 10, pausado: true }),
    ).toEqual({ irPara: 3, tocar: true })
    expect(
      passoDoMotion({ tempo: 5, inicio: 2, pausado: true }, { tempo: 3, inicio: 0, fim: 10, pausado: true }),
    ).toEqual({})
  })
})
