/**
 * BLOCO DE FUNDO — uma mancha só para os textos de um grupo.
 *
 * Manchete e apoio costumam ser camadas separadas. Com um fundo por texto, as
 * duas manchas se sobrepõem (tinta 0,6 vira 0,84 na interseção) e a de uma se
 * espalha por trás da outra. O `_halo.py` do canvas de design resolve com UM
 * halo por BLOCO; aqui o bloco é o GRUPO estilo Canva (`metadata.groupId`,
 * Cmd+G): explícito, previsível, e o arraste em grupo já move tudo junto.
 *
 * Regras (as mesmas nos dois motores — este módulo é PURO):
 *  - entram no bloco os textos do mesmo grupo que estão visíveis, com fundo
 *    ligado, sem rotação e sem texto curvo — texto girado desenha o próprio
 *    fundo (a união de caixas giradas seria inventar geometria);
 *  - o LÍDER desenha, com a configuração DELE; é o primeiro pela ordem de
 *    empilhamento (menor `order`), que fica por baixo dos outros;
 *  - com menos de 2 membros não há bloco: cada texto desenha o seu, como sempre.
 */

import type { Layer } from '@/types/template'

import { resolverFundo, type FundoResolvido } from './fundo-de-texto'
import { uniao, type Rect } from './halo'

/** `metadata.groupId` da camada, ou null. */
export function grupoDaCamada(layer: Layer): string | null {
  const id = layer.metadata?.groupId
  return typeof id === 'string' && id ? id : null
}

function textoCurvo(layer: Layer): boolean {
  const c = layer.effects?.curved
  return !!c?.enabled && (c.curvature ?? 0) !== 0
}

/** A camada pode participar de um bloco de fundo? */
export function elegivelParaBloco(layer: Layer): boolean {
  if (layer.type !== 'text' || layer.visible === false) return false
  if (!resolverFundo(layer.effects?.background)) return false
  if ((layer.rotation ?? 0) !== 0) return false
  if (textoCurvo(layer)) return false
  return true
}

/**
 * Membros do bloco de `layer`: os elegíveis do mesmo grupo, ordenados pela
 * ordem de empilhamento. Vazio quando a camada não tem grupo ou não é
 * elegível — e com um só membro não há bloco.
 */
export function membrosDoBloco(layers: Layer[], layer: Layer): Layer[] {
  const grupo = grupoDaCamada(layer)
  if (!grupo || !elegivelParaBloco(layer)) return []
  return layers
    .filter((l) => grupoDaCamada(l) === grupo && elegivelParaBloco(l))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

export type PapelNoBloco = 'sozinho' | 'lider' | 'membro'

export interface BlocoDaCamada {
  papel: PapelNoBloco
  /** Os membros do bloco (só a própria camada quando `sozinho`). */
  membros: Layer[]
}

/** O que esta camada faz pelo fundo: desenha o seu, desenha o do bloco, ou nada. */
export function papelNoBloco(layers: Layer[], layer: Layer): BlocoDaCamada {
  const membros = membrosDoBloco(layers, layer)
  if (membros.length < 2) return { papel: 'sozinho', membros: [layer] }
  return { papel: membros[0].id === layer.id ? 'lider' : 'membro', membros }
}

/**
 * Retângulo do bloco: a união das bases dos membros (tinta ou caixa, JÁ em
 * coordenadas da página) crescida pela borda e deslocada — a mesma conta de
 * `retanguloDoFundo`, sobre a união.
 */
export function retanguloDoBloco(fundo: FundoResolvido, bases: Rect[]): Rect | null {
  const u = uniao(bases.filter((r) => r.width > 0 && r.height > 0))
  if (!u) return null
  return {
    x: u.x - fundo.paddingX + fundo.offsetX,
    y: u.y - fundo.paddingY + fundo.offsetY,
    width: u.width + fundo.paddingX * 2,
    height: u.height + fundo.paddingY * 2,
  }
}

/** Assinatura do que, nos membros, muda a geometria do bloco — para o líder re-medir quando um irmão muda. */
export function assinaturaDoBloco(membros: Layer[]): string {
  return JSON.stringify(
    membros.map((m) => [m.id, m.content, m.position, m.size, m.style, m.textboxConfig, m.effects?.background, m.visible]),
  )
}
