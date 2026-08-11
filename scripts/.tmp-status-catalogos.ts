import 'dotenv/config'
import { google } from 'googleapis'
import { PrismaClient } from '../prisma/generated/client'

const prisma = new PrismaClient()

function getDrive() {
  const c = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
  )
  c.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN })
  return google.drive({ version: 'v3', auth: c })
}

async function contarImagens(drive: any, id: string, nivel = 0): Promise<number> {
  if (nivel > 4) return 0
  let n = 0
  const imgs = await drive.files.list({
    q: `'${id}' in parents and mimeType contains 'image/' and trashed = false`,
    fields: 'files(id)',
    pageSize: 1000,
  })
  n += (imgs.data.files ?? []).length
  const sub = await drive.files.list({
    q: `'${id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id)',
    pageSize: 200,
  })
  for (const f of sub.data.files ?? []) n += await contarImagens(drive, f.id, nivel + 1)
  return n
}

async function main() {
  const drive = getDrive()
  const projetos = await prisma.project.findMany({
    where: { googleDriveImagesFolderId: { not: null } },
    select: { id: true, name: true, googleDriveImagesFolderId: true },
    orderBy: { id: 'asc' },
  })

  console.log('projeto'.padEnd(22), 'no Drive'.padStart(9), 'catálogo'.padStart(9), 'cobertura'.padStart(10))
  for (const p of projetos) {
    const total = await contarImagens(drive, p.googleDriveImagesFolderId!)
    const res = await drive.files.list({
      q: `'${p.googleDriveImagesFolderId}' in parents and name = '_image-catalog.json' and trashed = false`,
      fields: 'files(id)',
      pageSize: 1,
    })
    const catId = res.data.files?.[0]?.id
    let cat = 0
    if (catId) {
      const c: any = await drive.files.get({ fileId: catId, alt: 'media' }, { responseType: 'json' })
      cat = (c.data?.images ?? []).length
    }
    const pct = total ? Math.round((cat / total) * 100) : 0
    const marca = !catId ? '— sem catálogo' : pct >= 99 ? '✅' : pct >= 1 ? '⏳' : '⚠️ vazio'
    console.log(
      p.name.padEnd(22),
      String(total).padStart(9),
      String(cat).padStart(9),
      `${String(pct).padStart(8)}%`,
      marca,
    )
  }
  await prisma.$disconnect()
}

main()
