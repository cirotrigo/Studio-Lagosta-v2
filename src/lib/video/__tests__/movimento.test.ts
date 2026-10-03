import { describe, expect, it } from 'vitest'
import {
  DESLIZE_DO_MOVIMENTO,
  ESCALA_DO_MOVIMENTO,
  progressoDoMovimento,
  QUADRO_ANOTADO,
  QUADRO_PARADO,
  quadroAnotado,
  quadroDoMovimento,
} from '../movimento'
import { camadasNoInstante, linhaDoTempo, problemasDosClipes } from '../linha-do-tempo'

const foto = (id: string, order: number, extra: Record<string, unknown> = {}) => ({
  id, type: 'image', order, position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 }, ...extra,
})
const musica = { source: 'library', musicId: 1, startTime: 0, endTime: 10 }

describe('quadroDoMovimento', () => {
  it('aproximar vai de 1 a 1,15; afastar faz o caminho inverso; nenhum desloca', () => {
    expect(quadroDoMovimento('aproximar', 0)).toEqual({ escala: 1, deslocamentoX: 0 })
    expect(quadroDoMovimento('aproximar', 1).escala).toBeCloseTo(ESCALA_DO_MOVIMENTO)
    expect(quadroDoMovimento('afastar', 0).escala).toBeCloseTo(ESCALA_DO_MOVIMENTO)
    expect(quadroDoMovimento('afastar', 1).escala).toBeCloseTo(1)
    expect(quadroDoMovimento('afastar', 0.5).deslocamentoX).toBe(0)
  })

  it('deslizar fica em 1,15 e anda 13% da largura, da esquerda para a direita, dentro da sobra', () => {
    const ini = quadroDoMovimento('deslizar', 0)
    const fim = quadroDoMovimento('deslizar', 1)
    expect(ini.escala).toBe(ESCALA_DO_MOVIMENTO)
    expect(fim.escala).toBe(ESCALA_DO_MOVIMENTO)
    expect(fim.deslocamentoX - ini.deslocamentoX).toBeCloseTo(2 * DESLIZE_DO_MOVIMENTO)
    expect(ini.deslocamentoX).toBeLessThan(0)
    // O conteúdo sempre cobre a caixa: o deslize nunca passa da sobra da escala
    expect(DESLIZE_DO_MOVIMENTO).toBeLessThan((ESCALA_DO_MOVIMENTO - 1) / 2)
  })

  it('suavização leve: o meio é o meio, e a curva anda devagar nas pontas', () => {
    expect(quadroDoMovimento('aproximar', 0.5).escala).toBeCloseTo(1.075)
    const passoNaPonta = quadroDoMovimento('aproximar', 0.1).escala - 1
    const passoNoMeio = quadroDoMovimento('aproximar', 0.55).escala - quadroDoMovimento('aproximar', 0.45).escala
    expect(passoNaPonta).toBeLessThan(passoNoMeio)
  })

  it('progresso fora de [0, 1] é preso; movimento ausente ou inválido é parado', () => {
    expect(quadroDoMovimento('aproximar', -3)).toEqual(quadroDoMovimento('aproximar', 0))
    expect(quadroDoMovimento('aproximar', 9)).toEqual(quadroDoMovimento('aproximar', 1))
    expect(quadroDoMovimento('aproximar', Number.NaN)).toEqual(quadroDoMovimento('aproximar', 0))
    expect(quadroDoMovimento(undefined, 0.5)).toEqual(QUADRO_PARADO)
    expect(quadroDoMovimento('girar', 0.5)).toEqual(QUADRO_PARADO)
  })
})

describe('progressoDoMovimento', () => {
  it('clipe anda dentro do próprio intervalo, preso antes e depois', () => {
    const layers = [foto('a', 0, { clipe: { duracao: 2 } }), foto('b', 1, { clipe: { duracao: 4 } })]
    const linha = linhaDoTempo(layers, null)
    expect(progressoDoMovimento({ id: 'b' }, linha, 1)).toBe(0)
    expect(progressoDoMovimento({ id: 'b' }, linha, 2)).toBe(0)
    expect(progressoDoMovimento({ id: 'b' }, linha, 4)).toBeCloseTo(0.5)
    expect(progressoDoMovimento({ id: 'b' }, linha, 6)).toBe(1)
    expect(progressoDoMovimento({ id: 'b' }, linha, 99)).toBe(1)
  })

  it('foto fora da sequência anda a página inteira; sem duração, fica no começo', () => {
    const layers = [foto('fundo', 0)]
    const linha = linhaDoTempo(layers, musica)
    expect(linha.duracao).toBe(10)
    expect(progressoDoMovimento({ id: 'fundo' }, linha, 2.5)).toBeCloseTo(0.25)
    expect(progressoDoMovimento({ id: 'fundo' }, linhaDoTempo(layers, null), 2.5)).toBe(0)
  })
})

describe('camadasNoInstante com movimento', () => {
  it('em página-vídeo anota o quadro só na foto em movimento', () => {
    const layers = [foto('fundo', 0, { movimento: 'afastar' }), foto('logo', 1), { id: 't', type: 'text', order: 2 }]
    const [fundo, logo, texto] = camadasNoInstante(layers, 0, { audio: musica })
    expect(quadroAnotado(fundo)).toEqual(quadroDoMovimento('afastar', 0))
    expect(QUADRO_ANOTADO in logo).toBe(false)
    expect(QUADRO_ANOTADO in texto).toBe(false)
    // O original não é tocado (o campo nunca chega ao banco)
    expect(QUADRO_ANOTADO in layers[0]).toBe(false)
  })

  it('sem áudio a decisão olha a página inteira: a sequência é vídeo mesmo antes de virar o clipe ativo', () => {
    const layers = [
      foto('a', 0, { clipe: {}, movimento: 'aproximar' }),
      foto('b', 1, { clipe: {}, movimento: 'deslizar' }),
    ]
    const em0 = camadasNoInstante(layers, 0)
    expect(em0.map((l) => l.id)).toEqual(['a'])
    expect(quadroAnotado(em0[0])).toEqual(quadroDoMovimento('aproximar', 0))
    const em4 = camadasNoInstante(layers, 4)
    expect(em4.map((l) => l.id)).toEqual(['b'])
    expect(quadroAnotado(em4[0])).toEqual(quadroDoMovimento('deslizar', 1 / 3))
  })

  it('página que não é vídeo (sem música nem sequência) não ganha movimento', () => {
    const [fundo] = camadasNoInstante([foto('fundo', 0, { movimento: 'aproximar' })], 0, { audio: null })
    expect(quadroAnotado(fundo)).toBeNull()
  })

  it('só foto se mexe: logo com movimento não é anotada', () => {
    const [logo] = camadasNoInstante([{ ...foto('l', 0, { movimento: 'aproximar' }), type: 'logo' }], 0, { audio: musica })
    expect(quadroAnotado(logo)).toBeNull()
  })
})

describe('problemasDosClipes — movimento', () => {
  it('recusa valor fora da lista; aceita os três, ausente e null', () => {
    expect(problemasDosClipes([foto('a', 0, { movimento: 'girar', name: 'Fundo' })])).toEqual([
      'A camada "Fundo" tem um movimento inválido (girar): vale aproximar, afastar, deslizar.',
    ])
    for (const movimento of ['aproximar', 'afastar', 'deslizar', null, undefined]) {
      expect(problemasDosClipes([foto('a', 0, { movimento })])).toEqual([])
    }
  })
})
