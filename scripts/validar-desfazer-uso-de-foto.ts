/**
 * DRY-RUN de `desfazerUsoDeFotoDoPost`: mostra quais artes de um post teriam o
 * registro de uso de foto (`PhotoUsage`) desfeito, e quantas linhas cairiam —
 * SEM apagar nada. Só leitura; roda contra o banco do `.env`.
 *
 * O que ele confere é a conta que os três caminhos de exclusão (cancelar-post,
 * DELETE web, DELETE externo) fazem antes do `db.socialPost.delete`:
 *  - post publicado → nada (motivo `publicado`), mesmo que o DELETE web aceite;
 *  - carrossel → uma Generation por slide, via `resultUrl` ∈ `mediaUrls`;
 *  - arte compartilhada com OUTRO post → fica de fora (motivo `sem-arte` quando
 *    não sobra nenhuma).
 *
 * Uso:
 *   npx tsx scripts/validar-desfazer-uso-de-foto.ts <postId>
 *   npx tsx scripts/validar-desfazer-uso-de-foto.ts <postId> --json
 */

import { db } from '../src/lib/db'
import { geracoesParaDesfazerUso } from '../src/lib/creatives/uso-de-foto'

async function main() {
  const args = process.argv.slice(2)
  const json = args.includes('--json')
  const postId = args.find((a) => !a.startsWith('--'))
  if (!postId) {
    console.error('Uso: npx tsx scripts/validar-desfazer-uso-de-foto.ts <postId> [--json]')
    process.exit(1)
  }

  const post = await db.socialPost.findUnique({
    where: { id: postId },
    select: {
      id: true,
      projectId: true,
      status: true,
      postType: true,
      scheduledDatetime: true,
      generationId: true,
      mediaUrls: true,
    },
  })
  if (!post) {
    console.error(`Post não encontrado: ${postId}`)
    process.exit(1)
  }

  const { geracoes, motivo } = await geracoesParaDesfazerUso({ projectId: post.projectId, postId: post.id })

  const usos =
    geracoes.length > 0
      ? await db.photoUsage.findMany({
          where: { projectId: post.projectId, generationId: { in: geracoes } },
          select: { id: true, driveFileId: true, generationId: true, origem: true, usedAt: true },
          orderBy: { usedAt: 'desc' },
        })
      : []

  const relatorio = {
    dryRun: true,
    post: {
      id: post.id,
      projectId: post.projectId,
      status: post.status,
      postType: post.postType,
      scheduledDatetime: post.scheduledDatetime?.toISOString() ?? null,
      generationId: post.generationId,
      midias: post.mediaUrls.length,
    },
    geracoesQueTeriamOUsoDesfeito: geracoes,
    motivo: motivo ?? null,
    photoUsageQueSeriamRemovidos: usos.length,
    linhas: usos.map((u) => ({
      id: u.id,
      driveFileId: u.driveFileId,
      generationId: u.generationId,
      origem: u.origem,
      usedAt: u.usedAt.toISOString(),
    })),
  }

  if (json) {
    console.log(JSON.stringify(relatorio, null, 2))
    return
  }

  console.log(`\nDRY-RUN — nada é apagado.\n`)
  console.log(`Post ${post.id} (projeto ${post.projectId}) — ${post.status} · ${post.postType} · ${post.mediaUrls.length} mídia(s)`)
  if (motivo) {
    const explicacao: Record<string, string> = {
      publicado: 'post PUBLICADO — o uso da foto é verdadeiro e fica.',
      'sem-arte': 'nenhuma arte exclusiva deste post (sem Generation, ou a arte é compartilhada com outro post).',
      'post-nao-encontrado': 'post não pertence ao projeto informado.',
      erro: 'falha ao resolver (veja o log acima).',
    }
    console.log(`Nada a desfazer: ${explicacao[motivo] ?? motivo}`)
  } else {
    console.log(`Artes só deste post: ${geracoes.join(', ')}`)
    console.log(`PhotoUsage que SERIAM removidos: ${usos.length}`)
    for (const u of usos) {
      console.log(`  - ${u.driveFileId}  (${u.origem}, ${u.usedAt.toISOString().slice(0, 10)}, arte ${u.generationId})`)
    }
  }
}

main()
  .catch((erro) => {
    console.error(erro)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
