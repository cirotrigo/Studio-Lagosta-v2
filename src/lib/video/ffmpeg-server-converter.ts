import { existsSync } from 'fs'
import { readFile, writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawn } from 'child_process'

export type ConversionProgress = {
  percent: number
  currentFps: number
  targetSize: string
  timemark: string
}

export type ConversionOptions = {
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
  crf?: number
  generateThumbnail?: boolean
  durationSeconds?: number
}

let cachedFfmpegPath: string | null = null
let attemptedResolution = false
let lastCandidatePaths: string[] = []

async function resolveInstallerPath(): Promise<string | null> {
  // Try ffmpeg-static first (better for serverless)
  try {
    const ffmpegStatic = await import('ffmpeg-static')
    const staticPath = typeof ffmpegStatic === 'string'
      ? ffmpegStatic
      : (ffmpegStatic as { default?: string }).default

    if (staticPath) {
      console.log('[FFmpeg] ffmpeg-static path found:', staticPath)
      if (existsSync(staticPath)) {
        console.log('[FFmpeg] ✅ ffmpeg-static binary validated')
        return staticPath
      } else {
        console.log('[FFmpeg] ❌ ffmpeg-static path not accessible:', staticPath)
      }
    }
  } catch (error) {
    console.warn('[FFmpeg] ⚠️ ffmpeg-static não disponível:', error)
  }

  // Fallback to @ffmpeg-installer/ffmpeg
  try {
    const installer = await import('@ffmpeg-installer/ffmpeg')

    console.log('[FFmpeg] Trying @ffmpeg-installer/ffmpeg...')

    // Check all possible path locations
    const possible = [
      (installer as { path?: string }).path,
      (installer as { ffmpegPath?: string }).ffmpegPath,
      (installer as { default?: { path?: string; ffmpegPath?: string } }).default?.path,
      (installer as { default?: { path?: string; ffmpegPath?: string } }).default?.ffmpegPath,
    ].filter(Boolean) as string[]

    console.log('[FFmpeg] Possible installer paths:', possible)

    for (const candidate of possible) {
      if (candidate && existsSync(candidate)) {
        console.log('[FFmpeg] ✅ Installer path validated:', candidate)
        return candidate
      } else {
        console.log('[FFmpeg] ❌ Installer path not found:', candidate)
      }
    }
  } catch (error) {
    console.warn('[FFmpeg] ⚠️ @ffmpeg-installer/ffmpeg não disponível:', error)
  }

  return null
}

async function ensureFfmpegPath(): Promise<string> {
  if (cachedFfmpegPath) {
    return cachedFfmpegPath
  }

  if (!attemptedResolution) {
    attemptedResolution = true
    const installerPath = await resolveInstallerPath()

    const candidates = [
      process.env.FFMPEG_PATH,
      installerPath,
      // Vercel-specific paths
      '/opt/bin/ffmpeg',
      '/opt/ffmpeg/ffmpeg',
      '/var/task/ffmpeg',
      // Standard Unix paths
      '/usr/bin/ffmpeg',
      '/usr/local/bin/ffmpeg',
      '/opt/homebrew/bin/ffmpeg',
      // Windows fallback (for local dev on Windows)
      'C:\\ffmpeg\\bin\\ffmpeg.exe',
    ].filter(Boolean) as string[]

    lastCandidatePaths = candidates

    for (const candidate of candidates) {
      try {
        console.log('[FFmpeg] Testando caminho:', candidate)
        if (candidate && existsSync(candidate)) {
          cachedFfmpegPath = candidate
          console.log('[FFmpeg] ✅ Binário encontrado em:', candidate)
          break
        }
      } catch (error) {
        console.warn('[FFmpeg] ❌ Falha ao testar caminho', candidate, error)
      }
    }

    if (cachedFfmpegPath) {
      console.log('[FFmpeg] Usando binário em:', cachedFfmpegPath)
      if (!process.env.FFMPEG_PATH) {
        process.env.FFMPEG_PATH = cachedFfmpegPath
      }
    } else {
      console.warn('[FFmpeg] ⚠️  Nenhum binário encontrado automaticamente.')
      console.warn('[FFmpeg] Veja FFMPEG_VERCEL_SETUP.md para configurar no Vercel')
    }
  }

  if (!cachedFfmpegPath) {
    throw new Error(
      `FFmpeg não encontrado. Candidatos testados: ${
        lastCandidatePaths.length ? lastCandidatePaths.join(', ') : 'nenhum'
      }. ` +
      `SOLUÇÃO: Configure a variável de ambiente FFMPEG_PATH ou instale uma FFmpeg Layer no Vercel. ` +
      `Consulte FFMPEG_VERCEL_SETUP.md para mais detalhes.`,
    )
  }

  return cachedFfmpegPath
}

function runFfmpegCommand(
  args: string[],
  {
    onStdout,
    onStderr,
  }: {
    onStdout?: (line: string) => void
    onStderr?: (line: string) => void
  } = {},
): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const ffmpegPath = await ensureFfmpegPath()
      const ffmpegProcess = spawn(ffmpegPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      ffmpegProcess.stdout.setEncoding('utf-8')
      ffmpegProcess.stderr.setEncoding('utf-8')

      ffmpegProcess.stdout.on('data', (chunk: string) => {
        chunk
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .forEach((line) => onStdout?.(line))
      })

      let stderrOutput = ''
      ffmpegProcess.stderr.on('data', (chunk: string) => {
        stderrOutput += chunk
        chunk
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .forEach((line) => onStderr?.(line))
      })

      ffmpegProcess.on('error', (error) => {
        reject(new Error(`Falha ao executar FFmpeg: ${error instanceof Error ? error.message : String(error)}`))
      })

      ffmpegProcess.on('close', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`FFmpeg retornou código ${code}. Log: ${stderrOutput}`))
        }
      })
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

export async function convertWebMToMP4ServerSide(
  webmBuffer: Buffer,
  onProgress?: (progress: ConversionProgress) => void,
  options: ConversionOptions = {},
): Promise<{ mp4Buffer: Buffer; thumbnailBuffer?: Buffer }> {
  const {
    preset = 'fast',
    crf = 23,
    generateThumbnail = true,
    durationSeconds,
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
      'MB',
    )

    await runFfmpegCommand(
      [
        '-y',
        '-i',
        inputPath,
        '-c:v',
        'libx264',
        '-preset',
        preset,
        '-crf',
        String(crf),
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        '-profile:v',
        'baseline',
        '-level',
        '3.0',
        '-max_muxing_queue_size',
        '1024',
        '-vf',
        'fps=30',
        '-r',
        '30',
        '-vsync',
        'cfr',
        '-c:a',
        'aac',
        '-progress',
        'pipe:1',
        '-nostats',
        outputPath,
      ],
      {
        onStdout: (line) => {
          if (line.startsWith('out_time_ms=') && durationSeconds) {
            const outTimeMicro = Number(line.split('=')[1])
            if (Number.isFinite(outTimeMicro)) {
              const percent = Math.min(
                100,
                (outTimeMicro / (durationSeconds * 1_000_000)) * 100,
              )
              onProgress?.({
                percent,
                currentFps: 0,
                targetSize: '0',
                timemark: '',
              })
            }
          }
        },
        onStderr: (line) => {
          console.log('[FFmpeg Server]', line)
        },
      },
    )

    let thumbnailBuffer: Buffer | undefined
    if (generateThumbnail) {
      console.log('[FFmpeg Server] Gerando thumbnail...')
      await runFfmpegCommand(
        [
          '-y',
          '-i',
          outputPath,
          '-frames:v',
          '1',
          '-q:v',
          '2',
          thumbnailPath,
        ],
        {
          onStderr: (line) => console.log('[FFmpeg Server][Thumbnail]', line),
        },
      )

      try {
        thumbnailBuffer = await readFile(thumbnailPath)
      } catch (error) {
        console.warn('[FFmpeg Server] Não foi possível ler thumbnail:', error)
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
      }. Caminho configurado: ${cachedFfmpegPath ?? 'nenhum'}. Candidatos testados: ${
        lastCandidatePaths.length ? lastCandidatePaths.join(', ') : 'nenhum'
      }`,
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
  return Boolean(cachedFfmpegPath)
}
