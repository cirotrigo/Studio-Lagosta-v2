/**
 * MVSEP API Client
 * Handles music stem separation using the MVSEP service
 * API Docs: https://mvsep.com/pt/full_api
 */

import { db } from '@/lib/db'
import { put } from '@vercel/blob'
import type { MusicStemJob } from '@prisma/client'

const MVSEP_API_KEY = process.env.MVSEP_API_KEY || 'BrIkx8zYQbvc4TggAZbsL96Mag9WN5'
const MVSEP_API_URL = 'https://mvsep.com/api'

interface MvsepCreateResponse {
  success: boolean
  data?: {
    hash: string
    link: string
  }
  errors?: string[]
  message?: string
}

interface MvsepStatusResponse {
  success: boolean
  status: 'waiting' | 'processing' | 'done' | 'failed'
  data?: {
    files?: Array<any> // Structure varies, use helper functions to extract fields
    algorithm?: string
    output_format?: string
    date?: string
  }
  message?: string
}

/**
 * Inicia a separação de stems para um job de música
 */
export async function startStemSeparation(job: MusicStemJob & { music: any }) {
  try {
    console.log(`[MVSEP] Starting stem separation for job ${job.id}, music ${job.musicId}`)

    // Atualizar status para processing
    await db.musicStemJob.update({
      where: { id: job.id },
      data: {
        status: 'processing',
        startedAt: new Date(),
        progress: 10,
      },
    })

    // Download do arquivo do Vercel Blob
    console.log('[MVSEP] Downloading file from Vercel Blob:', job.music.blobUrl)

    const audioResponse = await fetch(job.music.blobUrl)
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio from Vercel Blob: ${audioResponse.status}`)
    }

    const audioBlob = await audioResponse.blob()
    console.log('[MVSEP] Downloaded file, size:', audioBlob.size, 'bytes')

    // Criar FormData para upload multipart
    const formData = new FormData()
    formData.append('api_token', MVSEP_API_KEY)
    formData.append('audiofile', audioBlob, 'audio.mp3')
    formData.append('sep_type', '48') // MelBand Roformer (vocals, instrumental)
    formData.append('output_format', '0') // 0 = mp3 320kbps

    console.log('[MVSEP] Uploading file to MVSEP via multipart...')

    const response = await fetch(`${MVSEP_API_URL}/separation/create`, {
      method: 'POST',
      body: formData,
    })

    console.log('[MVSEP] Response status:', response.status, response.statusText)

    // Ler resposta como texto primeiro para debug
    const responseText = await response.text()
    console.log('[MVSEP] Raw response text:', responseText)

    // Tentar fazer parse do JSON
    let data: MvsepCreateResponse
    try {
      data = JSON.parse(responseText) as MvsepCreateResponse
      console.log('[MVSEP] Parsed response data:', JSON.stringify(data, null, 2))
    } catch (parseError) {
      console.error('[MVSEP] Failed to parse JSON response:', parseError)
      throw new Error(`Invalid JSON response from MVSEP: ${responseText.substring(0, 200)}`)
    }

    if (!response.ok || !data.success) {
      const errorMsg = data.errors?.join(', ') || data.message || 'MVSEP API error'
      console.error('[MVSEP] API returned error:', {
        status: response.status,
        statusText: response.statusText,
        responseData: data,
      })
      throw new Error(errorMsg)
    }

    if (!data.data?.hash) {
      console.error('[MVSEP] No hash in response. Full data:', JSON.stringify(data, null, 2))
      throw new Error('MVSEP did not return a job hash')
    }

    // Salvar hash do job MVSEP
    await db.musicStemJob.update({
      where: { id: job.id },
      data: {
        mvsepJobHash: data.data.hash,
        mvsepStatus: 'waiting',
        progress: 20,
      },
    })

    console.log(`[MVSEP] Job created successfully:`, data.data.hash)
  } catch (error) {
    console.error('[MVSEP] Failed to start separation:', error)

    await db.musicStemJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    })
  }
}

/**
 * Verifica o status de um job no MVSEP e atualiza o banco
 */
export async function checkMvsepJobStatus(job: MusicStemJob) {
  if (!job.mvsepJobHash) {
    console.warn(`[MVSEP] Job ${job.id} has no MVSEP hash`)
    return
  }

  try {
    console.log(`[MVSEP] Checking status for job ${job.id}, hash: ${job.mvsepJobHash}`)

    const response = await fetch(
      `${MVSEP_API_URL}/separation/get?api_token=${MVSEP_API_KEY}&hash=${job.mvsepJobHash}`
    )

    const responseText = await response.text()
    console.log(`[MVSEP] Status response for job ${job.id}:`, responseText)

    let data: MvsepStatusResponse
    try {
      data = JSON.parse(responseText) as MvsepStatusResponse
    } catch (parseError) {
      console.error(`[MVSEP] Failed to parse status response:`, parseError)
      throw new Error('Invalid JSON response from MVSEP status check')
    }

    if (!response.ok) {
      throw new Error(data.message || 'Failed to check status')
    }

    const mvsepStatus = data.status
    console.log(`[MVSEP] Job ${job.id} MVSEP status:`, mvsepStatus, 'Full data:', JSON.stringify(data, null, 2))

    // Atualizar progress baseado no status
    let progress = job.progress
    if (mvsepStatus === 'waiting') progress = 30
    if (mvsepStatus === 'processing') progress = 50

    await db.musicStemJob.update({
      where: { id: job.id },
      data: {
        mvsepStatus,
        progress,
      },
    })

    console.log(`[MVSEP] Job ${job.id} status: ${mvsepStatus} (${progress}%)`)

    // Se completou, baixar o stem
    if (mvsepStatus === 'done') {
      console.log(`[MVSEP] Job ${job.id} is DONE! Checking for files...`)
      console.log(`[MVSEP] data.data:`, JSON.stringify(data.data, null, 2))
      console.log(`[MVSEP] data.data?.files:`, JSON.stringify(data.data?.files, null, 2))

      if (!data.data?.files || data.data.files.length === 0) {
        console.error(`[MVSEP] Job ${job.id} is done but has no files!`)
        await db.musicStemJob.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            error: 'MVSEP completed but returned no files',
          },
        })
      } else {
        console.log(`[MVSEP] Found ${data.data.files.length} files, downloading stem...`)
        await downloadAndSaveStem(job, data)
      }
    }

    // Se falhou, marcar como erro
    if (mvsepStatus === 'failed') {
      console.log(`[MVSEP] Job ${job.id} FAILED on MVSEP side`)
      await db.musicStemJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          error: 'MVSEP processing failed',
        },
      })
    }
  } catch (error) {
    console.error('[MVSEP] Failed to check status:', error)
    // Não marcar como falho aqui, pode ser erro temporário de rede
  }
}

/**
 * Helper: Extract file name from MVSEP file object (tries multiple field names)
 */
function getFileName(file: any): string {
  return (
    file.name ||
    file.filename ||
    file.file_name ||
    file.fileName ||
    file.title ||
    'unknown.mp3'
  )
}

/**
 * Helper: Extract download URL from MVSEP file object (tries multiple field names)
 */
function getFileUrl(file: any): string | null {
  return (
    file.url ||
    file.link ||
    file.download_url ||
    file.downloadUrl ||
    file.download ||
    null
  )
}

/**
 * Baixa o stem de percussão e salva no Vercel Blob
 */
async function downloadAndSaveStem(job: MusicStemJob, mvsepResult: MvsepStatusResponse) {
  try {
    console.log(`[MVSEP] ⬇️  Starting download for job ${job.id}`)
    console.log(`[MVSEP] Files array:`, JSON.stringify(mvsepResult.data?.files, null, 2))

    await db.musicStemJob.update({
      where: { id: job.id },
      data: { progress: 70 },
    })
    console.log(`[MVSEP] Updated progress to 70%`)

    if (!mvsepResult.data?.files || mvsepResult.data.files.length === 0) {
      throw new Error('No stems found in result')
    }

    const files = mvsepResult.data.files

    // MVSEP retorna array de stems
    // Para MelBand Roformer (Type 48), procuramos o stem instrumental (sem vocais)
    console.log(`[MVSEP] Looking for instrumental stem in ${files.length} files...`)
    console.log(`[MVSEP] Files structure:`, JSON.stringify(files, null, 2))
    console.log(`[MVSEP] File names:`, files.map(f => getFileName(f)))
    console.log(`[MVSEP] File URLs:`, files.map(f => getFileUrl(f) || 'NO_URL'))
    console.log(`[MVSEP] All file keys:`, files.map(f => Object.keys(f)))

    // Try to find instrumental stem
    // MVSEP retorna 2 arquivos: vocals e instrumental
    // Ordem típica: [0]=vocals, [1]=instrumental
    // IMPORTANTE: Pegar o ÚLTIMO arquivo quando não conseguir identificar

    console.log(`[MVSEP] 🔍 Analisando ${files.length} arquivos...`)

    // Procurar por palavras que indicam INSTRUMENTAL
    const instrumentalStems = files.filter((file) => {
      const name = getFileName(file).toLowerCase()
      const isInstrumental = (
        name.includes('instrumental') ||
        name.includes('instrum') ||
        name.includes('no_vocal') ||
        name.includes('no vocal') ||
        name.includes('music') ||
        name.includes('backing') ||
        name.includes('karaoke')
      )
      if (isInstrumental) {
        console.log(`[MVSEP] ✅ Encontrado arquivo instrumental pelo nome:`, name)
      }
      return isInstrumental
    })

    // Procurar por palavras que indicam VOCALS (para EXCLUIR)
    const vocalStems = files.filter((file) => {
      const name = getFileName(file).toLowerCase()
      const isVocals = (
        name.includes('vocal') ||
        name.includes('voice') ||
        name.includes('voz') ||
        name.includes('singer') ||
        name.includes('acapella')
      )
      if (isVocals) {
        console.log(`[MVSEP] ❌ Encontrado arquivo vocal (vai ignorar):`, name)
      }
      return isVocals
    })

    // Escolher qual usar
    let stemToUse: any
    let stemName: string

    if (instrumentalStems.length > 0) {
      // Caso 1: Encontrou arquivo com nome "instrumental"
      stemToUse = instrumentalStems[0]
      stemName = getFileName(stemToUse)
      console.log(`[MVSEP] ✅ Usando arquivo identificado como instrumental:`, stemName)
    } else if (vocalStems.length > 0 && files.length > vocalStems.length) {
      // Caso 2: Encontrou vocals, pegar qualquer arquivo que NÃO seja vocal
      const nonVocals = files.filter(f => !vocalStems.includes(f))
      stemToUse = nonVocals[0]
      stemName = getFileName(stemToUse)
      console.log(`[MVSEP] ✅ Usando arquivo não-vocal (excluindo ${vocalStems.length} vocal):`, stemName)
    } else {
      // Caso 3: Não conseguiu identificar - PEGAR O ÚLTIMO ARQUIVO
      // Na maioria dos casos MVSEP retorna [vocals, instrumental] nessa ordem
      // Então o último é o instrumental
      stemToUse = files[files.length - 1]
      stemName = getFileName(stemToUse)
      console.warn(`[MVSEP] ⚠️  Não identificado - usando ÚLTIMO arquivo (índice ${files.length - 1}):`, stemName)
      console.warn(`[MVSEP] Todos os arquivos:`, files.map((f, i) => `[${i}] ${getFileName(f)}`))
    }

    await processStem(job, stemToUse)
  } catch (error) {
    console.error('[MVSEP] ❌ Failed to download/save stem:', error)
    console.error('[MVSEP] Error stack:', error instanceof Error ? error.stack : 'No stack')

    await db.musicStemJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Failed to save stem',
      },
    })
  }
}

/**
 * Processa um stem: baixa, faz upload para Blob e atualiza o banco
 */
async function processStem(job: MusicStemJob, stem: any) {
  const stemName = getFileName(stem)
  const stemUrl = getFileUrl(stem)

  console.log(`[MVSEP] 🎵 Processing stem: ${stemName}`)
  console.log(`[MVSEP] Stem URL: ${stemUrl}`)
  console.log(`[MVSEP] Stem object keys:`, Object.keys(stem))
  console.log(`[MVSEP] Full stem object:`, JSON.stringify(stem, null, 2))

  if (!stemUrl) {
    throw new Error(`No download URL found in stem object. Available keys: ${Object.keys(stem).join(', ')}`)
  }

  // Download do arquivo
  console.log(`[MVSEP] Downloading stem from MVSEP...`)
  const audioResponse = await fetch(stemUrl)
  if (!audioResponse.ok) {
    throw new Error(`Failed to download stem from MVSEP: ${audioResponse.status} ${audioResponse.statusText}`)
  }

  const audioBuffer = await audioResponse.arrayBuffer()
  const buffer = Buffer.from(audioBuffer)
  console.log(`[MVSEP] Downloaded ${buffer.length} bytes`)

  await db.musicStemJob.update({
    where: { id: job.id },
    data: { progress: 85 },
  })
  console.log(`[MVSEP] Updated progress to 85%`)

  // Upload para Vercel Blob
  const fileName = `music/stems/${job.musicId}_instrumental.mp3`
  console.log(`[MVSEP] Uploading to Vercel Blob: ${fileName}`)
  const blob = await put(fileName, buffer, {
    access: 'public',
    contentType: 'audio/mpeg',
    addRandomSuffix: true,
  })

  console.log(`[MVSEP] ✅ Uploaded to Vercel Blob: ${blob.url}`)

  await db.musicStemJob.update({
    where: { id: job.id },
    data: { progress: 95 },
  })
  console.log(`[MVSEP] Updated progress to 95%`)

  // Atualizar MusicLibrary com o stem instrumental
  console.log(`[MVSEP] Updating MusicLibrary ${job.musicId}...`)
  await db.musicLibrary.update({
    where: { id: job.musicId },
    data: {
      instrumentalUrl: blob.url,
      instrumentalSize: buffer.length,
      hasInstrumentalStem: true,
      stemsProcessedAt: new Date(),
    },
  })
  console.log(`[MVSEP] Updated MusicLibrary`)

  // Marcar job como completo
  console.log(`[MVSEP] Marking job ${job.id} as completed...`)
  await db.musicStemJob.update({
    where: { id: job.id },
    data: {
      status: 'completed',
      progress: 100,
      completedAt: new Date(),
    },
  })

  console.log(`[MVSEP] 🎉 Job ${job.id} completed successfully!`)
}
