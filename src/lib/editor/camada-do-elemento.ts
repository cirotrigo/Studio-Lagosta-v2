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
 * - Multicor (CP-V5): as partes são COPIADAS para `style.vetor.partes`, cada slot ganha a cor do seu papel em
 *   `style.vetor.cores` (e o papel em `style.vetor.papeis`, por slot); a silhueta (`pathData` + `fill`) leva a cor do
 *   slot da primeira parte de preenchimento.
 */
import type { ShapeDefinition } from '@/lib/assets/shapes-library'
import { resolverCorDaMarca, type DadosDaMarca } from '@/lib/brand/papeis-de-cor'
import { canonicalizeShapeStyleForPersistence } from '@/lib/shape-style'
import { slotDaSilhueta } from '@/lib/vetor/partes'
import type { CanalDeCor, ChaveDeCor, VetorDaCamada } from '@/lib/vetor/tipos'
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
  const asset = { id: definicao.id, versao: definicao.versao ?? 1 }
  let vetor: VetorDaCamada
  let cor: Partial<Record<CanalDeCor, string>>
  if (definicao.partes?.length) {
    const cores = Object.fromEntries(slots.map((s) => [s.id!, resolverCorDaMarca(s.papelPadrao, marca).hex]))
    vetor = {
      asset,
      papeis: Object.fromEntries(slots.map((s) => [s.id!, s.papelPadrao])),
      partes: definicao.partes.map((p) => ({ ...p })),
      cores,
    }
    const silhueta = slotDaSilhueta(definicao.partes)
    cor = { preenchimento: silhueta ? cores[silhueta] : undefined }
  } else {
    vetor = { asset, papeis: Object.fromEntries(slots.map((s) => [s.canal, s.papelPadrao])) }
    cor = { preenchimento: corDo('preenchimento'), contorno: corDo('contorno') }
  }

  const width = Math.min(360, Math.round(canvas.width * 0.33)) || 240
  // proporção inválida vale 1 e a altura nunca arredonda para 0 (item muito largo) — os itens publicados não mudam
  const aspect = definicao.aspect !== undefined && Number.isFinite(definicao.aspect) && definicao.aspect > 0 ? definicao.aspect : 1
  const height = definicao.shapeType === 'line' ? 40 : Math.max(1, Math.round(width / aspect))

  return {
    ...base,
    name: definicao.label,
    size: { width, height },
    position: {
      x: Math.max(0, Math.round((canvas.width - width) / 2)),
      y: Math.max(0, Math.round((canvas.height - height) / 2)),
    },
    style: estiloDoElemento(definicao, base.style, cor, vetor),
  }
}

/** O desenho de um item do catálogo — o que o estilo da camada copia (e o que a receita congelada do acento do T1b guarda). */
export type DesenhoDoElemento = Pick<ShapeDefinition, 'shapeType' | 'strokeWidth' | 'pathData' | 'pathFillRule' | 'lineStyle' | 'lineStartCap' | 'lineEndCap' | 'tracoPontas' | 'raio' | 'ajuste'> &
  Partial<Pick<ShapeDefinition, 'pathViewBox'>>

/**
 * O estilo FINAL da camada de um item, com a cor de cada canal já decidida por quem chama (a inserção do painel, pela
 * marca; o compositor, no T1b, pelo texto a que o acento se prende). Canal sem cor fica sem cor. Sai pela canonização
 * do servidor.
 */
export function estiloDoElemento(desenho: DesenhoDoElemento, base: LayerStyle | undefined, cor: Partial<Record<CanalDeCor, string>>, vetor: VetorDaCamada): LayerStyle {
  const style: LayerStyle = {
    ...base,
    shapeType: desenho.shapeType,
    fill: cor.preenchimento ?? 'transparent',
    strokeColor: cor.contorno,
    strokeWidth: desenho.strokeWidth ?? base?.strokeWidth,
    pathData: desenho.pathData,
    ...(desenho.pathViewBox && { pathViewBox: [...desenho.pathViewBox] as [number, number, number, number] }),
    pathFillRule: desenho.pathFillRule,
    lineStyle: desenho.lineStyle,
    lineStartCap: desenho.lineStartCap,
    lineEndCap: desenho.lineEndCap,
    ...(desenho.tracoPontas && { tracoPontas: desenho.tracoPontas }),
    // `width: 0` e cor transparente: o raio não liga contorno nenhum, nem no servidor quando o `strokeColor` some
    ...(desenho.raio !== undefined && { border: { width: 0, color: 'transparent', radius: desenho.raio } }),
    ...(desenho.ajuste === 'travado' && { manterProporcao: true }),
    vetor,
  }
  return canonicalizeShapeStyleForPersistence(style)!
}

/**
 * O que gravar junto quando a pessoa ESCOLHE a cor de um canal (campo de texto, seletor nativo ou swatch): o
 * `style.vetor` sem o papel daquele canal, para o "Reaplicar cores da marca" (V3) não desfazer a escolha. Mexer só na
 * transparência não é escolha de cor e não passa por aqui. Sem papel naquele canal, nada muda (`{}`).
 */
export function escolhaExplicitaDaCor(style: LayerStyle | undefined, canal: ChaveDeCor): Pick<LayerStyle, 'vetor'> {
  const vetor = style?.vetor
  if (!vetor?.papeis?.[canal]) return {}
  const restantes = Object.fromEntries(Object.entries(vetor.papeis).filter(([c]) => c !== canal))
  const proximo: VetorDaCamada = { ...vetor, papeis: restantes }
  if (Object.keys(restantes).length === 0) delete proximo.papeis
  return { vetor: proximo }
}
