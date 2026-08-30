/**
 * A fila de respostas de avaliação do Google APROVADAS na Caixa de Respostas
 * e ainda não publicadas — o elo entre a equipe (que aprova no app) e a
 * sessão do Claude (que publica pelo conector Windsor, único caminho para a
 * ação `reply_to_review`; medido em 30/08/2026 que não há rota server-side).
 *
 * FLUXO DA SESSÃO PUBLICADORA (quando o Ciro pedir "publica as respostas
 * salvas"):
 *   1. `npx tsx scripts/respostas-salvas.ts` — lista a fila com tudo que a
 *      publicação precisa (locationId = account da ação, reviewId, texto).
 *   2. Para cada item, publicar via conector Windsor:
 *      execute_action { connector: 'google_my_business', action:
 *      'reply_to_review', account: <locationId>, params: { review_id:
 *      <reviewId>, comment: <respostaAprovada> } }.
 *   3. `npx tsx scripts/respostas-salvas.ts --publicada <reviewId>` — marca
 *      no banco (senão a fila oferece o item de novo na próxima sessão;
 *      responder de novo no Google SUBSTITUI, então o dano de um repique é
 *      baixo — mas marcar é o que mantém a fila honesta).
 *
 * A coleta diária das 09h reconcilia com a verdade do Google depois.
 */
import { db } from '../src/lib/db'

async function main() {
  const iMarcar = process.argv.indexOf('--publicada')
  if (iMarcar > -1) {
    const reviewId = process.argv[iMarcar + 1]
    if (!reviewId) {
      console.error('Uso: --publicada <reviewId>')
      process.exit(1)
    }
    const a = await db.avaliacaoGoogle.findUnique({ where: { reviewId } })
    if (!a?.respostaAprovada) {
      console.error('Avaliação sem resposta aprovada — nada a marcar.')
      process.exit(1)
    }
    await db.avaliacaoGoogle.update({
      where: { id: a.id },
      data: { textoResposta: a.respostaAprovada, respondidaEm: new Date() },
    })
    console.log(`Marcada como publicada: ${reviewId}`)
    return
  }

  const fila = await db.avaliacaoGoogle.findMany({
    where: { respostaAprovada: { not: null }, respondidaEm: null },
    orderBy: [{ estrelas: 'asc' }, { respostaAprovadaEm: 'asc' }],
  })
  if (!fila.length) {
    console.log('Fila vazia — nenhuma resposta aprovada aguardando publicação.')
    return
  }
  const nomes = new Map(
    (await db.project.findMany({ where: { id: { in: [...new Set(fila.map((f) => f.projectId))] } }, select: { id: true, name: true } })).map(
      (p) => [p.id, p.name],
    ),
  )
  console.log(`${fila.length} resposta(s) aprovada(s) aguardando publicação:\n`)
  for (const a of fila) {
    console.log(`— ${nomes.get(a.projectId)} · ${'★'.repeat(a.estrelas)} ${a.autor ?? 'anônimo'}`)
    console.log(`  reviewId: ${a.reviewId}`)
    console.log(`  account (locationId): ${a.locationId}`)
    console.log(`  avaliação: "${(a.texto ?? '(só a nota)').replace(/\s+/g, ' ').slice(0, 140)}"`)
    console.log(`  resposta aprovada (${a.respostaAprovadaEm?.toISOString()}):`)
    console.log(`  "${a.respostaAprovada}"\n`)
  }
  console.log('Publicar cada uma via Windsor (execute_action reply_to_review) e marcar com --publicada <reviewId>.')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
