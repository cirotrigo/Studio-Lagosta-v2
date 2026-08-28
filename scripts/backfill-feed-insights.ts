/**
 * Backfill de métricas do FEED via Graph API — o irmão profundo do cron
 * /api/cron/fetch-feed-insights, para janelas maiores que os 60 dias diários.
 *
 * Uso:
 *   npx tsx scripts/backfill-feed-insights.ts                     # dry-run, todos com token
 *   npx tsx scripts/backfill-feed-insights.ts --projeto 3 --dias 400 --confirmar
 *
 * Dry-run lista o que seria coletado sem escrever nada. Com --confirmar,
 * grava em InstagramFeed e espelha nos SocialPost casados por
 * instagramMediaId (mesmo caminho do cron).
 */
import { db } from '../src/lib/db'
import { coletarFeedDoProjeto } from '../src/lib/instagram/feed-insights'
import { InstagramGraphApiClient } from '../src/lib/instagram/graph-api-client'

const args = process.argv.slice(2)
const confirmar = args.includes('--confirmar')
const flag = (nome: string) => {
  const i = args.indexOf(nome)
  return i >= 0 ? args[i + 1] : undefined
}
const projetoAlvo = flag('--projeto') ? Number(flag('--projeto')) : undefined
const dias = flag('--dias') ? Number(flag('--dias')) : 60

async function main() {
  const projetos = await db.project.findMany({
    where: {
      status: 'ACTIVE',
      instagramAccessToken: { not: null },
      ...(projetoAlvo ? { id: projetoAlvo } : {}),
    },
    select: { id: true, name: true, instagramAccessToken: true, instagramUsername: true },
    orderBy: { id: 'asc' },
  })
  if (projetos.length === 0) {
    console.log('nenhum projeto com token próprio casa com o filtro')
    return
  }

  console.log(`${confirmar ? 'COLETANDO' : 'DRY-RUN'} — janela de ${dias} dias — ${projetos.length} projeto(s)\n`)

  for (const p of projetos) {
    if (!confirmar) {
      const cliente = new InstagramGraphApiClient(p.instagramAccessToken)
      try {
        const midias = await cliente.getAccountMedia('me', { sinceDays: dias, max: 500 })
        console.log(`  ${p.name} (${p.id}): ${midias.length} mídias na janela — seria 1 chamada de insights por mídia`)
      } catch (e) {
        console.log(`  ${p.name} (${p.id}): ERRO ao listar — ${e instanceof Error ? e.message : e}`)
      }
      continue
    }

    console.log(`— ${p.name} (${p.id})...`)
    const r = await coletarFeedDoProjeto(p, { sinceDays: dias, max: 500 })
    console.log(
      `  mídias ${r.midias} | insights ${r.comInsights} (falhas ${r.falhasInsights}) | posts do Studio atualizados ${r.postsCasados}${r.erro ? ` | ERRO: ${r.erro}` : ''}`,
    )
  }

  if (!confirmar) console.log('\nnada foi gravado — rode com --confirmar para coletar')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
