/** Leitura de catálogos/fotos, sem banco, upload ou uso registrado. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'dotenv'
import { google } from 'googleapis'
import { createHash } from 'node:crypto'
async function main() {
  const source = process.argv[2]
  if (!source) throw new Error('Informe fonte de credenciais autorizada')
  const env = { ...parse(readFileSync(resolve(source, '.env'))), ...parse(readFileSync(resolve(source, '.env.local'))) }
  const auth = new google.auth.OAuth2(env.GOOGLE_DRIVE_CLIENT_ID, env.GOOGLE_DRIVE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: env.GOOGLE_DRIVE_REFRESH_TOKEN })
  const drive = google.drive({ version: 'v3', auth })
  const root = resolve('.tmp-medicao-compositor/diversidade'); mkdirSync(root, { recursive: true })
  const snapshot = JSON.parse(readFileSync(resolve('.tmp-medicao-compositor/snapshot.json'), 'utf8'))
  const plano = process.argv[3] ? JSON.parse(readFileSync(process.argv[3], 'utf8')) : null
  if (!plano) for (const c of snapshot.casos) {
    if (existsSync(resolve(root, `${c.projeto.id}-catalogo.json`))) continue
    const r = await drive.files.list({ q: `'${c.projeto.googleDriveImagesFolderId}' in parents and name = '_image-catalog.json' and trashed = false`, fields: 'files(id)', pageSize: 10 })
    const id = r.data.files?.[0]?.id
    if (!id) throw new Error('Sem catálogo')
    const cat = await drive.files.get({ fileId: id, alt: 'media' }, { responseType: 'json', timeout: 30000 })
    writeFileSync(resolve(root, `${c.projeto.id}-catalogo.json`), JSON.stringify(cat.data))
    console.log(`${c.projeto.name}: catálogo capturado`)
  }
  else {
    const sharp = (await import('sharp')).default
    for (const c of plano) {
      const inicio = performance.now()
      const r = await drive.files.get({ fileId: c.driveFileId, alt: 'media' }, { responseType: 'arraybuffer', timeout: 30000 })
      const original = Buffer.from(r.data as ArrayBuffer)
      const bytes = await sharp(original).rotate().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 95 }).toBuffer()
      c.path = resolve(root, `${c.projectId}-${c.slug}.jpg`)
      c.shaOriginal = createHash('sha256').update(original).digest('hex')
      c.shaRender = createHash('sha256').update(bytes).digest('hex')
      writeFileSync(c.path, bytes)
      await sharp(bytes).resize(300).png().toFile(resolve(root, `${c.slug}-thumb.png`))
      c.downloadMs = performance.now() - inicio
    }
    const anteriores = existsSync(resolve(root, 'fotos.json')) ? JSON.parse(readFileSync(resolve(root, 'fotos.json'), 'utf8')) : []
    writeFileSync(resolve(root, 'fotos.json'), JSON.stringify([...anteriores.filter((a: any) => !plano.some((p: any) => p.driveFileId === a.driveFileId)), ...plano], null, 2))
  }
}
main().catch((e) => { console.error('Falha na leitura; código/status:', e.code ?? e.response?.status ?? e.name); process.exitCode = 1 })
