/**
 * Fecha a proposta da faixa "Repostar" quando o post nasce.
 *
 * O desfecho é CALCULADO aqui, nunca declarado pela tela: a proposta para o
 * slot (projeto, dia, hora) é achada pela chave de idempotência, e a mídia do
 * post criado é comparada com os candidatos. Bateu por imagem ou por
 * Generation → `aceita-como-veio`; a faixa existia e a pessoa usou outra
 * coisa → `trocada`. Sem proposta para o slot (post criado pelo conector, ou
 * a faixa nunca apareceu), não há o que fechar — e nada vira aceitação por
 * omissão.
 *
 * Nunca lança: registrar aprendizado não pode impedir alguém de agendar.
 */
import { db } from '@/lib/db'
import { registrarDesfecho, sugestoesJaEmitidas } from '@/lib/aprendizado/captura'
import { chaveDaImagem } from '@/lib/posts/repostar'
import { chaveDoRepost } from '@/lib/posts/repostar-service'

interface CandidatoGravado {
  chave?: string
  generationId?: string | null
}

export async function fecharPropostaDeRepost(entrada: {
  projectId: number
  quando: Date
  postId: string
  mediaUrl: string | null | undefined
  generationId: string | null | undefined
  /** `User.id` INTERNO (cuid), nunca o clerkId. */
  decididoPor?: string | null
}): Promise<'aceita-como-veio' | 'trocada' | null> {
  try {
    const chave = chaveDoRepost(entrada.projectId, entrada.quando)
    const existentes = await sugestoesJaEmitidas([chave])
    const sugestaoId = existentes.get(chave)
    if (!sugestaoId) return null

    const sinal = await db.learningSignal.findUnique({
      where: { id: sugestaoId },
      select: { sugerido: true },
    })
    const candidatos = ((sinal?.sugerido as { candidatos?: CandidatoGravado[] } | null)?.candidatos ?? []) as CandidatoGravado[]
    const chaveMidia = entrada.mediaUrl ? chaveDaImagem(entrada.mediaUrl) : null
    const bateu = candidatos.some(
      (c) => (chaveMidia && c.chave === chaveMidia) || (entrada.generationId && c.generationId === entrada.generationId),
    )
    const desfecho = bateu ? 'aceita-como-veio' : 'trocada'

    await registrarDesfecho({
      sugestaoId,
      desfecho,
      escolhido: { chave: chaveMidia, generationId: entrada.generationId ?? null, postId: entrada.postId },
      postId: entrada.postId,
      generationId: entrada.generationId ?? null,
      decididoPor: entrada.decididoPor ?? null,
      superficie: 'agenda',
    })
    return desfecho
  } catch (erro) {
    console.error('[sinal-de-repost] não fechou a proposta (seguindo):', erro)
    return null
  }
}
