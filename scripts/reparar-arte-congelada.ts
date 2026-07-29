/**
 * Repara os posts cuja arte ficou congelada no PNG do momento da criação.
 *
 * Post criado pelo chat (`colocar-na-agenda` → `agendarPost`) copiava o PNG da
 * página para `mediaUrls` e gravava `renderStatus: NOT_NEEDED` — "esta arte não
 * vem de render". Com isso, editar a página no editor não mexia no post:
 * `invalidateScheduledRenders` só enxerga RENDERED/PENDING/RENDERING. A agenda
 * seguia mostrando a arte velha, e a aprovação publicava ela.
 *
 * O código novo grava RENDERED + renderedImageUrl para essas artes, então elas
 * passam a ser invalidadas normalmente. Este script acerta as linhas antigas:
 *
 *   - página editada depois do post criado → volta para a fila de render
 *     (PENDING, mídia limpa) e o cron gera a arte atual em até 2 min;
 *   - página intocada → só troca NOT_NEEDED por RENDERED, para que a PRÓXIMA
 *     edição invalide como deve.
 *
 * ⚠️  Rodar com --apply só depois do deploy no ar: o cron `render-stories` em
 * produção precisa já aceitar rascunho, senão o post fica PENDING sem ninguém
 * para renderizar — ou seja, sem arte nenhuma.
 *
 * Agendado que publica em menos de 15 minutos é pulado (re-render falhando 3x
 * marca o post como FAILED, e em cima da hora não há tempo de reagir).
 *
 * Uso:
 *   npx tsx scripts/reparar-arte-congelada.ts                    # dry-run
 *   npx tsx scripts/reparar-arte-congelada.ts --apply
 *   npx tsx scripts/reparar-arte-congelada.ts --apply --projeto 6
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const APPLY = process.argv.includes('--apply')
const MARGEM_MIN = 15

const idxProjeto = process.argv.indexOf('--projeto')
const PROJETO = idxProjeto >= 0 ? Number(process.argv[idxProjeto + 1]) : null

/** Artes geradas pelo fluxo de criativos vivem neste prefixo no Blob. */
const PREFIXO_ARTE = '/arte-rapida/'

const formatarBRT = (d: Date) =>
  d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

async function main() {
  console.log(
    APPLY
      ? '⚠️  MODO APPLY — os posts serão corrigidos no banco\n'
      : '🔍 DRY-RUN — nada será gravado (use --apply para gravar)\n',
  )

  const posts = await db.socialPost.findMany({
    where: {
      status: { in: ['DRAFT', 'SCHEDULED'] },
      pageId: { not: null },
      renderStatus: 'NOT_NEEDED',
      ...(PROJETO ? { projectId: PROJETO } : {}),
    },
    select: {
      id: true,
      projectId: true,
      status: true,
      createdAt: true,
      scheduledDatetime: true,
      mediaUrls: true,
      pageId: true,
    },
    orderBy: { scheduledDatetime: 'asc' },
  })

  // Só as artes que vieram de um render da página. Post com mídia trazida de
  // fora (upload, Drive) é NOT_NEEDED de verdade — re-renderizar trocaria a
  // imagem do usuário pelo desenho da página.
  const candidatos = posts.filter(
    (p) => p.mediaUrls.length === 1 && p.mediaUrls[0]?.includes(PREFIXO_ARTE),
  )

  if (candidatos.length === 0) {
    console.log('Nenhum post com arte congelada. Nada a fazer.')
    return
  }

  const paginas = await db.page.findMany({
    where: { id: { in: candidatos.map((p) => p.pageId!) } },
    select: { id: true, updatedAt: true },
  })
  const atualizadaEm = new Map(paginas.map((p) => [p.id, p.updatedAt]))

  const agora = Date.now()
  const reRenderizar: typeof candidatos = []
  const soMarcar: typeof candidatos = []
  const pulados: Array<{ id: string; motivo: string }> = []

  for (const post of candidatos) {
    const pageUpdatedAt = atualizadaEm.get(post.pageId!)
    if (!pageUpdatedAt) {
      pulados.push({ id: post.id, motivo: 'página não encontrada' })
      continue
    }

    const paginaMudou = pageUpdatedAt.getTime() > post.createdAt.getTime()

    if (!paginaMudou) {
      soMarcar.push(post)
      continue
    }

    if (
      post.status === 'SCHEDULED' &&
      post.scheduledDatetime &&
      post.scheduledDatetime.getTime() - agora < MARGEM_MIN * 60_000
    ) {
      pulados.push({
        id: post.id,
        motivo: `publica em menos de ${MARGEM_MIN} min (${formatarBRT(post.scheduledDatetime)})`,
      })
      continue
    }

    reRenderizar.push(post)
  }

  console.log(`${candidatos.length} post(s) com arte vinda de render da página:\n`)

  for (const post of reRenderizar) {
    console.log(
      `  ♻️  ${post.id}  [${post.status}]  ${post.scheduledDatetime ? formatarBRT(post.scheduledDatetime) : 'sem data'}  → re-render (página editada)`,
    )
  }
  for (const post of soMarcar) {
    console.log(
      `  🏷️  ${post.id}  [${post.status}]  ${post.scheduledDatetime ? formatarBRT(post.scheduledDatetime) : 'sem data'}  → só marcar RENDERED (página intocada)`,
    )
  }
  for (const p of pulados) {
    console.log(`  ⏭️  ${p.id}  → pulado: ${p.motivo}`)
  }

  if (!APPLY) {
    console.log(`\n🔍 dry-run: ${reRenderizar.length} re-render, ${soMarcar.length} remarcar.`)
    return
  }

  if (reRenderizar.length > 0) {
    const r = await db.socialPost.updateMany({
      where: { id: { in: reRenderizar.map((p) => p.id) } },
      data: {
        renderStatus: 'PENDING',
        renderedImageUrl: null,
        renderedAt: null,
        renderAttempts: 0,
        renderError: null,
        nextRenderAt: new Date(),
        mediaUrls: [],
      },
    })
    console.log(`\n♻️  ${r.count} post(s) na fila de render — o cron gera a arte em até 2 min.`)
  }

  for (const post of soMarcar) {
    await db.socialPost.update({
      where: { id: post.id },
      data: {
        renderStatus: 'RENDERED',
        renderedImageUrl: post.mediaUrls[0],
        renderedAt: post.createdAt,
      },
    })
  }
  if (soMarcar.length > 0) {
    console.log(`🏷️  ${soMarcar.length} post(s) remarcados — a próxima edição da página já invalida.`)
  }
}

main()
  .catch((error) => {
    console.error('Falhou:', error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
