/**
 * DICA DE COPY — o que propõe o texto de cada peça de uma leva (F3, fatia B1).
 *
 * É o serviço que `propor-semana` consome: recebe os slots já decididos
 * (horário, assunto, formato) e devolve, para cada um, os blocos de texto da
 * arte e a legenda.
 *
 * ── POR QUE ELE É ASSIM ───────────────────────────────────────────────────
 * Em 10 e 11/08/2026 o Ciro desligou três mecanismos de verificação — retry
 * automático de qualidade, revisão visual por IA e crivo de aprovação — pelo
 * MESMO motivo: verificação que atrasa, erra ou bloqueia treina o usuário a
 * ignorá-la. A conclusão que manda no desenho daqui: **qualidade entra na
 * GERAÇÃO, não em portões.** Por isso as perguntas do crivo de cada marca são
 * INSUMO do prompt (a copy já nasce respeitando-as) em vez de porta no fim do
 * fluxo, e por isso não existe tela para aprovar dica.
 *
 * E, pela mesma razão: **nada espera, nada bloqueia.** `montarDicasDeCopy`
 * NUNCA lança. Modelo fora do ar, base ilegível, projeto sem DNA — tudo degrada
 * para "sem dica", e a proposta segue útil, porque ela ainda tem horário, tema
 * e foto.
 *
 * ── UMA CHAMADA PARA A LEVA INTEIRA ───────────────────────────────────────
 * Não é economia: é o que deixa o modelo ver a semana toda de uma vez e não
 * repetir o mesmo gancho em dois posts. Molde em
 * `src/lib/aprendizado/classificador.ts` (F2).
 *
 * ── NÃO COBRA CRÉDITOS ────────────────────────────────────────────────────
 * Precedente direto: a rota de `revisao-ortografica` usa o mesmo `gpt-4o-mini`
 * e não cobra; e o contrato da F3 é que montar a proposta é de graça — só
 * `executar-plano` gasta. Proposta com pedágio é proposta que ninguém itera.
 *
 * O rigor (reconciliação por eco, guarda de preço/horário/data/promoção,
 * montagem do prompt) mora em `dica-de-copy-contrato.ts`, que é PURO e
 * testável sem banco.
 */

import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { db } from '@/lib/db'
import { loadBrandContext } from '@/lib/brand/brand-context'
import { parseApprovalChecklist } from '@/lib/brand/approval-checklist'
import { montarPerfil, perfilParaPrompt } from '@/lib/aprendizado/perfil'
import { searchKnowledgeBase } from '@/lib/knowledge/search'
import { vigenteEm } from '@/lib/knowledge/vigencia'
import { revisarOrtografia } from '@/lib/ai/revisao-ortografica'
import {
  ancoraDoPedido,
  aplicarGuardaDeDados,
  entradasValidasPara,
  montarPromptDeDica,
  reconciliarDicas,
  VERSAO_DA_DICA,
  type DicaDeCopy,
  type EntradaDaBase,
  type InsumosDaDica,
  type PedidoDeDica,
  type ResultadoDasDicas,
} from './dica-de-copy-contrato'

export {
  ancoraDoPedido,
  aplicarGuardaDeDados,
  ecoDaDica,
  entradasValidasPara,
  montarPromptDeDica,
  quandoEmBRT,
  reconciliarDicas,
  VERSAO_DA_DICA,
} from './dica-de-copy-contrato'
export type {
  CopyGuardada,
  DicaCrua,
  DicaDeCopy,
  EntradaDaBase,
  InsumosDaDica,
  ItemDaResposta,
  PedidoDeDica,
  ResultadoDasDicas,
} from './dica-de-copy-contrato'

/** Escrever copy curta com voz de marca não pede raciocínio caro. */
const MODELO = 'gpt-4o-mini'

/**
 * Teto de espera. Generoso porque isto NÃO roda no caminho de um clique: quem
 * chama é a montagem de uma proposta de semana. Ainda assim é teto — a leva
 * sem copy é útil, a leva que nunca volta não.
 */
const TIMEOUT_MS = 90_000

/** Uma leva maior que isto não é uma leva: é um mês. */
const MAX_PEDIDOS = 16

/** Quantas entradas da base entram no prompt. */
const MAX_ENTRADAS = 12

/** Orçamento de texto da base no prompt. Entrada que não cabe é PULADA. */
const MAX_CHARS_BASE = 8_000

/**
 * As categorias que carregam o que a copy pode citar. `TOM_DE_VOZ` fica de
 * fora: identidade mora no DNA (regra da casa), e o que interessa aqui é fato
 * verificável.
 */
const CATEGORIAS_DA_DICA = [
  'CAMPANHAS',
  'HORARIOS',
  'CARDAPIO',
  'DIFERENCIAIS',
  'ESTABELECIMENTO_INFO',
] as const

/** Ordem de importância quando a relevância não decide. */
const PRIORIDADE: string[] = [...CATEGORIAS_DA_DICA]

/**
 * 🔴 Todo campo é OPCIONAL — mesma lição do crivo (By Rock, 11/08/2026): com
 * eles obrigatórios, o zod recusa a resposta INTEIRA quando o modelo omite um
 * só, e ele omite (15 vereditos corretos descartados por falta de um campo). O
 * rigor mora em `reconciliarDicas`, que trata cada item como suspeito.
 */
const respostaSchema = z.object({
  dicas: z
    .array(
      z.object({
        eco: z
          .string()
          .optional()
          .describe(
            'CÓPIA das primeiras palavras da linha "âncora:" da peça que esta copy atende. Não é a headline nem texto novo.',
          ),
        ref: z.string().optional().describe('O identificador da peça ("ref:"), copiado.'),
        blocos: z
          .array(z.string())
          .optional()
          .describe('Os blocos de texto que vão DENTRO da arte, na ordem de leitura.'),
        legenda: z
          .string()
          .optional()
          .describe('A legenda do post. Deixe vazia quando o formato for story.'),
      }),
    )
    .optional(),
})

function resultadoVazio(
  refs: string[],
  avisos: string[],
  indisponivel: boolean,
): ResultadoDasDicas {
  return { versao: VERSAO_DA_DICA, dicas: [], semDica: refs, avisos, indisponivel }
}

/** Pedido utilizável: tem ref e tem data legível. */
function pedidoValido(pedido: PedidoDeDica | null | undefined): pedido is PedidoDeDica {
  if (!pedido || typeof pedido.ref !== 'string' || !pedido.ref.trim()) return false
  return pedido.quando instanceof Date && !Number.isNaN(pedido.quando.getTime())
}

/** A consulta que busca na base o que interessa a ESTA leva. */
function consultaDaLeva(nomeDaMarca: string, pedidos: PedidoDeDica[]): string {
  const termos = new Set<string>()
  for (const pedido of pedidos) {
    const tema = pedido.tema?.trim()
    if (tema) termos.add(tema)
    const observacao = pedido.observacao?.trim()
    if (observacao) termos.add(observacao)
  }
  if (termos.size === 0) {
    return `${nomeDaMarca}: cardápio, horários, campanhas e diferenciais da casa`
  }
  return [...termos].join(', ').slice(0, 600)
}

/**
 * Reúne as entradas da base que a leva pode citar.
 *
 * A vigência é filtrada pela data do slot MAIS PRÓXIMO (`refMinima`): é o
 * superconjunto exato, porque `expiresAt > data_maior` implica
 * `expiresAt > data_menor`. O descarte fino, entrada por entrada, acontece
 * depois, contra o `quando` de cada peça (`entradasValidasPara`).
 *
 * A busca por relevância só ORDENA — o que entra de verdade é a leitura do
 * banco, que é a única que carrega `expiresAt`. Relevância indisponível
 * (embedding, vetor) não deixa a dica sem base: cai na leitura direta, ordenada
 * por categoria e recência.
 */
async function reunirBase(
  projectId: number,
  consulta: string,
  refMinima: Date,
): Promise<{ entradas: EntradaDaBase[]; avisos: string[] }> {
  const avisos: string[] = []

  let relevantes: string[] = []
  try {
    const hits = await searchKnowledgeBase(consulta, { projectId }, {
      topK: 8,
      minScore: 0.55,
      includeEntryMetadata: true,
    })
    relevantes = [...new Set(hits.map((h) => h.entryId))]
  } catch (erro) {
    console.warn('[dica-de-copy] busca por relevância indisponível:', erro)
    avisos.push('A busca por relevância na base não respondeu; usei as entradas mais recentes.')
  }

  let linhas: Array<{
    id: string
    title: string
    category: string
    content: string
    expiresAt: Date | null
    updatedAt: Date
  }> = []
  try {
    linhas = await db.knowledgeBaseEntry.findMany({
      where: {
        projectId,
        status: 'ACTIVE',
        category: { in: CATEGORIAS_DA_DICA as unknown as never },
        ...vigenteEm(refMinima),
      },
      select: { id: true, title: true, category: true, content: true, expiresAt: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 40,
    })
  } catch (erro) {
    console.warn('[dica-de-copy] base de conhecimento indisponível:', erro)
    return {
      entradas: [],
      avisos: [
        ...avisos,
        'Não consegui ler a base de conhecimento agora — a copy saiu sem preço, horário, data ou promoção.',
      ],
    }
  }

  const peso = (linha: (typeof linhas)[number]) => {
    const posicao = relevantes.indexOf(linha.id)
    if (posicao >= 0) return posicao
    const categoria = PRIORIDADE.indexOf(linha.category)
    return 100 + (categoria >= 0 ? categoria : PRIORIDADE.length)
  }

  const ordenadas = [...linhas].sort((a, b) => {
    const diferenca = peso(a) - peso(b)
    if (diferenca !== 0) return diferenca
    return b.updatedAt.getTime() - a.updatedAt.getTime()
  })

  const entradas: EntradaDaBase[] = []
  let orcamento = 0
  for (const linha of ordenadas) {
    if (entradas.length >= MAX_ENTRADAS) break
    const custo = linha.title.length + linha.content.length
    // Entrada que não cabe é PULADA, nunca encerra o laço — o `break` faria uma
    // entrada longa no topo eliminar todas as menores, que é o defeito já
    // corrigido no formatador da base (`search.ts`).
    if (orcamento + custo > MAX_CHARS_BASE) continue
    orcamento += custo
    entradas.push({
      id: linha.id,
      titulo: linha.title,
      categoria: linha.category,
      conteudo: linha.content,
      expiresAt: linha.expiresAt,
    })
  }

  return { entradas, avisos }
}

export interface PreparoDaDica {
  insumos: InsumosDaDica | null
  entradas: EntradaDaBase[]
  avisos: string[]
}

/**
 * Tudo que o prompt precisa, lido do banco. Exportado para que a validação
 * (`scripts/validar-dica-de-copy-f3.ts`) mostre o prompt REAL, e não uma
 * reconstrução aproximada que envelhece sozinha.
 *
 * `insumos: null` significa "não deu para ler a identidade desta marca" — o
 * único caso em que a leva sai inteira sem dica.
 */
export async function prepararDica(
  projectId: number,
  pedidos: PedidoDeDica[],
): Promise<PreparoDaDica> {
  let contexto: Awaited<ReturnType<typeof loadBrandContext>> = null
  try {
    contexto = await loadBrandContext(projectId)
  } catch (erro) {
    console.warn('[dica-de-copy] identidade da marca indisponível:', erro)
  }
  if (!contexto) {
    return {
      insumos: null,
      entradas: [],
      avisos: ['Não consegui ler a identidade desta marca agora — a leva ficou sem dica de copy.'],
    }
  }

  const refMinima = new Date(Math.min(...pedidos.map((p) => p.quando.getTime())))

  const [perfil, base] = await Promise.all([
    montarPerfil(projectId)
      .then((p) => perfilParaPrompt(p))
      .catch((erro) => {
        console.warn('[dica-de-copy] perfil aprendido indisponível:', erro)
        return null
      }),
    reunirBase(projectId, consultaDaLeva(contexto.projectName, pedidos), refMinima),
  ])

  return {
    insumos: {
      nomeDaMarca: contexto.projectName,
      tomDeVoz: contexto.dna.toneOfVoice,
      regrasDeConteudo: contexto.dna.contentRules,
      perguntasDoCrivo: parseApprovalChecklist(contexto.dna.approvalChecklist),
      perfil,
    },
    entradas: base.entradas,
    avisos: base.avisos,
  }
}

/**
 * Propõe a copy de uma leva inteira. **Nunca lança.**
 */
export async function montarDicasDeCopy(input: {
  projectId: number
  pedidos: PedidoDeDica[]
}): Promise<ResultadoDasDicas> {
  const todos = Array.isArray(input?.pedidos) ? input.pedidos : []
  const pedidos = todos.filter(pedidoValido).slice(0, MAX_PEDIDOS)
  const avisos: string[] = []

  const descartados = todos.filter((p) => !pedidoValido(p))
  if (descartados.length > 0) {
    avisos.push(
      `${descartados.length} ${descartados.length === 1 ? 'peça ficou' : 'peças ficaram'} sem dica por não ter identificador ou data legível.`,
    )
  }
  if (todos.filter(pedidoValido).length > MAX_PEDIDOS) {
    avisos.push(
      `A leva tem mais de ${MAX_PEDIDOS} peças; escrevi a copy das ${MAX_PEDIDOS} primeiras. Peça o resto numa segunda leva.`,
    )
  }
  if (pedidos.length === 0) {
    return resultadoVazio([], avisos, false)
  }

  const refs = pedidos.map((p) => p.ref)

  const preparo = await prepararDica(input.projectId, pedidos)
  avisos.push(...preparo.avisos)
  if (!preparo.insumos) {
    return resultadoVazio(refs, avisos, true)
  }
  const { insumos, entradas } = { insumos: preparo.insumos, entradas: preparo.entradas }

  let itens: Array<{
    eco?: string
    ref?: string
    blocos?: string[]
    legenda?: string
  }> = []
  try {
    const { object } = await generateObject({
      model: openai(MODELO),
      // Copy é criativa: temperatura zero devolve a mesma frase de sempre, e a
      // leva inteira sairia com o mesmo formato.
      temperature: 0.75,
      maxOutputTokens: 4_000,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      schema: respostaSchema,
      messages: [
        { role: 'user', content: montarPromptDeDica(insumos, pedidos, entradas) },
      ],
    })
    itens = object.dicas ?? []
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : 'erro desconhecido'
    console.warn('[dica-de-copy] a dica de copy não respondeu — seguindo sem ela:', motivo)
    return resultadoVazio(refs, [...avisos, `A dica de copy não respondeu (${motivo}).`], true)
  }

  const reconciliacao = reconciliarDicas(pedidos, itens)
  avisos.push(...reconciliacao.avisos)

  const porRef = new Map(pedidos.map((p) => [p.ref, p]))
  const dicas: DicaDeCopy[] = []
  const semDica = [...reconciliacao.semDica]

  for (const bruta of reconciliacao.brutas) {
    const pedido = porRef.get(bruta.ref)
    if (!pedido) continue

    // Story não tem legenda. O prompt já diz; isto é a garantia mecânica —
    // mesma postura de todo o resto deste módulo.
    const legenda = pedido.formato === 'story' ? null : bruta.legenda

    const guardada = aplicarGuardaDeDados(
      { blocos: bruta.blocos, legenda },
      entradasValidasPara(pedido, entradas),
    )

    if (guardada.blocos.length === 0 && !guardada.legenda) {
      semDica.push(bruta.ref)
      avisos.push(
        `"${ancoraDoPedido(pedido)}" ficou sem dica: ${guardada.avisos.join(' ') || 'a proposta veio vazia.'}`,
      )
      continue
    }

    dicas.push({
      ref: bruta.ref,
      blocos: guardada.blocos,
      legenda: guardada.legenda,
      fontes: guardada.fontes,
      avisos: guardada.avisos,
      suspeitas: [],
    })
  }

  // A revisão ortográfica roda ANTES de a dica ser apresentada — ela nunca
  // lança e já degrada sozinha para silêncio. Em paralelo porque o vocabulário
  // da marca é cacheado por projeto: a primeira chamada paga, as outras não.
  await Promise.all(
    dicas.map(async (dica) => {
      try {
        const revisao = await revisarOrtografia(input.projectId, {
          blocos: dica.blocos,
          legenda: dica.legenda,
        })
        dica.suspeitas = revisao.suspeitas
      } catch (erro) {
        console.warn('[dica-de-copy] revisão ortográfica indisponível:', erro)
      }
    }),
  )

  return {
    versao: VERSAO_DA_DICA,
    dicas,
    semDica,
    avisos,
    indisponivel: false,
  }
}
