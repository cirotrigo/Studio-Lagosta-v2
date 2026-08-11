/**
 * O contrato PURO de `propor-semana` (F3, trilho B).
 *
 * O que se testa aqui é o que decide a cara da leva sem depender de banco: a
 * variedade de assuntos, a proporção com o histórico do cliente, a foto que não
 * se repete, o espalhamento por dia e a grade-semente do cold start.
 *
 * `propor-semana.ts` (a orquestração) não é importado de propósito — ele puxa
 * `@/lib/db`, que **lança no import** sem `DATABASE_URL`.
 */

import { describe, expect, it } from 'vitest'
import {
  distribuirPilares,
  escolherFotoSemRepetir,
  espalharPorDia,
  gradeSemente,
  ROTULO_DE_COLD_START,
} from '@/lib/planos/proposta-de-semana'

const PILARES = [
  { slug: 'almoco', nome: 'Almoço executivo' },
  { slug: 'happy-hour', nome: 'Happy hour' },
  { slug: 'delivery', nome: 'Delivery' },
  { slug: 'bastidores', nome: 'Bastidores' },
]

function contar(saida: Array<{ slug: string } | null>): Record<string, number> {
  const conta: Record<string, number> = {}
  for (const item of saida) if (item) conta[item.slug] = (conta[item.slug] ?? 0) + 1
  return conta
}

describe('distribuirPilares — variedade', () => {
  it('não repete assunto enquanto houver pilar não usado', () => {
    const saida = distribuirPilares(4, PILARES)
    const slugs = saida.map((p) => p?.slug)
    expect(new Set(slugs).size).toBe(4)
  })

  it('a leva menor que a taxonomia usa assuntos todos diferentes', () => {
    const saida = distribuirPilares(3, PILARES)
    expect(new Set(saida.map((p) => p?.slug)).size).toBe(3)
  })

  it('a primeira volta estreia TODOS antes de qualquer repetição', () => {
    const saida = distribuirPilares(9, PILARES)
    const primeiraVolta = saida.slice(0, PILARES.length).map((p) => p?.slug)
    expect(new Set(primeiraVolta).size).toBe(PILARES.length)
  })

  it('nunca põe o mesmo assunto em dois posts seguidos', () => {
    // 2 pilares e 6 posts é o caso mais apertado que existe: sem a regra da
    // adjacência, o déficit sozinho poderia repetir o dominante em sequência.
    const saida = distribuirPilares(6, PILARES.slice(0, 2), [
      { pilar: 'almoco', fracao: 0.9 },
      { pilar: 'happy-hour', fracao: 0.1 },
    ])
    const slugs = saida.map((p) => p?.slug)
    for (let i = 1; i < slugs.length; i++) {
      expect(slugs[i]).not.toBe(slugs[i - 1])
    }
  })
})

describe('distribuirPilares — proporção', () => {
  it('respeita a distribuição quando a leva é maior que a taxonomia', () => {
    const saida = distribuirPilares(6, PILARES.slice(0, 3), [
      { pilar: 'almoco', fracao: 0.6 },
      { pilar: 'happy-hour', fracao: 0.3 },
      { pilar: 'delivery', fracao: 0.1 },
    ])
    const conta = contar(saida)
    // O dominante aparece mais que o médio, e o médio mais que o raro — o que
    // um round-robin estrito não daria (empataria 2-2-2).
    expect(conta['almoco']).toBeGreaterThan(conta['happy-hour'])
    expect(conta['happy-hour']).toBeGreaterThan(conta['delivery'])
    expect(saida.filter(Boolean)).toHaveLength(6)
  })

  it('o assunto mais frequente do cliente abre a leva', () => {
    const saida = distribuirPilares(4, PILARES, [
      { pilar: 'bastidores', fracao: 0.7 },
      { pilar: 'almoco', fracao: 0.3 },
    ])
    expect(saida[0]?.slug).toBe('bastidores')
  })

  it('sem distribuição nenhuma, sai na ordem que o olho humano aprovou', () => {
    const saida = distribuirPilares(4, PILARES)
    expect(saida.map((p) => p?.slug)).toEqual(['almoco', 'happy-hour', 'delivery', 'bastidores'])
  })

  it('pilar aprovado sem histórico ainda entra na leva', () => {
    // Peso zero decide ORDEM e repetição, nunca elegibilidade: um assunto que o
    // cliente aprovou e ainda não publicou é justamente o que ele quer estrear.
    const saida = distribuirPilares(4, PILARES, [{ pilar: 'almoco', fracao: 1 }])
    expect(saida.map((p) => p?.slug)).toContain('bastidores')
  })
})

describe('distribuirPilares — taxonomia vazia', () => {
  it('devolve null em toda posição, sem quebrar', () => {
    const saida = distribuirPilares(3, [])
    expect(saida).toEqual([null, null, null])
  })

  it('quantidade zero devolve lista vazia', () => {
    expect(distribuirPilares(0, PILARES)).toEqual([])
  })
})

describe('escolherFotoSemRepetir', () => {
  const acervo = [{ driveFileId: 'a' }, { driveFileId: 'b' }, { driveFileId: 'c' }]

  it('leva o TOPO quando ele ainda não foi usado', () => {
    expect(escolherFotoSemRepetir(acervo, new Set())?.driveFileId).toBe('a')
  })

  it('desce na lista só o necessário para não repetir', () => {
    expect(escolherFotoSemRepetir(acervo, new Set(['a']))?.driveFileId).toBe('b')
    expect(escolherFotoSemRepetir(acervo, new Set(['a', 'b']))?.driveFileId).toBe('c')
  })

  it('uma leva inteira sai sem foto repetida', () => {
    const usadas = new Set<string>()
    const escolhidas = [0, 1, 2].map(() => {
      const foto = escolherFotoSemRepetir(acervo, usadas)
      if (foto) usadas.add(foto.driveFileId)
      return foto?.driveFileId
    })
    expect(escolhidas).toEqual(['a', 'b', 'c'])
    expect(new Set(escolhidas).size).toBe(3)
  })

  it('acervo esgotado repete em vez de deixar o item sem imagem', () => {
    expect(escolherFotoSemRepetir(acervo, new Set(['a', 'b', 'c']))?.driveFileId).toBe('a')
  })

  it('acervo vazio devolve null', () => {
    expect(escolherFotoSemRepetir([], new Set())).toBeNull()
  })
})

describe('espalharPorDia', () => {
  const slot = (data: string, hora: string) => ({ data, scheduledDatetime: `${data} ${hora}` })

  it('cobre os dias antes de repetir dia', () => {
    const slots = [
      slot('2026-08-17', '09:00'),
      slot('2026-08-17', '12:00'),
      slot('2026-08-17', '19:00'),
      slot('2026-08-18', '11:30'),
      slot('2026-08-19', '20:00'),
    ]
    const escolhidos = espalharPorDia(slots, 3)
    expect(escolhidos.map((s) => s.data)).toEqual(['2026-08-17', '2026-08-18', '2026-08-19'])
  })

  it('com espaço de sobra, volta para o segundo horário de cada dia', () => {
    const slots = [
      slot('2026-08-17', '09:00'),
      slot('2026-08-17', '19:00'),
      slot('2026-08-18', '11:30'),
    ]
    const escolhidos = espalharPorDia(slots, 3)
    expect(escolhidos.map((s) => s.scheduledDatetime)).toEqual([
      '2026-08-17 09:00',
      '2026-08-17 19:00',
      '2026-08-18 11:30',
    ])
  })

  it('devolve em ordem cronológica', () => {
    const slots = [
      slot('2026-08-19', '20:00'),
      slot('2026-08-17', '12:00'),
      slot('2026-08-18', '11:30'),
    ]
    const escolhidos = espalharPorDia(slots, 3)
    expect(escolhidos.map((s) => s.scheduledDatetime)).toEqual([
      '2026-08-17 12:00',
      '2026-08-18 11:30',
      '2026-08-19 20:00',
    ])
  })

  it('teto respeitado e lista vazia não quebra', () => {
    expect(espalharPorDia([slot('2026-08-17', '09:00')], 0)).toEqual([])
    expect(espalharPorDia([], 5)).toEqual([])
  })
})

describe('gradeSemente', () => {
  // 12:00 UTC de uma segunda-feira: 09:00 em Brasília, longe da virada do dia.
  const agora = new Date('2026-08-17T12:00:00.000Z')

  it('começa AMANHÃ e cobre um dia por vez', () => {
    const semente = gradeSemente({ agora, dias: 3, maxItens: 7 })
    expect(semente.map((s) => s.data)).toEqual(['2026-08-18', '2026-08-19', '2026-08-20'])
  })

  it('todo item semeado carrega o rótulo de ponto de partida', () => {
    const semente = gradeSemente({ agora, dias: 7, maxItens: 7 })
    expect(semente).toHaveLength(7)
    for (const s of semente) {
      expect(s.motivo).toContain(ROTULO_DE_COLD_START)
      expect(s.semente).toBe(true)
    }
  })

  it('o motivo NÃO inventa estatística sobre o cliente', () => {
    const semente = gradeSemente({ agora, dias: 2, maxItens: 7 })
    for (const s of semente) {
      expect(s.motivo).not.toMatch(/costuma|ocasi|vezes|\dx/i)
    }
  })

  it('alterna almoço e jantar', () => {
    const semente = gradeSemente({ agora, dias: 4, maxItens: 7 })
    expect(semente.map((s) => s.hora)).toEqual(['11:30', '18:30', '11:30', '18:30'])
  })

  it('respeita o teto de itens', () => {
    expect(gradeSemente({ agora, dias: 14, maxItens: 3 })).toHaveLength(3)
  })

  it('é determinística — duas montagens no mesmo dia dão os MESMOS horários', () => {
    const a = gradeSemente({ agora, dias: 7, maxItens: 7 })
    const b = gradeSemente({ agora: new Date(agora.getTime() + 3_600_000), dias: 7, maxItens: 7 })
    expect(a.map((s) => s.scheduledDatetime)).toEqual(b.map((s) => s.scheduledDatetime))
  })
})
