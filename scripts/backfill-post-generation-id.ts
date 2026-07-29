/**
 * Preenche `SocialPost.generationId` nos posts criados antes do vínculo existir.
 *
 * Até 29/07/2026 o `agendarPost` (chat → `colocar-na-agenda`) jogava fora o id
 * da Generation que o `criar-arte` acabara de criar. Sem esse vínculo a rota
 * POST /api/generations/{id}/improve não tem o que melhorar, e o botão
 * "Melhorar com IA" não aparece no post da agenda.
 *
 * O casamento é feito por `Generation.resultUrl === SocialPost.mediaUrls[0]`:
 * a arte do post é literalmente o PNG que a Generation gravou no Blob, e o
 * sufixo aleatório do Blob (`addRandomSuffix`) torna a URL única — não há como
 * duas artes diferentes colidirem. É a mesma regra que o `agendarPost` novo usa
 * quando o chamador não informa o id.
 *
 * Post cuja mídia veio de fora (upload, Drive, import do Zernio) não casa com
 * Generation nenhuma e é reportado como sem correspondência — o esperado.
 *
 * Só grava `generationId`. Não mexe em `mediaUrls`, `renderStatus` nem status:
 * é uma operação de religação de dados, sem efeito visual. Posts já vinculados
 * são ignorados, então rodar duas vezes é inofensivo.
 *
 * ⚠️  COBERTURA MEDIDA EM 29/07/2026 (7.616 posts): recupera QUASE NADA.
 * Dos 39 posts DRAFT/SCHEDULED sem vínculo, zero casaram; em todos os status,
 * só 9 casaram e todos já estavam POSTED. O motivo é que a URL do post quase
 * nunca é a mesma da Generation:
 *
 *   - 31 dos 39 não têm `pageId` — a mídia veio de upload, Drive ou import,
 *     nunca passou por uma Generation;
 *   - os 8 com `pageId` têm `Page.thumbnail` sobrescrito em base64 pelo
 *     PageSync, então nem o caminho post→página→Generation resolve;
 *   - o modal de agendar do editor e o /gerar-criativo sobem a arte por
 *     `/api/upload`, gerando um segundo blob com outro sufixo aleatório;
 *   - `reparar-arte-congelada --apply` trocou a mídia de vários posts pelo
 *     re-render (`/posts/rendered/...`), apagando a URL original.
 *
 * Ou seja: este script serve para o caso raro em que a arte do post ainda é
 * literalmente o arquivo da Generation. Para destravar os posts históricos de
 * verdade, o caminho é a Generation sintética (criar uma a partir da arte atual
 * do post na hora de melhorar), não o backfill.
 *
 * Uso:
 *   npx dotenv-cli -e .env -- npx tsx scripts/backfill-post-generation-id.ts                  # dry-run
 *   npx dotenv-cli -e .env -- npx tsx scripts/backfill-post-generation-id.ts --apply
 *   npx dotenv-cli -e .env -- npx tsx scripts/backfill-post-generation-id.ts --apply --projeto 6
 *   npx dotenv-cli -e .env -- npx tsx scripts/backfill-post-generation-id.ts --status SCHEDULED
 */
import { PrismaClient, PostStatus } from '@prisma/client'

const db = new PrismaClient()

const APPLY = process.argv.includes('--apply')

const idxProjeto = process.argv.indexOf('--projeto')
const PROJETO = idxProjeto >= 0 ? Number(process.argv[idxProjeto + 1]) : null

const idxStatus = process.argv.indexOf('--status')
const STATUS_ARG = idxStatus >= 0 ? process.argv[idxStatus + 1]?.toUpperCase() : null

/**
 * Por padrão cobre o que ainda pode ser melhorado ou aprovado. POSTED/FAILED
 * ficam de fora: religar não muda nada neles e só polui a saída — passe
 * --status POSTED se quiser a linhagem histórica também.
 */
const STATUS_PADRAO: PostStatus[] = ['DRAFT', 'SCHEDULED']
const STATUS = STATUS_ARG ? ([STATUS_ARG] as PostStatus[]) : STATUS_PADRAO

const formatarBRT = (d: Date | null) =>
  d ? d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : 'sem data'

async function main() {
  console.log(
    APPLY
      ? '⚠️  MODO APPLY — o vínculo será gravado no banco\n'
      : '🔍 DRY-RUN — nada será gravado (use --apply para gravar)\n',
  )
  console.log(`Status: ${STATUS.join(', ')}${PROJETO ? ` · projeto ${PROJETO}` : ' · todos os projetos'}\n`)

  const posts = await db.socialPost.findMany({
    where: {
      generationId: null,
      status: { in: STATUS },
      ...(PROJETO ? { projectId: PROJETO } : {}),
    },
    select: {
      id: true,
      projectId: true,
      status: true,
      postType: true,
      scheduledDatetime: true,
      mediaUrls: true,
    },
    orderBy: { scheduledDatetime: 'asc' },
  })

  if (posts.length === 0) {
    console.log('Nenhum post sem vínculo. Nada a fazer.')
    return
  }

  const comMidia = posts.filter((p) => p.mediaUrls.length > 0 && !!p.mediaUrls[0])
  const semMidia = posts.filter((p) => p.mediaUrls.length === 0 || !p.mediaUrls[0])

  // Uma consulta só para todas as URLs — evita N queries num backfill grande.
  const urls = [...new Set(comMidia.map((p) => p.mediaUrls[0]))]
  const generations = await db.generation.findMany({
    where: { resultUrl: { in: urls } },
    select: { id: true, projectId: true, resultUrl: true, templateName: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  /** Chave projeto+url: nunca vincular a Generation de outro cliente. */
  const porUrl = new Map<string, typeof generations>()
  for (const gen of generations) {
    if (!gen.resultUrl) continue
    const chave = `${gen.projectId}::${gen.resultUrl}`
    const lista = porUrl.get(chave) ?? []
    lista.push(gen)
    porUrl.set(chave, lista)
  }

  const casados: Array<{ postId: string; generationId: string; rotulo: string; status: string; quando: string }> = []
  const semMatch: typeof comMidia = []
  const ambiguos: Array<{ postId: string; quantas: number }> = []

  for (const post of comMidia) {
    const candidatas = porUrl.get(`${post.projectId}::${post.mediaUrls[0]}`) ?? []

    if (candidatas.length === 0) {
      semMatch.push(post)
      continue
    }
    if (candidatas.length > 1) {
      // Praticamente impossível com o sufixo aleatório do Blob, mas se
      // acontecer é melhor deixar para inspeção manual do que chutar.
      ambiguos.push({ postId: post.id, quantas: candidatas.length })
      continue
    }

    casados.push({
      postId: post.id,
      generationId: candidatas[0].id,
      rotulo: candidatas[0].templateName ?? 'Criativo',
      status: post.status,
      quando: formatarBRT(post.scheduledDatetime),
    })
  }

  console.log(`${posts.length} post(s) sem vínculo:\n`)

  for (const c of casados) {
    console.log(`  🔗 ${c.postId}  [${c.status}]  ${c.quando}  → ${c.generationId} (${c.rotulo})`)
  }
  for (const p of semMatch) {
    const url = p.mediaUrls[0]
    const curta = url.length > 60 ? `…${url.slice(-55)}` : url
    console.log(`  ➖ ${p.id}  [${p.status}]  sem Generation correspondente — ${curta}`)
  }
  for (const a of ambiguos) {
    console.log(`  ⚠️  ${a.postId}  ${a.quantas} Generations com a mesma URL — pulado, verifique à mão`)
  }
  for (const p of semMidia) {
    console.log(`  ⬜ ${p.id}  [${p.status}]  sem mídia (arte ainda não renderizada)`)
  }

  const resumo = `${casados.length} vinculável(is), ${semMatch.length} sem correspondência, ${ambiguos.length} ambíguo(s), ${semMidia.length} sem mídia`

  if (!APPLY) {
    console.log(`\n🔍 dry-run: ${resumo}.`)
    console.log('Rode de novo com --apply para gravar.')
    return
  }

  if (casados.length === 0) {
    console.log(`\nNada a gravar. ${resumo}.`)
    return
  }

  let gravados = 0
  for (const c of casados) {
    // updateMany com o guard de generationId null: se outro caminho vincular o
    // post entre o dry-run e o apply, não sobrescreve.
    const r = await db.socialPost.updateMany({
      where: { id: c.postId, generationId: null },
      data: { generationId: c.generationId },
    })
    gravados += r.count
  }

  console.log(`\n✅ ${gravados} post(s) vinculado(s). ${resumo}.`)
  if (gravados < casados.length) {
    console.log(`   (${casados.length - gravados} já tinham sido vinculados por outro caminho)`)
  }
  console.log('   Os aprovados agora mostram "Melhorar com IA" na agenda.')
}

main()
  .catch((error) => {
    console.error('Falhou:', error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
