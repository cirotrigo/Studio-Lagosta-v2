/**
 * Ícones das combinações de texto durante a EDIÇÃO: trocar a imagem, tirar e
 * pôr o ícone ao lado de um texto sem sair da combinação.
 *
 * Módulo puro (sem React, sem Konva): o painel usa, o teste importa.
 */

import { createId } from '@/lib/id'
import type { Layer } from '@/types/template'

export interface Dimensoes {
  width: number
  height: number
}

export interface CaixaDoIcone {
  position: { x: number; y: number }
  size: Dimensoes
}

/** Camada de imagem que acompanha um texto (marca deixada ao aplicar a combinação) */
export function ehIconeDeTexto(layer: Pick<Layer, 'metadata'>): boolean {
  const iconeDe = layer.metadata?.iconeDe
  return typeof iconeDe === 'string' && iconeDe.length > 0
}

function proporcaoDe(natural: Dimensoes | null | undefined, fallback: number): number {
  return natural && natural.width > 0 && natural.height > 0 ? natural.width / natural.height : fallback
}

/**
 * A caixa do ícone depois de trocar a imagem: mesmo CENTRO e mesma ÁREA, na
 * proporção do arquivo novo. Manter a caixa antiga com `contain` encolheria o
 * relógio (quadrado) dentro da caixa alta do alfinete; manter a altura o
 * deixaria maior que os outros ícones. A área igual preserva o peso visual.
 */
export function caixaDoIconeTrocado(atual: CaixaDoIcone, natural: Dimensoes | null): CaixaDoIcone {
  const w0 = Math.max(1, atual.size.width)
  const h0 = Math.max(1, atual.size.height)
  const proporcao = proporcaoDe(natural, w0 / h0)
  const area = w0 * h0
  const width = Math.max(1, Math.round(Math.sqrt(area * proporcao)))
  const height = Math.max(1, Math.round(Math.sqrt(area / proporcao)))
  const centroX = atual.position.x + w0 / 2
  const centroY = atual.position.y + h0 / 2
  return {
    position: { x: Math.round(centroX - width / 2), y: Math.round(centroY - height / 2) },
    size: { width, height },
  }
}

export interface IconeNovoEntrada {
  texto: Layer
  url: string
  natural: Dimensoes | null
  /**
   * Um ícone que já acompanha outro texto da combinação: o novo copia dele o
   * tamanho, o vão e a altura em relação ao corpo da letra, para os ícones da
   * mesma combinação saírem alinhados entre si.
   */
  referencia?: { icone: Layer; texto: Layer } | null
  id?: string
}

/**
 * Ícone novo à esquerda de um texto. Sem referência, os números vêm dos ícones
 * aprovados da Real (corpo 32: área ~29², ~14px antes do texto) e o ícone
 * centra na primeira linha. Entra no mesmo grupo e na mesma posição da pilha,
 * com a marca `iconeDe` — o contrato de buildComboLayers, para salvar e
 * refluir igual.
 */
export function iconeNovoParaTexto({ texto, url, natural, referencia, id }: IconeNovoEntrada): Layer {
  const fontSize = Math.max(1, texto.style?.fontSize ?? 32)
  const lineHeight = texto.style?.lineHeight ?? 1.2

  let areaPorCorpo = 0.81
  let vaoPorCorpo = 0.45
  let centroPorCorpo = lineHeight / 2
  const corpoRef = referencia?.texto.style?.fontSize
  if (referencia && corpoRef && corpoRef > 0) {
    const { icone, texto: textoRef } = referencia
    const iw = icone.size?.width ?? 0
    const ih = icone.size?.height ?? 0
    areaPorCorpo = (iw * ih) / (corpoRef * corpoRef)
    vaoPorCorpo = ((textoRef.position?.x ?? 0) - ((icone.position?.x ?? 0) + iw)) / corpoRef
    centroPorCorpo = ((icone.position?.y ?? 0) + ih / 2 - (textoRef.position?.y ?? 0)) / corpoRef
  }

  const proporcao = proporcaoDe(natural, 1)
  const area = Math.max(1, areaPorCorpo * fontSize * fontSize)
  const width = Math.max(1, Math.round(Math.sqrt(area * proporcao)))
  const height = Math.max(1, Math.round(Math.sqrt(area / proporcao)))
  const vao = Math.round(vaoPorCorpo * fontSize)
  const tx = texto.position?.x ?? 0
  const ty = texto.position?.y ?? 0

  const meta = texto.metadata ?? {}
  const elementId = typeof meta.elementId === 'string' && meta.elementId ? meta.elementId : texto.id
  const rotulo = typeof meta.elementLabel === 'string' && meta.elementLabel ? meta.elementLabel : 'Texto'

  return {
    id: id ?? createId(),
    type: 'image',
    name: `${texto.name ?? rotulo} (ícone)`,
    visible: true,
    locked: false,
    order: 0,
    fileUrl: url,
    position: {
      x: tx - vao - width,
      y: Math.round(ty + centroPorCorpo * fontSize - height / 2),
    },
    size: { width, height },
    style: { objectFit: 'contain' },
    metadata: {
      ...(meta.presetId ? { presetId: meta.presetId } : {}),
      ...(meta.presetName ? { presetName: meta.presetName } : {}),
      elementId: `${elementId}:icone`,
      elementLabel: `${rotulo} (ícone)`,
      ...(typeof meta.groupId === 'string' && meta.groupId ? { groupId: meta.groupId } : {}),
      ...(typeof meta.stackOrder === 'number' ? { stackOrder: meta.stackOrder } : {}),
      iconeDe: elementId,
    },
  } as Layer
}
