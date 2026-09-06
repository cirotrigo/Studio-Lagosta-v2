/**
 * Repostar — o serviço (lê o banco, chama o módulo puro, emite a sugestão).
 *
 * A FONTE é o post que passou pela agenda e foi publicado (`SocialPost`
 * POSTED), nunca a galeria de criativos: só 36% dos posts publicados são
 * alcançáveis pela aba de criativos (76% nos últimos 90 dias). Arte que nunca
 * virou post não foi ao ar — não é candidata a repost.
 *
 * A mídia se resolve pela Generation quando ela existe: é a URL que o cleanup
 * de 90 dias mantém viva. Sem Generation, a `mediaUrls` do post é o que há —
 * por isso a janela padrão é 60 dias, onde a mortalidade ainda é ~12%.
 */
import { db } from '@/lib/db'
import { registrarSugestao, sugestoesJaEmitidas } from '@/lib/aprendizado/captura'
import { chaveDeSugestao, diaBRT } from '@/lib/aprendizado/chaves'
import type { Superficie } from '@/lib/aprendizado/vocabulario'
import { emBRT } from '@/lib/posts/cadencia'
import {
  JANELA_PADRAO_DIAS,
  TETO_PADRAO,
  VERSAO_DO_REPOST,
  chaveDaImagem,
  ranquearRepost,
  type PostPublicadoParaRepost,
  type SugestaoDeRepost,
} from '@/lib/posts/repostar'

export interface ItemDeRepost extends Omit<SugestaoDeRepost, 'ultimoUso'> {
  ultimoUso: string
}

export interface ResultadoDeRepost {
  quando: string
  itens: ItemDeRepost[]
  total: number
  /** Id do `LearningSignal` emitido (ou reaproveitado) para este slot. */
  sugestaoId: string | null
}

/**
 * A chave de idempotência da proposta: UMA por (projeto, dia, hora, safra).
 * O formulário reconsulta a cada mudança de data; sem a chave, uma semana de
 * uso gravaria milhares de linhas para as mesmas dezenas de propostas.
 */
export function chaveDoRepost(projectId: number, quando: Date): string {
  const { minutos } = emBRT(quando)
  const hora = String(Math.floor(minutos / 60)).padStart(2, '0')
  return chaveDeSugestao(projectId, 'repost', diaBRT(quando), hora, VERSAO_DO_REPOST)
}

export async function sugerirRepost(entrada: {
  projectId: number
  quando: Date
  dias?: number
  excluirPostId?: string
  teto?: number
  superficie?: Superficie
  /** `false` para consultar sem registrar proposta (scripts, medições). */
  registrar?: boolean
}): Promise<ResultadoDeRepost> {
  const agora = new Date()
  const dias = entrada.dias ?? JANELA_PADRAO_DIAS
  const desde = new Date(agora.getTime() - dias * 86_400_000)

  const [publicados, futuros] = await Promise.all([
    db.socialPost.findMany({
      where: {
        projectId: entrada.projectId,
        status: 'POSTED',
        postType: 'STORY',
        OR: [{ sentAt: { gte: desde } }, { scheduledDatetime: { gte: desde, lte: agora } }],
        ...(entrada.excluirPostId ? { id: { not: entrada.excluirPostId } } : {}),
      },
      select: {
        id: true, mediaUrls: true, generationId: true, caption: true,
        sentAt: true, scheduledDatetime: true, createdAt: true, analyticsReach: true,
      },
    }),
    db.socialPost.findMany({
      where: {
        projectId: entrada.projectId,
        status: { in: ['DRAFT', 'SCHEDULED'] },
        scheduledDatetime: { gte: agora },
        ...(entrada.excluirPostId ? { id: { not: entrada.excluirPostId } } : {}),
      },
      select: { mediaUrls: true, generationId: true },
    }),
  ])

  const genIds = [...new Set(publicados.map((p) => p.generationId).filter(Boolean) as string[])]
  const gens = genIds.length
    ? await db.generation.findMany({
        where: { id: { in: genIds }, status: 'COMPLETED' },
        select: { id: true, resultUrl: true, templateName: true },
      })
    : []
  const genPorId = new Map(gens.map((g) => [g.id, g]))

  const posts: PostPublicadoParaRepost[] = publicados
    .filter((p) => p.mediaUrls?.[0])
    .map((p) => {
      const gen = p.generationId ? genPorId.get(p.generationId) : undefined
      return {
        id: p.id,
        mediaUrl: p.mediaUrls[0],
        generationId: gen?.id ?? null,
        generationUrl: gen?.resultUrl ?? null,
        templateName: gen?.templateName ?? null,
        quando: p.sentAt ?? p.scheduledDatetime ?? p.createdAt,
        caption: p.caption,
        alcance: p.analyticsReach,
      }
    })

  const jaAgendadas = new Set<string>()
  for (const f of futuros) {
    if (f.mediaUrls?.[0]) jaAgendadas.add(chaveDaImagem(f.mediaUrls[0]))
    if (f.generationId) jaAgendadas.add(f.generationId)
  }

  const itens = ranquearRepost(posts, { quando: entrada.quando, agora, teto: entrada.teto ?? TETO_PADRAO, jaAgendadas })

  let sugestaoId: string | null = null
  if (entrada.registrar !== false && itens.length > 0) {
    sugestaoId = await registrarPropostaDeRepost(entrada.projectId, entrada.quando, itens, entrada.superficie ?? 'agenda')
  }

  return {
    quando: entrada.quando.toISOString(),
    itens: itens.map((i) => ({ ...i, ultimoUso: i.ultimoUso.toISOString() })),
    total: itens.length,
    sugestaoId,
  }
}

/**
 * A proposta é registrada quando é EMITIDA, com chave de idempotência: a leva
 * reemitida custa um SELECT e zero escritas. Falha aqui nunca derruba a
 * sugestão (a captura engole o próprio erro e devolve `null`).
 */
async function registrarPropostaDeRepost(
  projectId: number,
  quando: Date,
  itens: SugestaoDeRepost[],
  superficie: Superficie,
): Promise<string | null> {
  const chave = chaveDoRepost(projectId, quando)
  try {
    const existentes = await sugestoesJaEmitidas([chave])
    const ja = existentes.get(chave)
    if (ja) return ja
    return await registrarSugestao({
      projectId,
      tipo: 'repost',
      servico: 'sugerir-repost',
      versao: VERSAO_DO_REPOST,
      chave,
      sugerido: {
        quando: quando.toISOString(),
        superficie,
        candidatos: itens.slice(0, 8).map((i) => ({
          chave: i.chave,
          generationId: i.generationId,
          postAnterior: i.ultimoPostId,
          pontos: i.pontos,
          semaforo: i.semaforo,
        })),
      },
    })
  } catch (erro) {
    console.error('[sugerir-repost] não registrou a proposta (seguindo):', erro)
    return null
  }
}
