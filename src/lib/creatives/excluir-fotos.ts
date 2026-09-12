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

import { createHash } from 'node:crypto'
import { dataBRT, dataValida } from '@/lib/posts/contexto-da-semana'

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
  /** Os ids que saíram POR USO — o conjunto efetivo, que muda conforme fotos são usadas ao longo do dia. */
  idsPorUso: string[]
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
/**
 * O DIA (em Brasília) de um registro de uso: timestamp ISO vira a data em
 * Brasília — um uso às 02:30Z de segunda é domingo à noite aqui, e
 * `evitarUsadasDesde: segunda` não pode excluí-lo (R18 da revisão de
 * 3f784e1a); a data pura do catálogo legado ("AAAA-MM-DD") fica como está.
 */
export function diaDoUso(uso: string | null | undefined): string | null {
  if (!uso) return null
  const t = uso.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const d = new Date(t)
  return Number.isNaN(d.getTime()) ? t.slice(0, 10) : dataBRT(d)
}

/**
 * A identidade da exclusão para a CHAVE da proposta de fotos: ids normalizados
 * (ordem, duplicata e espaço externo não contam) com a CAIXA preservada — a
 * filtragem distingue "AbC" de "abc", e `resumoEstavel` passa strings por
 * minúsculas (R17 da revisão de 3f784e1a: duas listas diferentes ganhavam a
 * mesma chave). `null` sem exclusão, para a chave de quem nunca excluiu não
 * mudar.
 */
export function identidadeDaExclusao(exclusao: ExclusaoDeFotos, excluidasPorUso: string[] = []): string | null {
  const { ids, desde } = normalizarExclusao(exclusao)
  if (ids.length === 0 && !desde) return null
  // Com corte por uso, o que se registra é a lista que a pessoa VIU — e ela muda
  // quando uma foto é usada durante o dia. A identidade leva o conjunto EFETIVO
  // excluído por uso: mesma busca, uso novo no meio → proposta nova, com o topo
  // certo; nada mudou → a mesma proposta (R21 da revisão de 941d8e77).
  const porUso = desde ? [...new Set(excluidasPorUso)].sort() : []
  return createHash('sha1').update(JSON.stringify({ ids, desde, porUso })).digest('hex').slice(0, 12)
}

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
  if (!pedida) return { mantidas: ranqueadas, resumo: { porId: 0, porUso: 0, naoEncontrados: [], idsPorUso: [] }, pedida }
  const vistos = new Set<string>()
  let porId = 0
  const idsPorUso: string[] = []
  const mantidas = ranqueadas.filter((r) => {
    const id = r.imagem.driveFileId
    vistos.add(id)
    if (ids.has(id)) {
      porId++
      return false
    }
    if (desde) {
      const uso = diaDoUso(ultimoUso.get(id))
      if (uso && uso >= desde) {
        idsPorUso.push(id)
        return false
      }
    }
    return true
  })
  return { mantidas, resumo: { porId, porUso: idsPorUso.length, naoEncontrados: [...ids].filter((i) => !vistos.has(i)), idsPorUso }, pedida }
}
