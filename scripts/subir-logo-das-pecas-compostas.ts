/**
 * Põe a LOGO no topo da pilha nas peças do compositor já gravadas e refaz o
 * PNG de cada uma (ajuste do Ciro, 02/09/2026: a mancha do halo do texto
 * cobria a marca quando os dois ficavam perto).
 *
 *   npx tsx scripts/subir-logo-das-pecas-compostas.ts --projeto 8            # dry-run
 *   npx tsx scripts/subir-logo-das-pecas-compostas.ts --projeto 8 --confirmar
 *
 * Só toca em página com a tag `compositor` cuja logo NÃO é a última camada.
 * Reescreve Page.layers, o snapshot (o "original" passa a ser o corrigido) e
 * o PNG da Generation (mesma URL de galeria: `resultUrl` novo). Post agendado
 * que use a página volta à fila de render.
 */
import 'dotenv/config'
import { put } from '@vercel/blob'

import { db } from '@/lib/db'
import type { Layer } from '@/types/template'
import { lerCamadas } from '@/lib/posts/page-layers'
import { registerProjectFonts } from '@/lib/posts/register-project-fonts'
import { invalidateScheduledRenders } from '@/lib/posts/invalidate-renders'

async function main() {
  const args = process.argv.slice(2)
  const confirmar = args.includes('--confirmar')
  const i = args.indexOf('--projeto')
  const projectId = Number(args[i + 1])
  if (!Number.isFinite(projectId)) throw new Error('use --projeto <id>')

  const paginas = await db.page.findMany({
    where: { tags: { has: 'compositor' }, Template: { projectId } },
    select: { id: true, name: true, width: true, height: true, layers: true, background: true },
  })
  const alvo: Array<{ id: string; name: string; width: number; height: number; background: string | null; camadas: Layer[] }> = []
  for (const p of paginas) {
    const { camadas, legivel } = lerCamadas(p.layers)
    if (!legivel) continue
    const cs = camadas as Layer[]
    const idx = cs.findIndex((c) => c.type === 'logo')
    if (idx < 0 || idx === cs.length - 1) continue
    const logo = cs[idx]
    const resto = cs.filter((_, k) => k !== idx)
    const novas = [...resto, logo].map((c, k) => ({ ...c, order: k }))
    alvo.push({ id: p.id, name: p.name, width: p.width, height: p.height, background: p.background, camadas: novas })
  }
  console.log(`${paginas.length} página(s) do compositor; ${alvo.length} com a logo abaixo de outra camada`)
  if (!confirmar) {
    console.log('Dry-run. Use --confirmar para gravar e re-renderizar.')
    return
  }

  await registerProjectFonts(projectId)
  const { CanvasRenderer } = await import('@/lib/canvas-renderer')
  let n = 0
  for (const p of alvo) {
    const renderer = new CanvasRenderer(p.width, p.height)
    const png = await renderer.renderDesign({ canvas: { width: p.width, height: p.height, backgroundColor: p.background ?? '#000' }, layers: p.camadas }, {})
    const blob = await put(`arte-rapida/${projectId}/${p.id}-${Date.now()}.png`, png, { access: 'public', contentType: 'image/png' })
    const gens = await db.generation.findMany({ where: { projectId, fieldValues: { path: ['pageId'], equals: p.id } }, select: { id: true, fieldValues: true } })
    await db.$transaction(async (tx) => {
      await tx.page.update({ where: { id: p.id }, data: { layers: JSON.stringify(p.camadas), thumbnail: blob.url } })
      for (const g of gens) {
        const fv = (g.fieldValues ?? {}) as Record<string, unknown>
        await tx.generation.update({ where: { id: g.id }, data: { resultUrl: blob.url, fieldValues: { ...fv, thumbnailUrl: blob.url, layersSnapshot: p.camadas, logoNoTopo: '2026-09-02' } as never } })
      }
      await invalidateScheduledRenders(tx, { pageIds: [p.id] })
    })
    n++
    console.log(`  ✓ ${p.name} (${gens.length} generation)`)
  }
  console.log(`${n} página(s) corrigida(s).`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
