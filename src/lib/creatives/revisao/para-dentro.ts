/**
 * "Trazer para dentro" — o deslocamento MÍNIMO que devolve uma caixa ao retângulo permitido (módulo puro).
 *
 * É a conta que o revisor já fazia inline em `regras.ts` (regra `fora-da-area-segura`, ajuste `mover`), extraída
 * em 29/10/2026 (L3 das linhas-guia) para o editor usar a MESMA — nunca copiada. A folga de 2 px e o `ceil(+2)`
 * são os do revisor: passar menos que a folga não é invasão; o ajuste empurra 2 px além da linha.
 */

export interface Caixa {
  x: number
  y: number
  width: number
  height: number
}

/** As quatro LINHAS (coordenadas), como `limitesDoEditor` / `margensDoEditor(...).marca`. */
export interface Limites {
  topo: number
  base: number
  esquerda: number
  direita: number
}

export type Lado = 'topo' | 'base' | 'esquerda' | 'direita'

export interface AjusteParaDentro {
  /** Os lados em que a caixa passa da linha além da folga. Vazio = está dentro. */
  lados: Lado[]
  /** O deslocamento mínimo (0 quando não há o que mover, ou quando a caixa é maior que a área naquele eixo). */
  dx: number
  dy: number
  /** O maior excesso, em px. */
  maior: number
  /** A caixa é mais alta / mais larga que a área: mover não resolve (encurtar o texto ou reduzir a fonte). */
  vertical: boolean
  horizontal: boolean
}

export function ajusteParaDentro(caixa: Caixa, lim: Limites, folga = 2): AjusteParaDentro {
  const sobra = {
    topo: lim.topo - caixa.y,
    base: caixa.y + caixa.height - lim.base,
    esquerda: lim.esquerda - caixa.x,
    direita: caixa.x + caixa.width - lim.direita,
  }
  const lados = (Object.keys(sobra) as Lado[]).filter((k) => sobra[k] > folga)
  const vertical = sobra.topo > folga && sobra.base > folga
  const horizontal = sobra.esquerda > folga && sobra.direita > folga
  let dy = 0
  let dx = 0
  if (!vertical) dy = sobra.topo > folga ? Math.ceil(sobra.topo + folga) : sobra.base > folga ? -Math.ceil(sobra.base + folga) : 0
  if (!horizontal) dx = sobra.esquerda > folga ? Math.ceil(sobra.esquerda + folga) : sobra.direita > folga ? -Math.ceil(sobra.direita + folga) : 0
  const maior = lados.length > 0 ? Math.max(...lados.map((k) => sobra[k])) : 0
  return { lados, dx, dy, maior, vertical, horizontal }
}

/**
 * A faixa da interface do Story como limites só VERTICAIS (texto e logo não entram nela; a largura não importa):
 * os lados da própria caixa viram as linhas da esquerda e da direita, então só topo/base podem sobrar.
 */
export function limitesDaFaixa(caixa: Caixa, faixa: { topo: number; rodape: number }, altura: number): Limites {
  return { topo: faixa.topo, base: altura - faixa.rodape, esquerda: caixa.x, direita: caixa.x + caixa.width }
}
