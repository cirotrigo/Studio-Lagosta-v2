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
  status: 'success' | 'error'
  hash?: string
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

    // Determinar URL e tipo de fonte
    // Se tem sourceUrl (YouTube/SoundCloud), usar isso
    // Senão, usar blobUrl (upload de arquivo)
    const musicUrl = job.music.sourceUrl || job.music.blobUrl
    const remoteType = job.music.sourceType || 'url'

    console.log('[MVSEP] Music source:', {
      hasSourceUrl: !!job.music.sourceUrl,
      sourceType: job.music.sourceType,
      remoteType,
    })

    // Enviar para MVSEP API
    const requestBody = {
      api_token: MVSEP_API_KEY,
      url: musicUrl,
      separation_type: 37, // DrumSep - Type 37 (percussion separation)
      output_format: 'mp3', // MP3 320kbps
      remote_type: remoteType, // 'youtube', 'soundcloud', ou 'url'
    }

    console.log('[MVSEP] Request to MVSEP API:', {
      endpoint: `${MVSEP_API_URL}/separation/create`,
      musicUrl: musicUrl.substring(0, 100) + '...',
      remoteType,
      separation_type: 37,
      hasApiKey: !!MVSEP_API_KEY,
    })

    const response = await fetch(`${MVSEP_API_URL}/separation/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    console.log('[MVSEP] Response status:', response.status, response.statusText)

    const data = (await response.json()) as MvsepCreateResponse
    console.log('[MVSEP] Response data:', data)

    if (!response.ok || data.status === 'error') {
      const errorMsg = data.message || 'MVSEP API error'
      console.error('[MVSEP] API returned error:', {
        status: response.status,
        statusText: response.statusText,
        responseData: data,
      })
      throw new Error(errorMsg)
    }

    if (!data.hash) {
      throw new Error('MVSEP did not return a job hash')
    }

    // Salvar hash do job MVSEP
    await db.musicStemJob.update({
      where: { id: job.id },
      data: {
        mvsepJobHash: data.hash,
        mvsepStatus: 'waiting',
        progress: 20,
      },
    })

    console.log(`[MVSEP] Job created successfully:`, data.hash)
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
