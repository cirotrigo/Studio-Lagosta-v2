/**
 * Captura de sinais de uso (F1) — as operações de banco.
 *
 * A captura vive NO SERVIDOR, onde a sugestão nasce e por onde a decisão
 * passa, nunca só na UI: a fila da bancada é localStorage (descartar um item é
 * um delete local, invisível), o chat escreve a copy na conversa (só o
 * resultado chega ao servidor) e o MCP local reimplementa handlers fora de
 * `src/lib` — instrumentar apenas o dispatcher remoto perderia a skill
 * `create-template-pages`, que é uma das vias mais usadas.
 *
 * Três entradas, e a terceira não é um caso especial:
 *
 *   registrarSugestao()            — no momento em que a proposta é EMITIDA
 *   registrarDesfecho()            — quando alguém decide sobre ela
 *   registrarDecisaoSemSugestao()  — escolha absoluta, sem proposta nenhuma
 *
 * ⚠️ REGRA CENTRAL: **falha de captura NUNCA derruba o fluxo principal.** Toda
 * função engole o próprio erro, loga e devolve um valor neutro — o mesmo
 * contrato de `sendWhatsAppText` com a notificação. Registrar aprendizado não
 * pode impedir ninguém de agendar um post; o sinal perdido é barato, o post
 * perdido não é.
 *
 * Serviço puro de dados: sem UI, sem Clerk, sem `after()`. É chamado igual por
 * rota HTTP, tool de MCP e cron.
 */

import { db } from '@/lib/db'
import {
  desfechoVenceOAnterior,
  exigeSugestao,
  type Desfecho,
  type Superficie,
  type TipoDeSinal,
} from './vocabulario'

/** Teto do que vai para as colunas Json. Acima disso, guarda só o tamanho. */
const TETO_JSON_BYTES = 64 * 1024

/** Ligações frouxas com o resto do mundo — todas SEM foreign key (ver a migration). */
interface Vinculos {
  /** O post que nasceu (ou foi alterado) por esta decisão. */
  postId?: string | null
  /** A arte envolvida. */
  generationId?: string | null
  /** A página/modelo envolvido. */
  pageId?: string | null
  /** Entrada CAMPANHAS da base, quando o item pertence a uma campanha. */
  campaignId?: string | null
}

export interface SugestaoEmitida extends Vinculos {
  projectId: number
  tipo: TipoDeSinal
  /**
   * O que foi proposto. Forma livre por tipo — a taxonomia fechada é da F2, e
   * cravar um shape agora só produziria migration em duas semanas. Exemplos:
   * slot `{ data, hora, motivo }`; modelo `{ pageId, nome, candidatos[] }`.
   */
  sugerido: unknown
  /** PROVENIÊNCIA: qual serviço emitiu (`sugerir-posts`, `prepare-creative`…). */
  servico: string
  /** Versão da heurística/prompt. Sem ela não dá para comparar safras. */
  versao?: string | null
  /**
   * Chave de idempotência. Com ela, emitir a mesma proposta duas vezes (o
   * chat repetindo a tool, um retry de rota) devolve a linha que já existe em
   * vez de inflar o denominador do KPI com sugestões fantasma.
   */
  chave?: string | null
}

export interface DesfechoDaSugestao extends Vinculos {
  /** Id devolvido por `registrarSugestao` (é o que vai em `SocialPost.sugestaoId`). */
  sugestaoId: string
  desfecho: Desfecho
  /** O que de fato foi escolhido. */
  escolhido?: unknown
  /** Diff estruturado, quando faz sentido (ver `diff-copy.ts`). */
  diff?: unknown
  /** `User.id` INTERNO (cuid) — NUNCA o clerkId. */
  decididoPor?: string | null
  superficie?: Superficie
}

export interface DecisaoAbsoluta extends Vinculos {
  projectId: number
  tipo: TipoDeSinal
  /** O que a pessoa escolheu, sem que nada tivesse sido proposto. */
  escolhido: unknown
  /** Diff, quando a decisão substitui algo anterior (edição de copy própria). */
  diff?: unknown
  /** `User.id` INTERNO (cuid) — NUNCA o clerkId. */
  decididoPor?: string | null
  superficie?: Superficie
  chave?: string | null
}

export type ResultadoDesfecho =
  /** Gravado pela primeira vez. */
  | 'gravado'
  /** Sobrescreveu um desfecho mais fraco (aceita → editada, por exemplo). */
  | 'revisado'
  /** Já havia desfecho igual ou mais forte — nada a fazer. */
  | 'ja-registrado'
  | 'nao-encontrado'
  | 'erro'

/**
 * Serializa para coluna Json: derruba `undefined`, converte Date em string e
 * recusa payload gigante. `null` quando não há nada para gravar.
 */
function paraJson(valor: unknown): unknown {
  if (valor === undefined || valor === null) return null
  try {
    const texto = JSON.stringify(valor)
    if (texto === undefined) return null
    if (texto.length > TETO_JSON_BYTES) {
      return { _truncado: true, _bytes: texto.length, _amostra: texto.slice(0, 2000) }
    }
    return JSON.parse(texto)
  } catch {
    return null
  }
}

function vinculos(v: Vinculos) {
  return {
    postId: v.postId ?? null,
    generationId: v.generationId ?? null,
    pageId: v.pageId ?? null,
    campaignId: v.campaignId ?? null,
  }
}

/** Só sobrescreve vínculo quando o novo tem valor — desfecho não apaga origem. */
function vinculosParaAtualizar(v: Vinculos) {
  const out: Record<string, string> = {}
  if (v.postId) out.postId = v.postId
  if (v.generationId) out.generationId = v.generationId
  if (v.pageId) out.pageId = v.pageId
  if (v.campaignId) out.campaignId = v.campaignId
  return out
}

/**
 * Registra uma sugestão NO MOMENTO EM QUE ELA É EMITIDA — não quando alguém a
 * aceita. É essa linha que forma o denominador do KPI: sem ela, a proposta
 * ignorada some e a taxa de aceitação vira 100%.
 *
 * Devolve o id do sinal (para gravar em `SocialPost.sugestaoId` e para fechar
 * o desfecho depois) ou `null` se a captura falhar — e `null` nunca deve
 * interromper quem chamou.
 */
export async function registrarSugestao(entrada: SugestaoEmitida): Promise<string | null> {
  try {
    const dados = {
      projectId: entrada.projectId,
      tipo: entrada.tipo,
      sugerido: paraJson(entrada.sugerido) as never,
      sugeridoEm: new Date(),
      servico: entrada.servico,
      versao: entrada.versao ?? null,
      chave: entrada.chave ?? null,
      ...vinculos(entrada),
    }

    if (entrada.chave) {
      // `update: {}` de propósito: proposta que já existe não é reescrita —
      // sobrescrever mudaria o que foi realmente mostrado à pessoa.
      const sinal = await db.learningSignal.upsert({
        where: { chave: entrada.chave },
        create: dados,
        update: {},
        select: { id: true },
      })
      return sinal.id
    }

    const sinal = await db.learningSignal.create({ data: dados, select: { id: true } })
    return sinal.id
  } catch (erro) {
    console.error('[aprendizado] falha ao registrar sugestão (seguindo sem ela):', erro)
    return null
  }
}

/** Várias sugestões da mesma emissão (uma leva de slots, por exemplo). */
export async function registrarSugestoes(entradas: SugestaoEmitida[]): Promise<Array<string | null>> {
  const ids: Array<string | null> = []
  for (const entrada of entradas) ids.push(await registrarSugestao(entrada))
  return ids
}

/**
 * Ids já gravados destas chaves (`chave` → `id`), numa consulta só.
 *
 * O `upsert` de `registrarSugestao` já garante que reemitir não duplica, mas
 * cobra uma ida ao banco POR ITEM: uma leva de 15 slots custa 15 escritas a
 * cada refetch da bancada — e a bancada refaz a consulta ao voltar para a aba.
 * Com esta leitura, a leva REEMITIDA custa um SELECT e nenhuma escrita; só o
 * que é novo passa pelo upsert.
 *
 * Não substitui o `chave` no `registrarSugestao`: duas emissões simultâneas
 * podem ver o mesmo vazio aqui, e quem resolve a corrida é o índice único.
 */
export async function sugestoesJaEmitidas(chaves: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const alvos = chaves.filter((c) => !!c)
  if (alvos.length === 0) return mapa
  try {
    const existentes = await db.learningSignal.findMany({
      where: { chave: { in: alvos } },
      select: { id: true, chave: true },
    })
    for (const s of existentes) if (s.chave) mapa.set(s.chave, s.id)
  } catch (erro) {
    // Sem a leitura, o caminho de baixo apenas volta a custar um upsert por
    // item — mais caro, nunca incorreto.
    console.error('[aprendizado] falha ao ler sugestões já emitidas:', erro)
  }
  return mapa
}

/**
 * Fecha (ou revisa) o desfecho de uma sugestão.
 *
 * Idempotente: gravar o mesmo desfecho duas vezes não duplica nem sobrescreve.
 * O que PODE sobrescrever é evidência mais forte — a janela do desfecho vai
 * até a publicação, então uma edição posterior vence o "aceitei" anterior
 * (`desfechoVenceOAnterior`). O caminho de volta não existe.
 */
export async function registrarDesfecho(entrada: DesfechoDaSugestao): Promise<ResultadoDesfecho> {
  try {
    if (!exigeSugestao(entrada.desfecho)) {
      // 'escolha-propria' descreve a AUSÊNCIA de sugestão; usá-lo aqui
      // apagaria a proposta que existiu e falsearia o KPI.
      console.error(
        `[aprendizado] desfecho '${entrada.desfecho}' não vale para sugestão emitida (sinal ${entrada.sugestaoId}) — use registrarDecisaoSemSugestao`,
      )
      return 'erro'
    }

    const atual = await db.learningSignal.findUnique({
      where: { id: entrada.sugestaoId },
      select: { desfecho: true },
    })
    if (!atual) {
      console.warn(`[aprendizado] sugestão ${entrada.sugestaoId} não existe — desfecho descartado`)
      return 'nao-encontrado'
    }

    const anterior = (atual.desfecho ?? null) as Desfecho | null
    if (!desfechoVenceOAnterior(anterior, entrada.desfecho)) return 'ja-registrado'

    // Compare-and-set no desfecho anterior: duas superfícies fechando o mesmo
    // sinal ao mesmo tempo não podem se sobrescrever em silêncio.
    const r = await db.learningSignal.updateMany({
      where: { id: entrada.sugestaoId, desfecho: anterior },
      data: {
        desfecho: entrada.desfecho,
        decididoEm: new Date(),
        decididoPor: entrada.decididoPor ?? undefined,
        superficie: entrada.superficie ?? undefined,
        escolhido: (paraJson(entrada.escolhido) ?? undefined) as never,
        diff: (paraJson(entrada.diff) ?? undefined) as never,
        ...vinculosParaAtualizar(entrada),
      },
    })
    if (r.count === 0) return 'ja-registrado'
    return anterior ? 'revisado' : 'gravado'
  } catch (erro) {
    console.error('[aprendizado] falha ao registrar desfecho (seguindo sem ele):', erro)
    return 'erro'
  }
}

/**
 * Decisão que não veio de sugestão nenhuma — a **escolha absoluta**.
 *
 * Nas primeiras semanas, antes de a dica de copy existir, é o único corpus que
 * haverá: quase toda copy, foto e horário nasce assim. A linha é completa (tem
 * o que foi escolhido, quem decidiu e onde), só não tem a metade de cima.
 * O desfecho é sempre `escolha-propria`, o que a mantém fora do denominador da
 * taxa de aceitação sem precisar de nenhum filtro especial.
 */
export async function registrarDecisaoSemSugestao(entrada: DecisaoAbsoluta): Promise<string | null> {
  try {
    const agora = new Date()
    const dados = {
      projectId: entrada.projectId,
      tipo: entrada.tipo,
      // A metade de cima fica vazia de propósito: não houve proposta.
      sugerido: undefined,
      sugeridoEm: null,
      servico: null,
      desfecho: 'escolha-propria',
      decididoEm: agora,
      decididoPor: entrada.decididoPor ?? null,
      superficie: entrada.superficie ?? null,
      escolhido: paraJson(entrada.escolhido) as never,
      diff: (paraJson(entrada.diff) ?? undefined) as never,
      chave: entrada.chave ?? null,
      ...vinculos(entrada),
    }

    if (entrada.chave) {
      const sinal = await db.learningSignal.upsert({
        where: { chave: entrada.chave },
        create: dados,
        update: {},
        select: { id: true },
      })
      return sinal.id
    }

    const sinal = await db.learningSignal.create({ data: dados, select: { id: true } })
    return sinal.id
  } catch (erro) {
    console.error('[aprendizado] falha ao registrar decisão (seguindo sem ela):', erro)
    return null
  }
}

const JANELA_PADRAO_DE_EXPIRACAO_MS = 14 * 24 * 3600_000

/**
 * Janela de expiração POR TIPO, quando o padrão de 14 dias não faz sentido.
 *
 * `foto`: a proposta de `buscar-fotos` é uma lista ranqueada que vale para a
 * peça que está sendo montada AGORA — ninguém volta três dias depois para
 * "aceitar" a busca de terça. Deixá-la pendente por 14 dias só segura no
 * denominador propostas que já morreram. 24h; o cron é diário, então na
 * prática fecha entre 24h e 48h.
 */
const JANELA_DE_EXPIRACAO_POR_TIPO_MS: Record<string, number> = {
  foto: 24 * 3600_000,
}

/**
 * Fecha como `expirada` a proposta que ninguém decidiu dentro da janela.
 *
 * Sugestão pendente para sempre é pior que ruído: ela não é aceitação nem
 * recusa, e deixada em aberto some do denominador do KPI ("ainda pode ser
 * aceita") justamente quando o que aconteceu foi indiferença.
 *
 * ⚠️ Ainda NÃO existe cron chamando isto — quem liga os fios é a tarefa
 * seguinte. A função nasce aqui porque `expirada` é um dos desfechos e não
 * pode depender de alguém lembrar de escrevê-la depois.
 */
export async function expirarSugestoesPendentes(opts?: {
  /** Tudo emitido antes disto e ainda sem desfecho. Padrão: 14 dias atrás. */
  antesDe?: Date
  projectId?: number
}): Promise<number> {
  try {
    const agora = Date.now()
    const limite = opts?.antesDe ?? new Date(agora - JANELA_PADRAO_DE_EXPIRACAO_MS)
    const tiposComJanelaPropria = Object.keys(JANELA_DE_EXPIRACAO_POR_TIPO_MS)
    const r = await db.learningSignal.updateMany({
      where: {
        desfecho: null,
        sugeridoEm: { not: null, lt: limite },
        tipo: { notIn: tiposComJanelaPropria },
        ...(opts?.projectId ? { projectId: opts.projectId } : {}),
      },
      data: { desfecho: 'expirada', decididoEm: new Date(), superficie: 'sistema' },
    })
    let total = r.count
    for (const [tipo, janelaMs] of Object.entries(JANELA_DE_EXPIRACAO_POR_TIPO_MS)) {
      const proprio = await db.learningSignal.updateMany({
        where: {
          desfecho: null,
          tipo,
          sugeridoEm: { not: null, lt: new Date(agora - janelaMs) },
          ...(opts?.projectId ? { projectId: opts.projectId } : {}),
        },
        data: { desfecho: 'expirada', decididoEm: new Date(), superficie: 'sistema' },
      })
      total += proprio.count
    }
    return total
  } catch (erro) {
    console.error('[aprendizado] falha ao expirar sugestões pendentes:', erro)
    return 0
  }
}
