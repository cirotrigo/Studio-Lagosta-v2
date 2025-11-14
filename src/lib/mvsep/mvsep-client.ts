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
  status: 'waiting' | 'processing' | 'done' | 'failed'
  results?: Array<{
    name: string
    url: string
  }>
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
    formData.append('sep_type', '37') // DrumSep
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
    const response = await fetch(
      `${MVSEP_API_URL}/separation/get?api_token=${MVSEP_API_KEY}&hash=${job.mvsepJobHash}`
    )

    const data = (await response.json()) as MvsepStatusResponse

    if (!response.ok) {
      throw new Error(data.message || 'Failed to check status')
    }

    const mvsepStatus = data.status

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
    if (mvsepStatus === 'done' && data.results) {
      await downloadAndSaveStem(job, data)
    }

    // Se falhou, marcar como erro
    if (mvsepStatus === 'failed') {
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
 * Baixa o stem de percussão e salva no Vercel Blob
 */
async function downloadAndSaveStem(job: MusicStemJob, mvsepResult: MvsepStatusResponse) {
  try {
    console.log(`[MVSEP] Downloading stem for job ${job.id}`)

    await db.musicStemJob.update({
      where: { id: job.id },
      data: { progress: 70 },
    })

    if (!mvsepResult.results || mvsepResult.results.length === 0) {
      throw new Error('No stems found in result')
    }

    // MVSEP retorna array de stems
    // Para DrumSep (Type 37), procuramos o stem de drums/percussion
    const drumStems = mvsepResult.results.filter(
      (r) =>
        r.name.toLowerCase().includes('drum') || r.name.toLowerCase().includes('percussion')
    )

    if (!drumStems || drumStems.length === 0) {
      // Fallback: pegar o primeiro stem disponível
      console.warn('[MVSEP] No drum-specific stem found, using first available')
      const drumStem = mvsepResult.results[0]
      await processStem(job, drumStem)
    } else {
      // Pegar o primeiro stem de drums (geralmente é o combinado)
      const drumStem = drumStems[0]
      await processStem(job, drumStem)
    }
  } catch (error) {
    console.error('[MVSEP] Failed to download/save stem:', error)

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
async function processStem(job: MusicStemJob, stem: { name: string; url: string }) {
  console.log(`[MVSEP] Processing stem: ${stem.name}`)

  // Download do arquivo
  const audioResponse = await fetch(stem.url)
  if (!audioResponse.ok) {
    throw new Error('Failed to download stem from MVSEP')
  }

  const audioBuffer = await audioResponse.arrayBuffer()
  const buffer = Buffer.from(audioBuffer)

  await db.musicStemJob.update({
    where: { id: job.id },
    data: { progress: 85 },
  })

  // Upload para Vercel Blob
  const fileName = `music/stems/${job.musicId}_percussion.mp3`
  const blob = await put(fileName, buffer, {
    access: 'public',
    contentType: 'audio/mpeg',
  })

  console.log(`[MVSEP] Uploaded to Vercel Blob: ${blob.url}`)

  await db.musicStemJob.update({
    where: { id: job.id },
    data: { progress: 95 },
  })

  // Atualizar MusicLibrary com o stem
  await db.musicLibrary.update({
    where: { id: job.musicId },
    data: {
      percussionUrl: blob.url,
      percussionSize: buffer.length,
      hasPercussionStem: true,
      stemsProcessedAt: new Date(),
    },
  })

  // Marcar job como completo
  await db.musicStemJob.update({
    where: { id: job.id },
    data: {
      status: 'completed',
      progress: 100,
      completedAt: new Date(),
    },
  })

  console.log(`[MVSEP] Job ${job.id} completed successfully!`)
}
