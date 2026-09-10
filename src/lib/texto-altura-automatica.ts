/**
 * A atualização que o editor grava quando mede a altura natural de um texto
 * com crescimento automático (`autoWrap.autoExpand`).
 *
 * Módulo puro: o componente do editor usa, o teste importa sem React.
 */

export type AncoraDoTexto = 'top' | 'middle' | 'bottom'

export interface AjusteDeAlturaEntrada {
  anchor: AncoraDoTexto
  x: number
  y: number
  width: number
  /** Altura natural medida (já arredondada para cima) */
  natural: number
  /** Altura gravada na camada antes da medida */
  atual: number
}

/**
 * Com a âncora no TOPO a posição não vai junto — o y não muda, e mandar o y
 * lido no render regravava um valor velho por cima do deslocamento que a
 * pilha do grupo acabou de aplicar. Isso acontece quando vários textos do
 * mesmo grupo são medidos no mesmo instante (ao abrir a página): os textos de
 * baixo voltavam ao lugar antigo e só as camadas que não são texto ficavam
 * deslocadas — era o que tirava os ícones de local e horário do alinhamento.
 *
 * Nas outras âncoras quem se move é a própria caixa, pelo delta da altura.
 */
export function ajusteDeAlturaMedida({ anchor, x, y, width, natural, atual }: AjusteDeAlturaEntrada): {
  size: { width: number; height: number }
  position?: { x: number; y: number }
} {
  const size = { width, height: natural }
  if (anchor === 'top') return { size }
  const diff = natural - atual
  const novoY = anchor === 'bottom' ? y - diff : y - diff / 2
  return { size, position: { x, y: Math.round(novoY) } }
}
