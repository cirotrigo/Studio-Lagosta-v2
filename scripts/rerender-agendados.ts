/**
 * Força o re-render dos posts agendados que já têm arte gravada.
 *
 * Para quando o código de render muda (ex.: a sombra que nunca era desenhada,
 * corrigida em 1ae1c31) ou quando o dado da página foi saneado por script:
 * o cron `render-stories` nunca revisita um post RENDERED, então a arte velha
 * seria publicada mesmo com o código novo no ar.
 *
 * Seleciona por critério (SCHEDULED + página + RENDERED), não por ids — assim
 * pega também posts que renderizaram entre o push e o deploy.
 *
 * ⚠️  Rodar com --apply SÓ DEPOIS do deploy estar no ar: invalidar antes faz o
 * cron re-renderizar com o código velho, e o resultado é o mesmo de hoje.
 *
 * Posts publicando em menos de 15 minutos são pulados por padrão: se o
 * re-render falhar 3x o post vira FAILED, e em cima da hora não há tempo de
 * ninguém reagir. Use --incluir-proximos para forçar.
 *
 * Uso:
 *   npx tsx scripts/rerender-agendados.ts                      # dry-run (padrão)
 *   npx tsx scripts/rerender-agendados.ts --apply              # grava
 *   npx tsx scripts/rerender-agendados.ts --apply --incluir-proximos
 */
import { PrismaClient } from '@prisma/client'
import { invalidateScheduledRenders } from '../src/lib/posts/invalidate-renders'

const db = new PrismaClient()

const APPLY = process.argv.includes('--apply')
const INCLUIR_PROXIMOS = process.argv.includes('--incluir-proximos')
const MARGEM_MIN = 15

async function main() {
  console.log(
    APPLY
      ? '⚠️  MODO APPLY — os renders serão invalidados e o cron re-renderiza em até 2 min\n'
      : '🔍 DRY-RUN — nada será gravado (use --apply para gravar)\n',
  )

  const posts = await db.socialPost.findMany({
    where: { status: 'SCHEDULED', pageId: { not: null }, renderStatus: 'RENDERED' },
    select: {
      id: true,
      scheduledDatetime: true,
      renderedAt: true,
      pageId: true,
      templateId: true,
    },
    orderBy: { scheduledDatetime: 'asc' },
  })

  if (posts.length === 0) {
    console.log('nenhum post SCHEDULED com render gravado.')
    return
  }

  const agora = Date.now()
  const alvos: typeof posts = []

  for (const p of posts) {
    const page = p.pageId
      ? await db.page.findUnique({ where: { id: p.pageId }, select: { updatedAt: true } })
      : null
    const desatualizado = p.renderedAt && page && page.updatedAt > p.renderedAt
    const minutos = p.scheduledDatetime
      ? Math.round((p.scheduledDatetime.getTime() - agora) / 60_000)
      : null
    const emCima = minutos !== null && minutos >= 0 && minutos < MARGEM_MIN

    const marca = emCima && !INCLUIR_PROXIMOS ? '⏭  PULADO (publica em breve)' : ''
    console.log(
      `${p.scheduledDatetime?.toISOString() ?? 'sem data'} · publica em ${minutos ?? '?'} min · render ${p.renderedAt?.toISOString() ?? '?'}${desatualizado ? ' · ⚠️ página editada depois' : ''} ${marca}`,
    )
    console.log(`   post ${p.id} · tpl ${p.templateId} · page ${p.pageId}`)

    if (emCima && !INCLUIR_PROXIMOS) continue
    alvos.push(p)
  }

  console.log(`\n${alvos.length} de ${posts.length} posts serão re-renderizados`)

  if (!APPLY) {
    console.log('\n🔍 dry-run: nada foi gravado.')
    return
  }

  if (alvos.length === 0) {
    console.log('nada a fazer.')
    return
  }

  // Por postIds, não por página: um post pulado pela guarda de 15 min pode
  // dividir a página com um alvo, e não pode ser arrastado junto
  const count = await invalidateScheduledRenders(db, { postIds: alvos.map((p) => p.id) })
  console.log(`\n✅ ${count} post(s) invalidado(s) — o cron re-renderiza em até 2 min.`)

  // Conferência: nenhum dos alvos deve seguir RENDERED
  const sobras = await db.socialPost.count({
    where: { id: { in: alvos.map((p) => p.id) }, renderStatus: 'RENDERED' },
  })
  console.log(sobras === 0 ? '✅ conferência: todos voltaram a PENDING.' : `❌ conferência: ${sobras} ainda RENDERED.`)
}

main()
  .catch((error) => {
    console.error('Falhou:', error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
