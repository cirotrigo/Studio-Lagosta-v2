/**
 * Envia os motions (.webm) de uma pasta local para a subpasta "Motions" da
 * pasta de Vídeos do cliente no Drive — é de lá que a aba Vídeos do editor lê.
 *
 * uso: npx tsx --env-file=.env scripts/motions/enviar-ao-drive.ts <projectId> <pasta> [--confirmar]
 * Sem --confirmar só lista o que faria. Arquivo com o mesmo nome já na pasta é pulado.
 */
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { db } from '../../src/lib/db'
import { googleDriveService } from '../../src/server/google-drive-service'

const [projectId, pasta] = process.argv.slice(2)
const CONFIRMAR = process.argv.includes('--confirmar')

async function main() {
  if (!projectId || !pasta) throw new Error('uso: enviar-ao-drive.ts <projectId> <pasta> [--confirmar]')
  const projeto = await db.project.findUnique({
    where: { id: Number(projectId) },
    select: { name: true, googleDriveVideosFolderId: true, googleDriveVideosFolderName: true },
  })
  if (!projeto?.googleDriveVideosFolderId) throw new Error(`projeto ${projectId} sem pasta de Vídeos configurada`)
  console.log(`${projeto.name} — pasta de Vídeos: ${projeto.googleDriveVideosFolderName} ${CONFIRMAR ? '' : '(dry-run)'}`)

  const pastas = await googleDriveService.listFiles({ folderId: projeto.googleDriveVideosFolderId, mode: 'folders', search: 'Motions' })
  let motionsId = pastas.items.find((i) => i.name === 'Motions')?.id ?? null
  if (!motionsId && CONFIRMAR) motionsId = await googleDriveService.createFolder('Motions', projeto.googleDriveVideosFolderId)
  console.log(motionsId ? `subpasta Motions: ${motionsId}` : 'subpasta Motions: seria criada')

  const jaLa = new Set<string>()
  let pageToken: string | undefined
  if (motionsId) {
    do {
      const r = await googleDriveService.listFiles({ folderId: motionsId, mode: 'videos', pageToken })
      r.items.forEach((i) => jaLa.add(i.name))
      pageToken = r.nextPageToken
    } while (pageToken)
  }

  // `uploadFileToFolder` renomeia com carimbo e sufixo; aqui o nome é o que a equipe lê na aba Vídeos.
  const drive = (googleDriveService as unknown as { drive: import('googleapis').drive_v3.Drive }).drive
  for (const nome of fs.readdirSync(pasta).filter((f) => f.endsWith('.webm')).sort()) {
    if (jaLa.has(nome)) { console.log(`já está lá  ${nome}`); continue }
    if (!CONFIRMAR) { console.log(`enviaria    ${nome}`); continue }
    const r = await drive.files.create({
      requestBody: { name: nome, parents: [motionsId!], mimeType: 'video/webm' },
      media: { mimeType: 'video/webm', body: Readable.from(fs.readFileSync(path.join(pasta, nome))) },
      fields: 'id',
      supportsAllDrives: true,
    })
    console.log(`enviado     ${nome}  (${r.data.id})`)
  }
  await db.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
