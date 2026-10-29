/**
 * As margens de `margensDoEditor` nas formas que o EDITOR consome (L1 das linhas-guia, 29/10/2026) — módulo puro,
 * sem Konva: os retângulos invisíveis do encaixe ao arrastar, as paradas do encaixe no redimensionar, as linhas azuis
 * da margem da marca, as faixas hachuradas da interface e as distâncias por eixo do "alinhar". Uma conversão só,
 * testada, para o stage, o transformer e o contexto não refazerem a conta cada um do seu jeito.
 */
import type { FaixasDaInterface, LinhasDaMarca } from './canvas-margin'
import type { RectInfo } from './konva-smart-guides'

/** As quatro linhas da marca como "objetos" de largura ou altura zero: o encaixe ao arrastar gruda nelas. */
export function retangulosDeEncaixe(marca: LinhasDaMarca, largura: number, altura: number): RectInfo[] {
  return [
    { id: 'margin-left', x: marca.esquerda, y: 0, width: 0, height: altura },
    { id: 'margin-right', x: marca.direita, y: 0, width: 0, height: altura },
    { id: 'margin-top', x: 0, y: marca.topo, width: largura, height: 0 },
    { id: 'margin-bottom', x: 0, y: marca.base, width: largura, height: 0 },
  ]
}

/** As paradas do encaixe no redimensionar: x das linhas verticais, y das horizontais. */
export function paradasDeEncaixe(marca: LinhasDaMarca): { v: number[]; h: number[] } {
  return { v: [marca.esquerda, marca.direita], h: [marca.topo, marca.base] }
}

/** As linhas azuis tracejadas, prontas para `<Line points>`. */
export function linhasDaMarca(marca: LinhasDaMarca, largura: number, altura: number): Array<{ id: string; points: [number, number, number, number] }> {
  return [
    { id: 'margem-esquerda', points: [marca.esquerda, 0, marca.esquerda, altura] },
    { id: 'margem-direita', points: [marca.direita, 0, marca.direita, altura] },
    { id: 'margem-topo', points: [0, marca.topo, largura, marca.topo] },
    { id: 'margem-base', points: [0, marca.base, largura, marca.base] },
  ]
}

/** As faixas da interface do Instagram (só Story): a de cima e a de baixo, prontas para `<Rect>`. Vazio fora do Story. */
export function faixasDaInterface(faixa: FaixasDaInterface | null, largura: number, altura: number): Array<{ id: string; x: number; y: number; width: number; height: number }> {
  if (!faixa) return []
  return [
    { id: 'interface-topo', x: 0, y: 0, width: largura, height: faixa.topo },
    { id: 'interface-rodape', x: 0, y: altura - faixa.rodape, width: largura, height: faixa.rodape },
  ]
}

/** As DISTÂNCIAS das bordas num eixo (o que `alignToCanvas` usa): `x` → esquerda/direita, `y` → topo/base. */
export function margensDoEixo(marca: LinhasDaMarca, axis: 'x' | 'y', largura: number, altura: number): { start: number; end: number } {
  return axis === 'x' ? { start: marca.esquerda, end: largura - marca.direita } : { start: marca.topo, end: altura - marca.base }
}
