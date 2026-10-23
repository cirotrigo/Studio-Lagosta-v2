/**
 * A camada FINAL que o painel de formas insere a partir de um item do catálogo (CP-V2c). Módulo PURO: sem React e sem
 * `@/lib/db`; o painel o chama e entrega o resultado a UM `addLayer` (uma camada, uma entrada de desfazer).
 *
 * - Tamanho e posição: a fórmula que o painel já usava (largura `min(360, 33% do canvas)`, linha com 40 de altura,
 *   o resto pela proporção do item), centrada.
 * - Cor de cada canal: o papel do slot resolvido pela marca (`resolverCorDaMarca`, CP-V2a). A vitrine do item
 *   (`fill`/`strokeColor` da definição) NUNCA é lida: canal sem slot fica sem cor (`fill: 'transparent'`, sem
 *   `strokeColor`).
 * - O estilo sai pela MESMA canonização do servidor (`canonicalizeShapeStyleForPersistence`): o estado do editor já
 *   nasce igual ao que o PATCH grava.
 * - Proveniência em `style.vetor` (item, versão, papel por canal); `manterProporcao: true` só no item `travado`;
 *   o raio da pílula vai em `style.border.radius` (os dois renderers o limitam a min(w, h) / 2).
 */
import type { ShapeDefinition } from '@/lib/assets/shapes-library'
import { resolverCorDaMarca, type DadosDaMarca } from '@/lib/brand/papeis-de-cor'
import { canonicalizeShapeStyleForPersistence } from '@/lib/shape-style'
import type { CanalDeCor, VetorDaCamada } from '@/lib/vetor/tipos'
import type { Layer, LayerStyle } from '@/types/template'

export interface ContextoDaInsercao {
  /** `createDefaultLayer('shape')`: id, ordem e estilo base da camada nova. */
  base: Layer
  canvas: { width: number; height: number }
  marca: DadosDaMarca
}

export function camadaDoElemento(definicao: ShapeDefinition, { base, canvas, marca }: ContextoDaInsercao): Layer {
  const slots = definicao.slots ?? []
  if (slots.length === 0) throw new Error(`item do catálogo sem slot de cor: ${definicao.id}`)
  const corDo = (canal: CanalDeCor) => {
    const slot = slots.find((s) => s.canal === canal)
    return slot ? resolverCorDaMarca(slot.papelPadrao, marca).hex : undefined
  }
  const papeis: VetorDaCamada['papeis'] = Object.fromEntries(slots.map((s) => [s.canal, s.papelPadrao]))
  const vetor: VetorDaCamada = { asset: { id: definicao.id, versao: definicao.versao ?? 1 }, papeis }

  const width = Math.min(360, Math.round(canvas.width * 0.33)) || 240
  const height = definicao.shapeType === 'line' ? 40 : Math.round(width / (definicao.aspect ?? 1))

  const style: LayerStyle = {
    ...base.style,
    shapeType: definicao.shapeType,
    fill: corDo('preenchimento') ?? 'transparent',
    strokeColor: corDo('contorno'),
    strokeWidth: definicao.strokeWidth ?? base.style?.strokeWidth,
    pathData: definicao.pathData,
    pathFillRule: definicao.pathFillRule,
    lineStyle: definicao.lineStyle,
    lineStartCap: definicao.lineStartCap,
    lineEndCap: definicao.lineEndCap,
    ...(definicao.tracoPontas && { tracoPontas: definicao.tracoPontas }),
    // `width: 0` e cor transparente: o raio não liga contorno nenhum, nem no servidor quando o `strokeColor` some
    ...(definicao.raio !== undefined && { border: { width: 0, color: 'transparent', radius: definicao.raio } }),
    ...(definicao.ajuste === 'travado' && { manterProporcao: true }),
    vetor,
  }

  return {
    ...base,
    name: definicao.label,
    size: { width, height },
    position: {
      x: Math.max(0, Math.round((canvas.width - width) / 2)),
      y: Math.max(0, Math.round((canvas.height - height) / 2)),
    },
    style: canonicalizeShapeStyleForPersistence(style),
  }
}

/**
 * O que gravar junto quando a pessoa ESCOLHE a cor de um canal (campo de texto, seletor nativo ou swatch): o
 * `style.vetor` sem o papel daquele canal, para o "Reaplicar cores da marca" (V3) não desfazer a escolha. Mexer só na
 * transparência não é escolha de cor e não passa por aqui. Sem papel naquele canal, nada muda (`{}`).
 */
export function escolhaExplicitaDaCor(style: LayerStyle | undefined, canal: CanalDeCor): Pick<LayerStyle, 'vetor'> {
  const vetor = style?.vetor
  if (!vetor?.papeis?.[canal]) return {}
  const restantes = Object.fromEntries(Object.entries(vetor.papeis).filter(([c]) => c !== canal))
  const proximo: VetorDaCamada = { ...vetor, papeis: restantes }
  if (Object.keys(restantes).length === 0) delete proximo.papeis
  return { vetor: proximo }
}
