/**
 * ANTES e DEPOIS do revisor numa peça real, SEM GRAVAR NADA — é a evidência
 * para a calibração de gosto e alarme falso com o Ciro (PR 0, 12/09/2026).
 *
 *   npx tsx scripts/revisar-antes-depois.ts --projeto 1 --page <pageId> [--sem-visao] [--saida <pasta>]
 *
 * Roda `revisarArte` na página como está, aplica os ajustes propostos EM
 * MEMÓRIA (o mesmo `aplicarAjustes` + autofix que `ajustarArte` usa) e
 * renderiza os dois PNGs lado a lado: `antes.png`, `depois.png`,
 * `lado-a-lado.jpg`, mais `revisao.json`. Lê o banco do `.env` (produção, só
 * leitura) e chama a visão uma vez, salvo `--sem-visao`. Nenhuma Page,
 * Generation, post ou sinal é escrito.
 */
import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'

import { db } from '@/lib/db'
import type { Layer } from '@/types/template'
import { lerCamadas } from '@/lib/posts/page-layers'
import { registerProjectFonts } from '@/lib/posts/register-project-fonts'
import { createServerTextMeasurer } from '@/lib/creatives/server-text-measurer'
import { aplicarAutofixOuFalhar } from '@/lib/creatives/text-autofix'
import { revisarArte } from '@/lib/creatives/revisao/revisar-arte'
import { aplicarAjustes } from '@/lib/creatives/revisao/aplicar-ajustes'

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(nome)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

async function renderizar(camadas: Layer[], canvas: { width: number; height: number }, background: string) {
  const { CanvasRenderer } = await import('@/lib/canvas-renderer')
  return new CanvasRenderer(canvas.width, canvas.height).renderDesign(
    { canvas: { ...canvas, backgroundColor: background }, layers: camadas } as never,
    {},
  )
}

async function main() {
  const projectId = Number(argumento('--projeto'))
  const pageId = argumento('--page')
  if (!Number.isFinite(projectId) || !pageId) {
    console.error('uso: --projeto <id> --page <pageId> [--sem-visao] [--saida <pasta>]')
    process.exit(2)
  }
  const semVisao = process.argv.includes('--sem-visao')
  const saida = argumento('--saida') ?? path.join('.tmp-revisor', `${projectId}-${pageId}`)
  await fs.mkdir(saida, { recursive: true })

  const r = await revisarArte({ projectId, pageId, visao: !semVisao, previa: true })
  await fs.writeFile(path.join(saida, 'revisao.json'), JSON.stringify({ ...r, previa: undefined }, null, 2))
  if (r.previa) await fs.writeFile(path.join(saida, 'marcada.jpg'), r.previa)

  const page = await db.page.findUniqueOrThrow({ where: { id: pageId } })
  const camadas = lerCamadas(page.layers).camadas as unknown as Layer[]
  const canvas = { width: page.width, height: page.height }
  const background = page.background ?? '#000000'

  await registerProjectFonts(projectId)
  const antes = await renderizar(camadas, canvas, background)
  await fs.writeFile(path.join(saida, 'antes.png'), antes)

  let depois: Buffer | null = null
  let aplicados = 0
  if (r.relatorio.ajustes.length > 0) {
    const medir = await createServerTextMeasurer()
    const aplicado = aplicarAjustes(camadas, r.relatorio.ajustes, { canvas, medir })
    aplicados = aplicado.aplicados.length
    const fix = await aplicarAutofixOuFalhar({ projectId, layers: aplicado.camadas, canvas, changedLayerIds: aplicado.alteradas })
    depois = await renderizar(fix.layers, canvas, background)
    await fs.writeFile(path.join(saida, 'depois.png'), depois)
    await fs.writeFile(
      path.join(saida, 'ajustes.json'),
      JSON.stringify({ ajustes: r.relatorio.ajustes, aplicados: aplicado.aplicados, recusados: aplicado.recusados, autocorrecao: fix.autocorrecao }, null, 2),
    )
  }

  const sharp = (await import('sharp')).default
  const w = 540
  const h = Math.round((canvas.height / canvas.width) * w)
  const painel = sharp({ create: { width: w * 2 + 30, height: h + 20, channels: 3, background: '#202020' } })
  const partes = [
    { input: await sharp(antes).resize(w, h).png().toBuffer(), left: 10, top: 10 },
    ...(depois ? [{ input: await sharp(depois).resize(w, h).png().toBuffer(), left: w + 20, top: 10 }] : []),
  ]
  await painel.composite(partes).jpeg({ quality: 88 }).toFile(path.join(saida, 'lado-a-lado.jpg'))

  console.log(`${r.pagina} — ${r.relatorio.achados.length} achado(s), ${r.relatorio.ajustes.length} ajuste(s) proposto(s), ${aplicados} aplicado(s) em memória`)
  for (const a of r.relatorio.achados) console.log(`  [${a.severidade}] ${a.regra}${a.regra === 'visao' ? `:${a.evidencia.problema}` : ''} — ${a.mensagem}`)
  console.log(`saída: ${saida}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
