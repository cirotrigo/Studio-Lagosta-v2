/**
 * Repara o histórico: posts cuja mídia morreu no Blob, mas cuja arte continua
 * viva na Generation (reapontada para o Drive pelo cleanup de 90 dias).
 *
 * O defeito (05/09/2026): `cleanupGenerations` apagava o blob e reapontava
 * `Generation.resultUrl` para o Drive sem tocar em `SocialPost.mediaUrls`.
 * Medido: 38% das artes de posts publicados há 60-89 dias e 40% das de 90-180
 * dias respondiam 404 — e das mortas em 60-89 dias, 13 de 19 tinham
 * `generationId`, isto é, eram recuperáveis só olhando no lugar certo. O
 * cleanup foi consertado (reaponta os posts antes de apagar); este script cuida
 * do que já tinha morrido.
 *
 * Uso:
 *   npx tsx scripts/reapontar-midias-mortas.ts                 # dry-run, 180 dias
 *   npx tsx scripts/reapontar-midias-mortas.ts --dias=365
 *   npx tsx scripts/reapontar-midias-mortas.ts --projeto=3
 *   npx tsx scripts/reapontar-midias-mortas.ts --confirmar     # grava
 *
 * O que ele faz:
 * 1. Lê os posts do período com mídia no Vercel Blob e confere cada URL
 *    distinta por HEAD (concorrência 10).
 * 2. Para cada mídia morta, resolve pela Generation do post (`generationId` →
 *    `resultUrl`, que precisa estar viva). Sem Generation, ou com a Generation
 *    também morta, não há conserto — sai no relatório, não some.
 * 3. Com `--confirmar`, troca por posição com compare-and-swap (nunca reduz a
 *    contagem de mídias). Post SCHEDULED/DRAFT com mídia morta é listado à
 *    parte: ali a troca é mais delicada (é o que vai ao ar) e merece olho.
 *
 * Não cria nada, não apaga nada, não gasta crédito.
 */
import { db } from '../src/lib/db'
import { ehUrlDoBlob, substituirUrl } from '../src/lib/cleanup/reapontar-midias-contrato'

const arg = (nome: string) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.split('=')[1]
const CONFIRMAR = process.argv.includes('--confirmar')
const DIAS = Number(arg('dias') ?? 180)
const PROJETO = arg('projeto') ? Number(arg('projeto')) : undefined
const CONCORRENCIA = 10

async function viva(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'follow' })
    if (r.ok) return true
    // Alguns hosts recusam HEAD; um GET de 1 byte decide.
    if (r.status === 405 || r.status === 403) {
      const g = await fetch(url, { headers: { Range: 'bytes=0-0' } })
      return g.ok || g.status === 206
    }
    return false
  } catch {
    return false
  }
}

async function conferir(urls: string[]): Promise<Map<string, boolean>> {
  const estado = new Map<string, boolean>()
  let i = 0
  await Promise.all(
    Array.from({ length: CONCORRENCIA }, async () => {
      while (i < urls.length) {
        const u = urls[i++]
        estado.set(u, await viva(u))
        if (estado.size % 500 === 0) console.log(`  … ${estado.size}/${urls.length} conferidas`)
      }
    }),
  )
  return estado
}

async function main() {
  const desde = new Date(Date.now() - DIAS * 86_400_000)
  console.log(`${CONFIRMAR ? '🔴 GRAVANDO' : 'dry-run'} — posts desde ${desde.toISOString().slice(0, 10)}${PROJETO ? `, projeto ${PROJETO}` : ''}`)

  const posts = await db.socialPost.findMany({
    where: {
      ...(PROJETO ? { projectId: PROJETO } : {}),
      OR: [{ sentAt: { gte: desde } }, { scheduledDatetime: { gte: desde } }],
    },
    select: {
      id: true, projectId: true, status: true, postType: true, mediaUrls: true,
      generationId: true, laterPostId: true, sentAt: true, scheduledDatetime: true,
    },
  })
  const comBlob = posts.filter((p) => p.mediaUrls.some(ehUrlDoBlob))
  const urls = [...new Set(comBlob.flatMap((p) => p.mediaUrls.filter(ehUrlDoBlob)))]
  console.log(`posts no período: ${posts.length} | com mídia no Blob: ${comBlob.length} | URLs distintas a conferir: ${urls.length}`)

  const estado = await conferir(urls)
  const mortas = new Set([...estado.entries()].filter(([, ok]) => !ok).map(([u]) => u))
  console.log(`URLs mortas: ${mortas.size}`)

  const afetados = comBlob.filter((p) => p.mediaUrls.some((u) => mortas.has(u)))
  const genIds = [...new Set(afetados.map((p) => p.generationId).filter(Boolean) as string[])]
  const gens = await db.generation.findMany({
    where: { id: { in: genIds } },
    select: { id: true, resultUrl: true },
  })
  const genPorId = new Map(gens.map((g) => [g.id, g.resultUrl]))

  // A URL da Generation também precisa estar viva — senão trocaríamos morta por morta.
  const urlsDeGen = [...new Set([...genPorId.values()].filter(Boolean) as string[])]
  const vivasDeGen = await conferir(urlsDeGen)

  const projetos = new Map((await db.project.findMany({ select: { id: true, name: true } })).map((p) => [p.id, p.name]))
  const porProjeto = new Map<number, { mortos: number; reparaveis: number; semGen: number; genMorta: number; naoPublicados: number }>()
  const linha = (id: number) => {
    const l = porProjeto.get(id) ?? { mortos: 0, reparaveis: 0, semGen: 0, genMorta: 0, naoPublicados: 0 }
    porProjeto.set(id, l)
    return l
  }

  const reparos: Array<{ post: (typeof afetados)[number]; novas: string[]; posicoes: number[] }> = []
  const delicados: string[] = []
  for (const post of afetados) {
    const l = linha(post.projectId)
    l.mortos++
    const nova = post.generationId ? genPorId.get(post.generationId) ?? null : null
    if (!nova) { l.semGen++; continue }
    if (!vivasDeGen.get(nova)) { l.genMorta++; continue }

    let novas = [...post.mediaUrls]
    const posicoes: number[] = []
    for (const u of post.mediaUrls) {
      if (!mortas.has(u)) continue
      const r = substituirUrl(novas, u, nova)
      novas = r.novas
      posicoes.push(...r.posicoes)
    }
    if (posicoes.length === 0) continue
    if (post.status !== 'POSTED') {
      l.naoPublicados++
      delicados.push(`${post.status} ${post.id} (${projetos.get(post.projectId)}, ${post.postType}, ${(post.scheduledDatetime ?? post.sentAt)?.toISOString().slice(0, 16)})${post.laterPostId ? ' — já no Zernio' : ''}`)
    }
    l.reparaveis++
    reparos.push({ post, novas, posicoes })
  }

  console.log('\nprojeto                        | mortos | reparáveis | sem Generation | Generation morta | não publicados')
  for (const [id, l] of [...porProjeto.entries()].sort((a, b) => b[1].mortos - a[1].mortos)) {
    console.log(`${(projetos.get(id) ?? String(id)).slice(0, 30).padEnd(30)} | ${String(l.mortos).padStart(6)} | ${String(l.reparaveis).padStart(10)} | ${String(l.semGen).padStart(14)} | ${String(l.genMorta).padStart(16)} | ${String(l.naoPublicados).padStart(14)}`)
  }
  if (delicados.length) {
    console.log('\n⚠️  posts NÃO publicados com mídia morta (reparados também, mas confira):')
    for (const d of delicados) console.log('  •', d)
  }

  if (!CONFIRMAR) {
    console.log(`\n${reparos.length} posts seriam reapontados. Rode com --confirmar para gravar.`)
  } else {
    let ok = 0, perdidos = 0
    for (const { post, novas } of reparos) {
      const r = await db.socialPost.updateMany({
        where: { id: post.id, mediaUrls: { equals: post.mediaUrls } },
        data: { mediaUrls: novas },
      })
      if (r.count === 1) ok++; else perdidos++
    }
    console.log(`\n✅ reapontados: ${ok} | perdidos no compare-and-swap: ${perdidos}`)
  }
  await db.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
