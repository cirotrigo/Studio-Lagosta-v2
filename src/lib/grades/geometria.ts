/**
 * Geometria da grade (§3.1–§3.2 do plano). Espaçamento só nas bordas INTERNAS, meia calha de cada lado; a borda de
 * fora fica colada na caixa. Toda célula tem pelo menos MIN_CELULA px nos dois eixos — inclusive no eixo sem borda
 * interna e no layout de 1 célula —, então largura/altura ≤ 0 nunca sai daqui.
 *
 * Layout `politica: 'quadradas'` (Q1) tem ramo próprio: matriz de quadrados iguais com calha cheia entre eles, contida
 * e centralizada na caixa — a sobra de um eixo vira margem igual dos dois lados.
 */
import type { LayoutDeGrade } from './catalogo'
import { deu, falhou, type Resultado, type Retangulo } from './tipos'

export const MIN_CELULA = 8
export const ESPACAMENTO_MAX = 100
export const ESPACAMENTO_PADRAO = 10
/** Diferença máxima entre a geometria gravada e a recalculada (px) */
export const TOLERANCIA_PX = 1e-6

const finito = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

export function caixaValida(c: unknown): c is Retangulo {
  if (!c || typeof c !== 'object') return false
  const { x, y, w, h } = c as Retangulo
  return finito(x) && finito(y) && finito(w) && finito(h) && w > 0 && h > 0
}

/**
 * Caixas das células em px, na ordem do catálogo (= ordem de leitura), e o espaçamento efetivo:
 * `floor(clamp(g, 0, min(100, gMax)))`, onde gMax é o maior g que deixa toda célula com ≥ MIN_CELULA.
 */
export function celulasDaGrade(
  layout: LayoutDeGrade,
  caixa: Retangulo,
  espacamento: number,
): Resultado<{ celulas: Retangulo[]; espacamento: number }> {
  if (!caixaValida(caixa)) {
    return falhou([{ codigo: 'ENTRADA_INVALIDA', mensagem: 'Caixa da grade com valor não finito ou lado ≤ 0.' }])
  }
  if (!finito(espacamento)) {
    return falhou([{ codigo: 'ENTRADA_INVALIDA', mensagem: 'Espaçamento não finito.' }])
  }
  if (layout.politica === 'quadradas') return celulasQuadradas(layout, caixa, espacamento)
  const { x: dx, y: dy } = layout.divisoes
  const borda = (origem: number, lado: number, u: number, d: number) => origem + (lado * u) / d

  let gMax = Number.POSITIVE_INFINITY
  let menorLado = Number.POSITIVE_INFINITY
  for (const c of layout.celulas) {
    const larg = borda(caixa.x, caixa.w, c.x + c.w, dx) - borda(caixa.x, caixa.w, c.x, dx)
    const alt = borda(caixa.y, caixa.h, c.y + c.h, dy) - borda(caixa.y, caixa.h, c.y, dy)
    menorLado = Math.min(menorLado, larg, alt)
    const nx = (c.x > 0 ? 1 : 0) + (c.x + c.w < dx ? 1 : 0)
    const ny = (c.y > 0 ? 1 : 0) + (c.y + c.h < dy ? 1 : 0)
    if (nx > 0) gMax = Math.min(gMax, (2 * (larg - MIN_CELULA)) / nx)
    if (ny > 0) gMax = Math.min(gMax, (2 * (alt - MIN_CELULA)) / ny)
  }
  if (menorLado < MIN_CELULA || gMax < 0) {
    return falhou([
      {
        codigo: 'GRADE_PEQUENA_DEMAIS',
        mensagem: `Caixa ${caixa.w}×${caixa.h} pequena demais para "${layout.id}": a menor célula teria ${menorLado.toFixed(2)} px (mínimo ${MIN_CELULA}).`,
      },
    ])
  }
  const g = Math.floor(Math.min(Math.max(espacamento, 0), ESPACAMENTO_MAX, gMax))
  const meia = g / 2

  const celulas = layout.celulas.map((c) => {
    const x0 = borda(caixa.x, caixa.w, c.x, dx) + (c.x > 0 ? meia : 0)
    const x1 = borda(caixa.x, caixa.w, c.x + c.w, dx) - (c.x + c.w < dx ? meia : 0)
    const y0 = borda(caixa.y, caixa.h, c.y, dy) + (c.y > 0 ? meia : 0)
    const y1 = borda(caixa.y, caixa.h, c.y + c.h, dy) - (c.y + c.h < dy ? meia : 0)
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  })
  return deu({ celulas, espacamento: g })
}

/**
 * C colunas × R linhas de lado `s = min((W − (C−1)g)/C, (H − (R−1)g)/R)`, origem centralizada. Calha inteira limitada a
 * [0, 100] e ao maior g que deixa `s ≥ MIN_CELULA`; caixa que não comporta nem com calha 0 ⇒ GRADE_PEQUENA_DEMAIS.
 */
function celulasQuadradas(layout: LayoutDeGrade, caixa: Retangulo, espacamento: number): Resultado<{ celulas: Retangulo[]; espacamento: number }> {
  const { x: C, y: R } = layout.divisoes
  const lado = (g: number) => Math.min((caixa.w - (C - 1) * g) / C, (caixa.h - (R - 1) * g) / R)
  const gMax = Math.min(C > 1 ? (caixa.w - C * MIN_CELULA) / (C - 1) : Infinity, R > 1 ? (caixa.h - R * MIN_CELULA) / (R - 1) : Infinity)
  if (lado(0) < MIN_CELULA) {
    return falhou([
      {
        codigo: 'GRADE_PEQUENA_DEMAIS',
        mensagem: `Caixa ${caixa.w}×${caixa.h} pequena demais para "${layout.id}": cada quadrado teria ${lado(0).toFixed(2)} px (mínimo ${MIN_CELULA}).`,
      },
    ])
  }
  const g = Math.floor(Math.min(Math.max(espacamento, 0), ESPACAMENTO_MAX, gMax))
  const s = lado(g)
  const x0 = caixa.x + (caixa.w - (C * s + (C - 1) * g)) / 2
  const y0 = caixa.y + (caixa.h - (R * s + (R - 1) * g)) / 2
  return deu({ celulas: layout.celulas.map((c) => ({ x: x0 + c.x * (s + g), y: y0 + c.y * (s + g), w: s, h: s })), espacamento: g })
}

/** Espaçamento com que o layout entra na página (inserção, miniaturas, criar): o do catálogo ou o padrão */
export const espacamentoInicial = (layout: LayoutDeGrade) => layout.espacamentoInicial ?? ESPACAMENTO_PADRAO

/** Raio efetivo da célula: entre 0 e metade do lado menor (valor alto vira cápsula). NaN ⇒ 0. */
export function raioDaCelula(raio: number, celula: { w: number; h: number }): number {
  if (Number.isNaN(raio)) return 0
  return Math.min(Math.max(raio, 0), Math.min(celula.w, celula.h) / 2)
}

/** Índices das caixas de cima para baixo, da esquerda para a direita (empate dentro de TOLERANCIA_PX) */
export function ordemDeLeitura(caixas: ReadonlyArray<{ x: number; y: number }>): number[] {
  return caixas
    .map((_, i) => i)
    .sort((a, b) => {
      const dy = caixas[a].y - caixas[b].y
      if (Math.abs(dy) > TOLERANCIA_PX) return dy
      const dx = caixas[a].x - caixas[b].x
      return Math.abs(dx) > TOLERANCIA_PX ? dx : a - b
    })
}
