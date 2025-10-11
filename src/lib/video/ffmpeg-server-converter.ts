import ffmpeg from 'fluent-ffmpeg'
import { readFile, writeFile, unlink } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { tmpdir } from 'os'

// Configura o caminho binário do FFmpeg
// A Vercel já tem FFmpeg pré-instalado, então tentamos usar o instalador
// como fallback para ambientes locais
try {
  const ffmpegPath = require('@ffmpeg-installer/ffmpeg')
  ffmpeg.setFfmpegPath(ffmpegPath.path)
} catch {
  // Se o instalador não estiver disponível, usa o FFmpeg do sistema
  // (Vercel tem FFmpeg pré-instalado em /usr/bin/ffmpeg)
  console.log('[FFmpeg] Usando FFmpeg do sistema')
}

export interface ConversionProgress {
  percent: number
  currentFps: number
  targetSize: string
  timemark: string
}

export interface ConversionOptions {
  /** Preset FFmpeg: ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow */
  preset?:
    | 'ultrafast'
    | 'superfast'
    | 'veryfast'
    | 'faster'
    | 'fast'
    | 'medium'
    | 'slow'
    | 'slower'
    | 'veryslow'
  /** CRF (Constant Rate Factor): 18-28, menor = melhor qualidade */
  crf?: number
  /** Gerar thumbnail do primeiro frame */
  generateThumbnail?: boolean
}

/**
 * Converte WebM para MP4 no servidor usando FFmpeg nativo com configurações
 * compatíveis com Instagram (H.264 + AAC, pixel format yuv420p, faststart).
 */
export async function convertWebMToMP4ServerSide(
  webmBuffer: Buffer,
  onProgress?: (progress: ConversionProgress) => void,
  options: ConversionOptions = {}
): Promise<{ mp4Buffer: Buffer; thumbnailBuffer?: Buffer }> {
  const {
    preset = 'fast',
    crf = 23,
    generateThumbnail = true,
  } = options

  const timestamp = Date.now()
  const inputPath = join(tmpdir(), `input-${timestamp}.webm`)
  const outputPath = join(tmpdir(), `output-${timestamp}.mp4`)
  const thumbnailPath = join(tmpdir(), `thumbnail-${timestamp}.jpg`)

  console.log('[FFmpeg Server] Iniciando conversão...')
  console.log('[FFmpeg Server] Input:', inputPath)
  console.log('[FFmpeg Server] Output:', outputPath)

  try {
    await writeFile(inputPath, webmBuffer)
    console.log(
      '[FFmpeg Server] Arquivo temporário criado:',
      (webmBuffer.length / 1024 / 1024).toFixed(2),
      'MB'
    )

    await new Promise<void>((resolve, reject) => {
      const command = ffmpeg(inputPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .outputOptions([
          `-preset ${preset}`,
          `-crf ${crf}`,
          '-pix_fmt yuv420p',
          '-movflags +faststart',
          '-profile:v baseline',
          '-level 3.0',
          '-max_muxing_queue_size 1024',
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('[FFmpeg Server] Comando:', commandLine)
        })
        .on('progress', (progress) => {
          console.log(
            `[FFmpeg Server] Progresso: ${progress.percent?.toFixed(1)}%`
          )
          onProgress?.({
            percent: progress.percent || 0,
            currentFps: progress.currentFps || 0,
            targetSize:
              progress.targetSize !== undefined && progress.targetSize !== null
                ? String(progress.targetSize)
                : '0KB',
            timemark: progress.timemark || '00:00:00',
          })
        })
        .on('end', () => {
          console.log('[FFmpeg Server] Conversão concluída!')
          resolve()
        })
        .on('error', (err, stdout, stderr) => {
          console.error('[FFmpeg Server] Erro:', err.message)
          console.error('[FFmpeg Server] stderr:', stderr)
          reject(new Error(`FFmpeg falhou: ${err.message}`))
        })

      command.run()
    })

    let thumbnailBuffer: Buffer | undefined
    if (generateThumbnail) {
      console.log('[FFmpeg Server] Gerando thumbnail...')
      await new Promise<void>((resolve, reject) => {
        ffmpeg(outputPath)
          .screenshots({
            count: 1,
            timemarks: ['0'],
            filename: basename(thumbnailPath),
            folder: dirname(thumbnailPath),
          })
          .on('end', () => {
            console.log('[FFmpeg Server] Thumbnail gerado!')
            resolve()
          })
          .on('error', (err) => {
            console.error(
              '[FFmpeg Server] Erro ao gerar thumbnail:',
              err.message
            )
            reject(new Error(`Falha ao gerar thumbnail: ${err.message}`))
          })
      })

      try {
        thumbnailBuffer = await readFile(thumbnailPath)
      } catch (error) {
        console.warn(
          '[FFmpeg Server] Não foi possível ler thumbnail:',
          error
        )
      }
    }

    const mp4Buffer = await readFile(outputPath)

    return {
      mp4Buffer,
      thumbnailBuffer,
    }
  } catch (error) {
    console.error('[FFmpeg Server] Falha na conversão:', error)
    throw new Error(
      `Falha ao converter vídeo: ${
        error instanceof Error ? error.message : 'Erro desconhecido'
      }`
    )
  } finally {
    console.log('[FFmpeg Server] Limpando arquivos temporários...')
    await Promise.all([
      unlink(inputPath).catch(() => {}),
      unlink(outputPath).catch(() => {}),
      unlink(thumbnailPath).catch(() => {}),
    ])
  }
}

export function isFFmpegAvailable(): boolean {
  try {
    const ffmpegPath = require('@ffmpeg-installer/ffmpeg')
    return Boolean(ffmpegPath.path)
  } catch {
    // Assume que FFmpeg está disponível no sistema (Vercel)
    return true
  }
}
