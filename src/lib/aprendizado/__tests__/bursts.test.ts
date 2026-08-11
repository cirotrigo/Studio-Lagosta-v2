import { describe, it, expect } from 'vitest'
import { detectarCampanhas, GAP_MAXIMO_DIAS, type PostClassificado } from '@/lib/aprendizado/bursts'

const DIA = 24 * 3600_000
const AGORA = new Date('2026-08-11T12:00:00.000Z')

function post(pilar: string | null, diasAtras: number, extra: Partial<PostClassificado> = {}): PostClassificado {
  return {
    id: `${pilar}-${diasAtras}-${Math.random().toString(36).slice(2, 7)}`,
    pilar,
    quando: new Date(AGORA.getTime() - diasAtras * DIA),
    ...extra,
  }
}

describe('detecção de campanha', () => {
  it('acha o aglomerado de um assunto que não aparece em mais lugar nenhum', () => {
    const posts = [
      // Festival: 4 peças em 5 dias, e só ali.
      post('festival', 40),
      post('festival', 42),
      post('festival', 43),
      post('festival', 45),
      // Rotina: happy hour toda semana, o ano inteiro.
      ...[7, 14, 21, 28, 35, 42, 49, 56].map((d) => post('happy-hour', d)),
    ]
    const candidatas = detectarCampanhas(posts, { agora: AGORA })
    expect(candidatas.map((c) => c.pilar)).toEqual(['festival'])
    expect(candidatas[0].postIds.length).toBe(4)
    expect(candidatas[0].motivo).toContain('não aparece em mais nenhum outro momento')
  })

  it('não confunde rotina semanal com campanha', () => {
    const rotina = [0, 7, 14, 21, 28, 35, 42, 49].map((d) => post('happy-hour', d))
    expect(detectarCampanhas(rotina, { agora: AGORA })).toEqual([])
  })

  it('quebra o aglomerado quando há lacuna longa', () => {
    const posts = [
      post('festival', 60),
      post('festival', 61),
      post('festival', 62),
      // Depois de uma lacuna bem maior que o teto, é OUTRA edição.
      post('festival', 60 - 3 * GAP_MAXIMO_DIAS),
      post('festival', 59 - 3 * GAP_MAXIMO_DIAS),
      post('festival', 58 - 3 * GAP_MAXIMO_DIAS),
    ]
    const candidatas = detectarCampanhas(posts, { agora: AGORA })
    expect(candidatas.length).toBe(2)
  })

  it('exige um mínimo de peças — duas é coincidência', () => {
    expect(detectarCampanhas([post('festival', 30), post('festival', 31)], { agora: AGORA })).toEqual([])
  })

  it('ignora os baldes reservados: campanha de "sem-texto" seria o buraco de instrumentação', () => {
    const posts = [
      ...[30, 31, 32, 33].map((d) => post('sem-texto', d)),
      ...[30, 31, 32, 33].map((d) => post('outro', d)),
      ...[30, 31, 32, 33].map((d) => post(null, d)),
    ]
    expect(detectarCampanhas(posts, { agora: AGORA })).toEqual([])
  })

  it('não repropõe aglomerado que já foi resolvido', () => {
    const posts = [30, 31, 32, 33].map((d) => post('festival', d, { campaignId: 'kb_1' }))
    expect(detectarCampanhas(posts, { agora: AGORA })).toEqual([])
  })

  it('marca como possivelmente em curso o que terminou anteontem', () => {
    const posts = [1, 2, 4, 6].map((d) => post('festival', d))
    const [c] = detectarCampanhas(posts, { agora: AGORA })
    expect(c.emAndamento).toBe(true)
  })

  it('a mais volumosa vem primeiro', () => {
    const posts = [
      ...[40, 41, 42].map((d) => post('festival-a', d)),
      ...[20, 21, 22, 23, 24].map((d) => post('festival-b', d)),
    ]
    expect(detectarCampanhas(posts, { agora: AGORA })[0].pilar).toBe('festival-b')
  })

  it('leva amostras de texto para a pessoa reconhecer a campanha', () => {
    const posts = [30, 31, 32].map((d) =>
      post('festival', d, { amostraDeTexto: 'Festival Italiano menu especial' }),
    )
    const [c] = detectarCampanhas(posts, { agora: AGORA })
    expect(c.amostras).toEqual(['Festival Italiano menu especial'])
  })
})
