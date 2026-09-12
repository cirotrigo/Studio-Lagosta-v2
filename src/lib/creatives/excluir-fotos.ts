/**
 * Exclusão de fotos da lista ranqueada do acervo (PR 6 de "Marca simples,
 * copy melhor", F2, 12/09/2026) — módulo PURO.
 *
 * Quem monta a semana escolhe uma foto por peça e não quer ver de novo, na
 * busca seguinte, a que já escolheu — nem a que foi ao ar há pouco. O rodízio
 * já EMPURRA a usada para baixo; excluir é decisão explícita de quem busca
 * (`excluir` com os ids já escolhidos, `evitarUsadasDesde` com a data), e por
 * isso fica declarada na resposta (`excluidas`), nunca escondida no score.
 */

import { dataValida } from '@/lib/posts/contexto-da-semana'

export interface ExclusaoDeFotos {
  /** Ids (driveFileId) já escolhidos nesta leva — saem da lista. */
  ids?: string[] | null
  /** "AAAA-MM-DD": foto com uso registrado a partir desta data sai da lista. */
  usadasDesde?: string | null
}

export interface ResumoDaExclusao {
  porId: number
  porUso: number
  /** Ids pedidos em `ids` que não estavam na lista (útil para quem confere). */
  naoEncontrados: string[]
}

/**
 * A exclusão NORMALIZADA: ids únicos, sem espaço, em ordem; a data só se
 * EXISTE no calendário (`dataValida` — "2026-02-31" passa num regex e o
 * `Date` a normaliza para março em silêncio). É esta forma que entra na
 * identidade da proposta de fotos (`registrarProposta`): pedidos equivalentes
 * (os mesmos ids em outra ordem) reutilizam a proposta; pedidos diferentes
 * (com e sem exclusão) são propostas diferentes — a lista que a pessoa viu é
 * outra, e o topo dela também.
 */
export function normalizarExclusao(exclusao: ExclusaoDeFotos): { ids: string[]; desde: string | null } {
  const ids = [...new Set((exclusao.ids ?? []).map((i) => i.trim()).filter(Boolean))].sort()
  const bruto = exclusao.usadasDesde?.trim() ?? ''
  const desde = dataValida(bruto) ? bruto : null
  return { ids, desde }
}

/**
 * Aplica a exclusão sobre a lista JÁ ranqueada, mantendo a ordem. `ultimoUso`
 * é o mapa driveFileId → data ISO do último uso (banco + legado). Data
 * inválida em `usadasDesde` (formato errado OU dia que não existe) não exclui
 * nada — e é declarada no resumo por quem chama, não aqui.
 */
export function excluirFotos<T extends { imagem: { driveFileId: string } }>(
  ranqueadas: T[],
  exclusao: ExclusaoDeFotos,
  ultimoUso: Map<string, string>,
): { mantidas: T[]; resumo: ResumoDaExclusao; pedida: boolean } {
  const normalizada = normalizarExclusao(exclusao)
  const ids = new Set(normalizada.ids)
  const desde = normalizada.desde
  const pedida = ids.size > 0 || !!desde
  if (!pedida) return { mantidas: ranqueadas, resumo: { porId: 0, porUso: 0, naoEncontrados: [] }, pedida }
  const vistos = new Set<string>()
  let porId = 0
  let porUso = 0
  const mantidas = ranqueadas.filter((r) => {
    const id = r.imagem.driveFileId
    vistos.add(id)
    if (ids.has(id)) {
      porId++
      return false
    }
    if (desde) {
      const uso = ultimoUso.get(id)?.slice(0, 10)
      if (uso && uso >= desde) {
        porUso++
        return false
      }
    }
    return true
  })
  return { mantidas, resumo: { porId, porUso, naoEncontrados: [...ids].filter((i) => !vistos.has(i)) }, pedida }
}
