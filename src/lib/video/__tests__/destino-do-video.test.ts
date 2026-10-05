import { describe, expect, it } from 'vitest'
import {
  antecedenciaParaGravar,
  decidirRecuperacao,
  motivoDaRecusa,
  quandoInicialDoVideo,
  rotuloDoDestino,
  decidirSubstituicao,
  midiasDepoisDaTroca,
  revisoesAceitas,
  situacaoNaHoraDoDestino,
  validarDestinoNaFila,
  validarSubstituicaoNaFila,
  type PostParaSubstituir,
  type ResultadoDoDestino,
} from '../destino-do-video'

const agora = new Date('2026-10-03T12:00:00Z')
const em = (min: number) => new Date(agora.getTime() + min * 60_000).toISOString()

describe('validarDestinoNaFila', () => {
  const story = { largura: 1080, altura: 1920 }
  const feed = { largura: 1080, altura: 1350 }
  const agenda = (quando: string, postType: 'STORY' | 'REEL' = 'STORY') =>
    ({ tipo: 'agenda', quando, postType, situacao: 'agendado' }) as const

  it('exige pelo menos 10 minutos de antecedência', () => {
    expect(validarDestinoNaFila(agenda(em(9)), { agora, ...story })).toMatch(/10 minutos/)
    expect(validarDestinoNaFila(agenda(em(10)), { agora, ...story })).toBeNull()
  })

  it('story só em página 9:16; feed só como reel', () => {
    expect(validarDestinoNaFila(agenda(em(30), 'STORY'), { agora, ...feed })).toMatch(/Reel/)
    expect(validarDestinoNaFila(agenda(em(30), 'REEL'), { agora, ...feed })).toBeNull()
    expect(validarDestinoNaFila(agenda(em(30), 'REEL'), { agora, ...story })).toBeNull()
  })

  it('data ilegível e destinos que não são agenda', () => {
    expect(validarDestinoNaFila(agenda('ontem'), { agora, ...story })).toMatch(/não são válidas/)
    expect(validarDestinoNaFila({ tipo: 'galeria' }, { agora, ...story })).toBeNull()
  })
})

const t = (min: number) => new Date(agora.getTime() + min * 60_000)
const post = (over: Partial<PostParaSubstituir> = {}): PostParaSubstituir => ({
  id: 'p1',
  projectId: 7,
  pageId: 'pg1',
  status: 'DRAFT',
  laterPostId: null,
  updatedAt: t(0),
  mediaUrls: ['https://b/x.mp4'],
  videoDaPagina: true,
  ...over,
})

describe('validarSubstituicaoNaFila', () => {
  const ctx = { projectId: 7, pageId: 'pg1', ehVideo: true }
  it('aceita o post de vídeo da página, editável', () => {
    expect(validarSubstituicaoNaFila(post(), ctx)).toBeNull()
  })
  it('recusa cada condição', () => {
    expect(validarSubstituicaoNaFila(null, ctx)).toMatch(/não existe/)
    expect(validarSubstituicaoNaFila(post({ projectId: 8 }), ctx)).toMatch(/não existe/)
    expect(validarSubstituicaoNaFila(post({ pageId: 'outra' }), ctx)).toMatch(/outra página/)
    expect(validarSubstituicaoNaFila(post(), { ...ctx, ehVideo: false })).toMatch(/não é de vídeo/)
    expect(validarSubstituicaoNaFila(post({ status: 'POSTED' }), ctx)).toMatch(/já saiu/)
    expect(validarSubstituicaoNaFila(post({ laterPostId: 'z1' }), ctx)).toMatch(/entregue/)
  })
})

/**
 * A cadeia: cada pedido guarda a revisão do post que viu e os pedidos
 * anteriores ainda sem desfecho. Simula as chegadas em qualquer ordem e
 * confere que o vídeo que fica é o do pedido MAIS NOVO.
 */
function simularCadeia(n: number, ordem: number[]) {
  let revisao = 0
  let video = 'original'
  const resultados: Array<ResultadoDoDestino | null> = Array(n).fill(null)
  // Todos pedidos antes de qualquer chegada: viram o post na revisão 0, e o
  // pedido i tem como predecessoras os anteriores (ainda sem desfecho).
  const pedidos = Array.from({ length: n }, (_, i) => ({
    esperado: { revisao: t(0).toISOString(), pageId: 'pg1' },
    predecessoras: Array.from({ length: i }, (_, j) => j),
  }))
  for (const i of ordem) {
    const p = pedidos[i]
    const aceitas = revisoesAceitas(p.esperado, p.predecessoras.map((j) => resultados[j]))
    const d = decidirSubstituicao(post({ updatedAt: t(revisao) }), p.esperado, aceitas, true)
    if (d.aceitar === false) {
      resultados[i] = { ok: false, motivo: d.motivo, em: t(revisao).toISOString() }
    } else {
      revisao += 1
      video = `v${i}`
      resultados[i] = { ok: true, revisaoDepois: t(revisao).toISOString(), em: t(revisao).toISOString() }
    }
  }
  return video
}

function permutacoes(xs: number[]): number[][] {
  if (xs.length <= 1) return [xs]
  return xs.flatMap((x, i) => permutacoes([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r]))
}

describe('decidirSubstituicao — a cadeia termina no vídeo mais novo', () => {
  it('duas substituições, nas duas ordens de chegada', () => {
    expect(simularCadeia(2, [0, 1])).toBe('v1')
    expect(simularCadeia(2, [1, 0])).toBe('v1')
  })
  it('três substituições, em toda ordem', () => {
    for (const ordem of permutacoes([0, 1, 2])) expect(simularCadeia(3, ordem)).toBe('v2')
  })
  it('mudança na agenda no meio é preservada (recusa)', () => {
    const d = decidirSubstituicao(post({ updatedAt: t(5) }), { revisao: t(0).toISOString(), pageId: 'pg1' }, [t(0).getTime()], true)
    expect(d).toEqual({ aceitar: false, motivo: expect.stringMatching(/mudado na agenda/) })
  })
  it('post entregue para publicar é recusado mesmo na revisão certa', () => {
    const d = decidirSubstituicao(post({ laterPostId: 'z' }), { revisao: t(0).toISOString(), pageId: 'pg1' }, [t(0).getTime()], true)
    expect(d.aceitar).toBe(false)
  })
})

describe('midiasDepoisDaTroca e situacaoNaHoraDoDestino', () => {
  it('troca só o vídeo anterior; sem ele, o novo vira a mídia', () => {
    expect(midiasDepoisDaTroca(['a.png', 'v.mp4'], 'v.mp4', 'n.mp4')).toEqual(['a.png', 'n.mp4'])
    expect(midiasDepoisDaTroca([], null, 'n.mp4')).toEqual(['n.mp4'])
  })
  it('horário que passou no processamento vira rascunho com motivo', () => {
    const destino = { tipo: 'agenda', quando: em(1), postType: 'STORY', situacao: 'agendado' } as const
    expect(situacaoNaHoraDoDestino(destino, agora)).toMatchObject({ situacao: 'rascunho', motivo: expect.any(String) })
    expect(situacaoNaHoraDoDestino({ ...destino, quando: em(30) }, agora)).toEqual({ situacao: 'agendado' })
  })
})

describe('decidirRecuperacao', () => {
  it('devolve enquanto há tentativa; esgotado, falha ou conclui sem destino', () => {
    expect(decidirRecuperacao({ attempts: 1, videoPronto: false })).toBe('devolver')
    expect(decidirRecuperacao({ attempts: 2, videoPronto: false })).toBe('falhar')
    expect(decidirRecuperacao({ attempts: 2, videoPronto: true })).toBe('concluir-sem-destino')
  })
})

describe('antecedenciaParaGravar e quandoInicialDoVideo', () => {
  it('a antecedência soma os 10 minutos da fila, a duração e 2 minutos de envio', () => {
    expect(antecedenciaParaGravar(null)).toBe(12 * 60_000)
    expect(antecedenciaParaGravar(30)).toBe(12 * 60_000 + 30_000)
  })

  it('o horário previsto da página vale só se ainda couber a gravação', () => {
    const ant = antecedenciaParaGravar(30)
    expect(quandoInicialDoVideo(em(60), undefined, agora, ant).toISOString()).toBe(em(60))
    const r = quandoInicialDoVideo(em(5), undefined, agora, ant)
    expect(r.getTime() - agora.getTime()).toBeGreaterThanOrEqual(ant)
  })

  it('sem previsto, o horário típico do dia que ainda dá tempo (hora local)', () => {
    const porDia = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, ['12:00', '19:00']]))
    const ant = antecedenciaParaGravar(30) // 12,5 min
    const as1130 = new Date(2026, 9, 3, 11, 30)
    expect(quandoInicialDoVideo(null, porDia, as1130, ant).getHours()).toBe(12)
    // Às 11h55 o meio-dia está a 5 min: não dá para gravar e preparar
    const as1155 = new Date(2026, 9, 3, 11, 55)
    const r = quandoInicialDoVideo(null, porDia, as1155, ant)
    expect([r.getDate(), r.getHours()]).toEqual([3, 19])
  })
})

describe('rotuloDoDestino e motivoDaRecusa', () => {
  const comDestino = (extra: Record<string, unknown>) => ({
    videoDaPagina: { pageId: 'p1', versao: 'v', divergiuNaGravacao: false, ...extra },
  })
  const agenda = { tipo: 'agenda', quando: em(60), postType: 'STORY', situacao: 'agendado' }
  const recusado: ResultadoDoDestino = { ok: false, motivo: 'post entregue', em: em(0) }

  it('galeria e vídeo sem destino não têm rótulo', () => {
    expect(rotuloDoDestino(null)).toBeNull()
    expect(rotuloDoDestino({ isVideo: true })).toBeNull()
    expect(rotuloDoDestino(comDestino({ destino: { tipo: 'galeria' } }))).toBeNull()
  })

  it('agenda: a caminho, criado (com e sem aviso) e recusado', () => {
    expect(rotuloDoDestino(comDestino({ destino: agenda }))?.texto).toMatch(/^vai para a agenda: /)
    expect(
      rotuloDoDestino(comDestino({ destino: { ...agenda, situacao: 'rascunho' } }))?.texto,
    ).toMatch(/^vai para a agenda como rascunho/)
    expect(rotuloDoDestino(comDestino({ destino: agenda, postId: 'x' }))).toEqual({ texto: 'na agenda', recusa: false })
    expect(rotuloDoDestino(comDestino({ destino: agenda, postId: 'x', aviso: 'o horário passou' }))?.texto).toBe(
      'na agenda como rascunho: o horário passou',
    )
    expect(rotuloDoDestino(comDestino({ destino: agenda, resultado: recusado }))).toEqual({
      texto: 'fora da agenda: post entregue',
      recusa: true,
    })
  })

  it('substituição: a caminho, feita e recusada', () => {
    const sub = { tipo: 'substituir', postId: 'x' }
    expect(rotuloDoDestino(comDestino({ destino: sub }))?.recusa).toBe(false)
    const ok: ResultadoDoDestino = { ok: true, revisaoDepois: 'r', em: em(0) }
    expect(rotuloDoDestino(comDestino({ destino: sub, resultado: ok }))?.texto).toMatch(/^substituiu/)
    expect(rotuloDoDestino(comDestino({ destino: sub, resultado: recusado }))).toEqual({
      texto: 'não substituiu: post entregue',
      recusa: true,
    })
  })

  it('motivoDaRecusa só devolve motivo de destino recusado', () => {
    expect(motivoDaRecusa(null)).toBeNull()
    expect(motivoDaRecusa({ ok: true, revisaoDepois: 'r', em: em(0) })).toBeNull()
    expect(motivoDaRecusa(recusado)).toBe('post entregue')
  })
})
