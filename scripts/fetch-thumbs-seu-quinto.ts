/**
 * fetch-thumbs-seu-quinto.ts
 *
 * Baixa as miniaturas de todas as imagens do catálogo do Seu Quinto e as grava
 * agrupadas por pasta, para montar folhas de contato visuais.
 *
 * Uso:
 *   npx tsx scripts/fetch-thumbs-seu-quinto.ts --out <dir> [--size 240]
 */

import { google } from 'googleapis'
import * as https from 'https'
import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'
import 'dotenv/config'

const CATALOG_FILE_ID = '1p1toWBs2-eQTp_hDEo7Jx6ukbbw8SaFB'

function arg(name: string, dflt?: string) {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return dflt
  const v = process.argv[i + 1]
  return v && !v.startsWith('--') ? v : 'true'
}

function getDrive() {
  const c = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
  )
  c.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN })
  return google.drive({ version: 'v3', auth: c })
}

function fetchBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    client
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchBuffer(res.headers.location).then(resolve).catch(reject)
        }
        if (res.statusCode && res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}`))
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      })
      .on('error', reject)
  })
}

const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const outDir = arg('out')!
  const size = arg('size', '240')
  const concurrency = Number(arg('concurrency', '8'))
  if (!outDir) throw new Error('--out é obrigatório')

  const drive = getDrive()
  const cat: any = (await drive.files.get({ fileId: CATALOG_FILE_ID, alt: 'media' }, { responseType: 'json' })).data
  const ativos = cat.images.filter((i: any) => !i.ausenteNoDrive)
  console.log(`imagens: ${ativos.length}`)

  fs.mkdirSync(outDir, { recursive: true })
  const indice: any[] = []
  let cursor = 0
  let ok = 0
  let erros = 0

  async function worker() {
    while (true) {
      const i = cursor++
      if (i >= ativos.length) return
      const img = ativos[i]
      const dir = path.join(outDir, slug(img.folder) || 'raiz')
      try {
        fs.mkdirSync(dir, { recursive: true })
        const dest = path.join(dir, `${String(i).padStart(4, '0')}_${slug(img.fileName)}.jpg`)
        if (!fs.existsSync(dest)) {
          const meta = await drive.files.get({ fileId: img.driveFileId, fields: 'thumbnailLink' })
          if (!meta.data.thumbnailLink) throw new Error('sem thumbnail')
          const buf = await fetchBuffer(meta.data.thumbnailLink.replace(/=s\d+/, `=s${size}`))
          fs.writeFileSync(dest, buf)
        }
        indice.push({ folder: img.folder, file: img.fileName, thumb: dest, quality: img.quality, cliente: img.clienteIdentificavel })
        ok++
      } catch (e: any) {
        erros++
        await sleep(400)
      }
      if ((ok + erros) % 100 === 0) console.log(`   [${ok + erros}/${ativos.length}] ok ${ok} · erros ${erros}`)
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  fs.writeFileSync(path.join(outDir, '_indice.json'), JSON.stringify(indice, null, 2))
  console.log(`\n✓ miniaturas: ${ok} · erros: ${erros}`)
  console.log(`✓ índice → ${path.join(outDir, '_indice.json')}`)
}

main().catch((e) => {
  console.error('✗', e?.message ?? e)
  process.exit(1)
})
