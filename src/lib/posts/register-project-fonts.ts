/**
 * Registers a project's custom fonts with @napi-rs/canvas so server-side
 * renders (stories, arte rápida) use the brand typefaces instead of falling
 * back to a system font.
 *
 * Fonts are cached on disk under /tmp so repeated renders in the same
 * serverless instance skip the download.
 *
 * Na Vercel NÃO existe fonte de sistema: família que falha aqui desenha NADA
 * (texto some da arte em silêncio — foi assim que o "de domingo" sumiu do
 * story do By Rock em 01/08). Por isso este módulo é paranóico:
 * - resposta não-2xx REJEITA (antes gravava o corpo do erro como .otf no
 *   cache, envenenando a instância quente para sempre);
 * - o retorno booleano de registerFromPath é conferido (não lança!) e um
 *   arquivo que não registra é apagado do cache e baixado de novo uma vez;
 * - falha vira log ALTO com o nome da família, nunca silêncio.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import * as http from 'http'
import { db } from '@/lib/db'

export function fetchBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    client
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchBuffer(res.headers.location).then(resolve).catch(reject)
        }
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume() // drena para liberar o socket
          return reject(new Error(`HTTP ${res.statusCode} ao baixar ${url}`))
        }
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      })
      .on('error', reject)
  })
}

/** Assinaturas de arquivo de fonte aceitas (OTF, TTF, coleção, WOFF/WOFF2). */
function pareceFonte(buf: Buffer): boolean {
  if (buf.length < 1024) return false
  const magic = buf.subarray(0, 4).toString('latin1')
  return (
    magic === 'OTTO' ||
    magic === 'true' ||
    magic === 'ttcf' ||
    magic === 'wOFF' ||
    magic === 'wOF2' ||
    (buf[0] === 0x00 && buf[1] === 0x01 && buf[2] === 0x00 && buf[3] === 0x00)
  )
}

export async function registerProjectFonts(projectId: number): Promise<void> {
  const fonts = await db.customFont.findMany({ where: { projectId } })
  if (fonts.length === 0) return

  // Dynamic import to avoid static bundling of @napi-rs/canvas
  const { GlobalFonts } = await import('@napi-rs/canvas')
  const fontDir = `/tmp/studio-lagosta-fonts/${projectId}`

  if (!fs.existsSync(fontDir)) {
    fs.mkdirSync(fontDir, { recursive: true })
  }

  const falhas: string[] = []

  for (const font of fonts) {
    const ext = path.extname(font.fileUrl) || '.otf'
    const filePath = path.join(fontDir, `${font.fontFamily}${ext}`)

    const baixar = async (): Promise<boolean> => {
      try {
        const buf = await fetchBuffer(font.fileUrl)
        if (!pareceFonte(buf)) {
          throw new Error(`resposta não parece arquivo de fonte (${buf.length} bytes)`)
        }
        fs.writeFileSync(filePath, buf)
        return true
      } catch (error) {
        console.warn(`[fonts] Failed to download font ${font.fontFamily}:`, error)
        return false
      }
    }

    if (!fs.existsSync(filePath) && !(await baixar())) {
      falhas.push(font.fontFamily)
      continue
    }

    // registerFromPath devolve false em arquivo corrompido — NÃO lança. Cache
    // envenenado (download antigo que gravou lixo) é descartado e refeito.
    let ok = false
    try {
      ok = GlobalFonts.registerFromPath(filePath, font.fontFamily) !== false
    } catch {
      ok = false
    }
    if (!ok) {
      fs.rmSync(filePath, { force: true })
      if (await baixar()) {
        try {
          ok = GlobalFonts.registerFromPath(filePath, font.fontFamily) !== false
        } catch {
          ok = false
        }
      }
    }
    if (!ok) falhas.push(font.fontFamily)
  }

  if (falhas.length > 0) {
    // Alto de propósito: com família faltando, o texto daquela camada sai
    // INVISÍVEL no render serverless.
    console.error(
      `[fonts] ${falhas.length}/${fonts.length} fontes NÃO registradas no projeto ${projectId}: ${falhas.join(', ')} — texto nessas famílias vai sumir do render`,
    )
  } else {
    console.log(`[fonts] ${fonts.length} fonts processed for project ${projectId}`)
  }
}
