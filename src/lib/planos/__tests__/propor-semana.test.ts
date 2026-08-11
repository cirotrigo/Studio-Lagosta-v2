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
  completarAteOAlvo,
  diasAteDomingoBRT,
  gradeSemente,
  horaMinimaHoje,
  POSTS_POR_DIA_ALVO,
  ROTULO_DE_COLD_START,
  ROTULO_DE_COMPLEMENTO,
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

  /**
   * Três por dia é o ritmo que a agência pratica, então a semente também sai
   * assim. O corte por teto pega o FIM da semana, nunca o segundo e o terceiro
   * story de um dia — meio dia proposto seria pior que um dia a menos.
   */
  it('começa HOJE, com três horários por dia', () => {
    // 09:00 BRT: os três horários do dia ainda estão à frente.
    const semente = gradeSemente({ agora, dias: 3, maxItens: 99 })
    expect(semente.map((s) => s.data)).toEqual([
      '2026-08-17', '2026-08-17', '2026-08-17',
      '2026-08-18', '2026-08-18', '2026-08-18',
      '2026-08-19', '2026-08-19', '2026-08-19',
    ])
    expect(semente.slice(0, 3).map((s) => s.hora)).toEqual(['11:30', '15:00', '18:30'])
  })

  /**
   * O dia meio vencido entra só com o que ainda dá para publicar: às 16h de
   * Brasília sobra o jantar — propor 11:30 às 16h é a primeira coisa que faz
   * alguém desconfiar da leva inteira.
   */
  it('do dia de hoje entra só o horário que ainda dá para cumprir', () => {
    const tarde = new Date('2026-08-17T19:00:00.000Z') // 16:00 BRT
    const semente = gradeSemente({ agora: tarde, dias: 2, maxItens: 99 })
    expect(semente.filter((s) => s.data === '2026-08-17').map((s) => s.hora)).toEqual(['18:30'])
    expect(semente.filter((s) => s.data === '2026-08-18')).toHaveLength(3)
  })

  it('o teto corta o fim da semana, não o meio de um dia', () => {
    const semente = gradeSemente({ agora, dias: 7, maxItens: 4 })
    expect(semente).toHaveLength(4)
    expect(semente.filter((s) => s.data === '2026-08-17')).toHaveLength(3)
    expect(semente.filter((s) => s.data === '2026-08-18')).toHaveLength(1)
  })

  it('todo item semeado carrega o rótulo de ponto de partida', () => {
    const semente = gradeSemente({ agora, dias: 7, maxItens: 7 })
    expect(semente).toHaveLength(7)  // o teto manda
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

  it('cobre almoço, tarde e jantar dentro do mesmo dia', () => {
    const semente = gradeSemente({ agora, dias: 2, maxItens: 99 })
    expect(semente.map((s) => s.hora)).toEqual([
      '11:30', '15:00', '18:30',
      '11:30', '15:00', '18:30',
    ])
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


describe('completarAteOAlvo', () => {
  const agora = new Date('2026-08-17T12:00:00.000Z')
  const real = (data: string, hora: string) => ({
    scheduledDatetime: `${data} ${hora}`,
    data,
    hora,
    diaSemana: 'terça-feira',
    motivo: 'costuma postar por volta das ' + hora,
    semente: false,
  })

  /**
   * 🔴 O defeito que esta função existe para travar: a cadência ESPELHA o que o
   * cliente fez. O Espeto caiu a 1,4 post/dia, e espelhar isso é propor uma
   * semana magra — ajudando o cliente a continuar magro.
   */
  it('completa o dia que ficou abaixo do ritmo', () => {
    const saida = completarAteOAlvo([real('2026-08-18', '12:00')], {
      agora,
      dias: 2, // hoje (17) e amanhã (18)
      maxItens: 99,
    })
    expect(saida).toHaveLength(POSTS_POR_DIA_ALVO)
    expect(saida.filter((s) => s.semente)).toHaveLength(POSTS_POR_DIA_ALVO - 1)
  })

  it('o slot real fica intacto, com o motivo estatístico dele', () => {
    const saida = completarAteOAlvo([real('2026-08-18', '12:00')], { agora, dias: 2, maxItens: 99 })
    const original = saida.find((s) => s.hora === '12:00')!
    expect(original.semente).toBe(false)
    expect(original.motivo).toContain('costuma postar')
  })

  it('o completado NÃO inventa estatística — carrega o rótulo próprio', () => {
    const saida = completarAteOAlvo([real('2026-08-18', '12:00')], { agora, dias: 2, maxItens: 99 })
    for (const s of saida.filter((x) => x.semente)) {
      expect(s.motivo).toContain(ROTULO_DE_COMPLEMENTO)
      expect(s.motivo).not.toContain('costuma postar')
      // Nem o rótulo de cold start: o cliente TEM rotina, ela é que é magra.
      expect(s.motivo).not.toContain(ROTULO_DE_COLD_START)
    }
  })

  it('dia que já bate o ritmo não é tocado', () => {
    const cheio = [
      real('2026-08-18', '09:00'),
      real('2026-08-18', '13:00'),
      real('2026-08-18', '20:00'),
    ]
    expect(completarAteOAlvo(cheio, { agora, dias: 2, maxItens: 99 })).toHaveLength(3)
  })

  it('quem publica MAIS que o alvo continua com tudo', () => {
    const quatro = [
      real('2026-08-18', '09:00'),
      real('2026-08-18', '13:00'),
      real('2026-08-18', '17:00'),
      real('2026-08-18', '20:00'),
    ]
    expect(completarAteOAlvo(quatro, { agora, dias: 2, maxItens: 99 })).toHaveLength(4)
  })

  /**
   * Dia sem nenhum slot real é dia em que o cliente NÃO costuma publicar.
   * Semear três ali desenharia uma semana que ele nunca teve.
   */
  it('dia vazio na cadência continua vazio', () => {
    const saida = completarAteOAlvo([real('2026-08-18', '12:00')], {
      agora,
      dias: 3,
      maxItens: 99,
    })
    expect(new Set(saida.map((s) => s.data))).toEqual(new Set(['2026-08-18']))
  })

  it('não repete um horário que o dia já tinha', () => {
    const saida = completarAteOAlvo([real('2026-08-18', '11:30')], {
      agora,
      dias: 2,
      maxItens: 99,
    })
    expect(saida.filter((s) => s.hora === '11:30')).toHaveLength(1)
  })

  it('o teto de itens é respeitado e a saída sai em ordem', () => {
    const saida = completarAteOAlvo([real('2026-08-18', '12:00')], { agora, dias: 2, maxItens: 2 })
    expect(saida).toHaveLength(2)
    expect(saida.map((s) => s.scheduledDatetime)).toEqual(
      [...saida.map((s) => s.scheduledDatetime)].sort(),
    )
  })

  it('lista vazia não vira semana inventada', () => {
    expect(completarAteOAlvo([], { agora, dias: 7, maxItens: 99 })).toEqual([])
  })
})


describe('horaMinimaHoje e diasAteDomingoBRT', () => {
  it('a folga de 90 minutos vale em BRT', () => {
    // 12:00 UTC = 09:00 BRT → mínimo 10:30.
    expect(horaMinimaHoje(new Date('2026-08-17T12:00:00.000Z'))).toBe('10:30')
  })

  it('terça cobre terça a domingo; domingo cobre só o domingo', () => {
    expect(diasAteDomingoBRT(new Date('2026-08-11T15:00:00.000Z'))).toBe(6) // terça
    expect(diasAteDomingoBRT(new Date('2026-08-10T15:00:00.000Z'))).toBe(7) // segunda
    expect(diasAteDomingoBRT(new Date('2026-08-16T15:00:00.000Z'))).toBe(1) // domingo
  })

  /**
   * 🔴 A meia-noite UTC engana: 02:00 UTC de quarta ainda é TERÇA às 23h em
   * Brasília — contar pela data UTC daria a janela do dia errado.
   */
  it('a virada do dia é a de Brasília, não a UTC', () => {
    expect(diasAteDomingoBRT(new Date('2026-08-12T02:00:00.000Z'))).toBe(6) // ainda terça em BRT
  })
})
