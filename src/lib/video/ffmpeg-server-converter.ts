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

/**
 * Mix de áudio server-side: o WebM chega mudo do editor e a trilha é montada
 * aqui, deterministicamente (sem clone <video> nem WebAudio ao vivo).
 * Caminhos são ARQUIVOS LOCAIS já baixados pelo chamador.
 */
export type AudioMixOptions = {
  mode: 'original' | 'library' | 'mix'
  /** Vídeo fonte (áudio original) — obrigatório em original/mix */
  originalPath?: string
  /** Início do trecho no vídeo fonte (trim do editor), em segundos */
  originalTrimStart?: number
  /** Volume do áudio original 0–1 (mix; original puro fica 1) */
  originalVolume?: number
  /** Música — obrigatório em library/mix */
  musicPath?: string
  /** Início do trecho da música, em segundos */
  musicStart?: number
  /** Volume da música 0–1 */
  musicVolume?: number
  fadeInDuration?: number
  fadeOutDuration?: number
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
  /** Largura de destino do vídeo (ex: 1080 para Stories) */
  targetWidth?: number
  /** Altura de destino do vídeo (ex: 1920 para Stories) */
  targetHeight?: number
  /** Trilha sonora mixada pelo ffmpeg (WebM de entrada é mudo) */
  audioMix?: AudioMixOptions
}

/**
 * Monta inputs extras e o filter_complex de áudio para o AudioMixOptions.
 * Todas as cadeias terminam em [aout] com exatamente `duration` segundos
 * (atrim + apad), para o -t do output cortar vídeo e áudio juntos.
 */
function buildAudioMixArgs(
  mix: AudioMixOptions,
  duration: number | undefined,
): { inputArgs: string[]; filterArgs: string[]; mapArgs: string[] } {
  const inputArgs: string[] = []
  const chains: string[] = []
  let inputIndex = 1 // 0 é o WebM

  const dur = duration && duration > 0 ? duration : undefined
  const trimExpr = (start: number) =>
    `atrim=start=${start.toFixed(3)}${dur ? `:duration=${dur.toFixed(3)}` : ''},asetpts=PTS-STARTPTS`

  const fades: string[] = []
  if (mix.fadeInDuration && mix.fadeInDuration > 0) {
    fades.push(`afade=t=in:st=0:d=${mix.fadeInDuration.toFixed(3)}`)
  }
  if (mix.fadeOutDuration && mix.fadeOutDuration > 0 && dur) {
    const st = Math.max(0, dur - mix.fadeOutDuration)
    fades.push(`afade=t=out:st=${st.toFixed(3)}:d=${mix.fadeOutDuration.toFixed(3)}`)
  }
  const fadeExpr = fades.length ? `,${fades.join(',')}` : ''

  let originalLabel: string | null = null
  if ((mix.mode === 'original' || mix.mode === 'mix') && mix.originalPath) {
    inputArgs.push('-i', mix.originalPath)
    const vol = mix.originalVolume ?? 1
    chains.push(
      `[${inputIndex}:a]${trimExpr(mix.originalTrimStart ?? 0)},volume=${vol.toFixed(3)}[aorig]`,
    )
    originalLabel = '[aorig]'
    inputIndex++
  }

  let musicLabel: string | null = null
  if ((mix.mode === 'library' || mix.mode === 'mix') && mix.musicPath) {
    inputArgs.push('-i', mix.musicPath)
    const vol = mix.musicVolume ?? 0.8
    chains.push(
      `[${inputIndex}:a]${trimExpr(mix.musicStart ?? 0)},volume=${vol.toFixed(3)}${fadeExpr},apad[amus]`,
    )
    musicLabel = '[amus]'
    inputIndex++
  }

  let outChain: string
  if (originalLabel && musicLabel) {
    outChain = `${originalLabel}${musicLabel}amix=inputs=2:duration=longest:normalize=0,apad[aout]`
  } else if (musicLabel) {
    outChain = `${musicLabel}anull[aout]`
  } else if (originalLabel) {
    outChain = `${originalLabel}apad[aout]`
  } else {
    return { inputArgs: [], filterArgs: [], mapArgs: [] }
  }
  chains.push(outChain)

  return {
    inputArgs,
    filterArgs: ['-filter_complex', chains.join(';')],
    mapArgs: ['-map', '0:v:0', '-map', '[aout]'],
  }
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

    // Get path from installer (ffmpeg-static or @ffmpeg-installer)
    const installerPath = await resolveInstallerPath()

    const candidates = [
      // Environment variable (highest priority for manual override)
      process.env.FFMPEG_PATH,
      // Installer paths (ffmpeg-static or @ffmpeg-installer/ffmpeg)
      installerPath,
      // Next.js build output paths (where Vercel bundles ffmpeg-static)
      '/var/task/.next/server/chunks/ffmpeg',
      '/var/task/.next/server/vendor-chunks/ffmpeg',
      // Standard node_modules paths
      '/var/task/node_modules/ffmpeg-static/ffmpeg',
      '/var/task/node_modules/.bin/ffmpeg',
      // Other Vercel paths
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

    console.log('[FFmpeg] Iniciando busca por FFmpeg...')
    console.log('[FFmpeg] Total de candidatos:', candidates.length)

    for (const candidate of candidates) {
      try {
        console.log('[FFmpeg] Testando:', candidate)
        if (candidate && existsSync(candidate)) {
          cachedFfmpegPath = candidate
          console.log('[FFmpeg] ✅ ENCONTRADO:', candidate)
          break
        } else {
          console.log('[FFmpeg] ❌ Não existe:', candidate)
        }
      } catch (error) {
        console.warn('[FFmpeg] ⚠️  Erro ao testar:', candidate, error)
      }
    }

    if (cachedFfmpegPath) {
      console.log('[FFmpeg] 🎉 Usando binário em:', cachedFfmpegPath)
      if (!process.env.FFMPEG_PATH) {
        process.env.FFMPEG_PATH = cachedFfmpegPath
      }
    } else {
      console.error('[FFmpeg] ❌ NENHUM BINÁRIO ENCONTRADO')
      console.error('[FFmpeg] Candidatos testados:', lastCandidatePaths)
      console.error('[FFmpeg] 📚 Veja FFMPEG_VERCEL_SETUP.md para instruções')
    }
  }

  if (!cachedFfmpegPath) {
    const errorMsg =
      `FFmpeg não encontrado. Candidatos testados: ${lastCandidatePaths.join(', ')
      }. ` +
      `\n\nSOLUÇÃO IMEDIATA: Configure no Vercel Dashboard:\n` +
      `1. Vá em Settings → Environment Variables\n` +
      `2. Adicione: FFMPEG_PATH = /var/task/node_modules/ffmpeg-static/ffmpeg\n` +
      `3. Marque Production, Preview, Development\n` +
      `4. Redeploy o projeto\n\n` +
      `Consulte FFMPEG_VERCEL_SETUP.md para mais detalhes.`

    throw new Error(errorMsg)
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
    targetWidth,
    targetHeight,
    audioMix,
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

    const audioArgs = audioMix
      ? buildAudioMixArgs(audioMix, durationSeconds)
      : { inputArgs: [], filterArgs: [], mapArgs: [] }
    if (audioMix) {
      console.log('[FFmpeg Server] Mix de áudio:', audioMix.mode, audioArgs.filterArgs[1] ?? '(sem filtro)')
    }

    await runFfmpegCommand(
      [
        '-y',
        '-i',
        inputPath,
        ...audioArgs.inputArgs,
        ...audioArgs.filterArgs,
        ...audioArgs.mapArgs,
        // Corta vídeo e áudio juntos na duração alvo (as cadeias têm apad)
        ...(audioMix && durationSeconds ? ['-t', durationSeconds.toFixed(3)] : []),
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
        '-g',
        '30',
        '-max_muxing_queue_size',
        '1024',
        '-vf',
        // Se dimensões de destino forem fornecidas, aplicar escala e crop para preencher completamente sem letterboxing
        // Isso é crucial para Instagram Stories (9:16) e outros formatos específicos
        // Usa 'increase' para escalar até preencher, depois crop centralizado explícito para cortar excesso
        // (iw-ow)/2 e (ih-oh)/2 calculam a posição central do crop
        targetWidth && targetHeight
          ? `fps=30,scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}:(iw-ow)/2:(ih-oh)/2`
          : 'fps=30',
        '-r',
        '30',
        '-vsync',
        'cfr',
        // Preservar áudio: se existir, converter para AAC; se não existir, não adicionar
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        '-ar',
        '48000',
        '-ac',
        '2',
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
      `Falha ao converter vídeo: ${error instanceof Error ? error.message : 'Erro desconhecido'
      }. Caminho configurado: ${cachedFfmpegPath ?? 'nenhum'}. Candidatos testados: ${lastCandidatePaths.length ? lastCandidatePaths.join(', ') : 'nenhum'
      }`,
    )
  } finally {
    console.log('[FFmpeg Server] Limpando arquivos temporários...')
    await Promise.all([
      unlink(inputPath).catch(() => { }),
      unlink(outputPath).catch(() => { }),
      unlink(thumbnailPath).catch(() => { }),
    ])
  }
}

export function isFFmpegAvailable(): boolean {
  return Boolean(cachedFfmpegPath)
}
