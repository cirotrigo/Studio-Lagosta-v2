/**
 * Classificador de posts na taxonomia FECHADA de pilares do cliente (F2).
 *
 * Recebe a lista aprovada na aba Marca e devolve, para cada post, um slug dela
 * — ou um dos dois reservados. Três travas, todas no CÓDIGO e não no prompt:
 *
 * 1. **Constrangido ao enum.** O que o modelo devolve passa por `casarPilar`:
 *    rótulo que não existe na taxonomia vira `outro`, sem aproximação por
 *    semelhança. "Quase igual" é como um pilar engole o vizinho.
 * 2. **Piso de confiança.** Abaixo de `CONFIANCA_MINIMA`, `outro` — nunca o
 *    rótulo mais provável. Pedir isso ao modelo no prompt não é trava: ele
 *    responde com confiança alta para agradar.
 * 3. **Reconciliação por ECO, não por índice.** O índice declarado não é
 *    confiável em lista longa — medido em 11/08/2026 no crivo do By Rock, onde
 *    o gpt-4o-mini devolveu a lista inteira DESLOCADA em uma posição. Cada
 *    resposta copia as primeiras palavras do texto que está julgando, e é o
 *    texto que amarra. Eco que não casa (ou casa com vários) é DESCARTADO: o
 *    post fica sem classificação, que é honesto, em vez de receber o pilar do
 *    vizinho, que é mentira com aparência de dado.
 *
 * Nunca lança. Falha de modelo devolve zero classificações e o histórico
 * continua como estava — reclassificar depois é barato, desclassificar errado
 * não é.
 */

import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import {
  casarPilar,
  comPisoDeConfianca,
  PILAR_SEM_TEXTO,
  taxonomiaEmTexto,
  type Pilar,
} from './pilares'

/** Leitura de texto curto contra uma lista fechada — não pede raciocínio caro. */
const MODELO = 'gpt-4o-mini'
const TIMEOUT_MS = 60_000

/**
 * Quantos posts por chamada. Lotes grandes economizam tokens de prompt (a
 * taxonomia é repetida a cada chamada) mas pioram o alinhamento das respostas
 * — que é o defeito que a reconciliação por eco existe para pegar. 25 é o
 * meio-termo: ~4 chamadas para as 100 publicações com texto de um cliente.
 */
export const TAMANHO_DO_LOTE = 25

/** Muda quando o prompt ou a regra muda — grava em `SocialPost.pilarVersao`. */
export const VERSAO_DO_CLASSIFICADOR = 'pilares-v1'

/** Quantas palavras do texto o modelo copia de volta como âncora. */
const PALAVRAS_DO_ECO = 6

const respostaSchema = z.object({
  itens: z.array(
    z.object({
      indice: z.number().int().optional().describe('O número do texto, exatamente como recebido'),
      eco: z
        .string()
        .optional()
        .describe(
          `Copie as primeiras ${PALAVRAS_DO_ECO} palavras do texto que você está classificando, exatamente como estão escritas.`,
        ),
      pilar: z
        .string()
        .optional()
        .describe('O identificador do pilar (a parte antes dos dois pontos na lista), ou "outro".'),
      confianca: z
        .number()
        .optional()
        .describe('0 a 1. Quanto você tem de certeza. Use abaixo de 0,6 quando estiver em dúvida.'),
    }),
  ),
})

export interface PostParaClassificar {
  id: string
  /** O texto reunido por `textoDoPost`. Vazio significa "sem texto". */
  texto: string
}

export interface Classificacao {
  postId: string
  pilar: string
  confianca: number | null
  versao: string
}

export interface ResultadoDaClassificacao {
  classificacoes: Classificacao[]
  /** Posts que o modelo não respondeu, ou cujo eco não casou. */
  naoClassificados: string[]
  /** Motivos legíveis do que não deu certo. */
  avisos: string[]
}

/** As primeiras palavras de um texto, normalizadas para comparação. */
export function ecoDe(texto: string, palavras = PALAVRAS_DO_ECO): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, palavras)
    .join(' ')
}

interface ItemDaResposta {
  indice?: number
  eco?: string
  pilar?: string
  confianca?: number
}

/**
 * Amarra cada resposta ao post CERTO.
 *
 * Preferência pelo eco; o índice só decide quando o eco não resolve E aquele
 * índice ainda está livre. Resposta que não se amarra a ninguém é descartada
 * — o post volta como não classificado.
 */
export function reconciliarClassificacao(
  posts: PostParaClassificar[],
  itens: ItemDaResposta[],
  taxonomia: Pilar[],
): ResultadoDaClassificacao {
  const ecos = posts.map((p) => ecoDe(p.texto))
  const usados = new Set<number>()
  const classificacoes: Classificacao[] = []
  const avisos: string[] = []

  /** Texto inteiro normalizado — para saber se dois candidatos são o MESMO post. */
  const inteiros = posts.map((p) => ecoDe(p.texto, 400))

  const casarPorEco = (eco: string | undefined): number => {
    if (!eco) return -1
    const alvo = ecoDe(eco)
    if (!alvo) return -1
    const candidatos: number[] = []
    for (let i = 0; i < ecos.length; i++) {
      if (usados.has(i)) continue
      if (ecos[i] === alvo || ecos[i].startsWith(alvo) || alvo.startsWith(ecos[i])) candidatos.push(i)
    }
    if (candidatos.length === 1) return candidatos[0]
    if (candidatos.length === 0) return -1

    /**
     * Empate entre textos IDÊNTICOS não é ambiguidade.
     *
     * O caso é comum e foi medido no Wine Vix em 11/08/2026: a mesma peça
     * publicada duas vezes ("Festival Italiano Menu exclusiva…", "HAPPY HOUR
     * Seg–Sáb…") aparece como duas linhas com a mesma copy. Descartar as duas
     * custava 8 das 25 classificações de um lote — e não protegia nada: em
     * qual das duas a resposta cai é indiferente, porque o texto é o mesmo.
     *
     * O descarte continua valendo para textos DIFERENTES que só compartilham o
     * começo — aí a resposta pode mesmo ir para a peça errada.
     */
    const primeiro = inteiros[candidatos[0]]
    const todosIguais = candidatos.every((i) => inteiros[i] === primeiro)
    return todosIguais ? candidatos[0] : -1
  }

  for (const item of itens) {
    let alvo = casarPorEco(item.eco)
    if (alvo < 0) {
      const i = item.indice
      if (typeof i === 'number' && i >= 0 && i < posts.length && !usados.has(i)) {
        // Só aceito quando o eco não veio; eco que veio e não casou é sinal de
        // resposta desalinhada, e o índice dela vale ainda menos.
        if (!item.eco) alvo = i
      }
    }
    if (alvo < 0) {
      avisos.push(`Resposta descartada: não deu para saber a que texto ela se refere ("${(item.eco ?? '').slice(0, 40)}").`)
      continue
    }

    usados.add(alvo)
    const confianca = typeof item.confianca === 'number' && Number.isFinite(item.confianca) ? item.confianca : null
    classificacoes.push({
      postId: posts[alvo].id,
      pilar: comPisoDeConfianca(casarPilar(item.pilar, taxonomia), confianca),
      confianca,
      versao: VERSAO_DO_CLASSIFICADOR,
    })
  }

  const naoClassificados = posts.filter((_, i) => !usados.has(i)).map((p) => p.id)
  return { classificacoes, naoClassificados, avisos }
}

const INSTRUCOES = [
  'Você organiza o conteúdo de Instagram de um restaurante. Recebeu os PILARES desta marca (uma lista fechada) e uma lista de TEXTOS de publicações já feitas.',
  '',
  'Para cada texto, diga a qual pilar ele pertence.',
  '',
  '🔴 Só existem os pilares da lista, mais "outro". Não invente pilar, não junte dois num só, não use sinônimo: devolva exatamente o identificador que está antes dos dois pontos.',
  '🔴 Use "outro" sem constrangimento — quando o texto não é sobre nenhum dos pilares, ou quando você ficaria em dúvida entre dois. Um "outro" honesto vale mais do que um palpite: a lista serve para contar quantas peças de cada assunto o cliente publica, e um chute estraga a conta.',
  '"confianca" é sua certeza de 0 a 1. Abaixo de 0,6 o sistema trata como "outro" de qualquer forma — então seja sincero em vez de arredondar para cima.',
  '',
  'O texto costuma ser curto e vir da arte (título, subtítulo, chamada). Julgue pelo ASSUNTO, não pela forma.',
  '',
  `🔴 Em "eco", copie as primeiras ${PALAVRAS_DO_ECO} palavras do texto que você está classificando, exatamente como aparecem. É o que garante que a sua resposta não caia no texto errado — resposta desalinhada é descartada.`,
  'Responda TODOS os textos, uma vez cada.',
].join('\n')

/** O prompt inteiro, montado. Exportado para inspeção e teste. */
export function montarPromptDeClassificacao(taxonomia: Pilar[], posts: PostParaClassificar[]): string {
  return [
    INSTRUCOES,
    '',
    '=== PILARES DESTA MARCA ===',
    taxonomiaEmTexto(taxonomia),
    `- outro: não é sobre nenhum dos pilares acima, ou você ficou em dúvida.`,
    '',
    '=== TEXTOS ===',
    posts.map((p, i) => `${i}. ${p.texto}`).join('\n'),
  ].join('\n')
}

/**
 * Classifica um lote. Nunca lança: erro vira aviso e lote sem classificação.
 */
export async function classificarLote(
  taxonomia: Pilar[],
  posts: PostParaClassificar[],
): Promise<ResultadoDaClassificacao> {
  const semTexto = posts.filter((p) => !p.texto.trim())
  const comTexto = posts.filter((p) => p.texto.trim())

  // O que não tem texto nem chega ao modelo — é a maioria, e classificá-lo
  // seria pagar por um palpite sobre o vazio.
  const daFalta: Classificacao[] = semTexto.map((p) => ({
    postId: p.id,
    pilar: PILAR_SEM_TEXTO,
    confianca: null,
    versao: VERSAO_DO_CLASSIFICADOR,
  }))

  if (comTexto.length === 0 || taxonomia.length === 0) {
    return { classificacoes: daFalta, naoClassificados: [], avisos: [] }
  }

  try {
    const { object } = await generateObject({
      model: openai(MODELO),
      temperature: 0,
      maxOutputTokens: 4_000,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      schema: respostaSchema,
      messages: [{ role: 'user', content: montarPromptDeClassificacao(taxonomia, comTexto) }],
    })
    const r = reconciliarClassificacao(comTexto, object.itens ?? [], taxonomia)
    return { ...r, classificacoes: [...daFalta, ...r.classificacoes] }
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : 'erro desconhecido'
    console.warn('[pilares] classificação indisponível neste lote:', motivo)
    return {
      classificacoes: daFalta,
      naoClassificados: comTexto.map((p) => p.id),
      avisos: [`O classificador não respondeu (${motivo}).`],
    }
  }
}
