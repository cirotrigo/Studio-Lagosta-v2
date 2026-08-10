/**
 * Vigência da campanha × horário do post — AVISO, nunca veto.
 *
 * Post marcado como CAMPANHA aponta (frouxamente, sem foreign key) para uma
 * entrada CAMPANHAS da base de conhecimento. Se essa entrada tem prazo
 * (`expiresAt`) e o post está marcado para DEPOIS dele, alguém precisa saber
 * — publicar "última semana do festival" com o festival encerrado é o erro
 * clássico que ninguém vê a tempo.
 *
 * Mas é aviso: a campanha pode ter sido prorrogada, o prazo pode estar
 * desatualizado na base, e barrar a publicação por causa de um metadado seria
 * pior do que publicar. Quem chama repassa o texto; a decisão continua sendo
 * de gente.
 *
 * Leitura DEFENSIVA de propósito: `expiresAt` existe no schema mas quem passa
 * a preenchê-lo é outra frente (F0.1). Entrada sem prazo, entrada que não
 * existe mais e erro de consulta produzem o mesmo resultado — nenhum aviso —
 * em vez de derrubar a agenda ou a aprovação.
 */

import { db } from '@/lib/db'

export interface PostParaVigencia {
  id: string
  campaignId: string | null
  scheduledDatetime: Date | null
}

/** Só a data importa aqui: prazo de campanha é dia, não minuto. */
function dataBRT(d: Date): string {
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

/**
 * Mapa postId → aviso, apenas para os posts cuja campanha já terá terminado.
 * Posts sem campanha, sem horário ou com campanha sem prazo ficam de fora.
 */
export async function avisosDeCampanhaVencida(
  projectId: number,
  posts: PostParaVigencia[],
): Promise<Map<string, string>> {
  const avisos = new Map<string, string>()

  const ids = Array.from(
    new Set(
      posts
        .filter((p) => p.campaignId && p.scheduledDatetime)
        .map((p) => p.campaignId as string),
    ),
  )
  if (ids.length === 0) return avisos

  try {
    const entradas = await db.knowledgeBaseEntry.findMany({
      where: { id: { in: ids }, projectId },
      select: { id: true, title: true, expiresAt: true },
    })
    const porId = new Map(entradas.map((e) => [e.id, e]))

    for (const post of posts) {
      if (!post.campaignId || !post.scheduledDatetime) continue
      const entrada = porId.get(post.campaignId)
      // Campanha sem prazo, ou que já não existe neste projeto: silêncio. O
      // ponteiro é frouxo de propósito (sem FK) — apagar a entrada não pode
      // encher a agenda de alerta sobre algo que ninguém pode consertar.
      if (!entrada?.expiresAt) continue
      if (post.scheduledDatetime.getTime() <= entrada.expiresAt.getTime()) continue

      avisos.set(
        post.id,
        `A campanha "${entrada.title}" termina em ${dataBRT(entrada.expiresAt)}, ` +
          `antes deste post (${dataBRT(post.scheduledDatetime)}). Confirme se a campanha foi ` +
          `prorrogada ou troque o conteúdo — o post não foi bloqueado.`,
      )
    }
  } catch (error) {
    // Aviso é acessório: falha aqui não pode derrubar aprovação nem agenda.
    console.error('[campanha-vigencia] falha ao ler a vigência das campanhas:', error)
  }

  return avisos
}
