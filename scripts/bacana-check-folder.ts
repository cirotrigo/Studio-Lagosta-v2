import { googleDriveService } from '../src/server/google-drive-service'

const BACANA_ROOT = '1odItv9IZ1IUHl7r0ux19iWjGigqDHoQ3'

async function main() {
  console.log('Listando pasta BACANA CHURRASCARIA...\n')
  const items = await googleDriveService.listFolderFiles(BACANA_ROOT)
  if (!items.length) {
    console.log('Pasta vazia — sem subpastas ou arquivos.')
  } else {
    for (const item of items) {
      const tipo = item.mimeType?.includes('folder') ? '[pasta]' : '[arquivo]'
      console.log(`${tipo} ${item.name} — ${item.id}`)
    }
  }
}

main().catch(console.error)
