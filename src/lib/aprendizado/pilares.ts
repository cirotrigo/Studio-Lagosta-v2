/**
 * Pilares de conteúdo — a taxonomia FECHADA de temas de um cliente (F2).
 *
 * Sem taxonomia fechada, o dedup de tema da semana não existe: "happy hour" e
 * "drinks" viram baldes diferentes e a grade sai com o mesmo assunto duas
 * vezes sem que nada perceba. A lista é proposta por um passe de LLM sobre o
 * histórico do PRÓPRIO cliente (cada restaurante tem os seus) e aprovada por
 * gente; daí em diante o classificador só escolhe dentro dela.
 *
 * ── OS DOIS SLUGS RESERVADOS ──────────────────────────────────────────────
 *
 * `outro`     — foi classificado e não coube em pilar nenhum, ou a confiança
 *               ficou abaixo do piso. **Baixa confiança vai para cá, nunca
 *               para o rótulo mais provável**: um balde honesto é informação;
 *               um rótulo chutado contamina toda contagem que vier depois.
 * `sem-texto` — não havia o que classificar.
 *
 * A diferença entre os dois não é preciosismo. Medido em 11/08/2026: das 176
 * publicações do Wine Vix em 8 semanas, só 26 têm texto legível no banco — o
 * resto é story cuja copy existe apenas dentro da imagem, porque foi montada
 * fora do Studio. Se "não deu para ler" caísse em `outro`, "outro" seria o
 * maior pilar de todo cliente e a linha de base da detecção de campanha viraria
 * ficção.
 *
 * Módulo PURO (sem Prisma, sem rede): o card da aba Marca é client e precisa
 * dos rótulos — mesma razão de `learning-scope.ts`, `art-direction.ts` e
 * `approval-checklist.ts`.
 */

/** Não coube em pilar nenhum (ou a confiança ficou baixa). */
export const PILAR_OUTRO = 'outro'
/** Não havia texto para classificar. Diferente de `outro`, e de propósito. */
export const PILAR_SEM_TEXTO = 'sem-texto'

/** Slugs que o sistema usa e ninguém pode cadastrar como pilar de projeto. */
export const SLUGS_RESERVADOS = [PILAR_OUTRO, PILAR_SEM_TEXTO] as const

/**
 * Piso de confiança. Abaixo disto o veredito do classificador é ignorado e o
 * post vai para `outro` — a regra "baixa confiança nunca vira o rótulo mais
 * provável" é implementada AQUI, no código, e não pedida ao modelo no prompt.
 */
export const CONFIANCA_MINIMA = 0.6

/** Quantos pilares uma taxonomia útil tem. Menos não separa; mais não deduplica. */
export const MIN_PILARES = 3
export const MAX_PILARES = 8
/**
 * O que o passe de LLM mira. O teto acima ainda aceita edição humana.
 *
 * 🔴 O máximo é 6, e não 8, por medição: pedindo "de 5 a 8", o modelo devolveu
 * **8 em 8 clientes** (11/08/2026) — ele mira o teto e DIVIDE em vez de
 * consolidar, que é o oposto do que uma taxonomia fechada existe para fazer.
 * O resultado eram pares redundantes em quase toda marca ("Eventos e
 * Celebrações" ao lado de "Datas Comemorativas"), e pilar redundante espalha o
 * mesmo assunto por dois baldes ou empurra o post para `outro`.
 *
 * `MAX_PILARES` continua 8 de propósito: o teto do LLM é mais apertado que o
 * da pessoa, que conhece a marca e pode querer um sétimo assunto.
 */
export const ALVO_PILARES = { minimo: 5, maximo: 6 } as const

export interface Pilar {
  /** kebab-case, ESTÁVEL — é o que fica gravado em `SocialPost.pilar`. */
  slug: string
  nome: string
  descricao?: string | null
  /** Palavras que aparecem quando o assunto é este. */
  exemplos?: string[]
  ordem?: number
  aprovado?: boolean
  origem?: 'llm' | 'humano' | null
}

/**
 * kebab-case sem acento. Estável para o mesmo nome escrito de formas
 * diferentes ("Happy Hour", "happy-hour", "HAPPY  HOUR" → `happy-hour`).
 */
export function slugDePilar(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

/** `true` para os slugs que o sistema reserva. */
export function ehReservado(slug: string): boolean {
  return (SLUGS_RESERVADOS as readonly string[]).includes(slug)
}

export interface TaxonomiaValidada {
  pilares: Pilar[]
  /** O que foi corrigido ou descartado, para mostrar a quem aprova. */
  avisos: string[]
}

/**
 * Normaliza e valida uma lista de pilares vinda de fora (LLM, formulário, MCP).
 *
 * NUNCA lança: devolve o que sobrou de bom e a lista do que foi recusado. Uma
 * proposta com um item torto não pode fazer o Ciro perder os outros sete —
 * é a mesma lição de `reconciliarVeredito` (validação de saída de modelo é
 * reconciliação, não parse).
 */
export function validarTaxonomia(entrada: unknown): TaxonomiaValidada {
  const avisos: string[] = []
  const pilares: Pilar[] = []
  const vistos = new Set<string>()

  if (!Array.isArray(entrada)) {
    return { pilares: [], avisos: ['A lista de pilares não veio como lista.'] }
  }

  for (const bruto of entrada) {
    if (!bruto || typeof bruto !== 'object') {
      avisos.push('Item ignorado: não é um pilar.')
      continue
    }
    const item = bruto as Record<string, unknown>
    const nome = typeof item.nome === 'string' ? item.nome.trim() : ''
    const slugPedido = typeof item.slug === 'string' ? slugDePilar(item.slug) : ''
    const slug = slugPedido || slugDePilar(nome)

    if (!nome) {
      avisos.push('Item ignorado: pilar sem nome.')
      continue
    }
    if (!slug) {
      avisos.push(`"${nome}" ignorado: não sobrou nada depois de virar identificador.`)
      continue
    }
    if (ehReservado(slug)) {
      avisos.push(`"${nome}" ignorado: "${slug}" é um identificador reservado do sistema.`)
      continue
    }
    if (vistos.has(slug)) {
      avisos.push(`"${nome}" ignorado: repete o pilar "${slug}".`)
      continue
    }
    if (pilares.length >= MAX_PILARES) {
      avisos.push(`"${nome}" ignorado: a lista já tem o máximo de ${MAX_PILARES} pilares.`)
      continue
    }

    vistos.add(slug)
    pilares.push({
      slug,
      nome: nome.slice(0, 60),
      descricao: typeof item.descricao === 'string' && item.descricao.trim() ? item.descricao.trim().slice(0, 400) : null,
      exemplos: Array.isArray(item.exemplos)
        ? item.exemplos.filter((e): e is string => typeof e === 'string' && e.trim() !== '').map((e) => e.trim().slice(0, 60)).slice(0, 12)
        : [],
      ordem: pilares.length,
      aprovado: item.aprovado === true,
      origem: item.origem === 'humano' || item.origem === 'llm' ? item.origem : null,
    })
  }

  return { pilares, avisos }
}

/**
 * Casa o rótulo devolvido pelo modelo com a taxonomia — por SLUG e, se não
 * bater, por NOME normalizado.
 *
 * O modelo devolve o que quer, inclusive o nome bonito em vez do slug. Quem
 * decide é o código: rótulo que não casa com pilar aprovado nenhum vira
 * `outro`, sem exceção e sem tentativa de aproximação por semelhança — "quase
 * igual" é como um pilar engole o vizinho.
 */
export function casarPilar(rotulo: unknown, taxonomia: Pilar[]): string {
  if (typeof rotulo !== 'string') return PILAR_OUTRO
  const limpo = slugDePilar(rotulo)
  if (!limpo) return PILAR_OUTRO
  if (ehReservado(limpo)) return limpo
  const porSlug = taxonomia.find((p) => p.slug === limpo)
  if (porSlug) return porSlug.slug
  const porNome = taxonomia.find((p) => slugDePilar(p.nome) === limpo)
  return porNome ? porNome.slug : PILAR_OUTRO
}

/**
 * Aplica o piso de confiança. Separado de `casarPilar` porque são duas regras
 * diferentes: uma é "este rótulo existe?", a outra é "o modelo tem certeza?".
 */
export function comPisoDeConfianca(slug: string, confianca: number | null | undefined): string {
  if (ehReservado(slug)) return slug
  if (typeof confianca !== 'number' || Number.isNaN(confianca)) return PILAR_OUTRO
  return confianca >= CONFIANCA_MINIMA ? slug : PILAR_OUTRO
}

/** Rótulo legível de qualquer slug, inclusive os reservados. */
export function nomeDoPilar(slug: string | null | undefined, taxonomia: Pilar[]): string {
  if (!slug) return 'não classificado'
  if (slug === PILAR_OUTRO) return 'outro'
  if (slug === PILAR_SEM_TEXTO) return 'sem texto no sistema'
  return taxonomia.find((p) => p.slug === slug)?.nome ?? slug
}

/** A taxonomia em texto, do jeito que entra no prompt do classificador. */
export function taxonomiaEmTexto(taxonomia: Pilar[]): string {
  return taxonomia
    .map((p) => {
      const partes = [`- ${p.slug}: ${p.nome}`]
      if (p.descricao) partes.push(`  ${p.descricao}`)
      if (p.exemplos && p.exemplos.length > 0) partes.push(`  aparece quando o texto fala de: ${p.exemplos.join(', ')}`)
      return partes.join('\n')
    })
    .join('\n')
}
