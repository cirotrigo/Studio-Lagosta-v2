/**
 * Trava de proporção do Transformer do editor (CP-V1), pura para ser testada sem Konva.
 *
 * - imagem, logo e elemento: sempre `keepRatio` (como antes), com as 8 alças: as do meio
 *   delas recortam a janela, não esticam (`cropForResizedBox`);
 * - forma com `style.manterProporcao === true`: `keepRatio` e SÓ as alças dos cantos. O
 *   `keepRatio` do Konva não vale nas alças do meio, que mudariam um eixo só;
 * - o resto (texto, forma sem a trava): livre, com `keepRatio` só com Shift.
 *
 * O Transformer é um só para a seleção inteira: basta uma forma travada na seleção para
 * o grupo todo redimensionar pelos cantos com a proporção mantida.
 */
import type { Layer } from '@/types/template'

export type Ancora =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'

export const TODAS_AS_ANCORAS: Ancora[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right', 'top-center', 'bottom-center']
export const ANCORAS_DOS_CANTOS: Ancora[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

const SEMPRE_PROPORCIONAL = new Set<Layer['type']>(['image', 'logo', 'element'])

/**
 * O que o painel da forma oferece (CP-V1): a trava de proporção em TODA forma (é só o gesto do
 * editor); o espelho só no `svg-path`, o único desenho que espelha nos dois renderers. As outras
 * formas não ganham espelho aqui.
 */
export function controlesDaForma(layer: Pick<Layer, 'type' | 'style'>): { trava: boolean; espelho: boolean } {
  const forma = layer.type === 'shape'
  return { trava: forma, espelho: forma && layer.style?.shapeType === 'svg-path' }
}

export function travaDeProporcao(layers: Layer[], selecionadas: string[], shift: boolean): { keepRatio: boolean; ancoras: Ancora[] } {
  const ids = new Set(selecionadas)
  const sel = layers.filter((l) => ids.has(l.id))
  const formaTravada = sel.some((l) => l.type === 'shape' && l.style?.manterProporcao === true)
  return {
    keepRatio: formaTravada || shift || sel.some((l) => SEMPRE_PROPORCIONAL.has(l.type)),
    ancoras: formaTravada ? ANCORAS_DOS_CANTOS : TODAS_AS_ANCORAS,
  }
}
