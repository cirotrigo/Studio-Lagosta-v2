/**
 * MVSEP API Client
 * Handles music stem separation using the MVSEP service
 * API Docs: https://mvsep.com/pt/full_api
 */

import { db } from '@/lib/db'
import { put } from '@vercel/blob'
import type { MusicStemJob } from '@prisma/client'
import { classificarStems, getFileName, getFileUrl } from './classificar-stems'

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
        console.log(`[MVSEP] Found ${data.data.files.length} files, downloading stems...`)
        await downloadAndSaveStems(job, data)
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
 * Baixa os stems da separação e salva os dois no Vercel Blob.
 */
async function downloadAndSaveStems(job: MusicStemJob, mvsepResult: MvsepStatusResponse) {
  try {
    console.log(`[MVSEP] ⬇️  Starting download for job ${job.id}`)

    await db.musicStemJob.update({
      where: { id: job.id },
      data: { progress: 60 },
    })

    if (!mvsepResult.data?.files || mvsepResult.data.files.length === 0) {
      throw new Error('No stems found in result')
    }

    const files = mvsepResult.data.files
    console.log(`[MVSEP] 🔍 Analisando ${files.length} arquivos:`, files.map((f) => getFileName(f)))

    const { instrumental, vocals, criterio } = classificarStems(files)

    console.log(`[MVSEP] Critério da classificação: ${criterio}`)
    console.log(`[MVSEP] 🎸 Instrumental:`, instrumental ? getFileName(instrumental) : 'NÃO IDENTIFICADO')
    console.log(`[MVSEP] 🎤 Voz:`, vocals ? getFileName(vocals) : 'NÃO IDENTIFICADA')

    if (!instrumental) {
      throw new Error(`Não foi possível identificar o instrumental entre ${files.length} arquivos`)
    }

    // O instrumental é o que decide o sucesso do job — é o contrato que já existia.
    const instrumentalSalvo = await enviarStemParaBlob(job, instrumental, 'instrumental')

    await db.musicStemJob.update({
      where: { id: job.id },
      data: { progress: 85 },
    })

    // A voz é ADITIVA: se falhar, o job continua completo com o instrumental.
    // Regredir a separação que já funcionava por causa do arquivo novo seria
    // trocar um problema por outro pior.
    let vocalSalvo: { url: string; tamanho: number } | null = null
    if (vocals) {
      try {
        vocalSalvo = await enviarStemParaBlob(job, vocals, 'vocals')
      } catch (error) {
        console.error('[MVSEP] ⚠️  Falha ao salvar a voz (o instrumental segue válido):', error)
      }
    } else {
      console.warn('[MVSEP] ⚠️  Nenhum arquivo de voz identificado nesta separação')
    }

    await db.musicStemJob.update({
      where: { id: job.id },
      data: { progress: 95 },
    })

    console.log(`[MVSEP] Updating MusicLibrary ${job.musicId}...`)
    await db.musicLibrary.update({
      where: { id: job.musicId },
      data: {
        instrumentalUrl: instrumentalSalvo.url,
        instrumentalSize: instrumentalSalvo.tamanho,
        hasInstrumentalStem: true,
        ...(vocalSalvo
          ? {
              vocalsUrl: vocalSalvo.url,
              vocalsSize: vocalSalvo.tamanho,
              hasVocalsStem: true,
            }
          : {}),
        stemsProcessedAt: new Date(),
      },
    })

    await db.musicStemJob.update({
      where: { id: job.id },
      data: {
        status: 'completed',
        progress: 100,
        completedAt: new Date(),
      },
    })

    console.log(
      `[MVSEP] 🎉 Job ${job.id} completed! instrumental=sim voz=${vocalSalvo ? 'sim' : 'não'}`
    )
  } catch (error) {
    console.error('[MVSEP] ❌ Failed to download/save stems:', error)
    console.error('[MVSEP] Error stack:', error instanceof Error ? error.stack : 'No stack')

    await db.musicStemJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Failed to save stems',
      },
    })
  }
}

/**
 * Baixa um stem do MVSEP e sobe para o Vercel Blob.
 */
async function enviarStemParaBlob(
  job: MusicStemJob,
  stem: any,
  tipo: 'instrumental' | 'vocals'
): Promise<{ url: string; tamanho: number }> {
  const stemName = getFileName(stem)
  const stemUrl = getFileUrl(stem)

  console.log(`[MVSEP] 🎵 Processing ${tipo}: ${stemName}`)

  if (!stemUrl) {
    throw new Error(
      `No download URL found in ${tipo} stem. Available keys: ${Object.keys(stem).join(', ')}`
    )
  }

  const audioResponse = await fetch(stemUrl)
  if (!audioResponse.ok) {
    throw new Error(
      `Failed to download ${tipo} from MVSEP: ${audioResponse.status} ${audioResponse.statusText}`
    )
  }

  const buffer = Buffer.from(await audioResponse.arrayBuffer())
  console.log(`[MVSEP] Downloaded ${tipo}: ${buffer.length} bytes`)

  const fileName = `music/stems/${job.musicId}_${tipo}.mp3`
  const blob = await put(fileName, buffer, {
    access: 'public',
    contentType: 'audio/mpeg',
    addRandomSuffix: true,
  })

  console.log(`[MVSEP] ✅ ${tipo} no Blob: ${blob.url}`)

  return { url: blob.url, tamanho: buffer.length }
}
