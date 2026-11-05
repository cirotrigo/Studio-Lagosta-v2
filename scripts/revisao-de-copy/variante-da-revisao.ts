/**
 * T5 (24/10/2026) — a variante que a página de revisão de copy usa para uma story (`montar-pagina.ts`).
 *
 * Com pedido: o de sempre (o id exato ou o nome contendo o pedido), e acha a variante promovida. Sem pedido: a primeira
 * story do RODÍZIO — a promovida só entra quando pedida. Puro: o script chama, o teste prova.
 */
import { entraNoRodizio } from '@/lib/compositor/fora-do-rodizio'

export function varianteDaRevisao<T extends { id: string; name: string; tags?: string[] | null }>(
  doStory: T[],
  pedida: string | null | undefined,
): { pagina: T } | { motivo: string } {
  if (!pedida) {
    const primeira = doStory.find(entraNoRodizio)
    return primeira ? { pagina: primeira } : { motivo: 'só há story fora do rodízio: peça a variante' }
  }
  const alvo = pedida.toLowerCase()
  const casam = doStory.filter((p) => p.id === pedida || p.name.toLowerCase().includes(alvo))
  if (casam.length === 1) return { pagina: casam[0] }
  return { motivo: `a variante "${pedida}" ${casam.length ? 'é ambígua (use o id)' : 'não existe'}` }
}
