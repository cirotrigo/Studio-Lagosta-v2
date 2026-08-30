/**
 * Ranqueamento do acervo de fotos — o score composto que substitui o
 * "menos usada primeiro".
 *
 * Nasceu do diagnóstico de 29/08/2026 (docs/PLANO-2026-08-29-SUGESTAO-DE-FOTOS.md,
 * §F1.3 e §F2): só 12% das propostas do acervo eram aceitas, porque o ranking
 * tinha UMA força e ela era anti-qualidade — a foto boa já usada ia para o fim
 * da fila e a foto que ninguém nunca quis morava permanentemente no topo. E o
 * casamento por tema era substring da FRASE INTEIRA: "cortes e churrasco"
 * devolvia ZERO num acervo de mil fotos (By Rock), porque nenhuma tag contém a
 * frase completa.
 *
 * Módulo PURO (sem Prisma, sem rede) — precedente de `cadencia.ts` e
 * `reconciliacao.ts`: é o que deixa o backtest (F1.5) e os testes rodarem sem
 * banco. Quem liga isto em `buscarNoAcervo` é outra frente; aqui só entra o
 * que dá para calcular a partir dos insumos recebidos.
 *
 * Regras da casa que valem aqui verbatim:
 * - **Score ORDENA, nunca esconde**: nenhuma foto sai da lista por score
 *   baixo. A saída tem exatamente as fotos da entrada, em outra ordem.
 * - **Peso por recência DECAI, nunca corta por idade** — e o decaimento dos
 *   sinais é ancorado na ÚLTIMA ATIVIDADE do cliente, nunca no relógio (mesma
 *   lição de `cadencia.ts`: ancorado no relógio, o sistema esquece justamente
 *   o cliente que parou de publicar e precisa voltar). A NOVIDADE é a exceção
 *   deliberada: "foto recém-catalogada" é relação com HOJE por definição.
 * - **Sem `Math.random()`**: o desempate final é hash determinístico de
 *   `driveFileId + hojeBRT` — a mesma ordem dentro do dia (a paginação por
 *   offset exige) e outra ordem entre dias (a semente diária que impede a
 *   mesma desconhecida de morar no topo para sempre).
 */

import { normalizar } from '@/lib/posts/dia-semana'

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface FotoRanqueavel {
  driveFileId: string
  fileName?: string
  folder?: string
  tags?: string[]
  bestFor?: string[]
  /** 'alta' | 'media' | 'baixa' quando existir — catálogos v2 não têm (neutro). */
  quality?: string | null
  /** ISO; ausente = foto antiga (sem novidade). */
  catalogadaEm?: string | null
  md5?: string
}

/** Sinal fechado: a pessoa levou esta foto (para o tema da busca, se houve). */
export interface EscolhaDeFoto {
  driveFileId: string
  tema: string | null
  quando: string
  sugestaoId?: string | null
  /**
   * De onde veio a escolha. 'busca' (default quando ausente) = levou a foto da
   * lista da busca. 'correcao' = alguém olhou a ARTE PRONTA na revisão e
   * mandou trocar a foto — a foto da arte nova é preferência humana explícita,
   * o par tema→foto mais forte que existe, e pesa mais que a escolha de busca.
   */
  forca?: 'busca' | 'correcao'
}

/** Sinal fechado: a foto foi proposta na posição `posicao` e a pessoa levou outra. */
export interface RejeicaoDeFoto {
  driveFileId: string
  tema: string | null
  quando: string
  posicao: number
  /** 'escura' | 'prato-antigo' | 'nao-e-o-assunto' | 'repetida' | 'outro' — TEXT livre (F4). */
  motivo?: string | null
  sugestaoId?: string | null
}

export interface FeedbackDeFoto {
  driveFileId: string
  positivo: boolean
  /** O texto cita foto/imagem/luz? Sem isso a reprovação pode ser da copy. */
  mencionaFoto: boolean
  quando: string
}

export interface PreferenciasDeFoto {
  escolhas: EscolhaDeFoto[]
  rejeicoes: RejeicaoDeFoto[]
  feedbacks: FeedbackDeFoto[]
  /** Âncora do decaimento (ISO) — a última atividade do cliente, nunca o relógio. */
  ultimaAtividade: string | null
}

/** Pilar aprovado do cliente — vocabulário que já existe; não se inventa um segundo. */
export interface PilarParaBusca {
  slug: string
  nome: string
  exemplos: string[]
}

export interface EntradaDeRanking<T extends FotoRanqueavel = FotoRanqueavel> {
  imagens: T[]
  tema?: string | null
  pilares?: PilarParaBusca[]
  preferencias: PreferenciasDeFoto
  /** ISO por driveFileId (banco+legado já mesclados pelo chamador). */
  ultimoUso: Map<string, string>
  /** driveFileIds com destaque ativo. */
  destaques: Set<string>
  /** 'AAAA-MM-DD'. */
  hojeBRT: string
}

export interface FotoRanqueada<T extends FotoRanqueavel = FotoRanqueavel> {
  imagem: T
  score: number
  /** Por componente, para backtest/debug — a soma é o `score`. */
  componentes: Record<string, number>
  /** Sem nenhum sinal E sem uso registrado — candidata à cota de exploração. */
  vagaDeExploracao: boolean
}

// ── Pesos ──────────────────────────────────────────────────────────────────

export interface PesosDoAcervo {
  /** Prata da casa primeiro. */
  DESTAQUE: number
  /** Por escolha cujo tema intersecta o da busca, decaída. */
  ESCOLHA_NO_TEMA: number
  /** Por escolha, qualquer tema, decaída. */
  ESCOLHA_GLOBAL: number
  /**
   * Escolha vinda de CORREÇÃO pós-produção (`forca: 'correcao'`): mais forte
   * que a de busca — alguém reprovou a arte pronta e apontou a foto certa.
   * ⚠️ Hoje o sinal de troca chega com `tema: null` (não carrega tema), então
   * na prática o que vale é o GLOBAL; o componente de tema existe para quando
   * o sinal passar a carregar o tema.
   */
  ESCOLHA_CORRECAO_TEMA: number
  ESCOLHA_CORRECAO_GLOBAL: number
  /** Por rejeição (topo ≤ REJEICAO_POSICAO_MAX) no mesmo tema, decaída. */
  REJEICAO_NO_TEMA: number
  /** Idem, parcela global — o contexto pode ter sido o problema, por isso fraca. */
  REJEICAO_GLOBAL: number
  /** Global quando o motivo acusa a FOTO ('prato-antigo', 'repetida'), não o contexto. */
  REJEICAO_GLOBAL_DEFEITO: number
  /** Rejeição só conta quando a foto estava no topo — ser preterida na 7ª posição não é sinal. */
  REJEICAO_POSICAO_MAX: number
  FEEDBACK_POSITIVO: number
  /** Só quando `mencionaFoto` — a reprovação pode ser da copy. */
  FEEDBACK_NEGATIVO: number
  QUALIDADE_ALTA: number
  QUALIDADE_BAIXA: number
  /** Boost no dia 0, decaindo linearmente até 0 em NOVIDADE_DIAS. */
  NOVIDADE_MAX: number
  NOVIDADE_DIAS: number
  /** Multiplicador sobre a `relevancia` de `casaComTema` (só quando há tema). */
  RELEVANCIA_POR_PONTO: number
  /**
   * Meia-vida do decaimento dos sinais, em dias — medida entre o evento e a
   * ÚLTIMA ATIVIDADE do cliente. Maior que a da cadência (21) de propósito:
   * sinal de foto é bem mais esparso que post.
   */
  MEIA_VIDA_SINAL_DIAS: number
  /** Onde a palavra casou: bestFor > tags > pasta. */
  CASAMENTO_BESTFOR: number
  CASAMENTO_TAGS: number
  CASAMENTO_PASTA: number
}

/**
 * Palpite inicial; calibrado pelo backtest (F1.5, `validar-ranking-do-acervo`).
 *
 * A hierarquia que os valores encodam: destaque (40) vence uma escolha cheia
 * no tema (25+10=35) e vence a correção global sozinha (20); escolhas
 * repetidas vencem o destaque — a prata da casa abre a fila, o uso real dela
 * toma conta. A correção (35/20) pesa mais que a busca (25/10) porque é
 * preferência sobre a ARTE PRONTA, não sobre uma miniatura. Rejeição no mesmo
 * tema (−12) desfaz cerca de metade de uma escolha no tema; a parcela global
 * (−5) é fraca porque o contexto pode ter sido o problema — a não ser que o
 * motivo acuse a foto.
 */
export const PESOS: PesosDoAcervo = {
  DESTAQUE: 40,
  ESCOLHA_NO_TEMA: 25,
  ESCOLHA_GLOBAL: 10,
  ESCOLHA_CORRECAO_TEMA: 35,
  ESCOLHA_CORRECAO_GLOBAL: 20,
  REJEICAO_NO_TEMA: -12,
  REJEICAO_GLOBAL: -5,
  REJEICAO_GLOBAL_DEFEITO: -12,
  REJEICAO_POSICAO_MAX: 3,
  FEEDBACK_POSITIVO: 5,
  FEEDBACK_NEGATIVO: -8,
  /**
   * 0 por MEDIÇÃO (backtest de 30/08/2026, scripts/validar-ranking-do-acervo.ts):
   * 93–99% de cada acervo está marcado 'alta' — 'alta' é a linha de base, não
   * sinal, e com +6 ela virava um muro que enterrava a foto certa abaixo de
   * dezenas de 'alta' nunca escolhidas (era o componente dominante em 93% dos
   * casos). Zerar melhorou o By Rock (mediana 16,5→10,5) sem piorar ninguém.
   * QUALIDADE_BAIXA fica: 'baixa' é raro e informativo.
   */
  QUALIDADE_ALTA: 0,
  QUALIDADE_BAIXA: -6,
  NOVIDADE_MAX: 15,
  NOVIDADE_DIAS: 21,
  RELEVANCIA_POR_PONTO: 2,
  MEIA_VIDA_SINAL_DIAS: 60,
  CASAMENTO_BESTFOR: 3,
  CASAMENTO_TAGS: 2,
  CASAMENTO_PASTA: 1,
}

// ── Palavras ───────────────────────────────────────────────────────────────

/**
 * Palavras que ligam frases, não assuntos. "cortes e churrasco" casa por
 * "cortes" OU "churrasco" — nunca pelo "e".
 */
const STOPWORDS = new Set(
  [
    'de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'pra', 'em',
    'no', 'na', 'nos', 'nas', 'o', 'a', 'os', 'as', 'um', 'uma',
    'por', 'ao', 'à',
  ].map(normalizar),
)

const DIA_MS = 24 * 3600_000

/**
 * Normaliza (minúsculas, sem acento — o catálogo mistura "almoço" e "almoco"
 * no MESMO acervo, medido no Wine Vix), quebra em palavras e descarta
 * stopwords e o que sobrar com menos de 3 caracteres.
 */
function quebrarEmPalavras(texto: string): string[] {
  return normalizar(texto)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 3 && !STOPWORDS.has(p))
}

/** Includes bidirecional: "picanha" casa "picanhas" e vice-versa. */
function casaPalavra(a: string, b: string): boolean {
  return a.includes(b) || b.includes(a)
}

/**
 * As palavras de busca de um tema.
 *
 * EXPANSÃO POR PILAR: se alguma palavra do tema casa com palavra do slug ou do
 * nome de um pilar aprovado, as palavras do nome e dos `exemplos` daquele
 * pilar entram como sinônimos. É o vocabulário que o cliente já aprovou
 * fazendo a ponte entre como a equipe pede ("churrasco") e como o catálogo
 * descreve ("picanha na brasa", "costela").
 */
export function palavrasDoTema(tema: string, pilares?: PilarParaBusca[]): string[] {
  const base = quebrarEmPalavras(tema)
  const resultado = [...base]
  const vistas = new Set(base)

  for (const pilar of pilares ?? []) {
    const chaves = [...quebrarEmPalavras(pilar.slug), ...quebrarEmPalavras(pilar.nome)]
    const ativa = base.some((p) => chaves.some((c) => casaPalavra(p, c)))
    if (!ativa) continue

    const extras = [
      ...quebrarEmPalavras(pilar.nome),
      ...(pilar.exemplos ?? []).flatMap((e) => quebrarEmPalavras(e)),
    ]
    for (const extra of extras) {
      if (vistas.has(extra)) continue
      vistas.add(extra)
      resultado.push(extra)
    }
  }

  return resultado
}

/**
 * Casamento por PALAVRA, nunca pela frase inteira.
 *
 * Cada palavra do tema conta o MAIOR peso do campo em que casou (bestFor >
 * tags > pasta); `relevancia` é a soma sobre as palavras casadas. O lado da
 * foto também é quebrado em palavras normalizadas — é o que faz "almoço" do
 * pedido encontrar "almoco" do catálogo, e o que impede "picanha" de casar com
 * a preposição de uma pasta por substring.
 */
export function casaComTema(
  img: FotoRanqueavel,
  palavras: string[],
): { casa: boolean; relevancia: number } {
  if (palavras.length === 0) return { casa: false, relevancia: 0 }

  const bestFor = (img.bestFor ?? []).flatMap((b) => quebrarEmPalavras(b))
  const tags = (img.tags ?? []).flatMap((t) => quebrarEmPalavras(t))
  const pasta = img.folder ? quebrarEmPalavras(img.folder) : []

  let relevancia = 0
  for (const crua of palavras) {
    const palavra = normalizar(crua)
    if (!palavra) continue
    let peso = 0
    if (bestFor.some((p) => casaPalavra(palavra, p))) peso = Math.max(peso, PESOS.CASAMENTO_BESTFOR)
    if (tags.some((p) => casaPalavra(palavra, p))) peso = Math.max(peso, PESOS.CASAMENTO_TAGS)
    if (pasta.some((p) => casaPalavra(palavra, p))) peso = Math.max(peso, PESOS.CASAMENTO_PASTA)
    relevancia += peso
  }

  return { casa: relevancia > 0, relevancia }
}

// ── Filtro ─────────────────────────────────────────────────────────────────

/** Ordem para o filtro de qualidade MÍNIMA (`quality: 'media'` inclui `alta`). */
const ORDEM_QUALIDADE: Record<string, number> = { alta: 3, media: 2, baixa: 1 }

export interface CriteriosDeFiltro {
  /** Caminho da pasta, por PREFIXO normalizado ("01_cortes" pega "01_cortes/picanha"). */
  folder?: string | null
  /** Nome do arquivo, exato ou PREFIXO ("ambiente-f3a" acha "ambiente-f3a8693.jpg"). */
  fileName?: string | null
  /** Igualdade ESTRITA, sem normalização — comportamento herdado de `buscarNoAcervo`. */
  menuCategory?: string | null
  /** Interseção EXATA (normalizada) com as tags da foto. */
  tags?: string[] | null
  /** Qualidade MÍNIMA ('alta' | 'media' | 'baixa'); sem anotação a foto vale como baixa. */
  quality?: string | null
  /**
   * O catálogo tem ALGUMA qualidade anotada? Catálogos regerados (taxonomia
   * v2) não têm — aplicar o filtro neles zeraria o acervo inteiro em silêncio,
   * então sem qualidade anotada o filtro `quality` é IGNORADO. O aviso disso é
   * decidido pelo chamador (`buscarNoAcervo`); aqui só chega o boolean.
   */
  temQualidadeNoCatalogo: boolean
  /**
   * As palavras da busca — `palavrasDoTema(tema, pilares)`, já com a expansão
   * por pilar (F2). VAZIO = sem filtro de tema.
   */
  palavrasDoTema: string[]
}

/**
 * O FILTRO de `buscarNoAcervo`, extraído puro.
 *
 * Comportamento idêntico ao que morava lá, com UMA mudança deliberada (F2): o
 * casamento de tema deixa de ser substring da FRASE INTEIRA e passa a ser por
 * PALAVRA (`casaComTema`) — "cortes e churrasco" volta a acertar a tag
 * "churrasco", em vez de devolver zero. Os filtros exatos não mudam: pasta e
 * fileName por prefixo normalizado, `menuCategory` por igualdade estrita,
 * `tags` por interseção exata, `quality` por ordem mínima.
 *
 * Todo casamento normalizado é SEM ACENTO (`normalizar`), porque o catálogo
 * mistura as duas grafias — "almoço" numa foto e "almoco" na vizinha, no MESMO
 * acervo (medido no Wine Vix). FILTRA, nunca ordena: a ordem do que passa é a
 * ordem da entrada — ordenar é de `ranquearAcervo`.
 */
export function filtrarAcervo<T extends FotoRanqueavel & { menuCategory?: string | null }>(
  imagens: T[],
  criterios: CriteriosDeFiltro,
): T[] {
  let resultado = imagens

  if (criterios.quality && criterios.temQualidadeNoCatalogo) {
    const minimo = ORDEM_QUALIDADE[criterios.quality] ?? 1
    resultado = resultado.filter((i) => (ORDEM_QUALIDADE[i.quality ?? ''] ?? 1) >= minimo)
  }
  if (criterios.folder) {
    const f = normalizar(criterios.folder)
    resultado = resultado.filter((i) => normalizar(i.folder ?? '').startsWith(f))
  }
  if (criterios.fileName) {
    const f = normalizar(criterios.fileName)
    resultado = resultado.filter((i) => normalizar(i.fileName ?? '').startsWith(f))
  }
  if (criterios.palavrasDoTema.length > 0) {
    resultado = resultado.filter((i) => casaComTema(i, criterios.palavrasDoTema).casa)
  }
  if (criterios.menuCategory) {
    resultado = resultado.filter((i) => i.menuCategory === criterios.menuCategory)
  }
  if (criterios.tags?.length) {
    const alvo = criterios.tags.map((t) => normalizar(t))
    resultado = resultado.filter((i) => i.tags?.some((t) => alvo.includes(normalizar(t))))
  }

  return resultado
}

// ── Tempo ──────────────────────────────────────────────────────────────────

/** Date.parse defensivo: string ilegível devolve null, nunca NaN no score. */
function instante(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

/**
 * Boost de novidade: foto catalogada há até NOVIDADE_DIAS antes de `hojeBRT`,
 * decaindo linearmente. Aqui — e SÓ aqui — o relógio vale: novidade é relação
 * com hoje por definição. Sem `catalogadaEm` (foto antiga, catálogo legado)
 * não há boost.
 */
function bonusDeNovidade(catalogadaEm: string | null | undefined, hojeBRT: string, pesos: PesosDoAcervo): number {
  const quando = instante(catalogadaEm ? catalogadaEm.slice(0, 10) : null)
  const hoje = instante(hojeBRT)
  if (quando === null || hoje === null) return 0
  const dias = Math.max(0, (hoje - quando) / DIA_MS)
  if (dias >= pesos.NOVIDADE_DIAS) return 0
  return pesos.NOVIDADE_MAX * (1 - dias / pesos.NOVIDADE_DIAS)
}

function pesoDeQualidade(quality: string | null | undefined, pesos: PesosDoAcervo): number {
  if (!quality) return 0
  const q = normalizar(quality)
  if (q === 'alta') return pesos.QUALIDADE_ALTA
  if (q === 'baixa') return pesos.QUALIDADE_BAIXA
  return 0
}

// ── Semente diária ─────────────────────────────────────────────────────────

/**
 * FNV-1a 32 bits com finalização murmur3 — determinístico, sem dependências.
 * Não é `Math.random()`: a mesma entrada dá sempre a mesma saída, e a data no
 * sufixo é o que troca a permutação de um dia para o outro.
 *
 * A finalização não é ornamento: o FNV-1a difunde MAL o último byte — entre
 * dias vizinhos ('…-30' e '…-31') todo hash se desloca por ±prime e a
 * permutação saía praticamente a mesma (pego por teste). O fmix do murmur3
 * espalha o sufixo por todos os bits.
 */
function hashSemente(s: string): number {
  let h = 0x811c9dc5 | 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

// ── Ranqueamento ───────────────────────────────────────────────────────────

interface SinaisDaFoto {
  escolhas: EscolhaDeFoto[]
  rejeicoes: RejeicaoDeFoto[]
  feedbacks: FeedbackDeFoto[]
}

function agruparPorFoto(preferencias: PreferenciasDeFoto): Map<string, SinaisDaFoto> {
  const porFoto = new Map<string, SinaisDaFoto>()
  const de = (id: string): SinaisDaFoto => {
    let s = porFoto.get(id)
    if (!s) {
      s = { escolhas: [], rejeicoes: [], feedbacks: [] }
      porFoto.set(id, s)
    }
    return s
  }
  for (const e of preferencias.escolhas) de(e.driveFileId).escolhas.push(e)
  for (const r of preferencias.rejeicoes) de(r.driveFileId).rejeicoes.push(r)
  for (const f of preferencias.feedbacks) de(f.driveFileId).feedbacks.push(f)
  return porFoto
}

/**
 * Ordena o acervo pelo score composto. NUNCA remove foto — a saída tem as
 * mesmas fotos da entrada.
 *
 * Ordem final (comparator total — a paginação por offset exige ordem estável e
 * determinística): score desc → menos usada primeiro (`ultimoUso` ausente vem
 * PRIMEIRO, depois data asc) → hash de `driveFileId + hojeBRT` → driveFileId.
 *
 * `pesos` é injetável para o backtest da F1.5 calibrar sem editar o módulo;
 * produção usa o default.
 */
export function ranquearAcervo<T extends FotoRanqueavel>(
  entrada: EntradaDeRanking<T>,
  pesos: PesosDoAcervo = PESOS,
): Array<FotoRanqueada<T>> {
  const { imagens, tema, pilares, preferencias, ultimoUso, destaques, hojeBRT } = entrada

  const palavrasDaBusca = tema ? palavrasDoTema(tema, pilares) : []
  const setDaBusca = new Set(palavrasDaBusca)

  /**
   * 🔴 O decaimento é ancorado na ÚLTIMA ATIVIDADE do cliente, nunca em
   * `hojeBRT`. Recência de sinal é comparação DENTRO do histórico ("o que ele
   * escolheu semana passada vale mais do que o que escolheu em março"), não
   * relógio de validade — ancorar no relógio apagaria as preferências do
   * cliente que passou um mês sem produzir. Sem âncora (cliente sem atividade
   * registrada), nada decai: peso 1.
   */
  const ancora = instante(preferencias.ultimaAtividade)
  const decair = (quando: string): number => {
    if (ancora === null) return 1
    const t = instante(quando)
    if (t === null) return 1
    const dias = Math.max(0, (ancora - t) / DIA_MS)
    return Math.pow(2, -dias / pesos.MEIA_VIDA_SINAL_DIAS)
  }

  /** Palavras de cada tema de sinal, com a MESMA expansão por pilar da busca. */
  const cacheDePalavras = new Map<string, string[]>()
  const temaCasaComABusca = (temaDoSinal: string | null): boolean => {
    if (!temaDoSinal || setDaBusca.size === 0) return false
    let palavras = cacheDePalavras.get(temaDoSinal)
    if (!palavras) {
      palavras = palavrasDoTema(temaDoSinal, pilares)
      cacheDePalavras.set(temaDoSinal, palavras)
    }
    return palavras.some((p) => setDaBusca.has(p))
  }

  const sinaisPorFoto = agruparPorFoto(preferencias)

  const ranqueadas = imagens.map((imagem): FotoRanqueada<T> => {
    const id = imagem.driveFileId
    const sinais = sinaisPorFoto.get(id)

    const componentes: Record<string, number> = {
      destaque: 0,
      escolhaNoTema: 0,
      escolhaGlobal: 0,
      escolhaCorrecaoTema: 0,
      escolhaCorrecaoGlobal: 0,
      rejeicaoNoTema: 0,
      rejeicaoGlobal: 0,
      feedback: 0,
      qualidade: 0,
      novidade: 0,
      relevancia: 0,
    }

    if (destaques.has(id)) componentes.destaque = pesos.DESTAQUE

    for (const escolha of sinais?.escolhas ?? []) {
      const w = decair(escolha.quando)
      if (escolha.forca === 'correcao') {
        // Correção pós-produção: o par mais forte. Hoje chega com tema null
        // (o sinal de troca não carrega tema), então o ramo do tema é dormente.
        componentes.escolhaCorrecaoGlobal += pesos.ESCOLHA_CORRECAO_GLOBAL * w
        if (temaCasaComABusca(escolha.tema)) componentes.escolhaCorrecaoTema += pesos.ESCOLHA_CORRECAO_TEMA * w
      } else {
        componentes.escolhaGlobal += pesos.ESCOLHA_GLOBAL * w
        if (temaCasaComABusca(escolha.tema)) componentes.escolhaNoTema += pesos.ESCOLHA_NO_TEMA * w
      }
    }

    for (const rejeicao of sinais?.rejeicoes ?? []) {
      // Só a rejeição de quem estava no TOPO é sinal: ser preterida na 7ª
      // posição não diz nada sobre a foto.
      if (rejeicao.posicao > pesos.REJEICAO_POSICAO_MAX) continue
      const w = decair(rejeicao.quando)
      const motivo = rejeicao.motivo ? normalizar(rejeicao.motivo) : null
      // 'prato-antigo'/'repetida' acusam a FOTO, não o contexto: a parcela
      // global sobe. 'nao-e-o-assunto' acusa só o contexto: global não conta.
      const defeitoDaFoto = motivo === 'prato-antigo' || motivo === 'repetida'
      const soNoTema = motivo === 'nao-e-o-assunto'
      if (!soNoTema) {
        componentes.rejeicaoGlobal += (defeitoDaFoto ? pesos.REJEICAO_GLOBAL_DEFEITO : pesos.REJEICAO_GLOBAL) * w
      }
      if (temaCasaComABusca(rejeicao.tema)) componentes.rejeicaoNoTema += pesos.REJEICAO_NO_TEMA * w
    }

    for (const feedback of sinais?.feedbacks ?? []) {
      const w = decair(feedback.quando)
      if (feedback.positivo) {
        componentes.feedback += pesos.FEEDBACK_POSITIVO * w
      } else if (feedback.mencionaFoto) {
        // Negativo SEM menção à foto não conta: a reprovação pode ser da copy.
        componentes.feedback += pesos.FEEDBACK_NEGATIVO * w
      }
    }

    componentes.qualidade = pesoDeQualidade(imagem.quality, pesos)
    componentes.novidade = bonusDeNovidade(imagem.catalogadaEm, hojeBRT, pesos)

    if (palavrasDaBusca.length > 0) {
      const { relevancia } = casaComTema(imagem, palavrasDaBusca)
      componentes.relevancia = relevancia * pesos.RELEVANCIA_POR_PONTO
    }

    let score = 0
    for (const valor of Object.values(componentes)) score += valor

    return {
      imagem,
      score,
      componentes,
      vagaDeExploracao: !sinaisPorFoto.has(id) && !ultimoUso.has(id),
    }
  })

  ranqueadas.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score

    // Rodízio como desempate (não mais como critério único): nunca usada vem
    // primeiro, depois a usada há mais tempo. Strings ISO comparam por ordem.
    const usoA = ultimoUso.get(a.imagem.driveFileId)
    const usoB = ultimoUso.get(b.imagem.driveFileId)
    if ((usoA === undefined) !== (usoB === undefined)) return usoA === undefined ? -1 : 1
    if (usoA !== undefined && usoB !== undefined && usoA !== usoB) return usoA < usoB ? -1 : 1

    // Semente diária: mesma ordem dentro do dia, outra entre dias.
    const hA = hashSemente(a.imagem.driveFileId + hojeBRT)
    const hB = hashSemente(b.imagem.driveFileId + hojeBRT)
    if (hA !== hB) return hA - hB

    // Desempate final absoluto, para o comparator ser total.
    if (a.imagem.driveFileId < b.imagem.driveFileId) return -1
    if (a.imagem.driveFileId > b.imagem.driveFileId) return 1
    return 0
  })

  return ranqueadas
}
