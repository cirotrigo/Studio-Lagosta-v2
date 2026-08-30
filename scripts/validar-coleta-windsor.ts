/**
 * Valida a coleta de métricas via Windsor.ai contra o banco REAL.
 *
 * Dry-run por padrão: mostra o que a API devolve, quais projetos seriam
 * alimentados e a prévia dos blocos do relatório — sem escrever nada.
 * `--confirmar` grava de verdade (upsert em InstagramFeed + casamento em
 * SocialPost, o mesmo caminho do cron).
 *
 *   npx tsx scripts/validar-coleta-windsor.ts
 *   npx tsx scripts/validar-coleta-windsor.ts --confirmar
 */
import { db } from '../src/lib/db'
import { coletarFeedViaWindsor } from '../src/lib/windsor/coleta-feed'
import { blocoAnunciosDaSemana, blocoAvaliacoesDaSemana } from '../src/lib/windsor/relatorio-extras'
import { isWindsorConfigured } from '../src/lib/windsor/client'

async function main() {
  const confirmar = process.argv.includes('--confirmar')

  if (!isWindsorConfigured()) {
    console.error('WINDSOR_API_KEY ausente no .env — nada a validar.')
    process.exit(1)
  }

  console.log(`Modo: ${confirmar ? 'GRAVAÇÃO' : 'dry-run (nada é escrito; use --confirmar para gravar)'}\n`)

  const antes = await db.instagramFeed.groupBy({ by: ['username'], _count: true })
  console.log('== InstagramFeed antes ==')
  for (const f of antes) console.log(`  ${f.username}: ${f._count}`)

  console.log('\n== Coleta de feed via Windsor (60 dias) ==')
  const resumo = await coletarFeedViaWindsor({ sinceDays: 60, dryRun: !confirmar })
  if (resumo.erro) {
    console.error('FALHOU:', resumo.erro)
    process.exit(1)
  }
  console.log(`linhas da API: ${resumo.linhasDaApi}`)
  for (const r of resumo.porProjeto) {
    console.log(
      `  projeto ${r.projectId} (@${r.username}): ${r.midias} mídias` +
        (confirmar ? ` → ${r.gravadas} gravadas, ${r.postsCasados} posts casados` : ' (seriam gravadas)') +
        (r.erro ? ` · ERRO: ${r.erro}` : ''),
    )
  }
  if (resumo.ignorados.length)
    console.log(`  fora do alvo (com token, ou sem projeto): ${resumo.ignorados.join(', ')}`)

  if (confirmar) {
    const depois = await db.instagramFeed.groupBy({ by: ['username'], _count: true })
    console.log('\n== InstagramFeed depois ==')
    for (const f of depois) console.log(`  ${f.username}: ${f._count}`)
  }

  console.log('\n== Prévia do bloco de anúncios do relatório ==')
  console.log((await blocoAnunciosDaSemana()) ?? '(vazio)')
  console.log('\n== Prévia do bloco de avaliações do relatório ==')
  console.log((await blocoAvaliacoesDaSemana()) ?? '(vazio)')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
