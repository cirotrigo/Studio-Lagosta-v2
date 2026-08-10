/**
 * Procura na LIXEIRA do Drive (e na pasta Arquivo) os arquivos expurgados na
 * curadoria de julho que ainda são o fundo de páginas legadas.
 * Só lê; baixa thumbnails para conferência visual.
 */
import { google } from 'googleapis'
import * as fs from 'fs'

const OUT = process.env.TRASH_OUT ?? '/tmp/drive-trash'

function getDrive() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
  )
  auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN })
  return google.drive({ version: 'v3', auth })
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const drive = getDrive()

  const terms = ['cmt055', 'cmt0344', 'cmt03355', 'cmt03360', 'f3a3299', 'gnocchi', 'fish', 'week']
  for (const term of terms) {
    const res = await drive.files.list({
      q: `trashed = true and name contains '${term}'`,
      pageSize: 100,
      fields: 'files(id,name,mimeType,thumbnailLink,trashedTime,parents)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    const files = res.data.files ?? []
    console.log(`lixeira "${term}": ${files.length}`)
    for (const f of files) console.log(`  ${f.name} (${f.id}) trashed=${f.trashedTime}`)
  }

  // metadados diretos dos ids TERO que deram 404 (confirmar: sumidos ou lixeira)
  for (const id of [
    '1rFZr3eaoecD6L9lhEwRKoTQTEQfpbXjW',
    '1_2T-GcaQcggFaA-1sCsPUpPx2VQ4cSrt',
    '1lFs2ajO6y6oIJ3RTCR3X3qu2wX4M38b6',
    '1yXWHWNuLaF97xz1QvtsL86SUYNzAEQAi',
  ]) {
    try {
      const r = await drive.files.get({
        fileId: id,
        fields: 'id,name,trashed',
        supportsAllDrives: true,
      })
      console.log(`id ${id}: name=${r.data.name} trashed=${r.data.trashed}`)
    } catch (e) {
      console.log(`id ${id}: ${(e as Error).message.slice(0, 60)}`)
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
