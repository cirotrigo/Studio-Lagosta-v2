/**
 * EXPORTADOR de leitura do piloto sintético (contrato § 1.1): lê as assinaturas de clientes do branch de DESENVOLVIMENTO do
 * Neon e escreve JSON + PNGs das logos numa pasta local. Nunca toca a produção — e a guarda é FAIL-CLOSED
 * (`scripts/fixtures/guarda-do-exportador.ts`, testada em `guarda-do-exportador.test.ts`):
 *  - a conexão sai SÓ de `.env.development.local` (aborta se não existir);
 *  - o `.env` é lido SÓ para a identidade da produção: sem ele, sem URL parseável nele, ou com o MESMO compute no dev
 *    (direto, pooled ou em maiúsculas), aborta — sem a prova de que o dev não é a produção, não exporta;
 *  - toda leitura dentro de UMA transação `READ ONLY` (o Postgres recusa qualquer escrita nela).
 * As logos e TODA imagem das camadas da assinatura são baixadas AQUI (URLs públicas do Blob) para a pasta do export: o gerador
 * fica offline e o piloto recusa fixture com camada sem arquivo.
 *
 *   npx tsx scripts/fixtures/exportar-piloto-sintetico.ts --cliente <projectId> [--cliente <id>…] <pasta-dos-exports>
 *   npx tsx scripts/fixtures/exportar-piloto-sintetico.ts --listar                      # só lista os clientes ativos com assinatura
 *   npx tsx scripts/fixtures/exportar-piloto-sintetico.ts --fotos --contar --cliente <id>… --desde <ISO> --ate <ISO>
 *   npx tsx scripts/fixtures/exportar-piloto-sintetico.ts --fotos --cliente <id>… --desde <ISO> --ate <ISO> --candidatos <n> <pasta>
 *
 * `--fotos` (P1 de `docs/PLANO-2026-10-17-CONTINUIDADE-E-CONTRATO-FOTOS.md`): seleção em `selecao-de-fotos.ts`, SQL em
 * `fotos-do-banco.ts`. ESCRITO E NÃO EXECUTADO: rodar a contagem (P2) ou a exportação (P4) exige autorização própria do owner.
 *
 * A lista de clientes a exportar é a decisão 5.2 do owner: este script não escolhe por ninguém. ESCRITO E NÃO EXECUTADO.
 */
import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { execFileSync } from 'node:child_process'
import { lerEnv, recusaDoExportador } from './guarda-do-exportador'
import { lerDoBranch } from './fotos-do-banco'
import {
  IMUTABILIDADE_DO_BLOB_COMPROVADA,
  ROTULOS_DO_MANIFESTO,
  contarCliente,
  exportarCliente,
  lerArgsDasFotos,
  recusaDoDestino,
  type Buscar,
} from './selecao-de-fotos'

const ler = (arquivo: string) => (fs.existsSync(arquivo) ? fs.readFileSync(arquivo, 'utf8') : null)

function urlDoBranchDeDev(): string {
  const dev = lerEnv(ler(path.resolve(process.cwd(), '.env.development.local')))
  const prod = lerEnv(ler(path.resolve(process.cwd(), '.env')))
  const recusa = recusaDoExportador({ prod, dev })
  if (recusa) throw new Error([recusa.titulo, ...recusa.linhas].join('\n'))
  return dev!.DATABASE_URL
}

type Pagina = { id: number; name: string; tags: string[]; width: number; height: number; background: string | null; layers: unknown; order: number }

async function principalDasFotos(argv: string[]) {
  const args = lerArgsDasFotos(argv)
  if ('recusa' in args) throw new Error(`--fotos: ${args.recusa}`)
  const raiz = path.resolve(__dirname, '../..')
  // Destino e guarda ANTES de qualquer conexão.
  if (args.pasta) {
    const recusa = recusaDoDestino(args.pasta, raiz, fs.realpathSync)
    if (recusa) throw new Error(recusa)
    if (fs.existsSync(args.pasta) && fs.readdirSync(args.pasta).length > 0) throw new Error(`a pasta ${args.pasta} não está vazia`)
  }
  const db = new PrismaClient({ datasources: { db: { url: urlDoBranchDeDev() } } })
  let leitura: Awaited<ReturnType<typeof lerDoBranch>>
  try {
    // Só a LEITURA fica na transação READ ONLY; nenhum download acontece com ela aberta.
    leitura = await db.$transaction((tx) => lerDoBranch(tx, args.clientes, args.ate), { timeout: 60_000 })
  } finally {
    await db.$disconnect()
  }
  if ('recusa' in leitura) throw new Error(`a contagem não pode rodar (causa ${leitura.causa}): ${leitura.recusa.join('; ')}`)
  const opcoes = { desde: args.desde, ate: args.ate, populacao: args.populacao, imutabilidadeComprovada: IMUTABILIDADE_DO_BLOB_COMPROVADA }
  const todos = [...leitura.postsPorCliente.values()].flat()
  const semProva = todos.every((p) => p.provas.length === 0)
  const comum = {
    args: { ...args, desde: args.desde.toISOString(), ate: args.ate.toISOString() },
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: raiz, encoding: 'utf8' }).trim(),
    marcadorDoSnapshot: leitura.marcador,
    ...(semProva ? { aviso: `nenhuma prova nesta seleção (o branch tem ${leitura.marcador.provas} no total)` } : {}),
    rotulos: ROTULOS_DO_MANIFESTO,
  }
  if (args.modo === 'contar') {
    const clientes = args.clientes.map((c) => contarCliente(c, leitura.postsPorCliente.get(c) ?? [], opcoes))
    console.log(JSON.stringify({ ...comum, clientes }, null, 1))
    return
  }
  fs.mkdirSync(args.pasta!, { recursive: true })
  const clientes = []
  for (const c of args.clientes) {
    clientes.push(
      await exportarCliente(c, leitura.postsPorCliente.get(c) ?? [], { ...opcoes, candidatos: args.candidatos! }, {
        buscar: fetch as unknown as Buscar,
        gravar: (nome, bytes) => fs.writeFileSync(path.join(args.pasta!, nome), bytes, { flag: 'wx' }),
      }),
    )
  }
  fs.writeFileSync(path.join(args.pasta!, 'manifesto.json'), JSON.stringify({ ...comum, clientes }, null, 1), { flag: 'wx' })
  for (const r of clientes) console.log(`cliente ${r.cliente}: ${r.exportados.length} exportado(s); ${r.elegiveis} elegível(is) conferido(s) de ${r.elegiveisPreliminares} preliminar(es)${r.foraDaLeva ? ' — FORA DA LEVA' : ''}`)
}

async function main() {
  const args = process.argv.slice(2)
  if (args.includes('--fotos')) return principalDasFotos(args)
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
          const baixar = async (url: string, arquivo: string) => {
            const r = await fetch(url)
            if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`)
            fs.writeFileSync(path.join(saida!, arquivo), Buffer.from(await r.arrayBuffer()))
            return arquivo
          }
          const comArquivo = []
          for (const [k, l] of logos.entries()) comArquivo.push({ ...l, arquivo: await baixar(l.fileUrl, `projeto-${id}-logo-${k}.png`) })
          // TODA imagem referenciada por `fileUrl` nas camadas da assinatura é baixada: o piloto RECUSA fixture com camada sem arquivo.
          const arquivos: Record<string, string> = {}
          let n = 0
          for (const pg of paginas) {
            const layers = (typeof pg.layers === 'string' ? JSON.parse(pg.layers) : pg.layers) as Array<{ fileUrl?: unknown }>
            for (const l of layers) {
              if (typeof l.fileUrl !== 'string' || !/^https?:\/\//.test(l.fileUrl) || logos.some((g) => g.fileUrl === l.fileUrl) || arquivos[l.fileUrl]) continue
              arquivos[l.fileUrl] = await baixar(l.fileUrl, `projeto-${id}-arquivo-${++n}.png`)
            }
          }
          fs.writeFileSync(path.join(saida!, `projeto-${id}.json`), JSON.stringify({ projeto, paginas, logos: comArquivo, arquivos }, null, 1))
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
