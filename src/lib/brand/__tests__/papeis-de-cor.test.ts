import { describe, expect, it } from 'vitest'
import { PAPEIS_DE_COR } from '@/lib/compositor/arquetipos/tipos'
import { hexValido } from '@/lib/creatives/halo/fundo-de-texto'
import { PAPEIS_DA_MARCA, resolverCorDaMarca, type CorDoPapel, type DadosDaMarca, type PapelDaMarca } from '../papeis-de-cor'

const todos = (dados: DadosDaMarca) =>
  Object.fromEntries(PAPEIS_DA_MARCA.map((p) => [p, resolverCorDaMarca(p, dados)])) as Record<PapelDaMarca, CorDoPapel>

/** Paleta sem nome de papel: escuro e claro saem pela luz, o destaque pela cor mais viva. */
const PALETA = [
  { name: 'Vermelho', hexCode: '#860125' },
  { name: 'Laranja', hexCode: '#FA5701' },
  { name: 'Amarelo', hexCode: '#FFB154' },
]

describe('resolverCorDaMarca — a cor de cada papel para um vetor (CP-V2a)', () => {
  it('carrega sem DATABASE_URL: o vitest.setup apaga a variável, e um import do banco lançaria', () => {
    expect(process.env.DATABASE_URL).toBeUndefined()
    expect(resolverCorDaMarca('escuro', { paleta: [], assinaturaCrua: null }).hex).toBe('#111111')
  })

  it('sem assinatura e sem paleta: os padrões, com a fonte "padrao"', () => {
    const padrao = { hex: '#111111', fonte: 'padrao' }
    expect(todos({ paleta: [], assinaturaCrua: null })).toEqual({
      escuro: padrao,
      claro: { hex: '#ffffff', fonte: 'padrao' },
      destaque: padrao,
      destaque2: padrao,
      texto: padrao,
    })
  })

  it('sem assinatura: escuro e claro pela luz, destaque pela mais viva da paleta', () => {
    expect(todos({ paleta: PALETA, assinaturaCrua: null })).toEqual({
      escuro: { hex: '#860125', fonte: 'paleta.luz' },
      claro: { hex: '#ffb154', fonte: 'paleta.luz' },
      destaque: { hex: '#fa5701', fonte: 'paleta.viva' },
      destaque2: { hex: '#fa5701', fonte: 'paleta.viva' },
      texto: { hex: '#860125', fonte: 'paleta.luz' },
    })
  })

  it('assinatura crua: fundo antes de mancha (D2); destaque e alternativa normalizados pelo hexValido', () => {
    const r = todos({ paleta: PALETA, assinaturaCrua: { fundo: '#0B1D3A', mancha: '#000000', destaque: { fill: '#FFC400', alternativa: '#FFF' } } })
    expect(r.escuro).toEqual({ hex: '#0b1d3a', fonte: 'assinatura.fundo' })
    expect(r.texto).toEqual(r.escuro) // D1
    expect(r.destaque).toEqual({ hex: '#ffc400', fonte: 'assinatura.destaque.fill' })
    expect(r.destaque2).toEqual({ hex: '#ffffff', fonte: 'assinatura.destaque.alternativa' })
    expect(r.claro).toEqual({ hex: '#ffb154', fonte: 'paleta.luz' }) // a assinatura não tem claro
    expect(resolverCorDaMarca('escuro', { paleta: PALETA, assinaturaCrua: { mancha: '#141414' } })).toEqual({ hex: '#141414', fonte: 'assinatura.mancha' })
  })

  it('valor que não é hex na assinatura é ignorado, e o passo seguinte decide', () => {
    const r = todos({ paleta: PALETA, assinaturaCrua: { fundo: 'rgba(0, 0, 0, 1)', mancha: 'preto', destaque: { fill: 123, alternativa: '#12345' } } })
    expect(r.escuro).toEqual({ hex: '#860125', fonte: 'paleta.luz' })
    expect(r.destaque).toEqual({ hex: '#fa5701', fonte: 'paleta.viva' })
    expect(r.destaque2).toEqual(r.destaque)
    for (const crua of [undefined, [], 'texto', 42, { destaque: 'amarelo' }]) {
      expect(resolverCorDaMarca('destaque2', { paleta: PALETA, assinaturaCrua: crua })).toEqual({ hex: '#fa5701', fonte: 'paleta.viva' })
    }
  })

  it('assinatura nunca gravada não vira o #0B0B0B que a mescla do compositor põe no ausente', () => {
    for (const crua of [null, undefined, {}]) {
      expect(resolverCorDaMarca('escuro', { paleta: [], assinaturaCrua: crua })).toEqual({ hex: '#111111', fonte: 'padrao' })
    }
  })

  it('nome escuro vence a menor luz; "Fundo claro" é claro, não escuro; "Highlight" não é claro; nome ambíguo não decide', () => {
    const nomes = [
      { name: 'Azul escuro', hexCode: '#1F3A93' },
      { name: 'Grafite', hexCode: '#0A0A0A' },
    ]
    expect(resolverCorDaMarca('escuro', { paleta: nomes, assinaturaCrua: null })).toEqual({ hex: '#1f3a93', fonte: 'paleta.nome' })

    const fundoClaro = [
      { name: 'Fundo claro', hexCode: '#E8E2D0' },
      { name: 'Azul', hexCode: '#1F3A93' },
    ]
    expect(resolverCorDaMarca('escuro', { paleta: fundoClaro, assinaturaCrua: null })).toEqual({ hex: '#1f3a93', fonte: 'paleta.luz' })
    expect(resolverCorDaMarca('claro', { paleta: fundoClaro, assinaturaCrua: null })).toEqual({ hex: '#e8e2d0', fonte: 'paleta.nome' })

    const highlight = [
      { name: 'Highlight', hexCode: '#FFFFF0' },
      { name: 'Azul', hexCode: '#1F3A93' },
    ]
    expect(resolverCorDaMarca('claro', { paleta: highlight, assinaturaCrua: null })).toEqual({ hex: '#fffff0', fonte: 'paleta.luz' })

    const ambiguo = [{ name: 'Claro-escuro', hexCode: '#777777' }]
    expect(resolverCorDaMarca('escuro', { paleta: ambiguo, assinaturaCrua: null }).fonte).toBe('paleta.luz')
    expect(resolverCorDaMarca('claro', { paleta: ambiguo, assinaturaCrua: null }).fonte).toBe('paleta.luz')
  })

  it('a mais viva fica fora do escuro e do claro; um quase-preto não conta como vivo; sem viva, o destaque é o escuro', () => {
    const paleta = [
      { name: 'Preto', hexCode: '#000000' },
      { name: 'Vinho quase preto', hexCode: '#240000' }, // saturação HSV 1,0: seria o "destaque" numa conta por HSV
      { name: 'Branco', hexCode: '#FFFFFF' },
      { name: 'Azul', hexCode: '#3366CC' },
    ]
    expect(resolverCorDaMarca('escuro', { paleta, assinaturaCrua: null })).toEqual({ hex: '#000000', fonte: 'paleta.nome' })
    expect(resolverCorDaMarca('destaque', { paleta, assinaturaCrua: null })).toEqual({ hex: '#3366cc', fonte: 'paleta.viva' })

    const soEscuroEClaro = [
      { name: 'Preto', hexCode: '#000000' },
      { name: 'Branco', hexCode: '#FFFFFF' },
    ]
    expect(resolverCorDaMarca('destaque', { paleta: soEscuroEClaro, assinaturaCrua: null })).toEqual({ hex: '#000000', fonte: 'paleta.nome' })
  })

  it('o destaque nunca repete o escuro nem o claro, mesmo quando eles são as cores mais vivas', () => {
    const paleta = [
      { name: 'Vermelho escuro', hexCode: '#B00020' },
      { name: 'Rosa claro', hexCode: '#FF4FA0' },
      { name: 'Verde', hexCode: '#2E7D32' },
    ]
    expect(todos({ paleta, assinaturaCrua: null })).toMatchObject({
      escuro: { hex: '#b00020', fonte: 'paleta.nome' },
      claro: { hex: '#ff4fa0', fonte: 'paleta.nome' },
      destaque: { hex: '#2e7d32', fonte: 'paleta.viva' },
    })
  })

  it('item da paleta sem hex válido é ignorado', () => {
    const paleta = [
      { name: 'Azul', hexCode: 'azul' },
      { name: 'Vazio', hexCode: null },
      { hexCode: '#12345' },
      null,
      { name: 'Verde', hexCode: '#2E7D32' },
    ] as unknown as DadosDaMarca['paleta']
    expect(resolverCorDaMarca('escuro', { paleta, assinaturaCrua: null })).toEqual({ hex: '#2e7d32', fonte: 'paleta.luz' })
  })

  const CASOS: DadosDaMarca[] = [
    { paleta: PALETA, assinaturaCrua: null },
    { paleta: PALETA, assinaturaCrua: { fundo: '#0B1D3A', destaque: { alternativa: '#FFF' } } },
    {
      paleta: [
        { name: 'Preto', hexCode: '#000000' },
        { name: 'Vinho quase preto', hexCode: '#240000' },
        { name: 'Branco', hexCode: '#FFFFFF' },
        { name: 'Azul', hexCode: '#3366CC' },
        { name: 'Creme', hexCode: '#F3E9D2' },
      ],
      assinaturaCrua: { mancha: '#141414' },
    },
    { paleta: [{ name: 'Fundo claro', hexCode: '#E8E2D0' }, { name: 'Azul escuro', hexCode: '#1F3A93' }], assinaturaCrua: [] },
  ]

  it('a paleta em qualquer ordem dá a mesma resposta (DESC no cliente, ASC no servidor)', () => {
    for (const c of CASOS) {
      expect(todos({ ...c, paleta: [...c.paleta].reverse() })).toEqual(todos(c))
    }
  })

  it('a cor só sai da assinatura, da paleta ou dos padrões', () => {
    for (const c of CASOS) {
      const a = (c.assinaturaCrua ?? {}) as Record<string, unknown>
      const d = (a.destaque ?? {}) as Record<string, unknown>
      const permitidas = new Set(
        ['#111111', '#ffffff', a.fundo, a.mancha, d.fill, d.alternativa, ...c.paleta.map((p) => p.hexCode)].map(hexValido).filter(Boolean),
      )
      for (const cor of Object.values(todos(c))) expect(permitidas.has(cor.hex), cor.hex).toBe(true)
    }
  })

  it('os papéis de cor dos arquétipos (texto, destaque) estão entre os papéis da marca', () => {
    expect(PAPEIS_DE_COR.filter((p) => !(PAPEIS_DA_MARCA as readonly string[]).includes(p))).toEqual([])
  })
})
