/**
 * Máquina de estados da seleção por gesto no canvas do editor.
 *
 * Um gesto do ponteiro sobre uma camada chama o handler de seleção mais de uma
 * vez: `down` (mousedown/touchstart) primeiro e, depois, `drag` (dragstart, se
 * arrastou) OU `click` (click/tap, se soltou no lugar). A seleção é DECIDIDA
 * uma única vez, na descida; as fases seguintes só consultam o que ficou
 * registrado no gesto.
 *
 * Era a falta disso que quebrava a seleção múltipla no canvas: Shift/Cmd+clique
 * alternava a camada no mousedown e alternava DE NOVO no click, voltando ao
 * estado anterior. E clicar numa camada que já fazia parte de uma seleção
 * múltipla (feita no painel de camadas) reduzia a seleção a ela ainda no
 * mousedown — arrastar o conjunto pelo canvas era impossível.
 *
 * Grupo estilo Canva (camadas com o mesmo `metadata.groupId`): o 1º clique
 * seleciona o grupo inteiro e o clique seguinte entra no elemento;
 * Shift+clique põe ou tira o grupo inteiro, salvo quando a pessoa já está
 * "dentro" dele (parte do grupo selecionada) — aí alterna só a camada.
 *
 * Puro: sem React, sem Konva. O stage traduz o evento em `phase`/`additive`
 * e aplica a seleção devolvida.
 */

export type FaseDoGesto = 'down' | 'drag' | 'click'

export interface GestoDeSelecao {
  layerId: string
  /** Seleção no instante da descida, antes de qualquer mudança */
  selectionAtDown: string[]
  /** A descida preservou uma seleção múltipla que já continha a camada (o arraste move o conjunto) */
  keptSelection: boolean
  /** Grupo inteiramente selecionado na descida (o drill-in acontece no click) */
  groupWasSelected: boolean
  /** Houve arraste neste gesto: o click, se vier, não decide nada */
  dragged: boolean
}

export interface EntradaDoGesto {
  phase: FaseDoGesto
  /** Shift/Cmd/Ctrl pressionado no evento */
  additive: boolean
  layerId: string
  /** Ids de TODAS as camadas do grupo da camada (inclusive ela). Com menos de 2, não há grupo. */
  groupIds: string[]
  /** Seleção atual */
  selection: string[]
  /** Gesto em andamento (o que a fase anterior registrou), ou null */
  gesture: GestoDeSelecao | null
}

export interface SaidaDoGesto {
  /** Nova seleção a aplicar; null = a seleção não muda */
  selection: string[] | null
  /** Gesto a registrar para as próximas fases; null = gesto encerrado */
  gesture: GestoDeSelecao | null
}

function mesmoConjunto(a: string[], b: string[]): boolean {
  return a.length === b.length && b.every((id) => a.includes(id))
}

function alternar(selection: string[], id: string): string[] {
  return selection.includes(id) ? selection.filter((item) => item !== id) : [...selection, id]
}

export function decidirSelecaoPorGesto(entrada: EntradaDoGesto): SaidaDoGesto {
  const { phase, layerId, selection, gesture } = entrada
  const groupIds = entrada.groupIds.length > 1 ? entrada.groupIds : []
  const isGrouped = groupIds.length > 1
  const sameGesture = gesture?.layerId === layerId
  // O dragstart nunca é decisão aditiva: com Shift pressionado durante o
  // arraste, as camadas que o Transformer puxa junto (startDrag proxy) chegam
  // aqui como dragstart órfão e seriam TIRADAS da seleção no meio do gesto
  const additive = entrada.additive && phase !== 'drag'

  if (phase === 'drag' && gesture && sameGesture) {
    return { selection: null, gesture: { ...gesture, dragged: true } }
  }

  if (phase === 'click') {
    // Sem descida registrada nesta camada, depois de arraste, ou aditivo (já
    // decidido na descida): o click não mexe em nada
    if (!gesture || !sameGesture || gesture.dragged || additive) {
      return { selection: null, gesture: null }
    }
    if (isGrouped && gesture.groupWasSelected) {
      // A seleção era exatamente o grupo: entra no elemento (drill-in).
      // Era o grupo mais outras camadas: fica só o grupo.
      const exactlyGroup = mesmoConjunto(gesture.selectionAtDown, groupIds)
      return { selection: exactlyGroup ? [layerId] : groupIds, gesture: null }
    }
    if (gesture.keptSelection) {
      return { selection: [layerId], gesture: null }
    }
    return { selection: null, gesture: null }
  }

  // Fase de descida (down, ou dragstart sem descida registrada — a camada que
  // o Transformer arrasta junto)
  const base: GestoDeSelecao = {
    layerId,
    selectionAtDown: selection,
    keptSelection: false,
    groupWasSelected: false,
    dragged: phase === 'drag',
  }
  const groupFullySelected = isGrouped && groupIds.every((id) => selection.includes(id))
  const groupPartlySelected = isGrouped && !groupFullySelected && groupIds.some((id) => selection.includes(id))

  if (additive) {
    if (!isGrouped || groupPartlySelected) {
      // Camada solta, ou já "dentro" do grupo: alterna só ela
      return { selection: alternar(selection, layerId), gesture: base }
    }
    // Grupo inteiro entra ou sai da seleção de uma vez
    return {
      selection: groupFullySelected
        ? selection.filter((id) => !groupIds.includes(id))
        : [...selection, ...groupIds],
      gesture: base,
    }
  }

  if (isGrouped) {
    const registro = { ...base, groupWasSelected: groupFullySelected, keptSelection: groupFullySelected }
    // Grupo inteiro já selecionado: mantém, para o arraste mover o conjunto;
    // o drill-in acontece no click (se não houver arraste)
    if (groupFullySelected) return { selection: null, gesture: registro }
    // Já "dentro" do grupo: seleção direta do elemento
    if (groupPartlySelected) return { selection: [layerId], gesture: registro }
    return { selection: groupIds, gesture: registro }
  }

  if (selection.length > 1 && selection.includes(layerId)) {
    // Já faz parte de uma seleção múltipla: preserva, para o arraste mover o
    // conjunto. Se o gesto terminar em clique, a fase click reduz a seleção
    // a esta camada.
    return { selection: null, gesture: { ...base, keptSelection: true } }
  }

  return { selection: [layerId], gesture: base }
}
