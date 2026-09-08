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
 * Nunca lança — é telemetria de manutenção, e uma falha aqui não pode derrubar
 * o cleanup inteiro. Compare-and-swap sobre o array inteiro: se outra escrita
 * mexeu nas mídias entre a leitura e a gravação, esta perde e conta como
 * `perdidos`, nunca sobrescreve.
 */
import { db } from '@/lib/db'
import { substituirUrl } from './reapontar-midias-contrato'

export interface ResultadoDoReapontamento {
  posts: number
  posicoes: number
  perdidos: number
}

export async function reapontarMidiasDosPosts(
  urlAntiga: string,
  urlNova: string,
): Promise<ResultadoDoReapontamento> {
  const resultado: ResultadoDoReapontamento = { posts: 0, posicoes: 0, perdidos: 0 }
  if (!urlAntiga || !urlNova || urlAntiga === urlNova) return resultado

  try {
    const posts = await db.socialPost.findMany({
      where: { OR: [{ mediaUrls: { has: urlAntiga } }, { renderedImageUrl: urlAntiga }] },
      select: { id: true, mediaUrls: true, renderedImageUrl: true },
    })

    for (const post of posts) {
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
  }
  return resultado
}
