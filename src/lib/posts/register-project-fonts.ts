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
 * - o retorno de registerFromPath é conferido (não lança! `false` na 0.1.x, `null` na 1.0.x) e um
 *   arquivo que não registra é apagado do cache e baixado de novo uma vez;
 * - falha vira log ALTO com o nome da família, nunca silêncio.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import * as http from 'http'
import { db } from '@/lib/db'
import { garantirFontesPadrao } from '@/lib/canvas-renderer'

/** CP5c § 3: o download aceita cancelamento (`req.destroy()` no abort) e um teto por download (`socket.setTimeout`). */
export interface OpcoesDoDownload {
  signal?: AbortSignal
  /** Teto de inatividade do socket, em ms; sem ele não há teto (o comportamento de sempre). */
  timeoutMs?: number
}

export function fetchBuffer(url: string, opcoes: OpcoesDoDownload = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const { signal, timeoutMs } = opcoes
    const erroDeAborto = () => (signal?.reason instanceof Error ? signal.reason : new Error(`download abortado: ${url}`))
    if (signal?.aborted) return reject(erroDeAborto())
    const client = url.startsWith('https') ? https : http
    let terminou = false
    const aoAbortar = () => {
      if (terminou) return
      terminou = true
      req.destroy(erroDeAborto())
      reject(erroDeAborto())
    }
    const fechar = <T>(fim: (v: T) => void) => (v: T) => {
      if (terminou) return
      terminou = true
      signal?.removeEventListener('abort', aoAbortar)
      fim(v)
    }
    const ok = fechar(resolve)
    const falhou = fechar(reject)
    const req = client
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          // O redirecionamento segue com o MESMO sinal e o mesmo teto (CP5c: redirecionamento em laço também cai no prazo).
          return fetchBuffer(res.headers.location, opcoes).then(ok).catch(falhou)
        }
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume() // drena para liberar o socket
          return falhou(new Error(`HTTP ${res.statusCode} ao baixar ${url}`))
        }
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => ok(Buffer.concat(chunks)))
        res.on('error', falhou)
      })
      .on('error', falhou)
    if (timeoutMs && timeoutMs > 0) req.setTimeout(timeoutMs, () => req.destroy(new Error(`download sem resposta por ${timeoutMs} ms: ${url}`)))
    signal?.addEventListener('abort', aoAbortar, { once: true })
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

/** CP5c: quem lê `CustomFont` (o `db`, ou a transação do gate, sob as travas) e o sinal/teto dos downloads. */
export interface OpcoesDoRegistroDeFontes extends OpcoesDoDownload {
  cliente?: { customFont: { findMany: (args: { where: { projectId: number } }) => Promise<Array<{ fontFamily: string; fileUrl: string }>> } }
}

export async function registerProjectFonts(projectId: number, opcoes: OpcoesDoRegistroDeFontes = {}): Promise<void> {
  garantirFontesPadrao()
  const cliente = opcoes.cliente ?? db
  const fonts = await cliente.customFont.findMany({ where: { projectId } })
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
        const buf = await fetchBuffer(font.fileUrl, { signal: opcoes.signal, timeoutMs: opcoes.timeoutMs })
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

    // registerFromPath devolve false (0.1.x) ou null (1.0.x) em arquivo corrompido — NÃO lança. Cache
    // envenenado (download antigo que gravou lixo) é descartado e refeito.
    let ok = false
    try {
      ok = Boolean(GlobalFonts.registerFromPath(filePath, font.fontFamily))
    } catch {
      ok = false
    }
    if (!ok) {
      fs.rmSync(filePath, { force: true })
      if (await baixar()) {
        try {
          ok = Boolean(GlobalFonts.registerFromPath(filePath, font.fontFamily))
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

/**
 * Das famílias pedidas, as que NÃO estão carregadas no registro do napi-rs
 * (nem como fonte do projeto, nem como fonte do sistema). Texto nessas
 * famílias é medido e desenhado na fonte de FALLBACK — a medida não vale, e
 * quem compõe precisa dizer "não medido" em vez de fingir que mediu (PR 4 de
 * "Marca simples, copy melhor", 12/09/2026). Nunca lança: sem o módulo nativo
 * devolve todas como não carregadas, que é o lado honesto do erro.
 */
export async function familiasNaoCarregadas(familias: string[]): Promise<Set<string>> {
  const pedidas = [...new Set(familias.filter((f) => typeof f === 'string' && f.trim()))]
  try {
    const { GlobalFonts } = await import('@napi-rs/canvas')
    return new Set(pedidas.filter((f) => !GlobalFonts.has(f)))
  } catch {
    return new Set(pedidas)
  }
}
