/**
 * T5 (24/10/2026) — a marca da variante PROMOVIDA: página copiada para o template "Assinatura" que nasce FORA do
 * rodízio. Ela é achada quando pedida (id, nome, `varianteOriginal`) e nunca escolhida sozinha.
 *
 * O nome sobrevive à normalização da rota de tags (`[a-z0-9-]`) e não contém `feed`/`story`/`quadrad`/`clara`/`escura`,
 * que o `formatoDaPagina` e a pontuação das variantes leem nas tags.
 *
 * Módulo PURO e sem import nenhum: o editor (client) também o usa.
 */
export const TAG_FORA_DO_RODIZIO = 'fora-do-rodizio'

export const entraNoRodizio = (p: { tags?: string[] | null }) => !(p.tags ?? []).includes(TAG_FORA_DO_RODIZIO)

/** A marca é do sistema: o pedido não a põe nem a tira — vale a da linha gravada (`antes`). */
export const tagsComMarcaPreservada = (antes: string[] | null | undefined, pedidas: string[]) => [
  ...pedidas.filter((t) => t !== TAG_FORA_DO_RODIZIO),
  ...((antes ?? []).includes(TAG_FORA_DO_RODIZIO) ? [TAG_FORA_DO_RODIZIO] : []),
]
