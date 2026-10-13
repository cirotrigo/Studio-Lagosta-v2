/**
 * Render da arte de um post a partir da sua página, com a reserva e o
 * descarte-em-voo que o resultado exige.
 *
 * Isto vivia inline no cron `render-stories`. Passou a ser função porque a
 * janela de congelamento precisa do MESMO comportamento: quando o post entra
 * na janela e a arte ainda está PENDING, o executor renderiza na hora em vez
 * de pular o post em silêncio — que era o que acontecia antes e fazia o post
 * simplesmente não sair.
 *
 * Duplicar essa lógica seria repetir o erro que já custou caro nesta base: a
 * regra de invalidação escrita em dois lugares foi exatamente o que deixou a
 * rota de página de fora por meses.
 */
import { db } from '@/lib/db'
import { renderStoryImage } from '@/lib/posts/story-renderer'
import { ensurePostGeneration } from './ensure-post-generation'
import { comoCopiaDaPagina, slotValuesSeguindo } from './copy-segue-a-pagina'
import { renderDaPaginaCobreAMidia } from './render-da-pagina'
import { MOTIVO_VIDEO_REMOVIDO, postDeVideo } from './post-de-video'
import { ErroRenderSemantico } from './erro-render-semantico'
import { RenderStatus, type Prisma } from '../../../prisma/generated/client'
import { fichaDeReserva } from './ficha-de-reserva'
import { VERSAO_DA_PROVA } from './prova-do-render'

/**
 * Shape único em vez de união discriminada: o tsconfig do projeto roda com
 * `strict: false`, e sem `strictNullChecks` o narrowing por `ok: true` não
 * acontece — os consumidores não conseguiriam ler `motivo` depois de checar
 * `ok`. Quem chama sempre testa `ok` antes de olhar o resto.
 */
export interface RenderPostArtResult {
  ok: boolean
  url?: string
  motivo?: 'sem-pagina' | 'midia-propria' | 'video-removido' | 'ocupado' | 'invalidado' | 'falhou' | 'falha-semantica'
  erro?: string
}

export interface RenderablePost {
  id: string
  pageId: string | null
  slotValues: unknown
  renderAttempts: number
}

/**
 * Renderiza e grava a arte do post.
 *
 * A reserva é compare-and-set (PENDING → RENDERING) em vez de update cru: o
 * update incondicional deixava duas execuções concorrentes renderizarem o
 * mesmo post e a última a terminar sobrescrevia a outra.
 *
 * A gravação do sucesso também é condicional. Se uma edição invalidou o
 * render no meio do voo (o status voltou a PENDING), gravar aqui ressuscitaria
 * a arte velha por cima da invalidação — o certo é descartar este resultado e
 * deixar o próximo ciclo renderizar de novo.
 */
export async function renderPostArt(post: RenderablePost): Promise<RenderPostArtResult> {
  if (!post.pageId) {
    return { ok: false, motivo: 'sem-pagina' }
  }

  /**
   * Este é o ponto por onde TODO render de post passa, e o sucesso grava
   * `mediaUrls: [png]`. Mídia que o render da página não cobre — um vídeo, ou
   * um carrossel — seria apagada por ele. Há mais de um caminho que deixa esse
   * post em PENDING (o PUT troca a mídia sem mexer em `renderStatus`, e voltar
   * para rascunho pede render de todo post RENDERED com página), então a guarda
   * mora aqui: o post sai da fila de render e a mídia fica.
   */
  const atual = await db.socialPost.findUnique({
    where: { id: post.id },
    select: { mediaUrls: true, videoDaPagina: true },
  })
  /**
   * Post de VÍDEO nunca é redesenhado como imagem: o render da página desenha
   * a miniatura, não o vídeo. Com a mídia limpa (à mão, pela agenda), a única
   * saída honesta é dizer por quê — o PNG publicaria uma foto parada no lugar
   * do vídeo. Sai da fila com o motivo, e o executor falha o post sem retry.
   */
  if (atual && postDeVideo(atual)) {
    if ((atual.mediaUrls ?? []).length === 0) {
      await db.socialPost.updateMany({
        where: { id: post.id, renderStatus: RenderStatus.PENDING },
        data: { renderStatus: RenderStatus.RENDER_FAILED, renderError: MOTIVO_VIDEO_REMOVIDO },
      })
      return { ok: false, motivo: 'video-removido', erro: MOTIVO_VIDEO_REMOVIDO }
    }
    await db.socialPost.updateMany({
      where: { id: post.id, renderStatus: RenderStatus.PENDING },
      data: { renderStatus: RenderStatus.NOT_NEEDED, renderError: null },
    })
    return { ok: false, motivo: 'midia-propria' }
  }
  if (atual && !renderDaPaginaCobreAMidia(atual.mediaUrls)) {
    await db.socialPost.updateMany({
      where: { id: post.id, renderStatus: RenderStatus.PENDING },
      data: { renderStatus: RenderStatus.NOT_NEEDED, renderError: null },
    })
    return { ok: false, motivo: 'midia-propria' }
  }

  const ficha = fichaDeReserva()
  const reserva = await db.socialPost.updateMany({
    where: { id: post.id, renderStatus: RenderStatus.PENDING },
    data: { renderStatus: RenderStatus.RENDERING, nextRenderAt: ficha },
  })

  if (reserva.count === 0) {
    // Outra execução já pegou (ou o post saiu de PENDING). Não é erro —
    // quem chamou tenta de novo no próximo ciclo.
    return { ok: false, motivo: 'ocupado' }
  }

  // Toda gravação daqui em diante é só desta reserva (ver `fichaDeReserva`).
  const daReserva = { id: post.id, renderStatus: RenderStatus.RENDERING, nextRenderAt: ficha }
  let pedido: { pageId: string | null; slotValues: unknown; renderAttempts: number } | null = null

  try {
    /**
     * O pedido desenhado — e a contagem de tentativas — são os da linha JÁ RESERVADA, não o que o chamador leu
     * antes (Codex, B1d checkpoint d): uma edição entre aquela leitura e a reserva mandaria desenhar (ou, no
     * contrato semântico, falhar em definitivo) o pedido antigo. Dentro do try: se a leitura falhar, a linha
     * volta à fila pelo retry de sempre em vez de ficar presa em RENDERING.
     */
    pedido = await db.socialPost.findUnique({ where: { id: post.id }, select: { pageId: true, slotValues: true, renderAttempts: true } })
    const pageId = pedido?.pageId ?? post.pageId
    const slotValues = pedido ? pedido.slotValues : post.slotValues

    const result = await renderStoryImage(
      pageId,
      post.id,
      slotValues as Record<string, unknown> | undefined,
    )

    /**
     * B1d (checkpoint e): a confirmação da mídia e a PROVA do render ("estas camadas produziram ESTA mídia") são
     * UMA transação. O CAS vem primeiro: sem a reserva (ficha) ou com a mídia trocada, nada é confirmado e nenhuma
     * prova nasce — o Blob vencido fica sem autoridade. Pegou a linha: a prova (post, URL confirmada, camadas
     * entregues ao canvas) é inserida no mesmo commit; se o INSERT falhar, o RENDERED volta atrás (opção A) e o
     * erro segue o retry comum. Vale para todo render canônico de página, legado também; só o envio do contrato
     * semântico a EXIGE (later-scheduler). Append-only: só create.
     */
    const confirmed = await db.$transaction(async (tx) => {
      const cas = await tx.socialPost.updateMany({
      // A mídia entra no predicado: trocada DURANTE o render (o PUT do post não
      // mexe em `renderStatus`), o PNG não pode entrar por cima dela.
      where: { ...daReserva, mediaUrls: { equals: atual?.mediaUrls ?? [] } },
      data: {
        renderStatus: RenderStatus.RENDERED,
        renderedImageUrl: result.url,
        renderedAt: new Date(),
        renderError: null,
        // Também alimenta o executor, que publica a partir de mediaUrls
        mediaUrls: [result.url],
        /**
         * A cópia da copy acompanha o que acabou de ser DESENHADO. É ela que o
         * corpus e a conferência de texto da melhoria leem; sem isto ficaria
         * com o texto do dia do agendamento — justamente o que o render
         * deixou de aplicar.
         *
         * Quem decide é o RENDER (`aplicouSlots`), não a marca no `slotValues`:
         * a marca falta em 35 posts de página própria medidos em 20/09/2026, e
         * era isso que deixava a cópia envelhecer justamente nos posts em que o
         * defeito aparecia. Sai daqui já MARCADA — o re-render cura a marca que
         * faltou, sem backfill.
         */
        ...(!result.aplicouSlots && slotValues
          ? {
              slotValues: comoCopiaDaPagina(
                slotValuesSeguindo(slotValues, result.copyDaPagina),
              ) as Prisma.InputJsonValue,
            }
          : {}),
      },
      })
      if (cas.count !== 1) return cas
      await tx.postRenderProof.create({
        data: { postId: post.id, mediaUrl: result.url, proofVersion: VERSAO_DA_PROVA, layersSnapshot: result.camadasEfetivas as Prisma.InputJsonValue },
      })
      return cas
    })

    if (confirmed.count === 0) {
      // Se quem mudou foi a MÍDIA, o post ainda está RENDERING e ficaria preso:
      // volta à fila, e a guarda lá de cima decide na próxima rodada (vídeo sai
      // da fila; imagem é desenhada de novo). Invalidado de verdade já está
      // PENDING, e este update não o alcança.
      await db.socialPost.updateMany({
        where: daReserva,
        data: { renderStatus: RenderStatus.PENDING, nextRenderAt: new Date() },
      })
      return { ok: false, motivo: 'invalidado' }
    }

    /**
     * Só agora a arte existe: é o momento de vincular a Generation que habilita
     * "Melhorar com IA". Cobre o caminho do MCP (`create-post` cria o post sem
     * arte e deixa o cron renderizar) — sem isto, esses posts ficariam sem
     * vínculo para sempre, como os 193 medidos em 03/08/2026.
     *
     * Não vincula de novo em re-render: `ensurePostGeneration` sai cedo quando
     * o post já tem `generationId`, então a arte melhorada continua sendo a
     * dona do vínculo.
     */
    await ensurePostGeneration(post.id, { midiaEsperada: result.url })

    return { ok: true, url: result.url }
  } catch (error) {
    const newAttempts = (pedido?.renderAttempts ?? post.renderAttempts) + 1

    /**
     * B1d (checkpoint d): o contrato semântico não casa com a página no momento do render. É DETERMINÍSTICO —
     * repetir dá o mesmo resultado —, então é terminal já nesta tentativa: RENDER_FAILED, sem backoff, com o
     * envelope seguro (código e erros estruturados, nunca o texto pedido) em renderError. Nada foi desenhado
     * nem subido: a recusa acontece antes. Erros comuns seguem o retry de sempre, logo abaixo.
     */
    if (error instanceof ErroRenderSemantico) {
      const envelope = error.paraRenderError()
      const terminal = await db.socialPost.updateMany({
        where: daReserva,
        data: { renderStatus: RenderStatus.RENDER_FAILED, renderAttempts: newAttempts, renderError: envelope, nextRenderAt: null },
      })
      // A reserva deixou de ser desta execução (invalidada, ou já reservada por outra): o pedido novo vale.
      if (terminal.count === 0) return { ok: false, motivo: 'invalidado' }
      return { ok: false, motivo: 'falha-semantica', erro: envelope }
    }

    const erro = error instanceof Error ? error.message : 'Unknown error'

    if (newAttempts >= 3) {
      await db.socialPost.updateMany({
        where: daReserva,
        data: {
          renderStatus: RenderStatus.RENDER_FAILED,
          renderAttempts: newAttempts,
          renderError: erro,
        },
      })
    } else {
      // Backoff exponencial: 2^tentativas * 2 minutos
      const backoffMs = Math.pow(2, newAttempts) * 2 * 60 * 1000
      await db.socialPost.updateMany({
        where: daReserva,
        data: {
          renderStatus: RenderStatus.PENDING,
          renderAttempts: newAttempts,
          renderError: erro,
          nextRenderAt: new Date(Date.now() + backoffMs),
        },
      })
    }

    return { ok: false, motivo: 'falhou', erro }
  }
}
