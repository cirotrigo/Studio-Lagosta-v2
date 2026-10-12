/**
 * TRANSPORTAR os slots das camadas de uma página para as camadas que a
 * substituem — nas operações que mantêm a MESMA ocorrência lógica mas
 * reescrevem `Page.layers` inteiro: a recomposição (`comporPeca` desenha do
 * zero) e a reversão (o snapshot volta por cima). Não há objeto antigo a
 * preservar, então a identidade é reconciliada por chave conservadora.
 *
 * Um slot antigo só vai para a camada nova quando:
 *  1. o `layer.id` é o mesmo e é ÚNICO dos dois lados (o compositor pode
 *     repetir id — o contador de repetição é por grupo);
 *  2. o papel dos dois lados é válido e igual;
 *  3. o bloco do contrato (`metadata.compositor.bloco`): nenhum lado tem, ou os
 *     dois têm o MESMO. Um lado só com bloco não casa;
 *  4. as linhas do bloco que a camada desenha: idem (bloco repartido).
 * E nunca sobrescreve: a camada nova que já declara slot fica com o dela; o
 * transporte que faria dois slots iguais não acontece.
 *
 * Nada aproximado — posição, nome, ordem e conteúdo não entram. Perda com aviso
 * é aceitável; slot na camada errada não é. Sem nenhum slot transportado, o
 * retorno é o MESMO array de entrada (página sem slot não muda em nada).
 *
 * Módulo PURO.
 */

import type { Layer } from '@/types/template'
import { vinculoDaCamada } from '@/lib/copy-autoral/efetiva'
import { lerSemanticRole, lerSlotId } from './ler'

export type AvisoDeSlot =
  | { codigo: 'SLOT_ANTIGO_INVALIDO'; layerId: string }
  | { codigo: 'SLOT_ANTIGO_DUPLICADO'; layerId: string; slotId: string }
  | { codigo: 'CAMADA_NOVA_NAO_ENCONTRADA'; layerId: string; slotId: string }
  | { codigo: 'ID_REPETIDO'; layerId: string; slotId: string }
  | { codigo: 'PAPEL_DIVERGENTE'; layerId: string; slotId: string }
  | { codigo: 'BLOCO_DIVERGENTE'; layerId: string; slotId: string }
  | { codigo: 'LINHAS_DIVERGENTES'; layerId: string; slotId: string }
  | { codigo: 'SLOT_NOVO_PREEXISTENTE'; layerId: string; slotId: string; slotNovo: string }
  | { codigo: 'SLOT_NOVO_INVALIDO'; layerId: string; slotId: string }
  | { codigo: 'SLOT_DUPLICARIA'; layerId: string; slotId: string }

export interface SlotsTransportados<T> {
  camadas: T[]
  avisos: AvisoDeSlot[]
}

/** O bloco do contrato na camada: `undefined` = ausente; qualquer outro valor conta como presente. */
function blocoDe(camada: Layer): unknown {
  const c = (camada.metadata as { compositor?: unknown } | undefined)?.compositor
  return c && typeof c === 'object' ? (c as { bloco?: unknown }).bloco : undefined
}

function blocosCasam(a: Layer, b: Layer): boolean {
  const x = blocoDe(a)
  const y = blocoDe(b)
  if (x === undefined && y === undefined) return true
  return typeof x === 'string' && typeof y === 'string' && x === y
}

/**
 * As linhas do bloco que a camada desenha (`metadata.compositor.linhas`): num
 * bloco REPARTIDO (`servico` e `servico-2` com o mesmo bloco) são elas que dizem
 * qual parte é de qual camada. Nenhum lado declara → casa; um lado só, ou
 * linhas diferentes → não casa (a edição redistribuiu as partes, e o slot
 * seguiria a linha errada — revisão adversarial do B0, F2). A leitura é a de
 * `vinculoDaCamada`, a fonte de verdade de "de quem é esta camada".
 */
function linhasCasam(a: Layer, b: Layer): boolean {
  const declara = (l: Layer) => {
    const c = (l.metadata as { compositor?: unknown } | undefined)?.compositor
    return !!c && typeof c === 'object' && (c as { linhas?: unknown }).linhas !== undefined
  }
  if (!declara(a) && !declara(b)) return true
  const x = vinculoDaCamada(a)?.linhas
  const y = vinculoDaCamada(b)?.linhas
  return !!x && !!y && x.length === y.length && x.every((n, i) => n === y[i])
}

function papeisCasam(a: Layer, b: Layer): boolean {
  const x = lerSemanticRole(a)
  const y = lerSemanticRole(b)
  return x.status === 'valido' && y.status === 'valido' && x.papel === y.papel
}

export function transportarSlots<T extends Layer>(anteriores: readonly Layer[], novas: readonly T[]): SlotsTransportados<T> {
  const avisos: AvisoDeSlot[] = []
  const contar = (lista: readonly Layer[], id: string) => lista.reduce((n, l) => (l.id === id ? n + 1 : n), 0)
  const ocupados = new Set<string>()
  for (const n of novas) {
    const s = lerSlotId(n)
    if (s.status === 'valido') ocupados.add(s.slotId)
  }
  const transporte = new Map<number, unknown>()
  // Slot repetido na ORIGEM é ambíguo: transportar a primeira ocorrência seria
  // escolher pela ordem do array (codex review do B0). Nenhuma vai.
  const naOrigem = new Map<string, number>()
  for (const a of anteriores) {
    const s = lerSlotId(a)
    if (s.status === 'valido') naOrigem.set(s.slotId, (naOrigem.get(s.slotId) ?? 0) + 1)
  }

  for (const antiga of anteriores) {
    const slotAntigo = lerSlotId(antiga)
    if (slotAntigo.status === 'ausente') continue
    if (slotAntigo.status === 'invalido') {
      avisos.push({ codigo: 'SLOT_ANTIGO_INVALIDO', layerId: antiga.id })
      continue
    }
    const { slotId } = slotAntigo
    const base = { layerId: antiga.id, slotId }
    if ((naOrigem.get(slotId) ?? 0) > 1) {
      avisos.push({ codigo: 'SLOT_ANTIGO_DUPLICADO', ...base })
      continue
    }
    const indice = novas.findIndex((n) => n.id === antiga.id)
    if (indice === -1) {
      avisos.push({ codigo: 'CAMADA_NOVA_NAO_ENCONTRADA', ...base })
      continue
    }
    if (contar(novas, antiga.id) > 1 || contar(anteriores, antiga.id) > 1) {
      avisos.push({ codigo: 'ID_REPETIDO', ...base })
      continue
    }
    const novaCamada = novas[indice]
    const slotNovo = lerSlotId(novaCamada)
    if (slotNovo.status === 'valido') {
      if (slotNovo.slotId !== slotId) avisos.push({ codigo: 'SLOT_NOVO_PREEXISTENTE', ...base, slotNovo: slotNovo.slotId })
      continue
    }
    if (slotNovo.status === 'invalido') {
      avisos.push({ codigo: 'SLOT_NOVO_INVALIDO', ...base })
      continue
    }
    if (!papeisCasam(antiga, novaCamada)) {
      avisos.push({ codigo: 'PAPEL_DIVERGENTE', ...base })
      continue
    }
    if (!blocosCasam(antiga, novaCamada)) {
      avisos.push({ codigo: 'BLOCO_DIVERGENTE', ...base })
      continue
    }
    if (!linhasCasam(antiga, novaCamada)) {
      avisos.push({ codigo: 'LINHAS_DIVERGENTES', ...base })
      continue
    }
    if (ocupados.has(slotId)) {
      avisos.push({ codigo: 'SLOT_DUPLICARIA', ...base })
      continue
    }
    ocupados.add(slotId)
    transporte.set(indice, (antiga.metadata as { slot: unknown }).slot)
  }

  if (transporte.size === 0) return { camadas: novas as T[], avisos }
  const camadas = novas.map((n, i) => {
    if (!transporte.has(i)) return n
    const slot = transporte.get(i)
    return { ...n, metadata: { ...(n.metadata ?? {}), slot: slot && typeof slot === 'object' ? { ...(slot as object) } : slot } }
  })
  return { camadas, avisos }
}

/** O aviso em texto, para quem o mostra (recomposição, reversão). A estrutura continua sendo a fonte. */
export function descreverAvisoDeSlot(a: AvisoDeSlot): string {
  const alvo = `camada "${a.layerId}"`
  switch (a.codigo) {
    case 'SLOT_ANTIGO_DUPLICADO':
      return `O slot "${a.slotId}" estava em mais de uma camada e não foi transportado (${alvo}).`
    case 'SLOT_ANTIGO_INVALIDO':
      return `Slot inválido na ${alvo} não foi transportado.`
    case 'CAMADA_NOVA_NAO_ENCONTRADA':
      return `O slot "${a.slotId}" se perdeu: a ${alvo} não existe mais.`
    case 'ID_REPETIDO':
      return `O slot "${a.slotId}" se perdeu: há mais de uma camada com o id "${a.layerId}".`
    case 'PAPEL_DIVERGENTE':
      return `O slot "${a.slotId}" se perdeu: a ${alvo} mudou de papel.`
    case 'LINHAS_DIVERGENTES':
      return `O slot "${a.slotId}" se perdeu: a ${alvo} passou a desenhar outras linhas do bloco.`
    case 'BLOCO_DIVERGENTE':
      return `O slot "${a.slotId}" se perdeu: a ${alvo} passou a desenhar outro bloco da copy.`
    case 'SLOT_NOVO_PREEXISTENTE':
      return `A ${alvo} já declara o slot "${a.slotNovo}"; o slot anterior "${a.slotId}" não foi transportado.`
    case 'SLOT_NOVO_INVALIDO':
      return `A ${alvo} tem um slot inválido; o slot anterior "${a.slotId}" não foi transportado por cima.`
    case 'SLOT_DUPLICARIA':
      return `O slot "${a.slotId}" não foi transportado para a ${alvo}: outra camada já o declara.`
  }
}

/**
 * As camadas sem `metadata.slot`. Para quando o lado "novo" não é fonte de
 * identidade: na reversão o snapshot é só o VISUAL a restaurar, e o slot que
 * ele carrega (a recomposição grava o snapshot com slots) é antigo — vencendo a
 * página, restauraria um slot trocado ou ressuscitaria um removido (codex
 * review do B0). Camada sem slot volta a MESMA.
 */
export function semSlots<T extends Layer>(camadas: readonly T[]): T[] {
  return camadas.map((c) => {
    const meta = c.metadata as Record<string, unknown> | undefined
    if (!meta || !('slot' in meta)) return c
    const { slot: _slot, ...resto } = meta
    return { ...c, metadata: resto }
  })
}
