/**
 * Reaponta as mídias dos posts quando a arte muda de endereço.
 *
 * Chamado pelo `cleanupGenerations` ANTES de apagar o blob: o post que
 * guardava a URL antiga passa a guardar a nova (o Drive), em QUALQUER status —
 * o SCHEDULED é o caso que importa. Com o repost de artes antigas, um post
 * agendado pode apontar para uma Generation de 85 dias; se o cron de domingo
 * apagar o blob sem avisar o post, o Zernio recebe uma URL morta cinco minutos
 * antes do horário.
 *
 * Post com `laterPostId` também é reapontado: a cópia que vai ao ar é a do
 * Zernio, e a nossa URL só serve à capa da agenda e ao `recover-stuck-post`,
 * que ficam certos com o endereço vivo.
 *
 * 🔴 B1d (checkpoint e): post com o contrato semântico (_slots/_papeis) é PRESERVADO — a URL dele é a provada —, e
 * o blob dessa URL não pode ser apagado (`podeApagarBlob`). ponytail: o blob fica para sempre; migrar a prova para a
 * URL nova exigiria provar a identidade dos bytes.
 *
 * Nunca lança — é telemetria de manutenção, e uma falha aqui não pode derrubar
 * o cleanup inteiro. Compare-and-swap sobre o array inteiro: se outra escrita
 * mexeu nas mídias entre a leitura e a gravação, esta perde e conta como
 * `perdidos`, nunca sobrescreve.
 */
import { db } from '@/lib/db'
import { substituirUrl } from './reapontar-midias-contrato'
import { temContratoSemantico } from '@/lib/posts/copy-segue-a-pagina'

export interface ResultadoDoReapontamento {
  posts: number
  posicoes: number
  perdidos: number
  /**
   * B1d (checkpoint e): posts com o contrato semântico NÃO reapontados — a mídia deles é a URL PROVADA
   * (`PostRenderProof` casa post + URL), e trocá-la deixaria o post sem prova para a mídia atual.
   */
  preservados: number
  /** O blob da URL antiga pode ser apagado? Não, se algum post foi preservado (ou se a leitura falhou). */
  podeApagarBlob: boolean
}

export async function reapontarMidiasDosPosts(
  urlAntiga: string,
  urlNova: string,
): Promise<ResultadoDoReapontamento> {
  const resultado: ResultadoDoReapontamento = { posts: 0, posicoes: 0, perdidos: 0, preservados: 0, podeApagarBlob: true }
  if (!urlAntiga || !urlNova || urlAntiga === urlNova) return resultado

  try {
    const posts = await db.socialPost.findMany({
      where: { OR: [{ mediaUrls: { has: urlAntiga } }, { renderedImageUrl: urlAntiga }] },
      select: { id: true, mediaUrls: true, renderedImageUrl: true, slotValues: true },
    })

    for (const post of posts) {
      if (temContratoSemantico(post.slotValues)) {
        resultado.preservados++
        resultado.podeApagarBlob = false
        continue
      }
      const { novas, posicoes } = substituirUrl(post.mediaUrls, urlAntiga, urlNova)
      const trocaRender = post.renderedImageUrl === urlAntiga
      if (posicoes.length === 0 && !trocaRender) continue

      const gravado = await db.socialPost.updateMany({
        where: { id: post.id, mediaUrls: { equals: post.mediaUrls } },
        data: {
          ...(posicoes.length > 0 ? { mediaUrls: novas } : {}),
          ...(trocaRender ? { renderedImageUrl: urlNova } : {}),
        },
      })
      if (gravado.count === 1) {
        resultado.posts++
        resultado.posicoes += posicoes.length
      } else {
        resultado.perdidos++
      }
    }
  } catch (erro) {
    console.error('[reapontarMidiasDosPosts] falhou (seguindo):', erro)
    // Sem saber quem aponta para a URL, o blob fica: pode ser a mídia provada de um post semântico.
    resultado.podeApagarBlob = false
  }
  return resultado
}
