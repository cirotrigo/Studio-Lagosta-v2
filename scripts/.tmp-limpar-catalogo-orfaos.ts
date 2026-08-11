/**
 * Remove do _image-catalog.json as entradas cujo arquivo NÃO existe mais no
 * Drive — fotos apagadas depois de catalogadas viram sugestão com miniatura
 * quebrada (mesma classe do problema das fotos perdidas de julho).
 *
 * Dry-run por padrão. `--aplicar` grava o catálogo limpo e deixa manifest com
 * as entradas removidas (é o rollback: reinserir no JSON).
 *
 *   npx tsx scripts/.tmp-limpar-catalogo-orfaos.ts 3
 *   npx tsx scripts/.tmp-limpar-catalogo-orfaos.ts 3 --aplicar
 */
import 'dotenv/config'
import * as fs from 'fs'
import { google } from 'googleapis'
import { Readable } from 'stream'
import { PrismaClient } from '../prisma/generated/client'

const prisma = new PrismaClient()
const PROJECT_ID = Number(process.argv[2])
const APLICAR = process.argv.includes('--aplicar')

function getDrive() {
  const c = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
  )
  c.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN })
  return google.drive({ version: 'v3', auth: c })
}

/** Ids de TODAS as imagens vivas, até 4 níveis (a profundidade do catálogo). */
async function idsVivos(drive: any, folderId: string, nivel = 0, acc = new Set<string>()) {
  if (nivel > 4) return acc
  let pageToken: string | undefined
  do {
    const r = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: 'files(id), nextPageToken',
      pageSize: 1000,
      pageToken,
    })
    for (const f of r.data.files ?? []) acc.add(f.id!)
    pageToken = r.data.nextPageToken ?? undefined
  } while (pageToken)

  const sub = await drive.files.list({
    q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id)',
    pageSize: 200,
  })
  for (const f of sub.data.files ?? []) await idsVivos(drive, f.id!, nivel + 1, acc)
  return acc
}

async function main() {
  if (!PROJECT_ID) throw new Error('uso: npx tsx scripts/.tmp-limpar-catalogo-orfaos.ts <projectId> [--aplicar]')
  const p = await prisma.project.findUnique({
    where: { id: PROJECT_ID },
    select: { name: true, googleDriveImagesFolderId: true },
  })
  if (!p?.googleDriveImagesFolderId) throw new Error('projeto sem pasta de imagens')
  const drive = getDrive()

  const cat = await drive.files.list({
    q: `'${p.googleDriveImagesFolderId}' in parents and name = '_image-catalog.json' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
  })
  const catId = cat.data.files?.[0]?.id
  if (!catId) throw new Error('projeto sem catálogo')

  const res: any = await drive.files.get({ fileId: catId, alt: 'media' }, { responseType: 'json' })
  const catalogo = res.data
  const entradas: any[] = catalogo.images ?? []

  console.log(`${p.name} — catálogo com ${entradas.length} entradas; varrendo o Drive…`)
  const vivos = await idsVivos(drive, p.googleDriveImagesFolderId)
  console.log(`imagens vivas no Drive: ${vivos.size}`)

  const mantidas = entradas.filter((e) => vivos.has(e.driveFileId))
  const orfas = entradas.filter((e) => !vivos.has(e.driveFileId))

  console.log(`\nórfãs (arquivo apagado do Drive): ${orfas.length}`)
  const porPasta = new Map<string, number>()
  for (const o of orfas) porPasta.set(o.folder ?? '?', (porPasta.get(o.folder ?? '?') ?? 0) + 1)
  for (const [pasta, n] of [...porPasta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`   ${String(n).padStart(4)}  ${pasta}`)
  }

  const manifesto = `/private/tmp/claude-501/-Users-cirotrigo-Documents-Studio-Lagosta-v2/f80a5549-1a54-44d5-ac51-8e7d6bcae472/scratchpad/limpeza-catalogo-p${PROJECT_ID}${APLICAR ? '' : '-dryrun'}.json`
  fs.writeFileSync(
    manifesto,
    JSON.stringify({ aplicado: APLICAR, projeto: p.name, catalogFileId: catId, removidas: orfas }, null, 2),
  )
  console.log(`\n📄 manifest (rollback = reinserir "removidas" no JSON): ${manifesto}`)

  if (!APLICAR) {
    console.log('\n🔍 DRY-RUN — nada gravado. Use --aplicar.')
  } else if (orfas.length === 0) {
    console.log('\n✅ nenhuma órfã — catálogo intocado (nada a gravar).')
  } else {
    const novo = { ...catalogo, images: mantidas, lastUpdated: new Date().toISOString() }
    const body = new Readable()
    body.push(JSON.stringify(novo, null, 2))
    body.push(null)
    await drive.files.update({ fileId: catId, media: { mimeType: 'application/json', body } })
    console.log(`\n✅ catálogo gravado com ${mantidas.length} entradas (${orfas.length} removidas).`)
  }
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('ERRO:', e?.message ?? e)
  process.exit(1)
})
