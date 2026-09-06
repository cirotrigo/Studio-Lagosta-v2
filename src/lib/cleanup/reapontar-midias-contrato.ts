/**
 * Troca de URL dentro das mídias de um post — a parte PURA do reapontamento.
 *
 * Por que existe: `cleanupGenerations` apaga o blob de uma Generation com mais
 * de 90 dias e reaponta `Generation.resultUrl` para o Drive, mas até 05/09/2026
 * não tocava em `SocialPost.mediaUrls`, que ficava guardando a URL recém-apagada.
 * Medido em produção: 38% das artes de posts publicados há 60-89 dias e 40%
 * das de 90-180 dias respondiam 404 — a arte existia (no Drive), o endereço
 * que o post guardava é que tinha morrido.
 *
 * Regras (as mesmas de `montarNovasMidias`, em `troca-de-arte.ts`):
 * - troca POR POSIÇÃO, nunca reduz a contagem de mídias;
 * - toda ocorrência da URL antiga é trocada (carrossel pode repetir a arte);
 * - a comparação é EXATA — a URL do Blob tem sufixo aleatório, então igualdade
 *   é inequívoca, e casar por prefixo já produziu falso "página que não existe".
 *
 * Sem Prisma, de propósito: é o que deixa a regra ter teste sem banco.
 */

export interface SubstituicaoDeUrl {
  /** As mídias com a troca aplicada (mesmo tamanho da entrada). */
  novas: string[]
  /** Índices em que a URL antiga foi encontrada. Vazio = nada a fazer. */
  posicoes: number[]
}

export function substituirUrl(midias: readonly string[], antiga: string, nova: string): SubstituicaoDeUrl {
  const posicoes: number[] = []
  const novas = midias.map((url, i) => {
    if (url === antiga) {
      posicoes.push(i)
      return nova
    }
    return url
  })
  return { novas, posicoes }
}

/** Hosts do Vercel Blob — a única mídia que o cleanup apaga. */
export function ehUrlDoBlob(url: string | null | undefined): boolean {
  return typeof url === 'string' && url.includes('blob.vercel-storage.com')
}
