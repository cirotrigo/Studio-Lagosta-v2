/**
 * EXPORTADOR de leitura do piloto sintético (contrato § 1.1): lê as assinaturas de clientes do branch de DESENVOLVIMENTO do
 * Neon e escreve JSON + PNGs das logos numa pasta local. Nunca toca a produção — e a guarda é FAIL-CLOSED
 * (`scripts/fixtures/guarda-do-exportador.ts`, testada em `guarda-do-exportador.test.ts`):
 *  - a conexão sai SÓ de `.env.development.local` (aborta se não existir);
 *  - o `.env` é lido SÓ para a identidade da produção: sem ele, sem URL parseável nele, ou com o MESMO compute no dev
 *    (direto, pooled ou em maiúsculas), aborta — sem a prova de que o dev não é a produção, não exporta;
 *  - toda leitura dentro de UMA transação `READ ONLY` (o Postgres recusa qualquer escrita nela).
 * As logos são baixadas AQUI (pelas URLs públicas do Blob) para a pasta do export: o gerador fica offline.
 *
 *   npx tsx scripts/fixtures/exportar-piloto-sintetico.ts --cliente <projectId> [--cliente <id>…] <pasta-dos-exports>
 *   npx tsx scripts/fixtures/exportar-piloto-sintetico.ts --listar                      # só lista os clientes ativos com assinatura
 *
 * A lista de clientes a exportar é a decisão 5.2 do owner: este script não escolhe por ninguém. ESCRITO E NÃO EXECUTADO.
 */
import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { lerEnv, recusaDoExportador } from './guarda-do-exportador'

const ler = (arquivo: string) => (fs.existsSync(arquivo) ? fs.readFileSync(arquivo, 'utf8') : null)

function urlDoBranchDeDev(): string {
  const dev = lerEnv(ler(path.resolve(process.cwd(), '.env.development.local')))
  const prod = lerEnv(ler(path.resolve(process.cwd(), '.env')))
  const recusa = recusaDoExportador({ prod, dev })
  if (recusa) throw new Error([recusa.titulo, ...recusa.linhas].join('\n'))
  return dev!.DATABASE_URL
}

type Pagina = { id: number; name: string; tags: string[]; width: number; height: number; background: string | null; layers: unknown; order: number }

async function main() {
  const args = process.argv.slice(2)
  const clientes = args.flatMap((a, i) => (a === '--cliente' ? [Number(args[i + 1])] : [])).filter((n) => Number.isFinite(n))
  const listar = args.includes('--listar')
  const saida = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--cliente').at(-1)
  if (!listar && (!saida || clientes.length === 0)) {
    console.error('uso: exportar-piloto-sintetico.ts --cliente <id> [--cliente <id>…] <pasta-dos-exports> | --listar')
    process.exit(1)
  }
  const db = new PrismaClient({ datasources: { db: { url: urlDoBranchDeDev() } } })
  try {
    await db.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
        if (listar) {
          const linhas = await tx.$queryRawUnsafe<Array<{ id: number; name: string; paginas: number }>>(
            `SELECT p.id, p.name, COUNT(pg.id)::int AS paginas FROM "Project" p JOIN "Template" t ON t."projectId" = p.id JOIN "Page" pg ON pg."templateId" = t.id AND pg."isTemplate" = true AND 'assinatura' = ANY(pg.tags) WHERE p.status = 'ACTIVE' GROUP BY p.id, p.name ORDER BY p.id`,
          )
          for (const l of linhas) console.log(`${l.id}\t${l.name}\t${l.paginas} página(s) de assinatura`)
          return
        }
        fs.mkdirSync(saida!, { recursive: true })
        for (const id of clientes) {
          const projeto = await tx.project.findUnique({ where: { id }, select: { id: true, name: true, assinatura: true } })
          if (!projeto) throw new Error(`projeto ${id} não existe`)
          const paginas = await tx.$queryRawUnsafe<Pagina[]>(
            `SELECT pg.id, pg.name, pg.tags, pg.width, pg.height, pg.background, pg.layers, pg."order" FROM "Page" pg JOIN "Template" t ON t.id = pg."templateId" WHERE t."projectId" = $1 AND pg."isTemplate" = true AND 'assinatura' = ANY(pg.tags) ORDER BY pg."order", pg.id`,
            id,
          )
          const logos = await tx.logo.findMany({ where: { projectId: id }, select: { id: true, fileUrl: true, isProjectLogo: true }, orderBy: { id: 'asc' } })
          const comArquivo = []
          for (const [k, l] of logos.entries()) {
            const r = await fetch(l.fileUrl)
            if (!r.ok) throw new Error(`logo ${l.id}: HTTP ${r.status}`)
            const arquivo = `projeto-${id}-logo-${k}.png`
            fs.writeFileSync(path.join(saida!, arquivo), Buffer.from(await r.arrayBuffer()))
            comArquivo.push({ ...l, arquivo })
          }
          fs.writeFileSync(path.join(saida!, `projeto-${id}.json`), JSON.stringify({ projeto, paginas, logos: comArquivo }, null, 1))
          console.log(`projeto ${id} (${projeto.name}): ${paginas.length} página(s) de assinatura, ${logos.length} logo(s) → ${saida}/projeto-${id}.json`)
        }
      },
      { timeout: 60_000 },
    )
  } finally {
    await db.$disconnect()
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
