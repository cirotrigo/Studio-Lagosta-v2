import { describe, expect, it } from 'vitest'
import {
  camadasNoInstante,
  clipeAtivoEm,
  inserirClipe,
  janelaDaTransicao,
  linhaDoTempo,
  normalizarClipes,
  problemasDosClipes,
  quadroDosClipes,
} from '../linha-do-tempo'
import { duracaoDaPagina, paginaEVideo, videoDeBase } from '../camadas-de-video'
import { medirDefasagem } from '@/lib/compositor/defasagem'

const foto = (id: string, order: number, clipe?: { duracao?: number; transicao?: unknown }) => ({
  id, type: 'image', order, position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 }, ...(clipe ? { clipe } : {}),
})
const video = (id: string, order: number, meta: Record<string, unknown>, clipe?: { duracao?: number; transicao?: unknown }) => ({
  id, type: 'video', order, position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 }, videoMetadata: meta, ...(clipe ? { clipe } : {}),
})
const texto = (id: string, order: number) => ({ id, type: 'text', order, content: id, clipe: undefined as { duracao?: number } | undefined })
const musica = (startTime: number, endTime: number) => ({ source: 'library', musicId: 1, startTime, endTime })

describe('linhaDoTempo', () => {
  it('página sem clipe usa EXATAMENTE a conta legada (paridade)', () => {
    const layers = [video('v', 0, { duration: 6, trimStart: 1, trimEnd: 4 }), texto('t', 1)]
    const audio = musica(0, 20)
    const l = linhaDoTempo(layers, audio)
    expect(l.clipes).toEqual([])
    expect(l.total).toBeNull()
    expect(l.duracao).toBe(duracaoDaPagina(layers, audio))
    expect(l.duracao).toBe(3)
    expect(l.avisos).toEqual([])
  })

  it('fotos em sequência: padrão 3 s, cada uma começa onde a anterior acabou', () => {
    const l = linhaDoTempo([foto('a', 0, {}), foto('b', 1, { duracao: 2 }), texto('t', 2)], null)
    expect(l.clipes).toEqual([
      { id: 'a', tipo: 'foto', inicio: 0, duracao: 3, trimStart: 0 },
      { id: 'b', tipo: 'foto', inicio: 3, duracao: 2, trimStart: 0 },
    ])
    expect(l.total).toBe(5)
    expect(l.duracao).toBe(5)
  })

  it('vídeo com trim: a duração é a do trecho e o trimStart viaja no clipe', () => {
    const l = linhaDoTempo([foto('a', 0, { duracao: 2 }), video('v', 1, { duration: 6, trimStart: 1, trimEnd: 4 }, {})], null)
    expect(l.clipes[1]).toEqual({ id: 'v', tipo: 'video', inicio: 2, duracao: 3, trimStart: 1 })
    expect(l.total).toBe(5)
  })

  it('vídeo ainda sem duração conta 0 e avisa', () => {
    const l = linhaDoTempo([video('v', 0, {}, {})], null)
    expect(l.clipes[0].duracao).toBe(0)
    expect(l.avisos.join(' ')).toMatch(/carregando/)
    // a duração vem pelo mapa de vídeos montados
    expect(linhaDoTempo([video('v', 0, {}, {})], null, new Map([['v', 7]])).clipes[0].duracao).toBe(7)
  })

  it('música mais curta corta a duração final; mais longa não estica', () => {
    const layers = [foto('a', 0, { duracao: 4 }), foto('b', 1, { duracao: 4 })]
    expect(linhaDoTempo(layers, musica(0, 5)).duracao).toBe(5)
    expect(linhaDoTempo(layers, musica(0, 30)).duracao).toBe(8)
  })

  it('11º clipe em diante fica de fora, com aviso', () => {
    const layers = Array.from({ length: 11 }, (_, i) => foto(`f${i}`, i, { duracao: 1 }))
    const l = linhaDoTempo(layers, null)
    expect(l.clipes).toHaveLength(10)
    expect(l.total).toBe(10)
    expect(l.avisos.join(' ')).toMatch(/até 10 clipes/)
  })

  it('duração de foto fora da faixa é presa em [0,5; 60]', () => {
    const l = linhaDoTempo([foto('a', 0, { duracao: 0.1 }), foto('b', 1, { duracao: 999 })], null)
    expect(l.clipes.map((c) => c.duracao)).toEqual([0.5, 60])
  })

  it('clipe oculto não entra na sequência', () => {
    const l = linhaDoTempo([foto('a', 0, {}), { ...foto('b', 1, {}), visible: false }], null)
    expect(l.clipes.map((c) => c.id)).toEqual(['a'])
  })
})

describe('clipeAtivoEm / camadasNoInstante', () => {
  const layers = [foto('a', 0, { duracao: 2 }), foto('b', 1, { duracao: 1 }), texto('t', 2)]
  const { clipes } = linhaDoTempo(layers, null)

  it('escolhe o último clipe cujo início já passou; depois do fim segura o último', () => {
    expect(clipeAtivoEm(clipes, 0)!.id).toBe('a')
    expect(clipeAtivoEm(clipes, 1.99)!.id).toBe('a')
    expect(clipeAtivoEm(clipes, 2)!.id).toBe('b')
    expect(clipeAtivoEm(clipes, 99)!.id).toBe('b')
    expect(clipeAtivoEm([], 0)).toBeNull()
  })

  it('camadasNoInstante deixa só o clipe ativo e tudo que não é clipe', () => {
    expect(camadasNoInstante(layers, 0).map((l) => l.id)).toEqual(['a', 't'])
    expect(camadasNoInstante(layers, 2.5).map((l) => l.id)).toEqual(['b', 't'])
  })

  it('página sem clipe volta inteira', () => {
    const legado = [foto('a', 0), texto('t', 1)]
    expect(camadasNoInstante(legado, 5)).toEqual(legado)
  })
})

describe('normalizarClipes / inserirClipe', () => {
  it('põe os clipes contíguos no fundo, na ordem pedida, e renumera order', () => {
    const layers = [texto('t', 0), foto('a', 1, {}), foto('b', 2, {}), foto('c', 3, {})]
    const r = normalizarClipes(layers, ['c', 'a', 'b'])
    expect(r.map((l) => [l.id, l.order])).toEqual([['c', 0], ['a', 1], ['b', 2], ['t', 3]])
  })

  it('sem ids mantém a ordem atual e não reconstrói objeto cujo order já bate', () => {
    const layers = [foto('a', 0, {}), texto('t', 1)]
    const r = normalizarClipes(layers)
    expect(r[0]).toBe(layers[0])
    expect(r[1]).toBe(layers[1])
  })

  it('inserirClipe: o fundo existente vira clipe 1 e a nova entra em tela cheia no fim', () => {
    const canvas = { width: 1080, height: 1920 }
    const layers = [foto('fundo', 0), texto('t', 1)]
    const nova = { id: 'n', type: 'video', order: 0, position: { x: 100, y: 100 }, size: { width: 300, height: 200 }, videoMetadata: { duration: 2 } }
    const r = inserirClipe(layers, nova as never, canvas)
    expect(r.map((l) => l.id)).toEqual(['fundo', 'n', 't'])
    expect(r[0].clipe).toEqual({})
    expect(r[1]).toMatchObject({ clipe: {}, position: { x: 0, y: 0 }, size: canvas })
    expect(r.map((l) => l.order)).toEqual([0, 1, 2])
  })

  it('inserirClipe: imagem pequena no fundo não vira clipe', () => {
    const layers = [{ ...foto('mini', 0), size: { width: 200, height: 200 } }]
    const r = inserirClipe(layers, foto('n', 0) as never, { width: 1080, height: 1920 })
    expect(r.find((l) => l.id === 'mini')!.clipe).toBeUndefined()
  })
})

describe('paginaEVideo / videoDeBase com clipes', () => {
  it('duas fotos como clipe fazem a página ser vídeo mesmo sem vídeo nem música', () => {
    expect(paginaEVideo([foto('a', 0, {}), foto('b', 1, {})], null)).toBe(true)
    expect(paginaEVideo([foto('a', 0, {})], null)).toBe(false)
    expect(paginaEVideo([foto('a', 0)], null)).toBe(false)
  })

  it('sequência não tem vídeo de base (som original não entra)', () => {
    const layers = [video('v', 0, { duration: 3 }, {}), foto('a', 1, {})]
    expect(videoDeBase(layers)).toBeNull()
    expect(videoDeBase([video('v', 0, { duration: 3 })])).not.toBeNull()
  })
})

describe('transição entre clipes (Fase 3)', () => {
  const dois = (transicao?: string, da = 2, db = 2) =>
    linhaDoTempo([foto('a', 0, { duracao: da }), foto('b', 1, { duracao: db, ...(transicao ? { transicao } : {}) })], null)
      .clipes
  const so = (c: ReturnType<typeof dois>, t: number) => Object.fromEntries(quadroDosClipes(c, t))

  it('só do segundo clipe em diante, e só valor da lista', () => {
    const l = linhaDoTempo(
      [
        foto('a', 0, { duracao: 2, transicao: 'dissolver' }),
        foto('b', 1, { duracao: 2, transicao: 'deslizar' }),
        foto('c', 2, { duracao: 2, transicao: 'girar' }),
      ],
      null,
    )
    expect(l.clipes.map((c) => c.transicao)).toEqual([undefined, 'deslizar', undefined])
    expect(l.total).toBe(6) // a duração total não muda
  })

  it('janela de 0,5 s centrada no corte, presa a metade do clipe mais curto; corte e clipe sem duração não têm', () => {
    expect(janelaDaTransicao(dois('dissolver'), 1)).toEqual({ de: 1.75, ate: 2.25, duracao: 0.5 })
    expect(janelaDaTransicao(dois('deslizar', 0.5, 4), 1)).toEqual({ de: 0.375, ate: 0.625, duracao: 0.25 })
    expect(janelaDaTransicao(dois(), 1)).toBeNull()
    const carregando = linhaDoTempo([foto('a', 0, { duracao: 2 }), video('v', 1, {}, { transicao: 'deslizar' })], null)
    expect(janelaDaTransicao(carregando.clipes, 1)).toBeNull()
    // clipes mínimos com transição nas duas junções: as janelas não se encostam
    const tres = linhaDoTempo(
      [foto('a', 0, { duracao: 0.5 }), foto('b', 1, { duracao: 0.5, transicao: 'dissolver' }), foto('c', 2, { duracao: 0.5, transicao: 'deslizar' })],
      null,
    ).clipes
    expect(janelaDaTransicao(tres, 1)!.ate).toBeLessThanOrEqual(janelaDaTransicao(tres, 2)!.de)
  })

  it('fora das janelas (e nas bordas, abertas) só o clipe ativo aparece, inteiro; t = 0 nunca está numa', () => {
    const puro = (ativo: 'a' | 'b') => ({
      a: { visivel: ativo === 'a', opacidade: 1, deslocamentoX: 0 },
      b: { visivel: ativo === 'b', opacidade: 1, deslocamentoX: 0 },
    })
    for (const tr of [undefined, 'dissolver', 'deslizar']) {
      for (const t of [0, 1, 1.75]) expect(so(dois(tr), t)).toEqual(puro('a'))
      for (const t of [2.25, 3, 9]) expect(so(dois(tr), t)).toEqual(puro('b'))
    }
  })

  it('dissolver: o que entra (por cima) vai de transparente a opaco; no corte, metade', () => {
    expect(so(dois('dissolver'), 2)).toEqual({
      a: { visivel: true, opacidade: 1, deslocamentoX: 0 },
      b: { visivel: true, opacidade: 0.5, deslocamentoX: 0 },
    })
    expect(so(dois('dissolver'), 1.875).b.opacidade).toBeCloseTo(0.25)
  })

  it('deslizar: o que sai vai para a esquerda, o que entra empurra pela direita; no corte, meio a meio', () => {
    expect(so(dois('deslizar'), 2)).toEqual({
      a: { visivel: true, opacidade: 1, deslocamentoX: -0.5 },
      b: { visivel: true, opacidade: 1, deslocamentoX: 0.5 },
    })
    // as duas bordas sempre se encostam: nem fresta, nem sobreposição
    for (const t of [1.8, 1.9, 2.1, 2.2]) {
      const q = so(dois('deslizar'), t)
      expect(q.b.deslocamentoX - q.a.deslocamentoX).toBeCloseTo(1)
      expect(q.a.deslocamentoX).toBeLessThan(0)
    }
  })
})

describe('problemasDosClipes', () => {
  it('transição fora da lista é recusada; ausente, null ou da lista passa', () => {
    expect(problemasDosClipes([foto('a', 0, {}), foto('b', 1, { transicao: 'dissolver' })])).toEqual([])
    expect(problemasDosClipes([foto('a', 0, {}), foto('b', 1, { transicao: null })])).toEqual([])
    const p = problemasDosClipes([foto('a', 0, {}), foto('b', 1, { transicao: 'girar' })])
    expect(p).toHaveLength(1)
    expect(p[0]).toMatch(/transição inválida/)
  })

  it('página legada passa; duração fora da faixa e 11 clipes são recusados em português', () => {
    expect(problemasDosClipes([foto('a', 0), video('v', 1, {})])).toEqual([])
    expect(problemasDosClipes([foto('a', 0, {}), foto('b', 1, { duracao: 3 })])).toEqual([])
    expect(problemasDosClipes([foto('a', 0, { duracao: 0.2 })]).join(' ')).toMatch(/duração inválida/)
    expect(problemasDosClipes([foto('a', 0, { duracao: 61 })])).toHaveLength(1)
    expect(problemasDosClipes([foto('a', 0, { duracao: Number.NaN })])).toHaveLength(1)
    const onze = Array.from({ length: 11 }, (_, i) => foto(`f${i}`, i, {}))
    expect(problemasDosClipes(onze).join(' ')).toMatch(/até 10 clipes/)
  })
})

describe('medirDefasagem com clipe', () => {
  const base = [
    { id: 'bg-foto', type: 'image', order: 0, position: { x: 0, y: 0 }, size: { width: 1080, height: 1920 }, fileUrl: 'https://x/a.jpg' },
    { id: 'headline', type: 'text', order: 1, content: 'Costela', position: { x: 0, y: 0 }, size: { width: 500, height: 80 } },
  ]
  it('qualquer clipe na página conta como ajuste manual (re-render como está, nunca recompor)', () => {
    const comClipe = [{ ...base[0], clipe: { duracao: 3 } }, base[1]]
    const d = medirDefasagem(comClipe, base)
    expect(d.mexidoNaMao.join(' ')).toMatch(/linha do tempo/)
    expect(d.soTexto).toBe(false)
    expect(medirDefasagem(base, base).mexidoNaMao).toEqual([])
  })
})
