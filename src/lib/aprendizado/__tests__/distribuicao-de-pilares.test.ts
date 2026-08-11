import { describe, it, expect } from 'vitest'
import {
  distribuicaoPorRecencia,
  referenciaDeRecencia,
  type PostComPilar,
} from '../distribuicao-de-pilares'

const AGORA = new Date('2026-08-11T12:00:00.000Z')
const DIA = 86_400_000

/** Posts de um pilar, todos com a mesma idade. */
function lote(pilar: string, quantos: number, idadeEmDias: number): PostComPilar[] {
  return Array.from({ length: quantos }, () => ({
    pilar,
    quando: new Date(AGORA.getTime() - idadeEmDias * DIA),
  }))
}

describe('distribuicaoPorRecencia', () => {
  /**
   * O defeito que este módulo veio fechar: o `groupBy` chapado de 180 dias dava
   * a um happy hour abandonado em março o mesmo peso do que saiu ontem.
   */
  it('o assunto recente pesa mais que o antigo com a MESMA contagem', () => {
    const r = distribuicaoPorRecencia([...lote('recente', 10, 5), ...lote('antigo', 10, 120)], AGORA)
    const recente = r.find((p) => p.pilar === 'recente')!
    const antigo = r.find((p) => p.pilar === 'antigo')!

    expect(recente.total).toBe(antigo.total)
    expect(recente.fracao).toBeGreaterThan(antigo.fracao)
    expect(r[0].pilar).toBe('recente')
  })

  /**
   * A contagem crua continua exposta — é ela que diz se há dado suficiente.
   *
   * Note que o LOTE MAIS NOVO pesa 1 por post: a âncora é a última atividade,
   * então o post mais recente do cliente vale sempre 1, e o desconto é sempre
   * relativo a ele. Quem encolhe é o lote velho.
   */
  it('total é a contagem crua; só o lote antigo tem peso menor que ela', () => {
    const r = distribuicaoPorRecencia([...lote('novo', 7, 0), ...lote('velho', 7, 63)], AGORA)
    const novo = r.find((p) => p.pilar === 'novo')!
    const velho = r.find((p) => p.pilar === 'velho')!

    expect(novo.total).toBe(7)
    expect(velho.total).toBe(7)
    expect(novo.peso).toBeCloseTo(7, 5)
    // 63 dias = 3 meias-vidas ⇒ 1/8 do peso.
    expect(velho.peso).toBeCloseTo(7 / 8, 5)
  })

  /**
   * 🔴 Ancorar no relógio faria o cliente que parou de publicar ver TODO o peso
   * evaporar — o sistema emudeceria justamente com quem precisa voltar a
   * postar. É a mesma lição que `cadencia.ts` já tinha pago.
   */
  it('cliente parado há dois meses mantém a distribuição, não zera', () => {
    const parado = [...lote('a', 6, 60), ...lote('b', 3, 62)]
    const r = distribuicaoPorRecencia(parado, AGORA)

    expect(r.reduce((t, p) => t + p.fracao, 0)).toBeCloseTo(1, 1)
    expect(r[0].pilar).toBe('a')
    // Com âncora no relógio, 60 dias ≈ 3 meias-vidas: o peso do topo cairia
    // para ~0,1 por post. Ancorado na última atividade, ele é ~1.
    expect(r[0].peso).toBeGreaterThan(4)
  })

  it('dentro do MESMO cliente, a ordem entre assuntos ainda diferencia idade', () => {
    // Tudo antigo, mas 'b' é 40 dias mais velho que 'a'.
    const r = distribuicaoPorRecencia([...lote('a', 5, 60), ...lote('b', 5, 100)], AGORA)
    expect(r[0].pilar).toBe('a')
    expect(r.find((p) => p.pilar === 'a')!.fracao).toBeGreaterThan(
      r.find((p) => p.pilar === 'b')!.fracao,
    )
  })

  /** Post sem data aconteceu — não pode sumir da contagem por isso. */
  it('post sem data conta no total e não derruba a fração dos outros', () => {
    const r = distribuicaoPorRecencia(
      [...lote('a', 3, 2), { pilar: 'b', quando: null }, { pilar: 'b', quando: null }],
      AGORA,
    )
    const b = r.find((p) => p.pilar === 'b')!
    expect(b.total).toBe(2)
    expect(b.peso).toBe(0)
    expect(r.find((p) => p.pilar === 'a')!.fracao).toBeCloseTo(1, 1)
  })

  /**
   * Sem NENHUMA data não há recência a medir. Devolver tudo zerado seria pior
   * que a resposta antiga, então o módulo cai na contagem chapada.
   */
  it('sem nenhuma data, cai na contagem chapada em vez de zerar tudo', () => {
    const r = distribuicaoPorRecencia(
      [
        { pilar: 'a', quando: null },
        { pilar: 'a', quando: null },
        { pilar: 'a', quando: null },
        { pilar: 'b', quando: null },
      ],
      AGORA,
    )
    expect(r.find((p) => p.pilar === 'a')!.fracao).toBeCloseTo(0.75, 2)
    expect(r.find((p) => p.pilar === 'b')!.fracao).toBeCloseTo(0.25, 2)
  })

  it('lista vazia devolve lista vazia, sem NaN', () => {
    expect(distribuicaoPorRecencia([], AGORA)).toEqual([])
  })

  it('as frações somam 1', () => {
    const r = distribuicaoPorRecencia(
      [...lote('a', 4, 3), ...lote('b', 9, 30), ...lote('c', 2, 150)],
      AGORA,
    )
    expect(r.reduce((t, p) => t + p.fracao, 0)).toBeCloseTo(1, 1)
  })
})

describe('referenciaDeRecencia', () => {
  it('é a última atividade quando ela está no passado', () => {
    const posts = [...lote('a', 1, 30), ...lote('b', 1, 10)]
    expect(referenciaDeRecencia(posts, AGORA).getTime()).toBe(AGORA.getTime() - 10 * DIA)
  })

  /** Post agendado à frente não pode empurrar a referência para o futuro. */
  it('nunca passa de agora', () => {
    const futuro = [{ pilar: 'a', quando: new Date(AGORA.getTime() + 5 * DIA) }]
    expect(referenciaDeRecencia(futuro, AGORA).getTime()).toBe(AGORA.getTime())
  })

  it('sem data nenhuma, é agora', () => {
    expect(referenciaDeRecencia([{ pilar: 'a', quando: null }], AGORA).getTime()).toBe(
      AGORA.getTime(),
    )
  })
})
