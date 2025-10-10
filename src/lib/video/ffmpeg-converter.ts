import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

/**
 * Singleton FFmpeg instance para reutilização
 */
let ffmpegInstance: FFmpeg | null = null
let isLoaded = false

/**
 * Inicializa e carrega o FFmpeg.wasm
 * Reutiliza a instância se já estiver carregada
 */
async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance && isLoaded) {
    return ffmpegInstance
  }

  if (!ffmpegInstance) {
    ffmpegInstance = new FFmpeg()

    // Log de progresso (opcional)
    ffmpegInstance.on('log', ({ message }) => {
      console.log('[FFmpeg]', message)
    })

    ffmpegInstance.on('progress', ({ progress, time }) => {
      console.log('[FFmpeg Progress]', `${(progress * 100).toFixed(2)}%`, `Time: ${time}`)
    })
  }

  if (!isLoaded) {
    console.log('[FFmpeg] Carregando FFmpeg.wasm...')

    // Usar CDN direto sem toBlobURL (evita problemas de COOP/COEP em desenvolvimento)
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'

    try {
      await ffmpegInstance.load({
        coreURL: `${baseURL}/ffmpeg-core.js`,
        wasmURL: `${baseURL}/ffmpeg-core.wasm`,
      })

      isLoaded = true
      console.log('[FFmpeg] FFmpeg.wasm carregado com sucesso!')
    } catch (error) {
      console.error('[FFmpeg] Erro ao carregar FFmpeg.wasm:', error)
      throw new Error('Falha ao carregar conversor de vídeo. Verifique sua conexão com a internet.')
    }
  }

  return ffmpegInstance
}

/**
 * Converte um vídeo WebM para MP4 usando FFmpeg.wasm
 *
 * @param webmBlob - Blob do vídeo WebM original
 * @param onProgress - Callback para progresso da conversão (0-100)
 * @returns Blob do vídeo MP4 convertido
 */
export async function convertWebMToMP4(
  webmBlob: Blob,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  console.log('[convertWebMToMP4] Iniciando conversão...')
  console.log('[convertWebMToMP4] Tamanho do WebM:', (webmBlob.size / 1024 / 1024).toFixed(2), 'MB')

  try {
    // 1. Carregar FFmpeg
    onProgress?.(10)
    const ffmpeg = await loadFFmpeg()

    // 2. Escrever arquivo WebM no sistema de arquivos virtual do FFmpeg
    onProgress?.(20)
    console.log('[convertWebMToMP4] Escrevendo arquivo input.webm...')
    await ffmpeg.writeFile('input.webm', await fetchFile(webmBlob))

    // 3. Executar conversão com FFmpeg
    // Usando codec copy para acelerar (sem recodificação)
    // Se o WebM for VP9, isso funciona bem. Se for VP8, pode precisar de recodificação.
    onProgress?.(30)
    console.log('[convertWebMToMP4] Executando conversão...')

    try {
      // Tentar primeiro com copy (mais rápido)
      await ffmpeg.exec([
        '-i',
        'input.webm',
        '-c:v',
        'copy', // Copiar codec de vídeo sem recodificar
        '-movflags',
        'faststart', // Otimizar para streaming
        'output.mp4',
      ])
    } catch (copyError) {
      console.warn('[convertWebMToMP4] Copy falhou, tentando recodificação...')
      // Se copy falhar, tentar recodificar com H.264
      await ffmpeg.exec([
        '-i',
        'input.webm',
        '-c:v',
        'libx264', // Recodificar para H.264
        '-preset',
        'fast', // Preset rápido
        '-crf',
        '23', // Qualidade (18-28, menor = melhor qualidade)
        '-movflags',
        'faststart',
        'output.mp4',
      ])
    }

    onProgress?.(80)

    // 4. Ler arquivo MP4 convertido
    console.log('[convertWebMToMP4] Lendo arquivo output.mp4...')
    const data = await ffmpeg.readFile('output.mp4')

    // 5. Limpar arquivos temporários
    onProgress?.(90)
    await ffmpeg.deleteFile('input.webm')
    await ffmpeg.deleteFile('output.mp4')

    // 6. Criar Blob do MP4
    // Converter FileData (Uint8Array) para Blob
    const mp4Blob = new Blob([new Uint8Array(data)], { type: 'video/mp4' })
    console.log('[convertWebMToMP4] Conversão concluída!')
    console.log('[convertWebMToMP4] Tamanho do MP4:', (mp4Blob.size / 1024 / 1024).toFixed(2), 'MB')

    onProgress?.(100)
    return mp4Blob
  } catch (error) {
    console.error('[convertWebMToMP4] Erro na conversão:', error)
    throw new Error(
      'Falha ao converter vídeo para MP4. ' +
        (error instanceof Error ? error.message : 'Erro desconhecido')
    )
  }
}

/**
 * Verifica se o FFmpeg.wasm está disponível no navegador
 */
export function isFFmpegSupported(): boolean {
  // FFmpeg.wasm requer SharedArrayBuffer, que precisa de headers COOP/COEP
  // Em desenvolvimento, normalmente funciona. Em produção, precisa configurar headers.
  try {
    return typeof SharedArrayBuffer !== 'undefined'
  } catch {
    return false
  }
}

/**
 * Pré-carrega o FFmpeg.wasm para melhorar performance
 * Útil para chamar antes de o usuário clicar em "exportar"
 */
export async function preloadFFmpeg(): Promise<boolean> {
  try {
    await loadFFmpeg()
    return true
  } catch (error) {
    console.error('[preloadFFmpeg] Falha ao pré-carregar FFmpeg:', error)
    return false
  }
}
