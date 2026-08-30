/**
 * FEEDBACK DE ARTE — a opinião humana sobre a peça pronta.
 *
 * Toda geração já grava `{prompt, refs, params}` em `Generation.fieldValues`:
 * o registro atômico de COMO a arte nasceu. O que faltava era o outro lado —
 * se ela prestou. Este serviço é esse par, e é o que torna o corpus utilizável:
 * um prompt sem julgamento não ensina nada.
 *
 * Também é o KPI honesto de qualidade. Em 10-11/08/2026 TODOS os vereditos
 * automáticos foram desligados (o crivo, por atraso; o QA por visão, porque
 * reprovava arte boa), então a única medida confiável de "a arte está boa" é
 * alguém dizer. Um clique.
 *
 * Regras que o desenho carrega:
 *
 * - **Um clique resolve.** "Gostei" é o caso comum e não abre nada. O texto é
 *   opcional e só existe em "preciso melhorar" — feedback que cobra redação
 *   não é dado, e o que não é dado não vira aprendizado.
 * - **REVISÃO é permitida, e a última ação explícita vence.** A pessoa muda de
 *   ideia ao olhar de novo; `captura.ts` sozinho ignoraria a segunda opinião
 *   (o `upsert` de decisão absoluta é `update: {}`), então a revisão mora aqui,
 *   com compare-and-set — o padrão de `registrarDesfecho`.
 * - **Nada aqui lança.** Falha vira log `[aprendizado]` e valor neutro, o
 *   mesmo contrato de `captura.ts`: registrar opinião não pode derrubar a
 *   galeria de quem estava só olhando a arte.
 *
 * O sinal é uma **decisão SEM sugestão** (`desfecho: 'escolha-propria'`): o
 * sistema não propôs "esta arte está boa", alguém julgou do zero. Isso a mantém
 * fora do denominador da taxa de aceitação sem filtro nenhum.
 */

import { db } from '@/lib/db'
import { registrarDecisaoSemSugestao } from './captura'
import { normalizarSuperficie, type Superficie } from './vocabulario'

/** O julgamento. Dois valores e nada de escala — meio-termo ninguém clica. */
export const VEREDITOS_DE_ARTE = ['gostei', 'melhorar'] as const
export type VereditoDeArte = (typeof VEREDITOS_DE_ARTE)[number]

/**
 * O ALVO do pedido de correção — o chip que estrutura o "preciso melhorar"
 * (29/08/2026, revisão pela agenda). Opcional SEMPRE: o texto livre continua
 * valendo sozinho. Vocabulário próprio do feedback (não vai para
 * `vocabulario.ts` porque não é tipo nem desfecho de sinal — é conteúdo do
 * `escolhido` deste sinal específico).
 *
 * `design` é a peça em si — layout, véu, tipografia, tamanho do texto
 * (pedido do Ciro em 30/08: foto/copy/horário não cobriam "melhorar a
 * arte"). `foto` é trocar a imagem; `copy` é o que o texto DIZ; `design` é
 * como a peça está desenhada.
 */
export const ALVOS_DE_CORRECAO = ['foto', 'copy', 'design', 'horario'] as const
export type AlvoDeCorrecao = (typeof ALVOS_DE_CORRECAO)[number]

export function normalizarAlvo(valor: unknown): AlvoDeCorrecao | undefined {
  if (typeof valor !== 'string') return undefined
  const limpo = valor
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  return ALVOS_DE_CORRECAO.find((a) => a === limpo)
}

/**
 * A foto que a pessoa sugere NO LUGAR da atual — estruturada (id do Drive),
 * não descrita em prosa. É o que deixa a sessão corretora refazer a peça sem
 * adivinhar, e o aprendizado de fotos colher a preferência exata.
 */
export interface FotoSugerida {
  driveFileId: string
  nome: string | null
}

function lerFotoSugerida(valor: unknown): FotoSugerida | null {
  const bruto = (valor ?? null) as Record<string, unknown> | null
  if (!bruto || typeof bruto.driveFileId !== 'string' || !bruto.driveFileId.trim()) return null
  return {
    driveFileId: bruto.driveFileId.trim().slice(0, 128),
    nome: typeof bruto.nome === 'string' && bruto.nome.trim() ? bruto.nome.trim().slice(0, 200) : null,
  }
}

/**
 * UM pedido de correção — a revisão pode deixar VÁRIOS na mesma arte, um por
 * alvo ("foto escura" E "título comprido" E "sobe o bloco"), cada um com o seu
 * texto (pedido do Ciro em 30/08: os chips são ABAS, não um seletor de
 * assunto do mesmo texto).
 */
export interface PedidoDeCorrecao {
  alvo: AlvoDeCorrecao
  texto: string | null
  /** Só faz sentido no alvo `foto`. */
  fotoSugerida: FotoSugerida | null
}

/** Normaliza a lista: um por alvo (o último vence), sem entradas vazias. */
function lerPedidos(valor: unknown): PedidoDeCorrecao[] {
  if (!Array.isArray(valor)) return []
  const porAlvo = new Map<AlvoDeCorrecao, PedidoDeCorrecao>()
  for (const item of valor) {
    const bruto = (item ?? {}) as Record<string, unknown>
    const alvo = normalizarAlvo(bruto.alvo)
    if (!alvo) continue
    const texto = limparComentario(bruto.texto)
    const fotoSugerida = alvo === 'foto' ? lerFotoSugerida(bruto.fotoSugerida) : null
    if (!texto && !fotoSugerida) continue
    porAlvo.set(alvo, { alvo, texto, fotoSugerida })
  }
  // Ordem fixa do vocabulário: a serialização vira comparação de idempotência.
  return ALVOS_DE_CORRECAO.filter((a) => porAlvo.has(a)).map((a) => porAlvo.get(a)!)
}

/**
 * Teto do comentário. Generoso porque quem escreve está fazendo o trabalho
 * caro do aprendizado; acima disso é outro canal (o chat).
 */
export const TETO_COMENTARIO = 1000

/** Superfície usada quando quem chama não sabe dizer de onde veio. */
const SUPERFICIE_PADRAO: Superficie = 'galeria'

export type ResultadoDeFeedback =
  /** Primeira opinião sobre esta arte. */
  | 'gravado'
  /** A pessoa mudou de ideia — a linha existente foi reescrita. */
  | 'revisado'
  /** Clicou de novo no que já estava marcado. */
  | 'ja-registrado'
  | 'erro'

/** O estado atual, que a UI mostra ao reabrir a arte. */
export interface FeedbackDeArte {
  veredito: VereditoDeArte
  /** A observação GERAL (a aba sem alvo). */
  comentario: string | null
  /** Os pedidos por alvo — vários na mesma arte, um texto para cada. */
  pedidos: PedidoDeCorrecao[]
  /** ISO. */
  em: string
  superficie: Superficie | null
  /** Quantas vezes a opinião foi trocada depois da primeira. */
  revisoes: number
}

export interface EntradaDeFeedback {
  generationId: string
  projectId: number
  veredito: VereditoDeArte
  /** Opcional SEMPRE — o veredito já vale sozinho. Observação GERAL. */
  comentario?: string | null
  /**
   * Pedidos por alvo (vários na mesma arte). Campos opcionais NO TIPO por
   * causa do `z.infer` com `strict: false` (toda chave vira opcional) — a
   * garantia é do runtime: `lerPedidos` descarta o que não se sustenta.
   * Ignorados em "gostei".
   */
  pedidos?: Array<{
    alvo?: AlvoDeCorrecao | string | null
    texto?: string | null
    fotoSugerida?: { driveFileId?: string; nome?: string | null } | null
  }> | null
  /** Forma antiga (um alvo só) — aceita e dobrada para `pedidos`. */
  alvo?: AlvoDeCorrecao | string | null
  /** Forma antiga — idem. */
  fotoSugerida?: { driveFileId?: string; nome?: string | null } | null
  /** `User.id` INTERNO (cuid), NUNCA o clerkId. */
  decididoPor?: string | null
  superficie?: Superficie
}

export interface RespostaDeFeedback {
  ok: boolean
  resultado: ResultadoDeFeedback
  /** O estado depois da operação — `null` só quando nada pôde ser gravado. */
  feedback: FeedbackDeArte | null
}

/**
 * Chave de idempotência: UMA linha por arte, sempre a mesma.
 *
 * Não passa por `chaveDeSugestao` de propósito — aqui não há safra de
 * heurística a versionar (é opinião de gente, não proposta do sistema) e o
 * formato legível ajuda a achar a linha na mão.
 */
export function chaveDoFeedbackDeArte(generationId: string): string {
  return `arte-feedback:gen:${generationId}`
}

export function normalizarVeredito(valor: unknown): VereditoDeArte | undefined {
  if (typeof valor !== 'string') return undefined
  const limpo = valor.trim().toLowerCase()
  return VEREDITOS_DE_ARTE.find((v) => v === limpo)
}

/** Comentário vazio é ausência de comentário, não string vazia. */
function limparComentario(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpo = valor.trim().slice(0, TETO_COMENTARIO)
  return limpo || null
}

/** O que ficou gravado em `escolhido`, defensivamente. */
function lerEscolhido(valor: unknown): {
  veredito: VereditoDeArte | undefined
  comentario: string | null
  pedidos: PedidoDeCorrecao[]
  revisoes: number
} {
  const bruto = (valor ?? {}) as Record<string, unknown>
  let pedidos = lerPedidos(bruto.pedidos)
  // Linha da forma antiga (um alvo só, gravada em 29-30/08): dobra para a
  // lista, para todo leitor enxergar um shape só.
  if (pedidos.length === 0) {
    pedidos = lerPedidos([
      { alvo: bruto.alvo, texto: null, fotoSugerida: bruto.fotoSugerida },
    ])
  }
  return {
    veredito: normalizarVeredito(bruto.veredito),
    comentario: limparComentario(bruto.comentario),
    pedidos,
    revisoes: typeof bruto.revisoes === 'number' && bruto.revisoes >= 0 ? Math.floor(bruto.revisoes) : 0,
  }
}

interface LinhaDeFeedback {
  id: string
  escolhido: unknown
  decididoEm: Date | null
  superficie: string | null
  updatedAt: Date
}

async function lerLinha(chave: string): Promise<LinhaDeFeedback | null> {
  const linha = await db.learningSignal.findUnique({
    where: { chave },
    select: { id: true, escolhido: true, decididoEm: true, superficie: true, updatedAt: true },
  })
  return linha ?? null
}

function paraFeedback(linha: LinhaDeFeedback): FeedbackDeArte | null {
  const { veredito, comentario, pedidos, revisoes } = lerEscolhido(linha.escolhido)
  if (!veredito) return null
  return {
    veredito,
    comentario,
    pedidos,
    em: (linha.decididoEm ?? linha.updatedAt).toISOString(),
    superficie: normalizarSuperficie(linha.superficie) ?? null,
    revisoes,
  }
}

/**
 * Grava (ou revisa) o que a pessoa achou da arte.
 *
 * Idempotente pela chave, com revisão: clicar de novo no mesmo botão é no-op;
 * trocar o veredito ou o comentário reescreve a linha e conta a revisão. A
 * escrita usa compare-and-set no `updatedAt` — duas abas julgando a mesma arte
 * não podem se sobrescrever em silêncio.
 */
export async function registrarFeedbackDeArte(entrada: EntradaDeFeedback): Promise<RespostaDeFeedback> {
  const neutro: RespostaDeFeedback = { ok: false, resultado: 'erro', feedback: null }
  try {
    const veredito = normalizarVeredito(entrada.veredito)
    if (!veredito) {
      console.error(`[aprendizado] veredito de arte desconhecido: ${String(entrada.veredito)}`)
      return neutro
    }
    if (!entrada.generationId || !Number.isInteger(entrada.projectId)) return neutro

    const comentario = limparComentario(entrada.comentario)
    // Pedidos só existem em "melhorar": um "gostei" posterior LIMPA todos —
    // a última ação explícita vence, e elogiar é retirar o pedido.
    const pedidos =
      veredito === 'melhorar'
        ? lerPedidos([
            ...(entrada.pedidos ?? []),
            // Forma antiga (um alvo só): dobrada para a lista.
            ...(entrada.alvo || entrada.fotoSugerida
              ? [{ alvo: entrada.alvo, texto: null, fotoSugerida: entrada.fotoSugerida }]
              : []),
          ])
        : []
    const superficie = normalizarSuperficie(entrada.superficie) ?? SUPERFICIE_PADRAO
    const chave = chaveDoFeedbackDeArte(entrada.generationId)

    const assinatura = (c: string | null, p: PedidoDeCorrecao[]) => JSON.stringify({ c, p })
    const mesmaCoisa = (g: ReturnType<typeof lerEscolhido>) =>
      g.veredito === veredito && assinatura(g.comentario, g.pedidos) === assinatura(comentario, pedidos)

    let linha = await lerLinha(chave)

    // Primeira opinião: a linha nasce pelo núcleo da captura, que já resolve a
    // corrida de duas criações simultâneas pelo índice único da chave.
    if (!linha) {
      await registrarDecisaoSemSugestao({
        projectId: entrada.projectId,
        tipo: 'arte',
        escolhido: { veredito, comentario, pedidos, revisoes: 0 },
        decididoPor: entrada.decididoPor ?? null,
        superficie,
        chave,
        generationId: entrada.generationId,
      })
      linha = await lerLinha(chave)
      if (!linha) return neutro

      const gravado = lerEscolhido(linha.escolhido)
      if (mesmaCoisa(gravado)) {
        await mesclarNaGeneration(entrada.generationId, paraFeedback(linha))
        return { ok: true, resultado: 'gravado', feedback: paraFeedback(linha) }
      }
      // Alguém escreveu primeiro (o `update: {}` do upsert não sobrescreve):
      // o que temos em mãos é uma REVISÃO daquela linha, e segue abaixo.
    }

    const anterior = lerEscolhido(linha.escolhido)
    if (mesmaCoisa(anterior)) {
      return { ok: true, resultado: 'ja-registrado', feedback: paraFeedback(linha) }
    }

    const agora = new Date()
    const proximo = { veredito, comentario, pedidos, revisoes: anterior.revisoes + 1 }
    const r = await db.learningSignal.updateMany({
      where: { id: linha.id, updatedAt: linha.updatedAt },
      data: {
        escolhido: proximo as never,
        decididoEm: agora,
        decididoPor: entrada.decididoPor ?? undefined,
        superficie,
        generationId: entrada.generationId,
      },
    })

    if (r.count === 0) {
      // Outra escrita venceu a corrida. A última ação explícita É a dela —
      // devolvemos o estado real, sem tentar de novo.
      const atual = await lerLinha(chave)
      return {
        ok: true,
        resultado: 'ja-registrado',
        feedback: atual ? paraFeedback(atual) : null,
      }
    }

    const feedback: FeedbackDeArte = {
      veredito,
      comentario,
      pedidos,
      em: agora.toISOString(),
      superficie,
      revisoes: proximo.revisoes,
    }
    await mesclarNaGeneration(entrada.generationId, feedback)
    return { ok: true, resultado: 'revisado', feedback }
  } catch (erro) {
    console.error('[aprendizado] falha ao registrar feedback de arte (seguindo sem ele):', erro)
    return neutro
  }
}

/** O feedback atual de uma arte — é o que a UI mostra ao reabrir. */
export async function lerFeedbackDeArte(generationId: string): Promise<FeedbackDeArte | null> {
  try {
    if (!generationId) return null
    const linha = await lerLinha(chaveDoFeedbackDeArte(generationId))
    return linha ? paraFeedback(linha) : null
  } catch (erro) {
    console.error('[aprendizado] falha ao ler feedback de arte:', erro)
    return null
  }
}

/**
 * Espelha o feedback em `Generation.fieldValues.feedback`.
 *
 * MERGE verificado, nunca substituição — é o padrão de `fieldValues.crivo`:
 * este Json é o registro atômico da run (prompt, refs, params, veredito) que
 * galeria, MCP e QA leem, e trocar o objeto inteiro para acrescentar um campo
 * apagaria a procedência da arte.
 *
 * A verdade do sinal é o `LearningSignal`; isto é conveniência de leitura, para
 * quem já tem a Generation na mão não precisar de segunda consulta. Falhar aqui
 * é log, nunca erro.
 */
async function mesclarNaGeneration(generationId: string, feedback: FeedbackDeArte | null): Promise<void> {
  if (!feedback) return
  try {
    const atual = await db.generation.findUnique({
      where: { id: generationId },
      select: { fieldValues: true },
    })
    if (!atual) return
    const anterior = (atual.fieldValues ?? {}) as Record<string, unknown>
    await db.generation.update({
      where: { id: generationId },
      data: {
        fieldValues: {
          ...anterior,
          feedback: {
            veredito: feedback.veredito,
            comentario: feedback.comentario,
            pedidos: feedback.pedidos,
            em: feedback.em,
            superficie: feedback.superficie,
            revisoes: feedback.revisoes,
          },
        } as never,
      },
    })
  } catch (erro) {
    console.warn('[aprendizado] não foi possível espelhar o feedback na Generation:', erro)
  }
}

export interface FiltroDeFeedbacks {
  projectId?: number
  /** Só o que foi decidido a partir daqui. */
  desde?: Date
  /** Só o que foi decidido até aqui. */
  ate?: Date
  veredito?: VereditoDeArte
  /** Teto de linhas devolvidas (default 50, máximo 200). */
  limit?: number
}

export interface FeedbackListado {
  generationId: string | null
  projectId: number
  veredito: VereditoDeArte
  comentario: string | null
  /** Os pedidos por alvo (vários na mesma arte), quando estruturados. */
  pedidos: PedidoDeCorrecao[]
  /** ISO. */
  quando: string
  /** Nome de quem julgou, quando dá para resolver. */
  quem: string | null
  superficie: Superficie | null
  revisoes: number
  /** O essencial da arte julgada — `null` quando ela já foi apagada. */
  arte: {
    resultUrl: string | null
    /** Como a arte nasceu (`fieldValues.source`): geração por IA, melhoria… */
    source: string | null
    templateName: string | null
    /** `imagem` | `arte`, quando a arte veio da geração por IA. */
    trilha: string | null
    projectName: string | null
    criadaEm: string
  } | null
}

const LIMITE_PADRAO = 50
const LIMITE_MAXIMO = 200

function textoOuNulo(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null
}

/**
 * O relatório: o que as pessoas acharam das artes, mais recente primeiro.
 *
 * O filtro por veredito é aplicado EM MEMÓRIA de propósito. O veredito mora
 * dentro do Json `escolhido`, e um filtro por path do Postgres que falhe aqui
 * derrubaria a listagem inteira em silêncio (o contrato manda devolver vazio em
 * vez de lançar) — com volumes desta ordem, ler um pouco mais e filtrar em JS
 * é barato e não tem esse risco.
 */
export async function listarFeedbacks(filtro: FiltroDeFeedbacks = {}): Promise<FeedbackListado[]> {
  try {
    const limite = Math.min(Math.max(1, Math.floor(filtro.limit ?? LIMITE_PADRAO)), LIMITE_MAXIMO)
    // Com filtro por veredito lemos com folga, porque o corte é em memória.
    const teto = filtro.veredito ? Math.min(limite * 5, 600) : limite

    const periodo: Record<string, Date> = {}
    if (filtro.desde) periodo.gte = filtro.desde
    if (filtro.ate) periodo.lte = filtro.ate

    const sinais = await db.learningSignal.findMany({
      where: {
        tipo: 'arte',
        ...(filtro.projectId ? { projectId: filtro.projectId } : {}),
        ...(Object.keys(periodo).length ? { decididoEm: periodo } : {}),
      },
      orderBy: { decididoEm: 'desc' },
      take: teto,
      select: {
        projectId: true,
        generationId: true,
        escolhido: true,
        decididoEm: true,
        decididoPor: true,
        superficie: true,
        updatedAt: true,
      },
    })

    const escolhidos = sinais
      .map((s) => ({ sinal: s, valor: lerEscolhido(s.escolhido) }))
      .filter((linha) => !!linha.valor.veredito)
      .filter((linha) => !filtro.veredito || linha.valor.veredito === filtro.veredito)
      .slice(0, limite)

    if (escolhidos.length === 0) return []

    const idsDeArte = Array.from(
      new Set(escolhidos.map((l) => l.sinal.generationId).filter((id): id is string => !!id)),
    )
    const idsDeGente = Array.from(
      new Set(escolhidos.map((l) => l.sinal.decididoPor).filter((id): id is string => !!id)),
    )

    const [artes, gente] = await Promise.all([
      idsDeArte.length
        ? db.generation.findMany({
            where: { id: { in: idsDeArte } },
            select: {
              id: true,
              resultUrl: true,
              templateName: true,
              projectName: true,
              fieldValues: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
      idsDeGente.length
        ? db.user.findMany({ where: { id: { in: idsDeGente } }, select: { id: true, name: true, email: true } })
        : Promise.resolve([]),
    ])

    const porArte = new Map(artes.map((a) => [a.id, a]))
    const porGente = new Map(gente.map((g) => [g.id, g.name || g.email || null]))

    return escolhidos.map(({ sinal, valor }) => {
      const arte = sinal.generationId ? porArte.get(sinal.generationId) : undefined
      const fv = (arte?.fieldValues ?? {}) as Record<string, unknown>
      return {
        generationId: sinal.generationId,
        projectId: sinal.projectId,
        veredito: valor.veredito as VereditoDeArte,
        comentario: valor.comentario,
        pedidos: valor.pedidos,
        quando: (sinal.decididoEm ?? sinal.updatedAt).toISOString(),
        quem: sinal.decididoPor ? (porGente.get(sinal.decididoPor) ?? null) : null,
        superficie: normalizarSuperficie(sinal.superficie) ?? null,
        revisoes: valor.revisoes,
        arte: arte
          ? {
              resultUrl: arte.resultUrl,
              source: textoOuNulo(fv.source),
              templateName: arte.templateName,
              trilha: textoOuNulo(fv.trilha) ?? textoOuNulo(fv.track),
              projectName: arte.projectName,
              criadaEm: arte.createdAt.toISOString(),
            }
          : null,
      }
    })
  } catch (erro) {
    console.error('[aprendizado] falha ao listar feedbacks de arte:', erro)
    return []
  }
}
