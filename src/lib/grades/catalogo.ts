/**
 * Catálogo de grades v1: os 14 layouts da pesquisa do Canva (27/10/2026), em UNIDADES INTEIRAS de uma divisão da
 * caixa. Inteiros e não frações: "a borda é interna?" vira comparação exata (`x > 0`, `x + w < divisoes.x`) e a
 * cobertura sem sobreposição se prova com aritmética exata. Congelado em profundidade.
 *
 * Grade gravada guarda `layout` + `versao`; a geometria efetiva fica nas camadas. Mudar um layout = versão nova,
 * nunca editar uma existente (grade antiga deixaria de conferir).
 *
 * `1-grande-4-pequenas` (grande em cima, 2×2 embaixo) é proposta deste G0: a pesquisa não fixou a disposição.
 *
 * Q1 (27/10): `4x7-quadrada` (Story, 28 fotos) e `4x5-quadrada` (Feed retrato, 20) entram NO FIM, com `politica:
 * 'quadradas'` e espaçamento inicial 0; os 14 de antes ficam com os mesmos objetos (sem chave nova).
 */
import type { Retangulo } from './tipos'

export interface LayoutDeGrade {
  id: string
  versao: number
  nome: string
  divisoes: { x: number; y: number }
  /** em unidades de `divisoes`, já na ordem de leitura (o índice é `metadata.grade.celula`) */
  celulas: ReadonlyArray<Retangulo>
  /**
   * `'quadradas'`: células iguais 1:1, contidas e centralizadas na caixa (a sobra vira margem, o quadrado nunca
   * estica); `celulas` são unidades 1×1 de uma matriz `divisoes.x × divisoes.y`. Ausente: as células preenchem a caixa.
   */
  politica?: 'quadradas'
  /** Espaçamento ao inserir (ausente = o padrão). Ler sempre por `espacamentoInicial` (geometria). */
  espacamentoInicial?: number
}

export const VERSAO_DO_CATALOGO = 1

type Def = [id: string, nome: string, dx: number, dy: number, celulas: Array<[number, number, number, number]>]

const DEFS: Def[] = [
  ['1-celula', '1 célula', 1, 1, [[0, 0, 1, 1]]],
  ['2-colunas', '2 colunas', 2, 1, [[0, 0, 1, 1], [1, 0, 1, 1]]],
  ['2-linhas', '2 linhas', 1, 2, [[0, 0, 1, 1], [0, 1, 1, 1]]],
  ['2-60-40', '2 colunas 60/40', 5, 1, [[0, 0, 3, 1], [3, 0, 2, 1]]],
  ['3-linhas', '3 linhas', 1, 3, [[0, 0, 1, 1], [0, 1, 1, 1], [0, 2, 1, 1]]],
  ['1-cima-2-baixo', '1 em cima, 2 embaixo', 2, 2, [[0, 0, 2, 1], [0, 1, 1, 1], [1, 1, 1, 1]]],
  ['2-cima-1-baixo', '2 em cima, 1 embaixo', 2, 2, [[0, 0, 1, 1], [1, 0, 1, 1], [0, 1, 2, 1]]],
  ['1-esquerda-2-direita', '1 grande à esquerda, 2 à direita', 2, 2, [[0, 0, 1, 2], [1, 0, 1, 1], [1, 1, 1, 1]]],
  ['2x2', '2×2', 2, 2, [[0, 0, 1, 1], [1, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 1]]],
  ['1-cima-3-baixo', '1 em cima, 3 embaixo', 3, 2, [[0, 0, 3, 1], [0, 1, 1, 1], [1, 1, 1, 1], [2, 1, 1, 1]]],
  ['2-1-2', '2 / 1 larga / 2', 2, 3, [[0, 0, 1, 1], [1, 0, 1, 1], [0, 1, 2, 1], [0, 2, 1, 1], [1, 2, 1, 1]]],
  ['1-grande-4-pequenas', '1 grande + 4 pequenas', 2, 4, [[0, 0, 2, 2], [0, 2, 1, 1], [1, 2, 1, 1], [0, 3, 1, 1], [1, 3, 1, 1]]],
  ['2x3', '2×3', 2, 3, [[0, 0, 1, 1], [1, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 1], [0, 2, 1, 1], [1, 2, 1, 1]]],
  ['3x2', '3×2', 3, 2, [[0, 0, 1, 1], [1, 0, 1, 1], [2, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 1], [2, 1, 1, 1]]],
]

const doDef = ([id, nome, dx, dy, celulas]: Def): LayoutDeGrade =>
  Object.freeze({
    id,
    versao: VERSAO_DO_CATALOGO,
    nome,
    divisoes: Object.freeze({ x: dx, y: dy }),
    celulas: Object.freeze(celulas.map(([x, y, w, h]) => Object.freeze({ x, y, w, h }))),
  })

/** Matriz C×R de quadrados iguais, em ordem de leitura */
const quadrada = (id: string, nome: string, c: number, r: number): LayoutDeGrade =>
  Object.freeze({
    ...doDef([id, nome, c, r, Array.from({ length: c * r }, (_, i): [number, number, number, number] => [i % c, Math.floor(i / c), 1, 1])]),
    politica: 'quadradas' as const,
    espacamentoInicial: 0,
  })

export const CATALOGO_DE_GRADES: ReadonlyArray<LayoutDeGrade> = Object.freeze([
  ...DEFS.map(doDef),
  quadrada('4x7-quadrada', 'Story · 28 fotos quadradas (4×7)', 4, 7),
  quadrada('4x5-quadrada', 'Feed retrato · 20 fotos quadradas (4×5)', 4, 5),
])

export function layoutDoCatalogo(id: unknown, versao: unknown): LayoutDeGrade | undefined {
  return CATALOGO_DE_GRADES.find((l) => l.id === id && l.versao === versao)
}

/** Células em frações 0..1 da caixa (conferência de área do catálogo; o desenho real sai de `celulasDaGrade`) */
export function fracoesDoLayout(layout: LayoutDeGrade): Retangulo[] {
  const { x: dx, y: dy } = layout.divisoes
  return layout.celulas.map((c) => ({ x: c.x / dx, y: c.y / dy, w: c.w / dx, h: c.h / dy }))
}
