/**
 * Quais artes (Generation) pertencem a um post — e SÓ a ele.
 *
 * Módulo PURO, sem Prisma: é a parte de `desfazerUsoDeFotoDoPost`
 * (`uso-de-foto.ts`) que precisa ser conferida sem banco. O post aponta para a
 * arte de duas formas — `generationId` (a primeira mídia) e `mediaUrls` (todas,
 * inclusive os slides de um carrossel, cada um com a sua Generation) —, e o
 * chamador traz as Generations cujo `resultUrl` está nessas URLs.
 *
 * 🔴 A LINHAGEM conta. Medido em 01/09/2026 no Quintal: o post aponta para a
 * MELHORIA (`source: ai_improvement`), e o `PhotoUsage` foi gravado na arte
 * ORIGINAL — quem registra o uso é `createArteRapida`, antes de a melhoria
 * existir. Olhar só o `generationId` do post desfazia ZERO. Por isso os
 * ancestrais (`sourceGenerationId`, subindo quantos níveis houver) entram na
 * conta.
 *
 * O que NÃO pode acontecer: apagar o registro de uso de uma foto que outro
 * post ainda usa. Duas peças podem compartilhar a mesma arte (duplicar na
 * bancada, trocar-arte-do-post apontando para uma arte existente) — e, pela
 * linhagem, duas melhorias da MESMA original em dois posts compartilham a
 * original. Desfazer o uso ao apagar UMA delas mentiria sobre a que continua
 * na agenda. Por isso toda arte que outro post referencia, diretamente ou por
 * um descendente, fica de fora.
 */

export interface PostComArtes {
  generationId?: string | null
  mediaUrls?: string[] | null
}

export interface GeracaoComUrl {
  id: string
  resultUrl?: string | null
  /** A arte de que esta nasceu (melhoria, refazer) — a linhagem sobe por aqui. */
  sourceGenerationId?: string | null
}

const PROFUNDIDADE_MAXIMA_DA_LINHAGEM = 10

/**
 * Ids de Generation cujo uso de foto pertence SÓ a este post — as artes que
 * ele referencia mais os ancestrais delas, menos tudo que outro post ainda
 * alcança (também pela linhagem).
 *
 * @param post o post que vai ser apagado
 * @param geracoes o POOL de Generations conhecidas: as referenciadas pelo post (por id e por URL), os ancestrais delas e, para a proteção, as irmãs/descendentes que outros posts possam citar
 * @param outrosPosts os DEMAIS posts do projeto que citam alguma arte do pool (por `generationId` ou por URL)
 */
export function resolverGeracoesSoDestePost(
  post: PostComArtes,
  geracoes: GeracaoComUrl[],
  outrosPosts: PostComArtes[] = [],
): string[] {
  const porId = new Map(geracoes.map((g) => [g.id, g]))
  const porUrl = new Map<string, string>()
  for (const g of geracoes) if (g.resultUrl && !porUrl.has(g.resultUrl)) porUrl.set(g.resultUrl, g.id)

  /** O id mais os ancestrais conhecidos (só os que estão no pool). */
  const comAncestrais = (id: string): string[] => {
    const cadeia = [id]
    let atual = porId.get(id)?.sourceGenerationId ?? null
    for (let n = 0; atual && n < PROFUNDIDADE_MAXIMA_DA_LINHAGEM && !cadeia.includes(atual); n++) {
      cadeia.push(atual)
      atual = porId.get(atual)?.sourceGenerationId ?? null
    }
    return cadeia
  }

  const referenciadas = (p: PostComArtes): string[] => {
    const diretas = new Set<string>()
    if (p.generationId) diretas.add(p.generationId)
    for (const url of p.mediaUrls ?? []) {
      const id = typeof url === 'string' ? porUrl.get(url) : undefined
      if (id) diretas.add(id)
    }
    return [...diretas].flatMap(comAncestrais)
  }

  const ids = new Set(referenciadas(post))
  if (ids.size === 0) return []

  const emUso = new Set<string>()
  for (const outro of outrosPosts) for (const id of referenciadas(outro)) emUso.add(id)

  return [...ids].filter((id) => !emUso.has(id))
}
