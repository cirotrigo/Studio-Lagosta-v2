/**
 * O sinal de FOTO fora da bancada: fechamento, anotação de motivo e leitura
 * agregada das preferências.
 *
 * `buscarNoAcervo` emite a proposta (a lista ranqueada, com o topo como
 * recomendação) em toda busca — inclusive nas que vêm do chat, pela tool
 * `buscar-fotos`. Mas só a bancada devolve o desfecho: o seletor de imagens
 * conhece o `sugestaoId` e o posta para `/aprendizado/desfecho`.
 *
 * No chat e na via de TEMPLATE ninguém carregava esse id de volta, e a
 * proposta ficava pendente para sempre — até a varredura de expiração fechá-la
 * como `expirada`. O registro seria uma MENTIRA: "ninguém decidiu" quando na
 * verdade a foto proposta virou arte. E como a via de template é a mais usada
 * da casa, o corpus nasceria enviesado justamente onde tem mais volume.
 *
 * A saída é a mesma de `sinal-de-modelo.ts`: fechar por RECONCILIAÇÃO. Achado
 * no teste ponta a ponta de 10/08/2026.
 *
 * **Fidelidade ao CARD (F3.4, 30/08/2026)**: quando a arte nasce de um item de
 * plano, quem escolheu a foto foi a pessoa olhando o CARD — e a foto do card
 * pode não ser o topo da busca porque o SISTEMA desceu na lista (não repetir
 * foto/pasta na leva). Fechar isso como `trocada` culpava o ranking por uma
 * troca que ninguém fez. Por isso `fecharSugestaoDeFoto` aceita `fotoDoCard`:
 * aceitou o que o card mostrou = `aceita-como-veio`, esteja a foto na posição
 * que estiver. O desfecho continua CALCULADO aqui, nunca declarado pela tela.
 *
 * A parte PURA (parse das linhas em escolhas/rejeições/feedbacks) mora em
 * `sinal-de-foto-contrato.ts`, testável sem banco — precedente de
 * `sinal-de-agendamento-contrato.ts`. Este arquivo só consulta e delega.
 *
 * ⚠️ Nada aqui lança — contrato de `captura.ts`.
 */

import { db } from '@/lib/db'
import { registrarDesfecho } from './captura'
import { chaveDoFeedbackDeArte } from './feedback-de-arte'
import {
  montarPreferencias,
  preferenciasVazias,
  type LinhaDeFeedbackDeArte,
  type PreferenciasDeFoto,
} from './sinal-de-foto-contrato'
import { motivoDeTrocaValido, type Superficie } from './vocabulario'

export type {
  EscolhaDeFoto,
  FeedbackDeFoto,
  PreferenciasDeFoto,
  RejeicaoDeFoto,
} from './sinal-de-foto-contrato'

/**
 * Mesma janela do sinal de modelo, e pela mesma razão: cobre a conversa
 * inteira entre buscar a foto e criar a arte, sem colar a arte de hoje na
 * busca de ontem.
 */
const JANELA_DE_FECHAMENTO_MS = 6 * 3_600_000

/** Quantas propostas em aberto olhamos para achar a que contém a foto usada. */
const PROPOSTAS_INSPECIONADAS = 5

/** Quantos sinais entram na agregação de preferências (os mais recentes). */
const SINAIS_LIDOS = 500

interface PropostaDeFoto {
  topo?: unknown
  propostas?: unknown
}

/** Os `driveFileId` que a proposta ofereceu, na ordem em que foram ranqueados. */
function idsPropostos(sugerido: unknown): string[] {
  const s = (sugerido ?? {}) as PropostaDeFoto
  if (!Array.isArray(s.propostas)) return []
  return s.propostas
    .map((p) => (p && typeof p === 'object' ? (p as { driveFileId?: unknown }).driveFileId : null))
    .filter((id): id is string => typeof id === 'string')
}

/**
 * Fecha a proposta de foto que a arte de fato consumiu.
 *
 * Conservador de propósito: só fecha proposta EM ABERTO, do mesmo projeto,
 * dentro da janela, **cuja lista ofereceu a foto usada**. Foto que veio de
 * fora da proposta (upload, link direto, busca manual no Drive) não fecha nada
 * — a proposta merece expirar, porque de fato ninguém a seguiu.
 *
 * `aceita-como-veio` quando a arte levou o TOPO da lista — **ou a foto que o
 * CARD do item mostrava** (`fotoDoCard`): a pessoa aceitou o que viu, e quem
 * desceu na lista foi o sistema, para não repetir foto na leva. `trocada` só
 * quando levou outra da mesma lista por decisão de gente — que é o sinal que
 * interessa aprender, porque diz que o ranking ofereceu a foto errada primeiro.
 */
export async function fecharSugestaoDeFoto(entrada: {
  projectId: number
  /** O `driveFileId` que virou a imagem da arte. */
  driveFileIdUsado: string
  /**
   * A foto que a pessoa VIU no card do item de plano (`ItemDePlano.fotoDriveId`).
   * Igual à usada, o desfecho é `aceita-como-veio` mesmo fora do topo da busca.
   */
  fotoDoCard?: string | null
  generationId?: string | null
  pageId?: string | null
  decididoPor?: string | null
  superficie?: Superficie
  /** Quando o chamador já sabe qual proposta fechar, pula a reconciliação. */
  sugestaoId?: string | null
}): Promise<void> {
  try {
    if (!entrada.driveFileIdUsado) return

    let sugestaoId = entrada.sugestaoId ?? null
    let eraOTopo = false

    if (!sugestaoId) {
      const abertas = await db.learningSignal.findMany({
        where: {
          projectId: entrada.projectId,
          tipo: 'foto',
          desfecho: null,
          sugeridoEm: { gte: new Date(Date.now() - JANELA_DE_FECHAMENTO_MS) },
        },
        orderBy: { sugeridoEm: 'desc' },
        take: PROPOSTAS_INSPECIONADAS,
        select: { id: true, sugerido: true },
      })

      for (const aberta of abertas) {
        if (!idsPropostos(aberta.sugerido).includes(entrada.driveFileIdUsado)) continue
        sugestaoId = aberta.id
        eraOTopo = (aberta.sugerido as PropostaDeFoto)?.topo === entrada.driveFileIdUsado
        break
      }
    }

    if (!sugestaoId) return

    // Aceitar o que o card mostrou é aceitação — a descida na lista foi do
    // sistema (não repetir foto/pasta), não uma troca de quem decidiu.
    const aceitouOCard = !!entrada.fotoDoCard && entrada.fotoDoCard === entrada.driveFileIdUsado

    await registrarDesfecho({
      sugestaoId,
      desfecho: eraOTopo || aceitouOCard ? 'aceita-como-veio' : 'trocada',
      escolhido: { driveFileId: entrada.driveFileIdUsado },
      generationId: entrada.generationId ?? null,
      pageId: entrada.pageId ?? null,
      decididoPor: entrada.decididoPor ?? null,
      superficie: entrada.superficie ?? 'chat',
    })
  } catch (erro) {
    console.error('[aprendizado] falha ao fechar sugestão de foto (seguindo sem ela):', erro)
  }
}

/** O que a anotação do chip pós-desfecho pode devolver. Nunca lança. */
export type ResultadoDaAnotacao =
  | 'anotado'
  | 'motivo-invalido'
  | 'nao-encontrado'
  | 'nao-e-foto'
  | 'sem-desfecho'
  | 'erro'

/**
 * Anota o MOTIVO da troca num sinal de foto cujo desfecho JÁ foi postado —
 * o chip é opcional e pode ser tocado depois (F4).
 *
 * Merge cirúrgico no Json `escolhido`: preserva `driveFileId`, `posicao` e o
 * que mais houver; só o `motivo` entra. Compare-and-set no `updatedAt` (padrão
 * de `feedback-de-arte.ts`): se outra escrita venceu no meio — uma revisão de
 * desfecho substitui o `escolhido` inteiro —, o chip é descartado em vez de
 * sobrescrever a verdade mais nova às cegas.
 *
 * Motivo fora do vocabulário (`MOTIVOS_DE_TROCA_DE_FOTO`) é descartado em
 * silêncio — a rota é fire-and-forget e um chip desconhecido não vira erro.
 */
export async function anotarMotivoDaTroca(entrada: {
  sugestaoId: string
  motivo: string
}): Promise<ResultadoDaAnotacao> {
  try {
    if (!motivoDeTrocaValido(entrada.motivo)) return 'motivo-invalido'
    if (!entrada.sugestaoId) return 'nao-encontrado'

    const sinal = await db.learningSignal.findUnique({
      where: { id: entrada.sugestaoId },
      select: { id: true, tipo: true, desfecho: true, escolhido: true, updatedAt: true },
    })
    if (!sinal) return 'nao-encontrado'
    if (sinal.tipo !== 'foto') return 'nao-e-foto'

    const escolhido = sinal.escolhido
    if (
      !sinal.desfecho ||
      !escolhido ||
      typeof escolhido !== 'object' ||
      Array.isArray(escolhido) ||
      typeof (escolhido as { driveFileId?: unknown }).driveFileId !== 'string'
    ) {
      return 'sem-desfecho'
    }

    const atual = escolhido as Record<string, unknown>
    if (atual.motivo === entrada.motivo) return 'anotado'

    const r = await db.learningSignal.updateMany({
      where: { id: sinal.id, updatedAt: sinal.updatedAt },
      data: { escolhido: { ...atual, motivo: entrada.motivo } as never },
    })
    if (r.count === 0) {
      console.warn(
        `[aprendizado] sinal ${sinal.id} mudou durante a anotação do motivo — chip descartado`,
      )
      return 'erro'
    }
    return 'anotado'
  } catch (erro) {
    console.error('[aprendizado] falha ao anotar motivo da troca (seguindo sem ele):', erro)
    return 'erro'
  }
}

/**
 * As preferências de foto de um projeto, agregadas dos sinais já capturados —
 * o insumo aprendido de `ranquearAcervo` (F1.3).
 *
 * Três fontes, quatro consultas no total (nunca N+1):
 *
 *  1. os sinais `tipo: 'foto'` mais recentes → escolhas e rejeições da BUSCA;
 *  2. os sinais `tipo: 'troca-de-arte'` com Generation → a CORREÇÃO
 *     pós-produção, cruzada com `PhotoUsage` para achar a foto da arte que
 *     entrou no lugar (`forca: 'correcao'`);
 *  3. o feedback de arte ("gostei"/"melhorar") das Generations que consumiram
 *     foto do acervo, achado pela chave (`chaveDoFeedbackDeArte`).
 *
 * A agregação em si é CÓDIGO sobre as linhas lidas (`montarPreferencias`),
 * nunca filtro por path de Json no SQL — regra da casa: a ausência do campo é
 * o caso comum, e o filtro por path descarta a linha que não o tem.
 *
 * NUNCA lança: qualquer falha devolve preferências vazias (o ranking segue
 * sem o aprendizado, que é o comportamento de hoje).
 */
export async function lerPreferenciasDeFoto(projectId: number): Promise<PreferenciasDeFoto> {
  try {
    const [sinaisDeFoto, trocasDeArte, paresDeUso] = await Promise.all([
      db.learningSignal.findMany({
        where: { projectId, tipo: 'foto' },
        // DESC em Postgres é NULLS FIRST — explícito para a escolha absoluta
        // (sem `sugeridoEm`) não comer a janela dos 500 mais recentes.
        orderBy: { sugeridoEm: { sort: 'desc', nulls: 'last' } },
        take: SINAIS_LIDOS,
        select: {
          id: true,
          desfecho: true,
          sugerido: true,
          escolhido: true,
          sugeridoEm: true,
          decididoEm: true,
        },
      }),
      db.learningSignal.findMany({
        where: { projectId, tipo: 'troca-de-arte', generationId: { not: null } },
        orderBy: { decididoEm: { sort: 'desc', nulls: 'last' } },
        take: SINAIS_LIDOS,
        select: { id: true, generationId: true, sugeridoEm: true, decididoEm: true },
      }),
      // Pares distintos (foto, arte) — serve à correção E ao feedback.
      db.photoUsage.groupBy({
        by: ['driveFileId', 'generationId'],
        where: { projectId, generationId: { not: null } },
      }),
    ])

    const usos = paresDeUso.map((par) => ({
      driveFileId: par.driveFileId,
      generationId: par.generationId,
    }))

    // O feedback é aditivo: falhar aqui não pode descartar escolhas e
    // rejeições já lidas — degrada para "sem feedback", nunca para vazio.
    let feedbacksDeArte: LinhaDeFeedbackDeArte[] = []
    try {
      const generationIds = Array.from(
        new Set(usos.map((u) => u.generationId).filter((g): g is string => !!g)),
      )
      if (generationIds.length > 0) {
        const porChave = new Map(generationIds.map((g) => [chaveDoFeedbackDeArte(g), g]))
        const sinais = await db.learningSignal.findMany({
          where: { chave: { in: Array.from(porChave.keys()) } },
          select: { chave: true, escolhido: true, decididoEm: true, updatedAt: true },
        })
        feedbacksDeArte = sinais.map((s) => ({
          generationId: s.chave ? (porChave.get(s.chave) ?? null) : null,
          escolhido: s.escolhido,
          decididoEm: s.decididoEm,
          updatedAt: s.updatedAt,
        }))
      }
    } catch (erro) {
      console.error(
        '[aprendizado] falha ao ler feedbacks de arte das fotos (seguindo sem eles):',
        erro,
      )
    }

    return montarPreferencias({ sinaisDeFoto, trocasDeArte, usos, feedbacksDeArte })
  } catch (erro) {
    console.error('[aprendizado] falha ao ler preferências de foto (seguindo sem elas):', erro)
    return preferenciasVazias()
  }
}
