/**
 * Revisão ortográfica da copy, com o vocabulário da marca.
 *
 * O prompt de arte manda reproduzir a copy "letra por letra, com a mesma
 * grafia" — regra forte e correta, criada para o modelo não reescrever o texto
 * do cliente. O efeito colateral é que ele é fiel ao ERRO também: a arte do
 * Festival Italiano do Wine Vix foi publicada com "Menu harmonizado /
 * disponivel durante o mês de agosto", sem acento, depois de atravessar o
 * pipeline inteiro sem ninguém acusar nada. Custou 25 créditos e foi ao ar.
 *
 * Este módulo é a segunda camada da conferência (a primeira é o corretor
 * nativo do navegador, de graça e instantâneo). Ele existe para o que o
 * corretor do navegador NÃO sabe: que "chopp", "picanha", "By Rock" e
 * "Brasileirinho" não são erros.
 *
 * Três contratos, herdados do que sobreviveu às verificações desligadas em
 * 10 e 11/08 (retry automático de qualidade, QA por visão e crivo de
 * aprovação — todos removidos por atrasar, errar ou bloquear):
 *
 * 1. **Roda em SEGUNDO PLANO, enquanto a pessoa digita.** Quando ela clica em
 *    adicionar/gerar, o resultado já está na tela: o clique não espera nada.
 *    Verificação que adiciona espera perceptível morre.
 * 2. **Falha é SILÊNCIO.** Timeout, modelo fora do ar, resposta torta:
 *    `indisponivel: true` e nenhuma suspeita. Erro na cara de quem está
 *    escrevendo é pior que a revisão não existir.
 * 3. **Avisa, nunca bloqueia e nunca corrige sozinho.** Quem clica na
 *    sugestão é o usuário; quem decide gerar assim mesmo, também.
 *
 * A regra que impede o alarme falso mora no contrato
 * (`revisao-ortografica-contrato.ts`): o vocabulário da marca protege a
 * PALAVRA, não o ACENTO.
 */

import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { db } from '@/lib/db'
import { loadBrandContext } from '@/lib/brand/brand-context'
import {
  extrairVocabulario,
  reconciliarSuspeitas,
  termosDaMarca,
  MAX_SUSPEITAS,
  MIN_CARACTERES_PARA_REVISAR,
  type RevisaoOrtografica,
  type VocabularioDaMarca,
} from '@/lib/ai/revisao-ortografica-contrato'

/** Modelo barato: é conferência de grafia, não raciocínio. */
const MODELO = 'gpt-4o-mini'

/**
 * Teto de espera. Curto de propósito — isto roda a cada pausa da digitação, e
 * uma resposta que chega depois de a pessoa ter clicado em gerar não serve
 * para nada. Estourou, é silêncio.
 */
const TIMEOUT_MS = 20_000

/** Teto do que vai ao modelo. Acima disso não é copy de arte, é outra coisa. */
const MAX_CARACTERES = 4_000

/**
 * Categorias da base que carregam vocabulário próprio da casa. `TOM_DE_VOZ` é
 * legado (a identidade mora no DNA), mas os projetos antigos ainda guardam as
 * palavras-chave e os bordões ali — e uma palavra protegida a mais não custa
 * nada, enquanto acusar o nome de um prato mata a funcionalidade.
 */
const CATEGORIAS_DE_VOCABULARIO = [
  'CARDAPIO',
  'CAMPANHAS',
  'DIFERENCIAIS',
  'ESTABELECIMENTO_INFO',
  'TOM_DE_VOZ',
] as const

/**
 * Vocabulário em memória, por projeto.
 *
 * A revisão dispara a cada pausa da digitação; reler a base e o DNA em toda
 * tecla somaria duas consultas ao caminho quente sem que nada tenha mudado.
 * TTL curto para uma entrada nova de cardápio valer no mesmo dia. É cache de
 * instância (serverless) — perder é irrelevante, o pior caso é reler.
 */
const CACHE_TTL_MS = 5 * 60_000
const cache = new Map<number, { em: number; marca: MarcaParaRevisao }>()

export interface MarcaParaRevisao {
  nome: string
  vocabulario: VocabularioDaMarca
  /** Nomes próprios e termos distintos, para o prompt. */
  termos: string[]
  /** Como a marca fala — bordões e palavras da casa. */
  tomDeVoz: string | null
}

/**
 * Reúne tudo que conta como "palavra da casa": nome do projeto, base de
 * conhecimento (títulos, tags e conteúdo) e as seções do DNA.
 *
 * Lê a base DIRETO do banco, sem busca semântica: aqui não se quer relevância,
 * quer-se o vocabulário inteiro — e uma chamada de embedding no caminho da
 * digitação seria latência paga para piorar o resultado.
 */
export async function carregarMarcaParaRevisao(projectId: number): Promise<MarcaParaRevisao | null> {
  const emCache = cache.get(projectId)
  if (emCache && Date.now() - emCache.em < CACHE_TTL_MS) return emCache.marca

  const [contexto, entradas] = await Promise.all([
    loadBrandContext(projectId),
    db.knowledgeBaseEntry.findMany({
      where: {
        projectId,
        status: 'ACTIVE',
        category: { in: CATEGORIAS_DE_VOCABULARIO as unknown as never },
      },
      select: { title: true, content: true, tags: true },
    }),
  ])
  if (!contexto) return null

  const fontes: Array<string | null> = [
    contexto.projectName,
    contexto.dna.toneOfVoice,
    contexto.dna.contentRules,
    contexto.dna.composition,
    contexto.dna.visualStyle,
    contexto.dna.photoDirection,
    contexto.cuisineType,
    ...contexto.colors.map((c) => c.name),
    ...entradas.map((e) => e.title),
    ...entradas.map((e) => e.tags.join(' ')),
    ...entradas.map((e) => e.content),
  ]

  const marca: MarcaParaRevisao = {
    nome: contexto.projectName,
    vocabulario: extrairVocabulario(fontes),
    termos: termosDaMarca([contexto.projectName, ...entradas.map((e) => e.title), ...entradas.map((e) => e.content), contexto.dna.toneOfVoice]),
    tomDeVoz: contexto.dna.toneOfVoice,
  }

  cache.set(projectId, { em: Date.now(), marca })
  return marca
}

/** Só para teste: descarta o vocabulário guardado em memória. */
export function limparCacheDeRevisao(): void {
  cache.clear()
}

/**
 * 🔴 Todo campo é OPCIONAL, mesma lição do crivo (11/08/2026): com eles
 * obrigatórios, o zod recusa a resposta INTEIRA quando o modelo omite um só —
 * e ele omite. O rigor mora em `reconciliarSuspeitas`, que trata cada item
 * como suspeito e confere contra o texto de verdade.
 */
const respostaSchema = z.object({
  suspeitas: z
    .array(
      z.object({
        trecho: z
          .string()
          .optional()
          .describe('O trecho errado, COPIADO do texto exatamente como está escrito lá.'),
        sugestao: z.string().optional().describe('O mesmo trecho, corrigido.'),
        motivo: z
          .string()
          .optional()
          .describe('Até 6 palavras: "falta o acento", "concordância", "erro de grafia".'),
      }),
    )
    .optional(),
})

const INSTRUCOES = [
  'Você revisa a ORTOGRAFIA de textos curtos de peças de Instagram de restaurantes, em português do Brasil.',
  '',
  'Aponte SOMENTE erro claro e indiscutível de:',
  '- ortografia (palavra escrita errada);',
  '- acentuação (acento faltando, sobrando ou errado);',
  '- concordância evidente (verbal ou nominal).',
  '',
  '🔴 NA DÚVIDA, CALE-SE. Uma acusação errada custa mais que um erro que passou: quem escreve aprende a ignorar o aviso, e aí ele deixa de servir para qualquer coisa. Devolva a lista VAZIA quando não houver erro claro — é o desfecho normal e esperado.',
  '',
  'NUNCA aponte, em hipótese nenhuma:',
  '- nome próprio, nome de marca, de prato, de banda, de drink, de bairro ou de rua;',
  '- estrangeirismo e gíria ("happy hour", "chopp", "smash", "rock and roll", "delivery", "burger");',
  '- palavra da lista VOCABULÁRIO DA CASA abaixo, em nenhuma forma;',
  '- @perfil, #hashtag, telefone, endereço, site, preço, horário;',
  '- estilo, tom, ritmo, escolha de palavra, repetição ou "poderia ficar melhor";',
  '- pontuação ausente no fim da linha, e ausência de ponto final;',
  '- MAIÚSCULAS: a copy é escrita em caixa alta de propósito. Isso é design, não erro.',
  '- frase sem verbo, frase cortada ou linha solta: cada linha é um bloco de texto independente na arte, e não precisa formar uma oração completa.',
  '- singular ou plural dentro de uma enumeração ("rock, petisco e boa companhia"): é escolha de quem escreveu, não erro.',
  '',
  'ACENTO EM CAIXA ALTA CONTA: "DISPONIVEL" está errado do mesmo jeito que "disponivel". A arte imprime o acento normalmente.',
  '',
  '🔴 NÃO "CONSERTE" O QUE JÁ ESTÁ CERTO. Verbo bem conjugado, plural correto, preposição correta e palavra comum bem escrita ficam como estão. Antes de listar um item, confirme que a sua sugestão é uma palavra que EXISTE em português e que qualquer revisor profissional concordaria com a troca. Se não tiver certeza absoluta disso, não liste.',
  '',
  '🔴 O campo "trecho" precisa ser uma CÓPIA LITERAL de um pedaço do texto recebido, com a mesma grafia e a mesma caixa. Recorte a MENOR parte que contém o erro — em geral UMA palavra. Só recorte mais de uma quando o erro for de concordância ENTRE elas ("os melhor prato" → "os melhores pratos"). Trecho que não existir no texto é descartado pelo sistema.',
  '"sugestao" é esse mesmo trecho corrigido, e nada além disso: mesma quantidade de palavras, mesmo radical, mudando só o que está errado. Nunca reescreva a frase.',
  '',
  `No máximo ${MAX_SUSPEITAS} itens, os mais claros primeiro. Lista vazia é a resposta certa na maioria das vezes.`,
].join('\n')

export interface PedidoDeRevisao {
  /** Blocos de copy da peça — cada um é uma linha independente na arte. */
  blocos: string[]
  /** Legenda do post, quando houver. */
  legenda?: string | null
}

/** O prompt inteiro, montado. Exportado para inspeção e teste. */
export function montarPrompt(marca: MarcaParaRevisao, pedido: PedidoDeRevisao): string {
  const blocos = pedido.blocos.map((b) => b.trim()).filter(Boolean)
  const legenda = pedido.legenda?.trim()

  const partes = [
    INSTRUCOES,
    '',
    `=== MARCA: ${marca.nome} ===`,
  ]

  if (marca.termos.length > 0) {
    partes.push(
      '',
      'VOCABULÁRIO DA CASA (nomes próprios, pratos, campanhas e termos da marca — NENHUM deles é erro):',
      marca.termos.join(' · '),
    )
  }

  if (marca.tomDeVoz) {
    partes.push(
      '',
      'COMO A MARCA FALA (as palavras e bordões daqui também não são erro):',
      marca.tomDeVoz.slice(0, 1_200),
    )
  }

  partes.push(
    '',
    '=== TEXTO A REVISAR ===',
    blocos.length > 0
      ? `BLOCOS DA ARTE (uma linha por bloco):\n${blocos.map((b, i) => `${i + 1}. ${b}`).join('\n')}`
      : 'BLOCOS DA ARTE: nenhum.',
  )

  if (legenda) partes.push('', `LEGENDA DO POST:\n${legenda}`)

  return partes.join('\n')
}

/**
 * Revisa a copy. **Nunca lança**: qualquer problema vira `indisponivel: true`
 * com a lista vazia, e a bancada simplesmente não mostra nada.
 */
export async function revisarOrtografia(
  projectId: number,
  pedido: PedidoDeRevisao,
): Promise<RevisaoOrtografica> {
  const blocos = pedido.blocos.map((b) => b.trim()).filter(Boolean)
  const legenda = pedido.legenda?.trim() || null
  const textos = [...blocos, ...(legenda ? [legenda] : [])]

  const total = textos.join('\n')
  if (total.length < MIN_CARACTERES_PARA_REVISAR) {
    return { suspeitas: [], indisponivel: false }
  }
  if (total.length > MAX_CARACTERES) {
    return { suspeitas: [], indisponivel: true }
  }

  let marca: MarcaParaRevisao | null = null
  try {
    marca = await carregarMarcaParaRevisao(projectId)
  } catch (error) {
    console.warn('[revisao-ortografica] vocabulário da marca indisponível:', error)
    return { suspeitas: [], indisponivel: true }
  }
  if (!marca) return { suspeitas: [], indisponivel: true }

  try {
    const { object } = await generateObject({
      model: openai(MODELO),
      temperature: 0,
      maxOutputTokens: 600,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      schema: respostaSchema,
      messages: [{ role: 'user', content: montarPrompt(marca, { blocos, legenda }) }],
    })

    return {
      suspeitas: reconciliarSuspeitas(textos, object.suspeitas, marca.vocabulario),
      indisponivel: false,
    }
  } catch (error) {
    const motivo = error instanceof Error ? error.message : 'erro desconhecido'
    console.warn('[revisao-ortografica] revisão não respondeu — seguindo em silêncio:', motivo)
    return { suspeitas: [], indisponivel: true }
  }
}
