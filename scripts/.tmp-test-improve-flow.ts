/**
 * E2E do fluxo "melhoria como acabamento" (01/08): gate de rascunho,
 * agendarPost por generationId, pedido de 1200. Sem gastar melhoria real.
 */
import { db } from '@/lib/db'
import { startImprovement } from '@/lib/ai/creative-improvement-service'
import { agendarPost } from '@/lib/creatives/agendar'

const CLERK = 'user_3348L5utqkVPHDPW0cTFzGzsLnD'
let falhas = 0
const check = (c: boolean, l: string) => { console.log(`${c ? '  ✓' : '  ✗ FALHOU'} — ${l}`); if (!c) falhas++ }

async function main() {
  const cleanup: string[] = []
  const posts: string[] = []
  try {
    // Generation de apoio (sem custo — linha direta com uma imagem existente)
    const gen = await db.generation.create({
      data: {
        templateId: 198, projectId: 7, status: 'COMPLETED', createdBy: CLERK,
        resultUrl: 'https://2rhsgfleozgl5jbm.public.blob.vercel-storage.com/drive-cache/1p01BBwHdWmZ4D8F_lCSPr-2IVKrquiKI-s1920.jpg',
        fieldValues: { source: 'arte-rapida', slotValues: { titulo: 'TESTE' } },
        templateName: 'E2E', projectName: 'By Rock', completedAt: new Date(),
      }, select: { id: true },
    })
    cleanup.push(gen.id)

    console.log('\n[1] agendarPost só com generationId resolve a mídia')
    const post = await agendarPost({ projectId: 7, scheduledDatetime: '2026-08-10 15:00', generationId: gen.id, caption: 'E2E flow — apagar' })
    posts.push(post.postId)
    check(post.imagens.length === 1 && post.imagens[0].includes('drive-cache'), `mídia resolvida: ${post.imagens[0].slice(0, 80)}`)
    const row = await db.socialPost.findUniqueOrThrow({ where: { id: post.postId }, select: { renderStatus: true, status: true } })
    check(row.renderStatus === 'NOT_NEEDED', `renderStatus NOT_NEEDED (arte não vem de página): ${row.renderStatus}`)
    check(row.status === 'DRAFT', 'nasceu rascunho')

    console.log('\n[2] melhorar aceita postId de RASCUNHO (job criado, runner não roda)')
    const started = await startImprovement({ generationId: gen.id, applyToPostId: post.postId, actorClerkId: CLERK, userRequest: 'x'.repeat(1100) })
    cleanup.push(started.jobGenerationId)
    check(!started.reused && Boolean(started.runnerArgs), `job criado para rascunho (${started.jobGenerationId})`)
    check(started.runnerArgs!.userRequest.length === 1100, 'pedido de 1100 chars aceito (teto novo 1200)')

    console.log('\n[3] recusas que ficam')
    try { await startImprovement({ generationId: gen.id, actorClerkId: CLERK, userRequest: 'x'.repeat(1300) }); check(false, '1300 chars deveria recusar') }
    catch (e: any) { check(e?.code === 'PEDIDO_LONGO', `1300 chars: ${e?.code}`) }
    await db.socialPost.update({ where: { id: post.postId }, data: { status: 'FAILED' } })
    try { await startImprovement({ generationId: gen.id, applyToPostId: post.postId, actorClerkId: CLERK }); check(false, 'FAILED deveria recusar') }
    catch (e: any) { check(e?.code === 'POST_NAO_MELHORAVEL', `FAILED: ${e?.code}`) }
  } finally {
    console.log('\n[cleanup]')
    if (posts.length) console.log('  posts:', (await db.socialPost.deleteMany({ where: { id: { in: posts } } })).count)
    if (cleanup.length) console.log('  generations:', (await db.generation.deleteMany({ where: { id: { in: cleanup } } })).count)
    await db.$disconnect()
  }
  console.log(falhas === 0 ? '\n✅ E2E passou' : `\n❌ ${falhas} falha(s)`)
  process.exit(falhas ? 1 : 0)
}
main().catch((e) => { console.error('💥', e); process.exit(1) })
