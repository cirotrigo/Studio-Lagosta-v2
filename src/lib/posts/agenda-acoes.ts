/**
 * Ações da agenda compartilhadas entre a rota HTTP e o conector MCP:
 * aprovar/reverter rascunhos, reagendar e cancelar.
 *
 * A regra de ouro aqui é não deixar a agenda mentir. O executor manda posts
 * agendados ao Zernio com antecedência, então toda ação sobre um post que já
 * tem `laterPostId` precisa acertar a fila remota ANTES de gravar o banco —
 * se o Zernio não confirmar, a ação falha e o estado local fica como estava.
 */

import { db } from '@/lib/db'
import { PostStatus, RenderStatus } from '../../../prisma/generated/client'
import { getLaterClient, LaterNotFoundError } from '@/lib/later'
import { parseBRT } from '@/lib/creatives/agendar'
import { ehHostProprio } from '@/lib/creatives/ingerir-midia'
import { CreativeError } from '@/lib/creatives/errors'
import { avisosDeCampanhaVencida } from '@/lib/posts/campanha-vigencia'
import { fecharSugestaoDeSlot, registrarSlotDoPost } from '@/lib/aprendizado/sinal-de-agendamento'
import type { Superficie } from '@/lib/aprendizado/vocabulario'

export type AcaoAprovacao = 'APPROVE' | 'REVERT'

export interface Ignorado {
  postId: string
  motivo: string
}

export interface AvisoPost {
  postId: string
  aviso: string
}

export interface ResultadoAprovacao {
  processados: string[]
  ignorados: Ignorado[]
  /**
   * O post FOI aprovado, e ainda assim há algo para alguém olhar — hoje, post
   * de campanha marcado para depois do fim dela. Aviso nunca vira veto.
   */
  avisos?: AvisoPost[]
  mensagem: string
}

/**
 * Hosts de mídia que NÃO morrem quando o post é apagado do Zernio: o Blob do
 * Studio, o CDN do Drive e o Supabase do Claudinho. Qualquer outra origem é
 * tratada como CDN do Zernio (o conservador certo: recusar o revert é
 * reversível, apagar a arte não é).
 *
 * A lista vive em `ingerir-midia.ts` porque é a mesma pergunta feita na entrada:
 * o que não está aqui é trazido para o Blob no agendamento, e post novo nunca
 * mais chega neste guard com mídia de fora.
 */
export function midiaSobreviveAoZernio(mediaUrls: string[]): boolean {
  return mediaUrls.every((url) => ehHostProprio(url))
}

export const formatarBRT = (data: Date) =>
  data.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  })

/**
 * Aprova (DRAFT→SCHEDULED) ou reverte (SCHEDULED→DRAFT) posts, validando um a
 * um: em lote, falhar tudo por causa de um post com horário vencido seria pior
 * do que processar o resto e devolver o motivo dos ignorados.
 */
export async function processarAprovacao(params: {
  projectId: number
  postIds: string[]
  action: AcaoAprovacao
  /** `User.id` INTERNO (cuid), NUNCA o clerkId. Auditoria do aprendizado. */
  decididoPor?: string | null
  /** Onde a decisão foi tomada. Padrão: a agenda. */
  superficie?: Superficie
}): Promise<ResultadoAprovacao> {
  const { projectId, postIds, action } = params
  const superficie = params.superficie ?? 'agenda'

  if (action === 'APPROVE') {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { name: true, instagramAccountId: true },
    })
    if (!project) {
      throw new CreativeError('PROJECT_NOT_FOUND', `Projeto não encontrado: ${projectId}`, 404)
    }
    // Sem conta conectada não há para onde publicar; barra a aprovação inteira
    // em vez de deixar o post virar SCHEDULED e falhar depois na fila.
    if (!project.instagramAccountId) {
      throw new CreativeError(
        'SEM_CONTA_INSTAGRAM',
        `O projeto "${project.name}" ainda não tem conta do Instagram conectada. Conecte a conta nas configurações antes de aprovar.`,
        400,
      )
    }
  }

  const posts = await db.socialPost.findMany({
    where: { id: { in: postIds }, projectId },
    select: {
      id: true,
      status: true,
      scheduledDatetime: true,
      laterPostId: true,
      mediaUrls: true,
      pageId: true,
      renderStatus: true,
      campaignId: true,
      // Para o registro de aprendizado da aprovação (ver abaixo).
      postType: true,
      generationId: true,
      sugestaoId: true,
    },
  })

  const encontrados = new Map(posts.map((post) => [post.id, post]))
  const ignorados: Ignorado[] = []
  const processados: string[] = []

  for (const postId of postIds) {
    if (!encontrados.has(postId)) {
      ignorados.push({ postId, motivo: 'Post não encontrado neste projeto.' })
    }
  }

  const agora = new Date()

  for (const post of posts) {
    if (action === 'APPROVE') {
      if (post.status !== PostStatus.DRAFT) {
        ignorados.push({
          postId: post.id,
          motivo:
            post.status === PostStatus.SCHEDULED
              ? 'Já estava agendado.'
              : 'Só dá para aprovar post que está como rascunho.',
        })
        continue
      }

      if (!post.scheduledDatetime) {
        ignorados.push({
          postId: post.id,
          motivo: 'Sem data e horário definidos. Reagende antes de aprovar.',
        })
        continue
      }

      // O executor tem catch-up de 6h: aprovar com horário vencido publicaria
      // na hora, sem o usuário esperar por isso.
      if (post.scheduledDatetime.getTime() <= agora.getTime()) {
        ignorados.push({
          postId: post.id,
          motivo: `O horário já passou (${formatarBRT(post.scheduledDatetime)}). Reagende antes de aprovar.`,
        })
        continue
      }

      // Sem imagem e sem página de template não há o que publicar — aprovado
      // assim, o post só falharia depois, na hora do envio.
      if (post.mediaUrls.length === 0 && !post.pageId) {
        ignorados.push({
          postId: post.id,
          motivo: 'Este rascunho está sem arte. Adicione a imagem antes de aprovar.',
        })
        continue
      }

      // Post de template ainda sem arte: agenda o render agora, senão o envio
      // antecipado despacharia o post sem imagem. Sem mídia, re-renderizar é
      // sempre a escolha segura — inclusive se constar RENDERED, porque o
      // envio publica a partir de mediaUrls, nunca de renderedImageUrl.
      // renderAttempts volta a zero (como em invalidate-renders): reaprovar
      // um post cujo render falhou 3x precisa renderizar de novo, não ficar
      // preso para sempre fora do filtro renderAttempts < 3 do cron.
      const precisaRender = post.pageId !== null && post.mediaUrls.length === 0

      await db.socialPost.update({
        where: { id: post.id },
        data: {
          status: PostStatus.SCHEDULED,
          errorMessage: null,
          failedAt: null,
          processingStartedAt: null,
          ...(precisaRender
            ? { renderStatus: 'PENDING', nextRenderAt: agora, renderAttempts: 0, renderError: null }
            : {}),
        },
      })
      processados.push(post.id)

      /**
       * O RÓTULO POSITIVO MAIS LIMPO DO SISTEMA: alguém olhou a arte, a copy e
       * o horário e armou a publicação. Nenhum outro ponto do fluxo tem uma
       * confirmação humana tão explícita.
       *
       * UMA linha por slot, e qual delas depende de ter havido proposta:
       *
       *  - COM proposta: o desfecho da sugestão, que já é o registro completo
       *    (o proposto, o comprometido e o contexto). `registrarSlotDoPost`
       *    NÃO roda junto — ele grava `escolha-propria`, rótulo falso para
       *    quem aceitou uma proposta, e a segunda linha dobrava o peso do
       *    horário na cadência. Achado no teste ponta a ponta de 10/08/2026.
       *  - SEM proposta: a linha de slot na mesma chave que `agendarPost` usa
       *    (`slot:post:<id>`), idempotente. No caminho normal (criar rascunho
       *    → aprovar) o agendamento já a gravou e isto é no-op; o valor está
       *    no caminho de fora — post criado pela bancada ou por import, que
       *    nunca passou por `agendarPost`.
       */
      if (post.sugestaoId) {
        await fecharSugestaoDeSlot({
          sugestaoId: post.sugestaoId,
          postId: post.id,
          quando: post.scheduledDatetime,
          desfecho: 'aceita-como-veio',
          contexto: { postType: post.postType, situacao: 'agendado' },
          pageId: post.pageId,
          generationId: post.generationId,
          campaignId: post.campaignId,
          decididoPor: params.decididoPor ?? null,
          superficie,
        })
      } else {
        await registrarSlotDoPost({
          projectId,
          postId: post.id,
          quando: post.scheduledDatetime,
          postType: post.postType,
          situacao: 'agendado',
          pageId: post.pageId,
          generationId: post.generationId,
          campaignId: post.campaignId,
          decididoPor: params.decididoPor ?? null,
          superficie,
        })
      }
      continue
    }

    // REVERT — voltar para rascunho
    if (post.status !== PostStatus.SCHEDULED) {
      ignorados.push({
        postId: post.id,
        motivo:
          post.status === PostStatus.DRAFT
            ? 'Já era rascunho.'
            : 'Post já saiu para publicação e não pode voltar a rascunho.',
      })
      continue
    }

    // Post importado do Zernio guarda a mídia no CDN de lá; apagar o post
    // remoto mata as URLs e o rascunho volta sem arte, quebrado. Mídia nossa
    // (Blob, Drive, Supabase) sobrevive ao delete — só essas podem reverter.
    if (post.laterPostId && !midiaSobreviveAoZernio(post.mediaUrls)) {
      ignorados.push({
        postId: post.id,
        motivo:
          'A arte deste post está guardada no Zernio e seria apagada junto. Para adiar, reagende; para remover de vez, cancele.',
      })
      continue
    }

    // O executor envia posts futuros para o Zernio com antecedência. Se o post
    // já está lá, marcar DRAFT no banco não impede nada: ele publicaria assim
    // mesmo e a agenda estaria mentindo. Só volta a rascunho se conseguir
    // tirar da fila remota.
    if (post.laterPostId) {
      try {
        const laterClient = getLaterClient()
        await laterClient.deletePost(post.laterPostId)
      } catch (error) {
        if (!(error instanceof LaterNotFoundError)) {
          console.error(
            `[AGENDA_ACOES] Falha ao remover post do Zernio (${post.laterPostId}):`,
            error,
          )
          ignorados.push({
            postId: post.id,
            motivo:
              'Não foi possível tirar o post da fila de publicação. Tente de novo em instantes.',
          })
          continue
        }
        // Já não existia por lá — remover a referência local é seguro.
      }
    }

    /**
     * Voltar para rascunho reconstrói a arte a partir da página.
     *
     * Quem volta um post para rascunho quase sempre volta PARA MEXER na arte —
     * é literalmente a instrução que a agenda dá quando o post está congelado
     * ("volte para rascunho e agende de novo"). Sem isto, essa instrução tem
     * uma ordem que falha em silêncio:
     *
     *   editar o template AINDA congelado → a invalidação pula o post (não
     *   pode zerar a arte de um post armado) → voltar para rascunho não mexe
     *   em renderStatus → aprovar não re-renderiza, porque só força render
     *   quando `mediaUrls` está vazio → publica a versão antiga, calada.
     *
     * Marcando PENDING aqui, a página volta a ser a fonte de verdade em
     * qualquer ordem.
     *
     * `renderStatus === RENDERED` não é detalhe: NOT_NEEDED significa que a
     * arte NÃO vem do render desta página — é upload, import, ou a arte
     * MELHORADA com IA (que custou ~140s, 1 crédito e verificação por visão).
     * Re-renderizar essas destruiria trabalho que a página não sabe refazer.
     *
     * `mediaUrls` fica intacto de propósito: o rascunho segue mostrando a arte
     * anterior enquanto o render novo não chega, e um render que falhe não
     * deixa o post sem imagem nenhuma.
     */
    const reconstroiArte = post.pageId !== null && post.renderStatus === RenderStatus.RENDERED

    await db.socialPost.update({
      where: { id: post.id },
      data: {
        status: PostStatus.DRAFT,
        laterPostId: null,
        lateStatus: null,
        processingStartedAt: null,
        ...(reconstroiArte
          ? {
              renderStatus: RenderStatus.PENDING,
              nextRenderAt: agora,
              renderAttempts: 0,
              renderError: null,
            }
          : {}),
      },
    })
    processados.push(post.id)
  }

  const total = processados.length
  const plural = total === 1 ? 'post' : 'posts'
  const mensagem =
    action === 'APPROVE'
      ? total > 0
        ? `${total} ${plural} ${total === 1 ? 'aprovado' : 'aprovados'} e na fila de publicação.`
        : 'Nenhum post foi aprovado.'
      : total > 0
        ? `${total} ${plural} ${total === 1 ? 'voltou' : 'voltaram'} para rascunho.`
        : 'Nenhum post voltou para rascunho.'

  /**
   * Só na aprovação, e só sobre o que foi de fato aprovado: aprovar é o
   * momento em que a publicação passa a ser real, e é aí que "a campanha já
   * terá acabado" ainda dá tempo de ser corrigido. Voltar para rascunho não
   * precisa do alerta.
   */
  let avisos: AvisoPost[] = []
  if (action === 'APPROVE' && processados.length > 0) {
    const aprovados = new Set(processados)
    const mapa = await avisosDeCampanhaVencida(
      projectId,
      posts.filter((p) => aprovados.has(p.id)),
    )
    avisos = [...mapa.entries()].map(([postId, aviso]) => ({ postId, aviso }))
  }

  return { processados, ignorados, ...(avisos.length > 0 ? { avisos } : {}), mensagem }
}

/**
 * Muda a data/hora de um post preservando a situação: rascunho continua
 * rascunho (mudar a data não é aprovar), agendado continua agendado.
 *
 * Se o post já foi para a fila remota, o Zernio é atualizado PRIMEIRO; só com
 * a confirmação dele o banco muda — mais estrito que o PUT da interface, que
 * grava local e sincroniza depois, porque no chat ninguém vê um aviso de
 * divergência passar batido.
 */
export async function reagendarPost(params: {
  projectId: number
  postId: string
  /** "AAAA-MM-DD HH:mm" em horário de Brasília, ou ISO com fuso */
  novaDataHora: string
}) {
  const { projectId, postId } = params

  const post = await db.socialPost.findUnique({
    where: { id: postId },
    select: {
      id: true,
      projectId: true,
      status: true,
      scheduledDatetime: true,
      laterPostId: true,
      publishType: true,
      reminderSentAt: true,
    },
  })

  if (!post || post.projectId !== projectId) {
    throw new CreativeError('POST_NAO_ENCONTRADO', 'Post não encontrado neste projeto.', 404)
  }

  // Reagendar só preserva situação entre rascunho e agendado. Post falhado é
  // avisado no WhatsApp e NUNCA rearmado por aqui — promovê-lo a agendado
  // reabriria o risco de publicação dupla que o sistema inteiro evita.
  if (post.status !== PostStatus.DRAFT && post.status !== PostStatus.SCHEDULED) {
    if (post.status === PostStatus.POSTED) {
      throw new CreativeError('POST_JA_SAIU', 'Este post já foi publicado — não dá mais para reagendar.', 400)
    }
    if (post.status === PostStatus.POSTING) {
      throw new CreativeError('POST_SAINDO', 'Este post está sendo publicado agora — não dá mais para reagendar.', 400)
    }
    throw new CreativeError(
      'POST_FALHOU',
      'Este post falhou na publicação, e reagendar não o faria tentar de novo. Confira o aviso no WhatsApp; para tentar novamente use a agenda no Studio, ou crie um post novo.',
      400,
    )
  }

  const quando = parseBRT(params.novaDataHora)
  if (Number.isNaN(quando.getTime())) {
    throw new CreativeError('DATA_INVALIDA', 'Data/hora inválida. Use "AAAA-MM-DD HH:mm" no horário de Brasília.', 400)
  }
  if (quando.getTime() <= Date.now()) {
    throw new CreativeError(
      'DATA_NO_PASSADO',
      `Esse horário já passou (${formatarBRT(quando)}). Escolha uma data à frente.`,
      400,
    )
  }

  if (post.laterPostId) {
    const laterClient = getLaterClient()
    try {
      await laterClient.updatePost(post.laterPostId, { scheduledFor: quando.toISOString() })
    } catch (error) {
      if (error instanceof LaterNotFoundError) {
        // O post chegou a existir no Zernio e sumiu — não dá para saber se
        // publicou. Reenviar arriscaria post dobrado (mesmo invariante do
        // executor), então nada muda até o sync esclarecer o estado.
        throw new CreativeError(
          'ESTADO_INDEFINIDO',
          'Este post sumiu da fila de publicação e não dá para saber se chegou a publicar. Aguarde alguns minutos a sincronização e confira a agenda (e o Instagram) antes de mexer nele.',
          409,
        )
      }
      console.error(`[AGENDA_ACOES] Falha ao reagendar no Zernio (${post.laterPostId}):`, error)
      throw new CreativeError(
        'ZERNIO_INDISPONIVEL',
        'Não foi possível atualizar a fila de publicação. Tente de novo em instantes.',
        502,
      )
    }
  }

  // Lembrete que já disparou precisa disparar de novo no horário novo — sem
  // zerar reminderSentAt o cron de lembretes ignora o post para sempre e a
  // publicação manual morre em silêncio.
  const eLembrete = post.publishType === 'REMINDER'
  const rearmarLembrete = eLembrete && post.reminderSentAt !== null

  const atualizado = await db.socialPost.update({
    where: { id: post.id },
    data: {
      scheduledDatetime: quando,
      // Rascunho segue rascunho: a promoção para agendado é só na aprovação
      ...(post.status === PostStatus.DRAFT ? {} : { status: PostStatus.SCHEDULED }),
      errorMessage: null,
      failedAt: null,
      processingStartedAt: null,
      ...(rearmarLembrete ? { reminderSentAt: null } : {}),
    },
    select: { id: true, status: true, scheduledDatetime: true },
  })

  const situacao = atualizado.status === PostStatus.DRAFT ? 'rascunho' : 'agendado'
  const quandoBRT = formatarBRT(atualizado.scheduledDatetime!)
  const mensagem =
    situacao === 'rascunho'
      ? `Reagendado para ${quandoBRT}. Continua como rascunho — não publica até você aprovar.`
      : eLembrete
        ? `Reagendado: o lembrete de publicação será enviado no WhatsApp perto de ${quandoBRT} (este post é publicado manualmente, não pelo sistema).`
        : `Reagendado: vai publicar em ${quandoBRT}.`
  return { postId: atualizado.id, situacao, quando: quandoBRT, mensagem }
}

/**
 * Cancela um post: tira da fila remota (se chegou lá) e apaga da agenda.
 *
 * Post publicado não se cancela — e aqui, diferente do DELETE da interface, a
 * falha ao remover do Zernio ABORTA o cancelamento: apagar só localmente
 * deixaria o post publicando mesmo assim, com a agenda dizendo que não existe.
 */
export async function cancelarPost(params: { projectId: number; postId: string }) {
  const { projectId, postId } = params

  const post = await db.socialPost.findUnique({
    where: { id: postId },
    select: {
      id: true,
      projectId: true,
      status: true,
      scheduledDatetime: true,
      laterPostId: true,
      caption: true,
    },
  })

  if (!post || post.projectId !== projectId) {
    throw new CreativeError('POST_NAO_ENCONTRADO', 'Post não encontrado neste projeto.', 404)
  }

  if (post.status === PostStatus.POSTED) {
    throw new CreativeError(
      'POST_JA_PUBLICADO',
      'Este post já foi publicado no Instagram — não dá para cancelar. Se precisar, apague direto no Instagram.',
      400,
    )
  }
  if (post.status === PostStatus.POSTING) {
    throw new CreativeError(
      'POST_SAINDO',
      'Este post está sendo publicado neste momento — não dá mais para cancelar.',
      400,
    )
  }

  if (post.laterPostId) {
    const laterClient = getLaterClient()
    try {
      await laterClient.deletePost(post.laterPostId)
    } catch (error) {
      if (!(error instanceof LaterNotFoundError)) {
        console.error(`[AGENDA_ACOES] Falha ao cancelar no Zernio (${post.laterPostId}):`, error)
        throw new CreativeError(
          'ZERNIO_INDISPONIVEL',
          'Não foi possível tirar o post da fila de publicação. Tente de novo em instantes.',
          502,
        )
      }
      // Já não existia por lá — seguir com a exclusão local é seguro.
    }
  }

  await db.socialPost.delete({ where: { id: post.id } })

  const quando = post.scheduledDatetime ? ` de ${formatarBRT(post.scheduledDatetime)}` : ''
  return {
    cancelado: true,
    postId: post.id,
    mensagem: `Post${quando} cancelado e removido da agenda.`,
  }
}

/**
 * Edita legenda/tipo de um RASCUNHO. Post aprovado não se edita por aqui de
 * propósito: mudar algo já armado alteraria uma publicação real (e abriria o
 * pântano de sincronizar a edição com a fila remota) — o caminho é
 * voltar-para-rascunho → editar → aprovar de novo. Mesma filosofia do
 * "rascunho se edita, não se melhora" da melhoria com IA, invertida.
 */
export async function editarPost(params: {
  projectId: number
  postId: string
  caption?: string
  postType?: 'STORY' | 'POST' | 'REEL' | 'CAROUSEL'
}) {
  const { projectId, postId } = params

  if (params.caption === undefined && params.postType === undefined) {
    throw new CreativeError('SEM_EDICAO', 'Nada para editar: envie caption e/ou postType.', 400)
  }

  const post = await db.socialPost.findUnique({
    where: { id: postId },
    select: { id: true, projectId: true, status: true, scheduledDatetime: true, postType: true },
  })
  if (!post || post.projectId !== projectId) {
    throw new CreativeError('POST_NAO_ENCONTRADO', 'Post não encontrado neste projeto.', 404)
  }

  if (post.status === PostStatus.POSTED) {
    throw new CreativeError('POST_JA_PUBLICADO', 'Este post já foi publicado — não dá mais para editar.', 400)
  }
  if (post.status === PostStatus.POSTING) {
    throw new CreativeError('POST_SAINDO', 'Este post está sendo publicado agora — não dá mais para editar.', 400)
  }
  if (post.status === PostStatus.SCHEDULED) {
    throw new CreativeError(
      'POST_APROVADO',
      'Este post já está aprovado e armado para publicar. Traga-o de volta para rascunho (voltar-para-rascunho), edite, e aprove de novo — editar algo armado mudaria uma publicação real sem re-aprovação.',
      400,
    )
  }
  if (post.status === PostStatus.FAILED) {
    throw new CreativeError(
      'POST_FALHOU',
      'Este post falhou ao publicar — o caminho é a interface ("Tentar novamente") ou criar um post novo.',
      400,
    )
  }

  const atualizado = await db.socialPost.update({
    where: { id: post.id },
    data: {
      ...(params.caption !== undefined ? { caption: params.caption } : {}),
      ...(params.postType !== undefined ? { postType: params.postType } : {}),
    },
    select: { id: true, caption: true, postType: true, scheduledDatetime: true },
  })

  const quandoBRT = atualizado.scheduledDatetime ? formatarBRT(atualizado.scheduledDatetime) : null
  return {
    editado: true,
    postId: atualizado.id,
    tipo: atualizado.postType === 'STORY' ? 'story' : atualizado.postType.toLowerCase(),
    legenda: atualizado.caption,
    ...(quandoBRT ? { quando: quandoBRT } : {}),
    mensagem: `Rascunho atualizado${quandoBRT ? ` (segue na agenda para ${quandoBRT})` : ''}. Continua sem publicar até ser aprovado.`,
  }
}
