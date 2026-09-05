/**
 * Prova que remarcar um post leva as páginas da arte junto.
 *
 * Exercita o caminho REAL (`reagendarPost`, o mesmo que a tool do conector
 * chama) num post RASCUNHO, leva-o para outra semana, confere pasta+nome+ordem
 * e devolve para a data original. Reversível por construção: a segunda
 * remarcação desfaz a primeira, e o script confere que voltou ao estado de
 * partida antes de dar por encerrado.
 *
 *   npx tsx scripts/validar-refile-ao-remarcar.ts <postId>
 *
 * Só aceita post em RASCUNHO — remarcar publicação de verdade não é teste.
 */
import 'dotenv/config'

import { db } from '@/lib/db'
import { reagendarPost } from '@/lib/posts/agenda-acoes'

/** "AAAA-MM-DD HH:mm" no fuso de Brasília — a forma que `parseBRT` espera. */
function brt(d: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const v = (t: string) => p.find((x) => x.type === t)!.value
  return `${v('year')}-${v('month')}-${v('day')} ${v('hour')}:${v('minute')}`
}

const fmt = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d)

/** As páginas do post, com a pasta em que estão. */
async function retrato(postId: string) {
  const post = await db.socialPost.findUnique({ where: { id: postId }, select: { pageId: true, mediaUrls: true, id: true } })
  const ids = new Set<string>()
  if (post?.pageId) ids.add(post.pageId)
  const urls = Array.isArray(post?.mediaUrls) ? (post!.mediaUrls as unknown[]).map(String) : []
  if (urls.length > 1) {
    for (const u of urls) {
      const m = (u.split('/').pop() ?? '').match(/^(c[a-z0-9]+)-\d{13}\./)
      if (m && m[1] !== post!.id) ids.add(m[1])
    }
  }
  const pages = await db.page.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, name: true, order: true, Template: { select: { name: true } } },
    orderBy: { order: 'asc' },
  })
  return pages.map((p) => ({ id: p.id, nome: p.name, ordem: p.order, pasta: p.Template.name }))
}

async function main() {
  const postId = process.argv[2]
  if (!postId) { console.error('uso: npx tsx scripts/validar-refile-ao-remarcar.ts <postId>'); process.exit(1) }

  const post = await db.socialPost.findUnique({ where: { id: postId }, select: { status: true, scheduledDatetime: true, projectId: true } })
  if (!post) { console.error('post não encontrado'); process.exit(1) }
  if (post.status !== 'DRAFT') { console.error(`ABORTADO: o post está ${post.status}; este teste só roda em rascunho.`); process.exit(1) }
  const original = post.scheduledDatetime!
  const destino = new Date(original.getTime() + 14 * 24 * 60 * 60 * 1000)

  const antes = await retrato(postId)
  console.log(`\nANTES — post em ${fmt(original)}`)
  antes.forEach((p) => console.log(`   [${p.pasta}] ord=${p.ordem}  ${p.nome}`))
  if (antes.length === 0) { console.error('ABORTADO: este post não tem página; o teste não provaria nada.'); process.exit(1) }

  await reagendarPost({ projectId: post.projectId, postId, novaDataHora: brt(destino) })
  const depois = await retrato(postId)
  console.log(`\nDEPOIS de remarcar para ${fmt(destino)}`)
  depois.forEach((p) => console.log(`   [${p.pasta}] ord=${p.ordem}  ${p.nome}`))

  const mudouPasta = depois.filter((p, i) => p.pasta !== antes[i]?.pasta).length
  const mudouNome = depois.filter((p, i) => p.nome !== antes[i]?.nome).length
  console.log(`\n   páginas que mudaram de pasta: ${mudouPasta}/${antes.length}`)
  console.log(`   páginas que mudaram de nome:  ${mudouNome}/${antes.length}`)

  await reagendarPost({ projectId: post.projectId, postId, novaDataHora: brt(original) })
  const volta = await retrato(postId)
  const voltouIgual = JSON.stringify(volta) === JSON.stringify(antes)
  console.log(`\nDE VOLTA para ${fmt(original)} — estado idêntico ao inicial: ${voltouIgual ? 'SIM' : 'NÃO'}`)
  if (!voltouIgual) {
    console.log('   esperado:'); antes.forEach((p) => console.log(`     [${p.pasta}] ord=${p.ordem}  ${p.nome}`))
    console.log('   obtido:');   volta.forEach((p) => console.log(`     [${p.pasta}] ord=${p.ordem}  ${p.nome}`))
  }

  const ok = mudouPasta === antes.length && mudouNome === antes.length && voltouIgual
  console.log(`\n${ok ? '✅ PASSOU' : '❌ FALHOU'}: remarcar ${ok ? 'levou' : 'NÃO levou'} as páginas junto, e o teste é reversível.`)
  process.exitCode = ok ? 0 : 1
}
main().finally(() => db.$disconnect())
