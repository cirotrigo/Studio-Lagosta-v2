/**
 * Aborto COOPERATIVO das escritas da base (módulo PURO).
 *
 * `criarEntradaBase` e `reindexEntry` esperam embeddings por segundos; quem
 * os chama segurando uma exclusão (a trava por projeto da migração da voz,
 * PR13-18/20) precisa de um jeito de dizer "perdi a posse — não escreva mais
 * nada, e não desfaça o que outra aplicação pode ter retomado". O sinal é
 * conferido ANTES de cada escrita (chunks, vetores, compensação); o que já
 * saiu para o indexador não tem como ser cancelado, mas nada NOVO começa.
 */
export class EscritaAbortada extends Error {
  readonly code = 'ESCRITA_ABORTADA' as const
  constructor(readonly etapa: string, motivo?: string) {
    super(`escrita da base abortada antes de "${etapa}"${motivo ? `: ${motivo}` : ''}`)
    this.name = 'EscritaAbortada'
  }
}

export function motivoDoAborto(signal: AbortSignal | undefined): string | undefined {
  const r = signal?.reason as unknown
  if (r instanceof Error) return r.message
  return typeof r === 'string' ? r : undefined
}

/** Lança `EscritaAbortada` se o sinal já foi disparado. Sem sinal, não faz nada. */
export function lancarSeAbortado(signal: AbortSignal | undefined, etapa: string): void {
  if (signal?.aborted) throw new EscritaAbortada(etapa, motivoDoAborto(signal))
}

export function foiAbortada(erro: unknown): erro is EscritaAbortada {
  return erro instanceof EscritaAbortada || (typeof erro === 'object' && erro !== null && (erro as { code?: unknown }).code === 'ESCRITA_ABORTADA')
}
