/**
 * Backfill de `Generation.canal` no histórico (03/09/2026).
 *
 * Dry-run por padrão; `--confirmar` grava. Só toca em linha com `canal` NULO
 * (idempotente) e só afirma o que dá para saber pelos dados:
 *
 *  - `createdBy` que NÃO é clerkId (o id INTERNO do dono) + authorName
 *    `arte-enviada` | `arte-rapida` | `compositor` | `ajuste-arte` →
 *    `claude-code`. É o MCP local e os scripts do canvas. ⚠️ A API externa do
 *    Claudinho gravava a MESMA assinatura (`arte-rapida` + id interno) e não
 *    há marcador que separe as duas no histórico — foram 65 linhas assim em
 *    toda a base, quase todas de agosto/setembro de 2026, quando quem produzia
 *    era o Claude Code. As do Claudinho que existirem ficam rotuladas errado,
 *    e é uma escolha: o rótulo só passa a ser exato daqui para frente.
 *  - `createdBy` clerkId → `studio` (pessoa logada no app). ⚠️ Arte pedida
 *    pelo conector remoto (claude.ai) também é assinada pelo clerkId de quem
 *    conectou e NÃO tem marcador no histórico — fica como `studio`. Só linha
 *    nova nasce `claude-ai`.
 *  - `post-midia`, `troca-de-arte`, `arte-livre` com id interno → ficam
 *    NULAS (mídia de post, subida pela agenda; não é automação).
 */

import { db } from '@/lib/db'

const confirmar = process.argv.includes('--confirmar')

async function main() {
  const plano = await db.$queryRaw<Array<{ regra: string; n: bigint }>>`
    SELECT
      CASE
        WHEN "createdBy" LIKE 'user_%' THEN 'studio'
        WHEN "authorName" IN ('arte-enviada','arte-rapida','compositor','ajuste-arte') THEN 'claude-code'
        ELSE '(fica nula)'
      END AS regra,
      count(*) AS n
    FROM "Generation"
    WHERE canal IS NULL
    GROUP BY 1 ORDER BY 2 DESC`
  console.log(confirmar ? '### GRAVANDO' : '### DRY-RUN (use --confirmar para gravar)')
  for (const p of plano) console.log(`${String(Number(p.n)).padStart(6)}  ${p.regra}`)

  if (!confirmar) {
    await db.$disconnect()
    return
  }
  const a = await db.$executeRaw`
    UPDATE "Generation" SET canal = 'claude-code'
    WHERE canal IS NULL AND "createdBy" NOT LIKE 'user_%'
      AND "authorName" IN ('arte-enviada','arte-rapida','compositor','ajuste-arte')`
  const b = await db.$executeRaw`
    UPDATE "Generation" SET canal = 'studio'
    WHERE canal IS NULL AND "createdBy" LIKE 'user_%'`
  console.log(`gravado: claude-code=${a}, studio=${b}`)
  const sobra = await db.generation.count({ where: { canal: null } })
  console.log(`ficam nulas: ${sobra}`)
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
