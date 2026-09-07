/**
 * O catálogo de fotos v3 — UM contrato para o `_image-catalog.json` (F4,
 * 07/09/2026).
 *
 * Até aqui o mesmo arquivo tinha TRÊS interfaces divergentes (`acervo.ts`
 * lia, `reconciliar-catalogo.ts` e `enriquecer-catalogo.ts` escreviam) e dois
 * prompts de visão diferentes: `zona` e `clienteIdentificavel` eram escritos e
 * nunca lidos; `precoLegivel`/`marcaDeTerceiro` existiam em dois dos três
 * escritores. Aqui moram o schema (zod, tolerante — campo ausente é o caso
 * COMUM, e uma entrada estranha nunca derruba o catálogo), o prompt único e a
 * normalização da resposta do modelo.
 *
 * O que a v3 acrescenta são as perguntas que a equipe faz e que só a foto
 * respondia: `assunto` (o item principal, UM só), `elementos` (o que mais
 * está no quadro), `enquadramento`, `momento`, `lotacao`, `pessoas`. Com o
 * embedding de imagem (F2) a descrição deixa de precisar prever toda pergunta
 * futura; ela precisa ser CERTA no que afirma — e o vocabulário de tags
 * passa a ser FECHADO (pilares + pastas + lista canônica do domínio): tag fora
 * dele vai para `tagsLivres`, nunca para `tags`.
 *
 * Módulo PURO (sem Prisma, sem Drive, sem rede): quem carrega pilares, pastas,
 * cardápio e DNA é o chamador.
 */

import { z } from 'zod'

// ── Vocabulários fechados ──────────────────────────────────────────────────

export const ENQUADRAMENTOS = ['close', 'medio', 'aberto', 'vista-de-cima', 'detalhe'] as const
export const MOMENTOS = ['dia', 'golden-hour', 'noite', 'interno'] as const
export const LOTACOES = ['vazio', 'moderado', 'cheio'] as const
export const PESSOAS = ['nenhuma', 'maos', 'equipe', 'clientes-de-costas', 'clientes-de-frente'] as const
export const MOODS = ['casual', 'aconchegante', 'animado', 'dramatico', 'elegante', 'familiar', 'festivo', 'sofisticado', 'documental'] as const
export const QUALIDADES = ['alta', 'media', 'baixa'] as const
export const CATEGORIAS_DE_MENU = [
  'PRATOS_PRINCIPAIS', 'PETISCOS_ENTRADAS', 'BURGERS', 'CHAPAS', 'SALADAS', 'SOBREMESAS', 'BEBIDAS', 'AMBIENTE', 'AREA_KIDS', 'MUSICA',
] as const

/**
 * Tags canônicas do domínio — comuns à carteira inteira de restaurantes.
 * Curtas, minúsculas, com hífen. O que é específico de UM cliente vem dos
 * pilares aprovados e das pastas do acervo dele.
 */
export const TAGS_CANONICAS = [
  // luz e momento
  'golden-hour', 'luz-ambar-interna', 'sol-forte', 'noite', 'contraluz', 'penumbra', 'luz-natural',
  // ocasião
  'almoco', 'jantar', 'happy-hour', 'cafe-da-manha', 'brunch', 'fim-de-semana', 'familia', 'grupo', 'casal', 'sozinho', 'criancas',
  // uso
  'story-abertura', 'story-oferta', 'story-conversao', 'prova-social', 'cardapio', 'ambiente', 'evento-sazonal', 'bastidores', 'equipe', 'delivery', 'promocao',
  // lugar
  'fachada', 'salao', 'varanda', 'balcao', 'calcada', 'cozinha', 'area-kids', 'area-externa', 'vitrine', 'mesa-posta', 'palco',
  // comida e bebida (genéricas; o prato específico vai em `assunto`/`menuItem`)
  'carne', 'churrasco', 'brasa', 'frango', 'peixe', 'frutos-do-mar', 'massa', 'pizza', 'hamburguer', 'petisco', 'porcao', 'salada', 'sobremesa', 'doce', 'gelato', 'torta', 'cafe', 'drink', 'cerveja', 'chopp', 'vinho', 'suco', 'sem-alcool',
  // forma
  'close', 'vista-de-cima', 'detalhe', 'maos', 'servindo', 'preparo', 'producao', 'embalagem',
] as const

// ── Schema ─────────────────────────────────────────────────────────────────

const texto = z.string().trim()
const lista = z.array(z.string()).catch([])
const enumOuNulo = <T extends readonly [string, ...string[]]>(valores: T) => z.enum(valores).nullable().catch(null)

/**
 * Uma entrada do catálogo. Tudo além de `driveFileId`/`fileName`/`folder` é
 * opcional e TOLERANTE (`.catch`): a leitura nunca falha por um campo torto —
 * ele vira ausente, que é neutro em toda regra do ranking.
 */
export const EntradaDoCatalogoSchema = z.object({
  driveFileId: z.string(),
  fileName: z.string().catch('Sem nome'),
  folder: z.string().catch(''),
  folderId: z.string().optional(),
  createdTime: z.string().optional(),
  md5: z.string().optional(),
  catalogadaEm: z.string().optional(),
  /** `v3` a partir de 07/09/2026; ausente = análise antiga. */
  analiseVersao: z.string().optional(),

  menuItem: texto.nullable().catch(null),
  menuCategory: texto.nullable().catch(null),
  description: texto.catch(''),
  tags: lista,
  /** O que o modelo quis tagear FORA do vocabulário fechado — fica, mas não é `tags`. */
  tagsLivres: lista.optional(),
  mood: texto.catch('casual'),
  bestFor: lista,
  quality: texto.catch('media'),
  usageHistory: z.array(z.object({ date: z.string(), theme: z.string() })).catch([]),

  // v3 — as perguntas que só a foto respondia
  /** O item principal do quadro, UM só, em minúsculas ("croissant", "salão", "fachada"). */
  assunto: texto.nullable().catch(null),
  /** O que mais está no quadro, por nome ("xícara de café", "guardanapo", "cliente ao fundo"). */
  elementos: lista.optional(),
  enquadramento: enumOuNulo(ENQUADRAMENTOS),
  momento: enumOuNulo(MOMENTOS),
  lotacao: enumOuNulo(LOTACOES),
  pessoas: enumOuNulo(PESSOAS),
  zona: texto.nullable().optional(),
  clienteIdentificavel: z.boolean().optional(),

  analiseBloqueada: z.literal(true).optional(),
  precoLegivel: z.boolean().optional(),
  marcaDeTerceiro: texto.nullable().optional(),
  observacao: texto.optional(),
})

export type EntradaDoCatalogo = z.infer<typeof EntradaDoCatalogoSchema>

export const CatalogoDeFotosSchema = z.object({
  projectId: z.number().optional(),
  projectName: z.string().optional(),
  catalogFileId: z.string().nullable().optional(),
  lastUpdated: z.string().optional(),
  regeneradoEm: z.string().optional(),
  images: z.array(z.unknown()).catch([]),
})

/** Lê o catálogo tolerando entrada estragada (é pulada, com aviso), nunca lançando. */
export function lerEntradasDoCatalogo(bruto: unknown): { entradas: EntradaDoCatalogo[]; puladas: number } {
  const cat = CatalogoDeFotosSchema.safeParse(bruto)
  const lista = cat.success ? cat.data.images : []
  const entradas: EntradaDoCatalogo[] = []
  let puladas = 0
  for (const item of lista) {
    const r = EntradaDoCatalogoSchema.safeParse(item)
    if (r.success && r.data.driveFileId) entradas.push(r.data)
    else puladas++
  }
  return { entradas, puladas }
}

// ── Vocabulário e prompt ───────────────────────────────────────────────────

export function normalizarTag(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/** A folha da pasta, sem prefixo numérico nem underline — o assunto que ela nomeia. */
export function tagDaPasta(folder: string): string {
  const folha = (folder ?? '').split('/').pop() ?? ''
  return normalizarTag(folha.replace(/^_+/, '').replace(/^\d{1,3}[_-](?=[a-z])/i, ''))
}

export interface VocabularioDeTags {
  pilares: string[]
  pastas: string[]
  canonicas: string[]
  /** Todas, normalizadas, para a checagem de pertencimento. */
  conjunto: Set<string>
}

export function montarVocabularioDeTags(input: { pilares: string[]; pastas: string[] }): VocabularioDeTags {
  const pilares = [...new Set(input.pilares.map(normalizarTag).filter(Boolean))]
  const pastas = [...new Set(input.pastas.map(tagDaPasta).filter((p) => p && p !== 'raiz'))]
  const canonicas = [...TAGS_CANONICAS]
  return { pilares, pastas, canonicas, conjunto: new Set([...pilares, ...pastas, ...canonicas]) }
}

export interface InsumosDoPrompt {
  projectName: string
  pasta: string
  /** Cardápio oficial (texto), vazio se não houver. */
  cardapio: string
  /** DNA: direção fotográfica e estética, já cortados; vazio se não houver. */
  contextoDaMarca: string
  vocabulario: VocabularioDeTags
}

export const VERSAO_DA_ANALISE = 'v3'

/**
 * O prompt ÚNICO de análise de foto (cron e script). Herdou do enriquecer o
 * contexto do DNA e o vocabulário; do cron, o cardápio exato e as duas
 * perguntas de DNA (preço, marca de terceiro); e ganhou as perguntas da v3.
 */
export function montarPromptDeAnalise(i: InsumosDoPrompt): string {
  const v = i.vocabulario
  const linhasVocab = [
    'VOCABULÁRIO FECHADO DE TAGS — use SOMENTE estas em "tags" (minúsculas, com hífen). O que não estiver aqui vai em "tagsLivres":',
    v.pilares.length ? `Temas da marca (pilares aprovados): ${v.pilares.join(' · ')}` : '',
    v.pastas.length ? `Assuntos do acervo (pastas): ${v.pastas.join(' · ')}` : '',
    `Canônicas: ${v.canonicas.join(' · ')}`,
  ].filter(Boolean)

  return `Você é um curador visual do acervo fotográfico do restaurante "${i.projectName}".
Analise esta foto. Ela está na pasta "${i.pasta}" do acervo.

${i.contextoDaMarca || '(Este cliente ainda não tem direção fotográfica no DNA — descreva de forma concreta o que vê.)'}

${i.cardapio ? `CARDÁPIO OFICIAL (use EXATAMENTE estes nomes ao identificar um prato):\n${i.cardapio}\n` : '(Cardápio não disponível — descreva o prato pelo que vê.)'}

${linhasVocab.join('\n')}

Retorne APENAS um JSON, sem markdown:
{
  "assunto": "o item PRINCIPAL do quadro, em uma ou duas palavras minúsculas: o prato, a bebida, 'salao', 'fachada', 'vitrine', 'equipe'… Nunca uma frase",
  "menuItem": "nome EXATO do item do cardápio, copiado letra por letra; null se não for comida/bebida ou se não der para identificar com segurança",
  "menuCategory": "${CATEGORIAS_DE_MENU.join(' | ')} | null",
  "description": "1 a 2 frases em português descrevendo CONCRETAMENTE o que aparece — o prato, o que o acompanha, onde está, quem está. Seja específico, nunca genérico. Não repita a pasta.",
  "elementos": ["o que MAIS está no quadro além do assunto, por nome: 'xicara de cafe', 'guardanapo', 'cliente ao fundo', 'letreiro'…"],
  "enquadramento": "${ENQUADRAMENTOS.join(' | ')}",
  "momento": "${MOMENTOS.join(' | ')} (interno = luz artificial sem janela reconhecível)",
  "lotacao": "${LOTACOES.join(' | ')} | null (só para ambiente/salão; null em close de prato)",
  "pessoas": "${PESSOAS.join(' | ')}",
  "zona": "onde na casa a foto acontece, em uma palavra minúscula (fachada, salao, varanda, balcao, calcada, cozinha, area-kids, externa); null se for close sem ambiente reconhecível",
  "tags": ["6 a 12 tags SÓ do vocabulário fechado acima"],
  "tagsLivres": ["o que você quis tagear e não está no vocabulário (pode ficar vazio)"],
  "mood": "${MOODS.join(' | ')}",
  "bestFor": ["temas de post ideais, dos pilares e do vocabulário de uso"],
  "quality": "${QUALIDADES.join(' | ')}",
  "clienteIdentificavel": true se há rosto de CLIENTE reconhecível em primeiro plano (não conta equipe uniformizada nem músico no palco), senão false,
  "precoLegivel": true se há preço, valor em R$ ou cardápio com preços LEGÍVEIS no quadro, senão false,
  "marcaDeTerceiro": "nome da marca de TERCEIRO em destaque (cerveja, refrigerante, loja vizinha — guarda-sol, geladeira, letreiro), ou null",
  "observacao": "opcional: só se a foto tiver problema relevante (desfocada, escura demais, print de tela, arte pronta em vez de foto, imagem gerada por IA)"
}

CRITÉRIOS DE QUALIDADE:
- "alta": nítida, bem iluminada, composição boa, serve para virar arte.
- "media": utilizável com limitação (enquadramento torto, luz mediana, fundo bagunçado).
- "baixa": desfocada, escura ou estourada demais, ruído alto, print de tela, arte pronta.

REGRAS:
1. menuItem DEVE ser copiado exatamente do cardápio. Não batendo com nenhum item, use null. NUNCA invente prato.
2. Ambiente, decoração, fachada ou área externa sem comida em destaque: menuItem null, menuCategory "AMBIENTE".
3. Chopp, cerveja, vinho, cachaça ou drink: menuCategory "BEBIDAS".
4. "assunto" é UMA coisa. Se a foto é a vitrine com vários sabores, o assunto é "vitrine"; o sabor em destaque vai em elementos.
5. Tudo em português, tags em minúsculas com hífen. Seja honesto no quality.`
}

// ── Normalização da resposta ───────────────────────────────────────────────

function enumOu<T extends readonly string[]>(valores: T, bruto: unknown): T[number] | null {
  if (typeof bruto !== 'string') return null
  const n = normalizarTag(bruto)
  return (valores as readonly string[]).includes(n) ? (n as T[number]) : null
}

function listaDeStrings(bruto: unknown, teto = 20): string[] {
  if (!Array.isArray(bruto)) return []
  return bruto
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter((x) => x.length > 0)
    .slice(0, teto)
}

export interface AnaliseNormalizada {
  assunto: string | null
  menuItem: string | null
  menuCategory: string | null
  description: string
  elementos: string[]
  enquadramento: (typeof ENQUADRAMENTOS)[number] | null
  momento: (typeof MOMENTOS)[number] | null
  lotacao: (typeof LOTACOES)[number] | null
  pessoas: (typeof PESSOAS)[number] | null
  zona: string | null
  tags: string[]
  tagsLivres: string[]
  mood: string
  bestFor: string[]
  quality: string
  clienteIdentificavel: boolean
  precoLegivel?: boolean
  marcaDeTerceiro?: string | null
  observacao?: string
  analiseVersao: string
}

/**
 * Transforma a resposta CRUA do modelo na entrada do catálogo, aplicando o
 * vocabulário fechado: tag conhecida fica em `tags`, desconhecida vai para
 * `tagsLivres`. A `zona` e as marcas derivadas (cliente identificável,
 * descarte) entram nas tags como antes. Nada aqui lança — campo torto vira
 * ausente/neutro.
 */
export function normalizarAnalise(bruto: unknown, vocabulario: VocabularioDeTags, opcoes: { pasta: string }): AnaliseNormalizada {
  const b = (bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto : {}) as Record<string, unknown>
  const str = (v: unknown, teto = 400) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, teto) : null)

  const quality = enumOu(QUALIDADES, b.quality) ?? 'media'
  const zona = str(b.zona, 40) ? normalizarTag(String(b.zona)) : null
  const clienteIdentificavel = b.clienteIdentificavel === true

  const tags = new Set<string>()
  const tagsLivres = new Set<string>()
  for (const t of [...listaDeStrings(b.tags), ...listaDeStrings(b.tagsLivres)]) {
    const n = normalizarTag(t)
    if (!n || n.includes('/') || /^\d+-/.test(n)) continue
    if (vocabulario.conjunto.has(n)) tags.add(n)
    else tagsLivres.add(n)
  }
  if (zona) tags.add(zona)
  if (clienteIdentificavel) tags.add('cliente-identificavel')
  if (quality === 'baixa') tags.add('descarte-sugerido')
  // O assunto é sempre buscável como tag — é a palavra que a equipe vai pedir.
  const assunto = str(b.assunto, 60) ? normalizarTag(String(b.assunto)).replace(/-/g, ' ') : null
  if (assunto) {
    const n = normalizarTag(assunto)
    if (vocabulario.conjunto.has(n)) tags.add(n)
    else tagsLivres.add(n)
  }

  const description = str(b.description, 600) ?? `Foto do restaurante (pasta: ${opcoes.pasta})`

  return {
    assunto,
    menuItem: str(b.menuItem, 120),
    menuCategory: enumOu(CATEGORIAS_DE_MENU, typeof b.menuCategory === 'string' ? b.menuCategory.toUpperCase() : null)
      ? (String(b.menuCategory).toUpperCase() as (typeof CATEGORIAS_DE_MENU)[number])
      : null,
    description,
    elementos: listaDeStrings(b.elementos, 12).map((e) => e.toLowerCase().slice(0, 60)),
    enquadramento: enumOu(ENQUADRAMENTOS, b.enquadramento),
    momento: enumOu(MOMENTOS, b.momento),
    lotacao: enumOu(LOTACOES, b.lotacao),
    pessoas: enumOu(PESSOAS, b.pessoas),
    zona,
    tags: [...tags],
    tagsLivres: [...tagsLivres],
    mood: enumOu(MOODS, b.mood) ?? 'casual',
    bestFor: listaDeStrings(b.bestFor, 12).map(normalizarTag).filter(Boolean),
    quality,
    clienteIdentificavel,
    ...(typeof b.precoLegivel === 'boolean' ? { precoLegivel: b.precoLegivel } : {}),
    ...(typeof b.marcaDeTerceiro === 'string' && b.marcaDeTerceiro.trim()
      ? { marcaDeTerceiro: b.marcaDeTerceiro.trim().slice(0, 60) }
      : b.marcaDeTerceiro === null
        ? { marcaDeTerceiro: null }
        : {}),
    ...(str(b.observacao, 200) ? { observacao: str(b.observacao, 200)! } : {}),
    analiseVersao: VERSAO_DA_ANALISE,
  }
}

/** A entrada de quem a visão RECUSOU analisar — o que dá para saber pela pasta. */
export function analisePelaPasta(pasta: string): AnaliseNormalizada {
  const tag = tagDaPasta(pasta)
  return {
    assunto: tag ? tag.replace(/-/g, ' ') : null,
    menuItem: null,
    menuCategory: null,
    description: `Foto do restaurante (pasta: ${pasta}). A análise por visão foi recusada.`,
    elementos: [],
    enquadramento: null,
    momento: null,
    lotacao: null,
    pessoas: null,
    zona: null,
    tags: tag ? [tag] : [],
    tagsLivres: [],
    mood: 'casual',
    bestFor: ['generico'],
    quality: 'media',
    clienteIdentificavel: false,
    analiseVersao: VERSAO_DA_ANALISE,
  }
}
