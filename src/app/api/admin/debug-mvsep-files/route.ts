/**
 * ADMIN: Debug MVSEP files structure
 * GET /api/admin/debug-mvsep-files?musicId=X
 *
 * Retorna informações sobre os arquivos do último job de stem
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const MVSEP_API_KEY = process.env.MVSEP_API_KEY || 'BrIkx8zYQbvc4TggAZbsL96Mag9WN5'
const MVSEP_API_URL = 'https://mvsep.com/api'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const musicIdStr = searchParams.get('musicId')

    if (!musicIdStr) {
      return NextResponse.json(
        { error: 'Missing musicId parameter' },
        { status: 400 }
      )
    }

    const musicId = parseInt(musicIdStr)

    // Buscar o job de stem da música
    const job = await db.musicStemJob.findUnique({
      where: { musicId },
      include: { music: true }
    })

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    if (!job.mvsepJobHash) {
      return NextResponse.json(
        { error: 'Job has no MVSEP hash' },
        { status: 400 }
      )
    }

    // Buscar status do MVSEP
    const response = await fetch(
      `${MVSEP_API_URL}/separation/get?api_token=${MVSEP_API_KEY}&hash=${job.mvsepJobHash}`
    )

    const data = await response.json()

    if (!data.data?.files) {
      return NextResponse.json({
        error: 'No files in response',
        mvsepResponse: data
      })
    }

    // Analisar arquivos
    const files = data.data.files
    const filesInfo = files.map((file: any, index: number) => {
      // Tentar extrair informações de cada arquivo
      const allKeys = Object.keys(file)

      // Tentar todos os campos possíveis para nome
      const possibleNameFields = ['name', 'filename', 'file_name', 'fileName', 'title', 'type', 'stem_type']
      const nameInfo: any = {}
      possibleNameFields.forEach(field => {
        if (file[field]) {
          nameInfo[field] = file[field]
        }
      })

      // Tentar todos os campos possíveis para URL
      const possibleUrlFields = ['url', 'link', 'download_url', 'downloadUrl', 'download', 'file_url']
      const urlInfo: any = {}
      possibleUrlFields.forEach(field => {
        if (file[field]) {
          urlInfo[field] = file[field]
        }
      })

      return {
        index,
        allKeys,
        nameFields: nameInfo,
        urlFields: urlInfo,
        fullObject: file
      }
    })

    return NextResponse.json({
      jobId: job.id,
      musicId: job.musicId,
      musicName: job.music.name,
      mvsepHash: job.mvsepJobHash,
      mvsepStatus: data.status,
      totalFiles: files.length,
      filesAnalysis: filesInfo,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
