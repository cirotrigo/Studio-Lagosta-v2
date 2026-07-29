/**
 * Reflow das combinações de texto empilhadas.
 *
 * Uma combinação cria camadas ligadas por `metadata.groupId`. Quando um texto
 * recebe conteúdo maior (ou menor) que o exemplo, a caixa dele muda de altura
 * — e tudo que está ABAIXO no grupo precisa acompanhar, senão o layout abre
 * buraco ou sobrepõe. Este módulo faz esse ajuste de forma pura: recebe as
 * camadas e um medidor, devolve patches de posição/altura.
 *
 * Regras:
 * - Deslocamento por DELTA, não re-cálculo de espaçamentos: os gaps que o
 *   usuário ajustou à mão sobrevivem.
 * - Um membro só se move se estiver INTEIRAMENTE abaixo do texto que cresceu
 *   (bottom original do texto ≤ topo original do membro). Colunas lado a lado
 *   (mesma faixa de y) não se movem entre si.
 * - Texto cresce mantendo o topo (âncora top): a borda de cima fica, a de
 *   baixo desce — e arrasta o que vem depois.
 *
 * Sem React, sem DB, sem canvas: o medidor vem de fora (Konva no editor,
 * RenderEngine.measureTextLayerHeight no servidor) para as duas pontas
 * medirem igual.
 */
import type { Layer } from '@/types/template'

export interface StackReflowPatch {
  id: string
  /** Novo y absoluto (presente só quando muda) */
  y?: number
  /** Nova altura natural (presente só quando muda; só camadas de texto) */
  height?: number
}

export type MeasureLayerHeight = (layer: Layer) => number | null

const EPSILON = 0.5

function layerGroupId(layer: Layer): string | null {
  const groupId = layer.metadata?.groupId
  return typeof groupId === 'string' && groupId ? groupId : null
}

/**
 * Reflui UM grupo (todas as camadas com o mesmo groupId). Camadas fora do
 * grupo não são tocadas — quem chama filtra ou usa reflowLayersAfterFill.
 */
export function reflowComboStack(members: Layer[], measure: MeasureLayerHeight): StackReflowPatch[] {
  if (members.length < 2) return []

  type TextDiff = { origTop: number; origBottom: number; diff: number }
  const diffs: TextDiff[] = []

  // 1. Quanto cada texto do grupo cresce/encolhe (geometria ORIGINAL)
  for (const member of members) {
    if (member.type !== 'text') continue
    const natural = measure(member)
    if (natural == null) continue
    const current = member.size?.height ?? 0
    const diff = natural - current
    if (Math.abs(diff) < 1) continue
    const top = member.position?.y ?? 0
    diffs.push({ origTop: top, origBottom: top + current, diff })
  }

  // 2. Cada membro desloca pela soma dos diffs dos textos inteiramente acima
  const patches: StackReflowPatch[] = []
  for (const member of members) {
    const top = member.position?.y ?? 0
    let shift = 0
    for (const d of diffs) {
      if (d.origBottom <= top + EPSILON && d.origTop < top) shift += d.diff
    }

    const own = member.type === 'text' ? measure(member) : null
    const patch: StackReflowPatch = { id: member.id }
    if (Math.abs(shift) >= EPSILON) patch.y = Math.round(top + shift)
    if (own != null && Math.abs(own - (member.size?.height ?? 0)) >= 1) patch.height = own
    if (patch.y !== undefined || patch.height !== undefined) patches.push(patch)
  }

  return patches
}

export function applyStackPatches(layers: Layer[], patches: StackReflowPatch[]): Layer[] {
  if (patches.length === 0) return layers
  const byId = new Map(patches.map((p) => [p.id, p]))
  return layers.map((layer) => {
    const patch = byId.get(layer.id)
    if (!patch) return layer
    return {
      ...layer,
      position: patch.y !== undefined
        ? { x: layer.position?.x ?? 0, y: patch.y }
        : layer.position,
      size: patch.height !== undefined
        ? { width: layer.size?.width ?? 0, height: patch.height }
        : layer.size,
    }
  })
}

/**
 * Pós-preenchimento (slotValues/textOverrides): reflui TODOS os grupos da
 * página (idempotente — grupo sem mudança gera zero patches) e, nas camadas de
 * texto SOLTAS que receberam conteúdo novo, ajusta a altura ao texto e liga o
 * autoExpand — sem vizinhos ligados não há o que mover, mas crescer é melhor
 * que truncar linhas inteiras na altura gravada.
 */
export function reflowLayersAfterFill(
  layers: Layer[],
  changedTextIds: Iterable<string>,
  measure: MeasureLayerHeight,
): Layer[] {
  const changed = new Set(changedTextIds)

  // 1. Grupos
  const groups = new Map<string, Layer[]>()
  for (const layer of layers) {
    const groupId = layerGroupId(layer)
    if (!groupId) continue
    const list = groups.get(groupId) ?? []
    list.push(layer)
    groups.set(groupId, list)
  }
  let result = layers
  for (const members of groups.values()) {
    const patches = reflowComboStack(members, measure)
    result = applyStackPatches(result, patches)
  }

  // 2. Textos soltos alterados
  return result.map((layer) => {
    if (!changed.has(layer.id) || layer.type !== 'text' || layerGroupId(layer)) return layer
    const natural = measure(layer)
    if (natural == null) return layer

    const autoWrap = layer.textboxConfig?.autoWrap
    const needsHeight = Math.abs(natural - (layer.size?.height ?? 0)) >= 1
    const needsExpand = autoWrap?.autoExpand !== true
    if (!needsHeight && !needsExpand) return layer

    return {
      ...layer,
      size: needsHeight
        ? { width: layer.size?.width ?? 0, height: natural }
        : layer.size,
      textboxConfig: {
        ...layer.textboxConfig,
        anchor: layer.textboxConfig?.anchor ?? 'top',
        autoWrap: {
          lineHeight: autoWrap?.lineHeight ?? layer.style?.lineHeight ?? 1.2,
          breakMode: autoWrap?.breakMode ?? 'word',
          autoExpand: true,
        },
      },
    }
  })
}
