/**
 * Partes do vetor MULTICOR (CP-V5). Puro, sem `@/lib/db` e sem Konva: o renderer (`desenhar.ts`), a canonização
 * (`shape-style.ts`), a validação das portas (`validar-camada.ts`) e a UI leem por aqui.
 *
 * - `ehMulticor`: há `style.vetor.partes` declaradas (lista não vazia). Decide a opacidade (preservada para o renderer) e
 *   a UI de N slots — mesmo que o renderer caia na silhueta por dado ruim.
 * - `partesParaPintar`: o que o renderer pinta, ou `null` (desenha a silhueta `pathData` + `fill`, como o leitor antigo).
 *   Tudo ou nada: parte malformada ou slot sem cor legível nunca pinta pela metade (o canvas ignora cor inválida e
 *   reaproveitaria a cor da parte anterior).
 */
import { lerCor } from './cor'
import type { ParteDoVetor } from './tipos'

/** Máximo de partes de um vetor multicor (arquitetura §6.6). */
export const MAX_PARTES = 8
/** Máximo de slots (cores distintas) — o mesmo teto do catálogo e do importador (arquitetura §3.3 e §6.6). */
export const MAX_SLOTS = 4
/** Teto agregado de comandos de path somando as partes (arquitetura §6.6, "≤ 400 segmentos"). */
export const MAX_COMANDOS_DAS_PARTES = 400
/** Chave do slot: curta, sem espaço, para virar chave de `vetor.cores`/`vetor.papeis` e atributo de teste. */
export const SLOT_VALIDO = /^[a-z0-9][a-z0-9-]{0,31}$/i

type Objeto = Record<string, unknown>
const ehObjeto = (v: unknown): v is Objeto => typeof v === 'object' && v !== null && !Array.isArray(v)

export function ehMulticor(style: { vetor?: unknown } | undefined): boolean {
  const vetor = style?.vetor
  return ehObjeto(vetor) && Array.isArray(vetor.partes) && vetor.partes.length > 0
}

/** Os slots na ordem da primeira parte que os usa (a ordem dos controles na UI). */
export function slotsDasPartes(partes: ReadonlyArray<{ slot?: unknown }> | undefined): string[] {
  const saida: string[] = []
  for (const p of partes ?? []) if (typeof p?.slot === 'string' && !saida.includes(p.slot)) saida.push(p.slot)
  return saida
}

/** O slot que a silhueta (`style.fill`) espelha: o da primeira parte de preenchimento. */
export function slotDaSilhueta(partes: ReadonlyArray<{ slot?: unknown; alvo?: unknown }> | undefined): string | undefined {
  const p = (partes ?? []).find((x) => x?.alvo === 'fill' && typeof x.slot === 'string')
  return p?.slot as string | undefined
}

export interface ParteParaPintar {
  d: string
  alvo: 'fill' | 'stroke'
  fillRule: 'nonzero' | 'evenodd'
  cor: string
}

const memo = new WeakMap<object, ParteParaPintar[] | null>()

export function partesParaPintar(vetor: unknown): ParteParaPintar[] | null {
  if (!ehObjeto(vetor) || !Array.isArray(vetor.partes)) return null
  const lembrada = memo.get(vetor)
  if (lembrada !== undefined) return lembrada
  const partes = vetor.partes as unknown[]
  const cores = vetor.cores
  let saida: ParteParaPintar[] | null = []
  if (partes.length === 0 || partes.length > MAX_PARTES || !ehObjeto(cores)) saida = null
  for (const parte of saida ? partes : []) {
    const p = parte as Partial<ParteDoVetor> | null
    const cor = ehObjeto(p) && typeof p.slot === 'string' && Object.hasOwn(cores as Objeto, p.slot) ? (cores as Objeto)[p.slot] : undefined
    const regraOk = p?.fillRule === undefined || p.fillRule === 'nonzero' || p.fillRule === 'evenodd'
    if (!ehObjeto(p) || typeof p.d !== 'string' || !p.d.trim() || (p.alvo !== 'fill' && p.alvo !== 'stroke') || !regraOk || typeof cor !== 'string' || lerCor(cor) === null) {
      saida = null
      break
    }
    saida!.push({ d: p.d, alvo: p.alvo, fillRule: p.fillRule === 'evenodd' ? 'evenodd' : 'nonzero', cor })
  }
  memo.set(vetor, saida)
  return saida
}
