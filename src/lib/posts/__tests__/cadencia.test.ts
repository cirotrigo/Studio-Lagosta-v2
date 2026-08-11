import { describe, it, expect } from 'vitest'
import {
  calcularCadencia,
  ehEvidenciaFraca,
  LIMIAR_DE_PESO,
  MEIA_VIDA_DIAS,
  PESO_AUTO_REFORCO,
  pesoDoPost,
  pesoPorRecencia,
  type PostDoHistorico,
} from '@/lib/posts/cadencia'

const DIA = 24 * 3600_000
/** Uma quinta-feira, 10:00 em Brasília (13:00 UTC). */
const AGORA = new Date('2026-08-13T13:00:00.000Z')

/**
 * Post `diasAtras` dias antes de AGORA, no horário indicado em BRASÍLIA.
 * A conversão BRT→UTC (+3h) é feita aqui de propósito: escrever o horário em
 * UTC no teste é a forma mais fácil de testar o dia da semana errado.
 */
function post(diasAtras: number, horaBRT = '10:00', extra: Partial<PostDoHistorico> = {}): PostDoHistorico {
  const base = new Date(AGORA.getTime() - diasAtras * DIA)
  const [h, m] = horaBRT.split(':').map(Number)
  const quando = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), h + 3, m),
  )
  return { quando, ...extra }
}

/** Os horários típicos, como "dia:hora", para comparar sem depender da ordem. */
function horarios(posts: PostDoHistorico[], opcoes: Parameters<typeof calcularCadencia>[1] = {}) {
  const r = calcularCadencia(posts, { agora: AGORA, ...opcoes })
  const out: string[] = []
  for (const [dia, slots] of r.slotsPorDia) for (const s of slots) out.push(`${dia}:${s.hora}`)
  return out.sort()
}

describe('peso por recência', () => {
  it('vale 1 hoje e cai pela metade a cada meia-vida', () => {
    expect(pesoPorRecencia(AGORA, AGORA)).toBeCloseTo(1, 5)
    expect(pesoPorRecencia(new Date(AGORA.getTime() - MEIA_VIDA_DIAS * DIA), AGORA)).toBeCloseTo(0.5, 5)
    expect(pesoPorRecencia(new Date(AGORA.getTime() - 2 * MEIA_VIDA_DIAS * DIA), AGORA)).toBeCloseTo(0.25, 5)
  })

  it('não passa de 1 para post no futuro (relógio adiantado não cria peso extra)', () => {
    expect(pesoPorRecencia(new Date(AGORA.getTime() + 10 * DIA), AGORA)).toBe(1)
  })
})

describe('desconto por origem', () => {
  it('sugestão ACEITA sem edição vale menos — é o sistema se ouvindo', () => {
    const aceito = post(0, '13:00', { origem: 'sugerido-aceito' })
    expect(pesoDoPost(aceito, AGORA)).toBeCloseTo(PESO_AUTO_REFORCO, 5)
    expect(ehEvidenciaFraca(aceito)).toBe(true)
  })

  it('sugestão EDITADA e escolha própria valem cheio — houve decisão humana', () => {
    expect(pesoDoPost(post(0, '13:00', { origem: 'sugerido-editado' }), AGORA)).toBeCloseTo(1, 5)
    expect(pesoDoPost(post(0, '13:00', { origem: 'escolha-propria' }), AGORA)).toBeCloseTo(1, 5)
    expect(ehEvidenciaFraca(post(0, '13:00', { origem: 'sugerido-editado' }))).toBe(false)
  })

  it('post de campanha é evidência fraca, marcado pelo escopo ou pelo vínculo', () => {
    expect(ehEvidenciaFraca(post(0, '13:00', { escopo: 'CAMPANHA' }))).toBe(true)
    expect(ehEvidenciaFraca(post(0, '13:00', { campaignId: 'kb_1' }))).toBe(true)
  })
})

describe('confirma, nunca cria', () => {
  /** Quatro quintas seguidas às 10:00 BRT — rotina forte. */
  const rotina = [post(0), post(7), post(14), post(21)]

  it('rotina sozinha cria o horário típico', () => {
    expect(horarios(rotina)).toContain('4:10:00')
  })

  it('só campanha NÃO cria horário típico, por mais recente que seja', () => {
    const soCampanha = [
      post(0, '15:00', { escopo: 'CAMPANHA' }),
      post(7, '15:00', { escopo: 'CAMPANHA' }),
      post(14, '15:00', { escopo: 'CAMPANHA' }),
      post(21, '15:00', { escopo: 'CAMPANHA' }),
    ]
    expect(horarios(soCampanha)).not.toContain('4:15:00')
  })

  it('só auto-reforço NÃO cria horário típico', () => {
    const soAceites = [0, 7, 14, 21, 28].map((d) => post(d, '16:00', { origem: 'sugerido-aceito' }))
    expect(horarios(soAceites)).not.toContain('4:16:00')
  })

  it('campanha CONFIRMA um horário que a rotina já sustenta', () => {
    // A peça de campanha cai na MESMA quinta-feira das 10:00 (múltiplo de 7).
    const comApoio = [...rotina, post(28, '10:00', { escopo: 'CAMPANHA' })]
    const r = calcularCadencia(comApoio, { agora: AGORA })
    const slot = r.slotsPorDia.get(4)?.find((s) => s.hora === '10:00')
    expect(slot).toBeDefined()
    expect(slot!.apoioFraco).toBe(true)
    expect(slot!.peso).toBeGreaterThan(slot!.pesoForte)
    expect(slot!.motivo).toContain('campanha')
  })
})

describe('campanha encerrada', () => {
  it('sai inteira do histórico e derruba o horário que só ela sustentava', () => {
    const posts = [0, 7, 14, 21].map((d) => post(d, '11:00', { campanhaEncerrada: true }))
    const r = calcularCadencia(posts, { agora: AGORA })
    expect(r.postsConsiderados).toBe(0)
    expect(r.descartadosPorCampanha).toBe(4)
    expect(r.slotsPorDia.size).toBe(0)
  })
})

describe('mínimo de ocorrências', () => {
  it('um post só nunca é padrão, nem no mesmo dia', () => {
    // Peso 1,0 num post recente ainda fica abaixo do limiar, mas a trava de
    // ocorrências existe para o caso de o limiar ser afrouxado.
    const r = calcularCadencia([post(0, '09:00')], { agora: AGORA, limiarDePeso: 0.5 })
    expect(r.slotsPorDia.size).toBe(0)
  })

  it('duas publicações na última semana bastam — o indício recente conta', () => {
    expect(horarios([post(0, '18:00'), post(7, '18:00')])).toContain('4:18:00')
  })

  it('duas publicações separadas por um mês não bastam', () => {
    expect(horarios([post(0, '18:00'), post(28, '18:00')])).not.toContain('4:18:00')
  })
})

describe('recência ancorada na última atividade', () => {
  it('cliente que parou de publicar mantém a cadência dele', () => {
    // Quatro quintas seguidas, mas a última foi há 40 dias. Ancorado no
    // relógio, tudo isso pesaria ~0,27 e sumiria; ancorado na última
    // atividade, a rotina continua visível.
    const parado = [42, 49, 56, 63].map((d) => post(d, '10:00'))
    expect(horarios(parado)).toContain('4:10:00')
  })
})

describe('postsPorSemana sobre semanas COM atividade', () => {
  it('não dilui o cliente que passou semanas parado', () => {
    // 6 posts concentrados em duas semanas: 3 por semana ATIVA, não 6/8.
    const posts = [0, 0, 0, 7, 7, 7].map((d, i) => post(d, i % 3 === 0 ? '10:00' : i % 3 === 1 ? '10:15' : '10:20'))
    const r = calcularCadencia(posts, { agora: AGORA })
    expect(r.semanasComAtividade).toBe(2)
    const quinta = r.cadencia.find((c) => c.diaSemana === 'quinta')
    expect(quinta?.postsPorSemana).toBe(3)
  })
})

describe('motivo', () => {
  it('distingue rotina de novidade das últimas duas semanas', () => {
    const rotina = calcularCadencia([0, 7, 14, 21, 28, 35].map((d) => post(d, '10:00')), { agora: AGORA })
    expect(rotina.slotsPorDia.get(4)?.[0].motivo).toContain('costuma postar')
    expect(rotina.slotsPorDia.get(4)?.[0].picoRecente).toBe(false)

    const novidade = calcularCadencia([0, 3, 7].map((d) => post(d, '20:00')), {
      agora: AGORA,
      limiarDePeso: 1.5,
    })
    const slots = [...novidade.slotsPorDia.values()].flat()
    const pico = slots.find((s) => s.hora === '20:00')
    expect(pico?.picoRecente).toBe(true)
    expect(pico?.motivo).toContain('novidade')
  })
})

describe('limiar calibrado', () => {
  it('é o valor medido contra os clientes reais', () => {
    expect(LIMIAR_DE_PESO).toBe(1.75)
  })
})
