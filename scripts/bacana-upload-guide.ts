import { googleDriveService } from '../src/server/google-drive-service'
import * as fs from 'fs'
import * as path from 'path'

const FOLDER_ID = '1HDp8rKhpf9OdZwz-wbSogx3_gBezhlwt' // _sistema/guias-de-referencia
const PDF_PATH = path.join(process.env.HOME!, 'Downloads/guia-visual-bacana-v11.pdf')

async function main() {
  if (!fs.existsSync(PDF_PATH)) {
    console.error(`❌ PDF não encontrado: ${PDF_PATH}`)
    process.exit(1)
  }

  const buffer = fs.readFileSync(PDF_PATH)
  console.log(`Enviando guia-visual-bacana-v11.pdf (${(buffer.length / 1024 / 1024).toFixed(1)} MB)...`)

  await googleDriveService.uploadFileToFolder({
    buffer,
    fileName: 'guia-visual-bacana-v11.pdf',
    mimeType: 'application/pdf',
    folderId: FOLDER_ID,
  })

  console.log(`✓ Guia v1.1 enviado para _sistema/guias-de-referencia/`)
}

main().catch(console.error)
