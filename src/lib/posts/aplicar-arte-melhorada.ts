/**
 * O último passo da melhoria com IA quando ela nasceu de um post da agenda: pôr a arte nova NO POST.
 *
 * Saiu de dentro do runner (`creative-improvement-runner.ts`) em 11/11/2026 para poder ser testado sozinho, quando
 * ganhou o ramo do Zernio: post que já está lá recebe a arte nova NO MESMO post de lá (Zernio primeiro, banco depois).
 * Antes disso `laterPostId` fazia a melhoria ficar só na galeria.
 */

import { db } from '@/lib/db'
import { recusaDeArteNoZernio, trocarMidiaNoZernio } from './midia-no-zernio'

export interface ArteAplicada {
  aplicada: boolean
  /** Posição que recebeu a arte (0 = a primeira). */
  indice: number
  total: number
  /** Por que não aplicou. A arte melhorada continua na galeria. */
  motivo?: string
}

export async function aplicarArteMelhoradaAoPost(params: {
  postId: string
  projectId: number
  /** Slide que recebe a arte. Fora do post, vale o mais próximo (o índice vem de uma tela). */
  indice?: number | null
  /** A arte melhorada, no Blob do Studio. */
  url: string
  generationId: string
}): Promise<ArteAplicada> {
  /**
   * Carrossel: substitui SÓ o slide melhorado.
   *
   * Antes daqui saía `mediaUrls: [nova]`, o que apagava os outros slides
   * de um carrossel agendado — perda silenciosa, e sem volta, porque a
   * melhoria também marca `renderStatus: NOT_NEEDED` e tira o post do
   * alcance do re-render. A regra agora é: a melhoria NUNCA reduz a
   * quantidade de mídias do post, venha de onde vier o pedido.
   */
  const atual = await db.socialPost.findFirst({
    where: { id: params.postId, projectId: params.projectId },
    select: { mediaUrls: true, laterPostId: true, lateStatus: true, scheduledDatetime: true },
  })
  const midiasAtuais = atual?.mediaUrls ?? []
  const indice = Math.min(Math.max(params.indice ?? 0, 0), Math.max(midiasAtuais.length - 1, 0))
  const naoAplicada = (motivo: string): ArteAplicada => ({ aplicada: false, indice, total: midiasAtuais.length, motivo })

  /**
   * Post já no Zernio: o que vai ao ar é a cópia de lá, então a arte troca LÁ antes. A melhoria leva ~140s; a janela
   * pode ter fechado no meio, e por isso a recusa é conferida de novo aqui (o serviço já conferiu ao aceitar o pedido).
   * Se o Zernio não trocar, o banco não muda e a arte fica só na galeria.
   */
  let urlNoPost = params.url
  if (atual?.laterPostId) {
    const recusa = recusaDeArteNoZernio(atual)
    if (recusa) return naoAplicada(recusa.mensagem)
    try {
      const noZernio = await trocarMidiaNoZernio({
        laterPostId: atual.laterPostId,
        indice,
        url: params.url,
        totalEsperado: midiasAtuais.length,
      })
      urlNoPost = noZernio[indice] ?? params.url
    } catch (error) {
      return naoAplicada(error instanceof Error ? error.message : 'falha ao trocar a arte no Zernio')
    }
  }

  const novasMidias = midiasAtuais.length > 0 ? [...midiasAtuais] : [urlNoPost]
  novasMidias[indice] = urlNoPost

  // A melhoria demora ~1min; o post pode ter sido publicado nesse
  // meio-tempo. Só aplica se AINDA estiver em rascunho/agendado — trocar
  // a mídia de um post POSTING/POSTED mentiria sobre o que foi publicado.
  const updated = await db.socialPost.updateMany({
    where: {
      id: params.postId,
      projectId: params.projectId,
      status: { in: ['DRAFT', 'SCHEDULED'] },
      // O vínculo com o Zernio tem de ser o que foi LIDO: post nativo entregue
      // no meio do caminho (ganhou `laterPostId`) vai ao ar com a arte que
      // está lá, e trocar `mediaUrls` aqui só faria a agenda mentir.
      laterPostId: atual?.laterPostId ?? null,
      // Compare-and-swap: se outra edição mexeu nas mídias entre a leitura
      // e agora, esta escrita desiste em vez de ressuscitar a lista velha
      ...(atual ? { mediaUrls: { equals: midiasAtuais } } : {}),
    },
    data: {
      mediaUrls: novasMidias,
      generationId: params.generationId,
      // A arte agora é uma derivação de IA, não o render da página:
      // NOT_NEEDED tira o post do alcance do cron render-stories e da
      // invalidação por edição de página — que zerariam mediaUrls e
      // voltariam a arte crua por cima da melhoria.
      renderStatus: 'NOT_NEEDED',
      nextRenderAt: null,
      renderError: null,
      // Mexido agora: uma rodada do sync que já estava listando não fala por cima.
      ...(atual?.laterPostId ? { lastSyncAt: new Date() } : {}),
    },
  })
  if (updated.count === 0) return naoAplicada('o post mudou de estado ou de mídias no meio do caminho')
  return { aplicada: true, indice, total: novasMidias.length }
}
