/**
 * Leva as peças do compositor que nasceram nos coletores "Arte Composta"
 * para as PASTAS DA SEMANA (regra de 03/09/2026), renomeando cada página por
 * dia/hora/formato/tema e reapontando a Generation para a pasta nova.
 *
 *   npx tsx scripts/organizar-programacao.ts --projeto 8            # dry-run
 *   npx tsx scripts/organizar-programacao.ts --projeto 8 --confirmar
 *
 * Nada é excluído: os coletores esvaziados somem da aba sozinhos (coletor
 * vazio não tem card). Post agendado continua apontando para a MESMA página.
 */
import 'dotenv/config'

import { db } from '@/lib/db'
import { garantirPasta } from '@/lib/compositor/pastas'
import { nomeDaPagina } from '@/lib/compositor/pasta-da-semana'
import type { Formato } from '@/lib/compositor/spec'

async function main() {
  const args = process.argv.slice(2)
  const confirmar = args.includes('--confirmar')
  const projectId = Number(args[args.indexOf('--projeto') + 1])
  if (!Number.isFinite(projectId)) throw new Error('use --projeto <id>')
  const projeto = await db.project.findUnique({ where: { id: projectId }, select: { userId: true, name: true } })
  if (!projeto) throw new Error('projeto não encontrado')

  const paginas = await db.page.findMany({
    where: { tags: { has: 'compositor' }, Template: { projectId, category: 'arte-rapida' } },
    select: { id: true, name: true, width: true, height: true, templateId: true, Template: { select: { name: true } } },
  })
  const gens = await db.generation.findMany({
    where: { projectId, fieldValues: { path: ['source'], equals: 'compositor' } },
    select: { id: true, fieldValues: true },
  })
  const genPorPagina = new Map<string, { id: string; quando: string | null; tema: string | null; formato: Formato }>()
  for (const g of gens) {
    const fv = g.fieldValues as Record<string, unknown>
    const spec = (fv.spec ?? {}) as Record<string, unknown>
    const pageId = typeof fv.pageId === 'string' ? fv.pageId : null
    if (!pageId) continue
    genPorPagina.set(pageId, { id: g.id, quando: typeof spec.quando === 'string' ? spec.quando : null, tema: typeof spec.tema === 'string' ? spec.tema : null, formato: (spec.formato as Formato) ?? 'story' })
  }

  console.log(`${projeto.name}: ${paginas.length} página(s) do compositor em coletores`)
  const plano = paginas.map((p) => {
    const g = genPorPagina.get(p.id)
    const formato: Formato = g?.formato ?? (p.height > p.width * 1.6 ? 'story' : p.height === p.width ? 'quadrado' : 'feed')
    return { p, g, formato, nome: nomeDaPagina({ quando: g?.quando ?? null, formato, tema: g?.tema ?? null, nome: p.name }) }
  })
  for (const item of plano.slice(0, 8)) console.log(`  ${item.p.Template.name} / ${item.p.name} → ${item.g?.quando?.slice(0, 16) ?? 'sem data'} · "${item.nome}"`)
  if (plano.length > 8) console.log(`  … e mais ${plano.length - 8}`)
  if (!confirmar) {
    console.log('Dry-run. Use --confirmar para mover.')
    return
  }

  const ordem = new Map<number, number>()
  let movidas = 0
  for (const item of plano) {
    const pasta = await garantirPasta(projectId, projeto.userId, item.g?.quando ?? null)
    const n = ordem.get(pasta.id) ?? (await db.page.aggregate({ where: { templateId: pasta.id }, _max: { order: true } }))._max.order ?? -1
    ordem.set(pasta.id, n + 1)
    await db.$transaction([
      db.page.update({ where: { id: item.p.id }, data: { templateId: pasta.id, name: item.nome, order: n + 1, tags: ['compositor', item.formato] } }),
      ...(item.g ? [db.generation.update({ where: { id: item.g.id }, data: { templateId: pasta.id, templateName: pasta.name } })] : []),
    ])
    movidas++
  }
  const pastas = await db.template.findMany({ where: { projectId, category: { in: ['programacao', 'avulsas'] } }, select: { name: true, _count: { select: { Page: true } } }, orderBy: { name: 'asc' } })
  console.log(`${movidas} página(s) movida(s). Pastas: ${pastas.map((t) => `${t.name} (${t._count.Page})`).join(', ')}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
