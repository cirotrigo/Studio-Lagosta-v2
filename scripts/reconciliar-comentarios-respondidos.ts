/**
 * Reconcilia a fila da Caixa com a VERDADE da Graph API: para cada
 * comentário que a fila considera pendente (projetos com token), pergunta ao
 * Instagram se ele já tem resposta — e grava a memória
 * (`ComentarioRespondido`) das que têm.
 *
 * Existe porque o Windsor serve cache: resposta publicada (pelo app, pelo
 * Farol ou pelo celular do cliente) demora minutos a horas para virar
 * reply_count lá, e a pergunta respondida voltava para a fila. O caminho
 * normal se cura sozinho (o app grava a memória ao publicar); este script
 * conserta o que foi respondido POR FORA ou antes da memória existir.
 *
 * Idempotente e barato (~1 chamada Graph por comentário pendente). Rode
 * quando a fila parecer mentir:  npx tsx scripts/reconciliar-comentarios-respondidos.ts
 */
import { db } from '../src/lib/db'
import { InstagramGraphApiClient } from '../src/lib/instagram/graph-api-client'
import { montarCaixa } from '../src/lib/caixa/itens'

async function main() {
  const projetos = (
    await db.project.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, instagramUsername: true, instagramAccessToken: true },
    })
  ).map((p) => ({
    id: p.id,
    name: p.name,
    instagramUsername: p.instagramUsername,
    temToken: !!p.instagramAccessToken,
    token: p.instagramAccessToken,
  }))

  const caixa = await montarCaixa(projetos)
  const pendentesComToken = caixa.comentarios.filter((c) => c.enviaDaqui)
  console.log(`${caixa.comentarios.length} pendentes na fila; ${pendentesComToken.length} verificáveis por token.\n`)

  let curados = 0
  for (const c of pendentesComToken) {
    const projeto = projetos.find((p) => p.id === c.projectId)!
    const cliente = new InstagramGraphApiClient(projeto.token)
    try {
      const respostas = await cliente.getCommentReplies(c.comentarioId)
      if (!respostas.length) continue
      await db.comentarioRespondido.upsert({
        where: { comentarioId: c.comentarioId },
        create: { projectId: c.projectId, comentarioId: c.comentarioId, respostaId: respostas[0].id },
        update: { respostaId: respostas[0].id },
      })
      curados++
      console.log(`✓ ${c.cliente}: "${c.texto.slice(0, 50)}" já tinha resposta (${respostas[0].timestamp ?? 's/ data'}) — fora da fila.`)
    } catch (erro) {
      console.error(`  ${c.cliente} (${c.comentarioId}): não deu para verificar — ${erro instanceof Error ? erro.message : erro}`)
    }
    await new Promise((ok) => setTimeout(ok, 150))
  }
  console.log(`\n${curados} comentário(s) reconciliado(s).`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
