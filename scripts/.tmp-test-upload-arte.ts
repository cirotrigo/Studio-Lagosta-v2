/**
 * E2E do upload de arte local (temporário).
 * Cria um PNG sintético, importa para o projeto 8 (Lagosta Criativa),
 * confere no banco/Blob e apaga tudo no fim.
 */
import 'dotenv/config'
import sharp from 'sharp'
import * as fs from 'fs'
import { del } from '@vercel/blob'
import { db } from '../src/lib/db'
import { importarArte } from '../src/lib/creatives/arte-enviada'

const PROJECT_ID = 8

async function main() {
  const file = '/tmp/teste-arte-enviada.png'
  await sharp({
    create: { width: 1080, height: 1920, channels: 3, background: { r: 200, g: 30, b: 60 } },
  })
    .png()
    .toFile(file)

  const result = await importarArte({
    projectId: PROJECT_ID,
    bytes: fs.readFileSync(file),
    fileName: 'teste arte enviada.png',
    origem: 'e2e upload-creative',
  })
  console.log('IMPORTADA:', JSON.stringify(result, null, 2))

  const head = await fetch(result.url, { method: 'HEAD' })
  console.log('BLOB:', head.status, head.headers.get('content-type'), head.headers.get('content-length'))

  const gen = await db.generation.findUnique({
    where: { id: result.generationId },
    select: { status: true, resultUrl: true, templateName: true, fieldValues: true, projectName: true, authorName: true },
  })
  console.log('GENERATION:', JSON.stringify(gen, null, 2))

  const page = await db.page.findUnique({
    where: { id: result.pageId },
    select: { name: true, width: true, height: true, isTemplate: true, thumbnail: true, layers: true, templateId: true },
  })
  console.log('PAGE:', JSON.stringify(page, null, 2))

  // Aparece na listagem do projeto?
  const listado = await db.generation.findFirst({
    where: { projectId: PROJECT_ID },
    orderBy: { createdAt: 'desc' },
    select: { id: true, templateName: true },
  })
  console.log('TOPO DA GALERIA:', JSON.stringify(listado))

  // ── cleanup ──
  await db.generation.delete({ where: { id: result.generationId } })
  await db.page.delete({ where: { id: result.pageId } })
  await del(result.url)
  const restou = await db.template.findFirst({
    where: { projectId: PROJECT_ID, name: 'Arte Enviada' },
    select: { id: true, name: true, dimensions: true, type: true, Page: { select: { id: true } } },
  })
  console.log('TEMPLATE COLETOR (fica, sem páginas):', JSON.stringify(restou))
  fs.unlinkSync(file)
  console.log('cleanup ok')
}

main()
  .catch((e) => {
    console.error('FALHOU:', e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
