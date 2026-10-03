/**
 * A CAPA de um vídeo: um quadro em JPEG de 480px de largura, para os cards da
 * agenda (`/api/video-thumb`). Só servidor — usa o ffmpeg do projeto.
 *
 * Por que no servidor, e não um `<video preload="metadata">` no card: medido
 * em 02/10/2026 com os 37 vídeos da Wine Vix de set/out — o navegador baixa
 * de 1 a 5 MB POR vídeo para desenhar o primeiro quadro (os MP4 têm ~14 Mbps),
 * ~83 MB numa visão de mês. Aqui o ffmpeg lê só o começo do arquivo (range,
 * ~0,5s por vídeo) e o card recebe ~45 KB.
 */

import { spawn } from 'child_process'
import { isVideoUrl } from '@/lib/media-type'
import { ensureFfmpegPath } from './ffmpeg-server-converter'

/**
 * Vídeo de post só mora no Blob do Studio. Checagem por HOSTNAME, nunca por
 * `includes` na URL inteira: a URL vira leitura a partir do servidor (SSRF).
 */
export function videoDoBlob(alvo: string): URL | null {
  let origem: URL
  try {
    origem = new URL(alvo)
  } catch {
    return null
  }
  if (origem.protocol !== 'https:') return null
  if (!origem.hostname.toLowerCase().endsWith('.public.blob.vercel-storage.com')) return null
  if (!isVideoUrl(origem.pathname)) return null
  return origem
}

function extrairQuadro(ffmpeg: string, url: string, segundo: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const processo = spawn(
      ffmpeg,
      [
        '-hide_banner', '-loglevel', 'error',
        // Um redirect não pode levar o ffmpeg a outro protocolo (file:, concat:…)
        '-protocol_whitelist', 'https,tls,tcp',
        '-ss', String(segundo),
        '-i', url,
        '-frames:v', '1',
        '-vf', 'scale=480:-2',
        '-q:v', '5',
        '-f', 'image2pipe', '-vcodec', 'mjpeg',
        'pipe:1',
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    )
    const partes: Buffer[] = []
    const prazo = setTimeout(() => processo.kill('SIGKILL'), 20_000)
    processo.stdout.on('data', (parte: Buffer) => partes.push(parte))
    processo.on('error', () => {
      clearTimeout(prazo)
      resolve(null)
    })
    processo.on('close', () => {
      clearTimeout(prazo)
      const jpeg = Buffer.concat(partes)
      resolve(jpeg.length > 0 ? jpeg : null)
    })
  })
}

/**
 * O quadro de capa, ou `null` quando o vídeo não pôde ser lido (blob apagado,
 * host antigo). Lança só se o ffmpeg não existir no ambiente.
 */
export async function extrairCapaDeVideo(origem: URL): Promise<Buffer | null> {
  const ffmpeg = await ensureFfmpegPath()
  const url = origem.toString()
  // 1s pula o fade de abertura; vídeo mais curto que isso não devolve quadro
  // nenhum, e aí vale o primeiro.
  return (await extrairQuadro(ffmpeg, url, 1)) ?? (await extrairQuadro(ffmpeg, url, 0))
}
