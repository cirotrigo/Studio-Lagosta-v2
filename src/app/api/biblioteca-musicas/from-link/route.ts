/**
 * POST /api/biblioteca-musicas/from-link
 * Adicionar música da biblioteca via link do YouTube/SoundCloud
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

// Validação de URLs
function detectSourceType(url: string): 'youtube' | 'soundcloud' | 'url' | null {
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname.toLowerCase()

    // YouTube
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      return 'youtube'
    }

    // SoundCloud
    if (hostname.includes('soundcloud.com')) {
      return 'soundcloud'
    }

    // URL genérica (deve ser arquivo de áudio direto)
    if (url.match(/\.(mp3|wav|ogg|m4a|flac)(\?|$)/i)) {
      return 'url'
    }

    return null
  } catch (e) {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { sourceUrl, name, artist, genre, mood, projectId, duration } = body

    if (!sourceUrl || !name) {
      return NextResponse.json(
        { error: 'Missing required fields: sourceUrl, name' },
        { status: 400 }
      )
    }

    // Detectar tipo de fonte
    const sourceType = detectSourceType(sourceUrl)

    if (!sourceType) {
      return NextResponse.json(
        {
          error: 'Invalid URL. Please provide a YouTube, SoundCloud link, or direct audio file URL.',
        },
        { status: 400 }
      )
    }

    console.log(`[From Link] Processing ${sourceType} link:`, sourceUrl)

    // Criar entrada no banco
    // Para links externos, ainda não temos o arquivo no blob
    // O MVSEP vai baixar direto da fonte
    const faixaMusica = await db.musicLibrary.create({
      data: {
        name,
        artist: artist || null,
        genre: genre || null,
        mood: mood || null,
        projectId: projectId ? parseInt(projectId) : null,
        duration: duration ? parseFloat(duration) : 0, // 0 = desconhecido, será atualizado depois
        blobUrl: '', // Será preenchido depois que MVSEP processar
        blobSize: 0, // Será preenchido depois
        sourceType,
        sourceUrl,
        createdBy: userId,
      },
    })

    console.log(`[From Link] Created music ${faixaMusica.id} from ${sourceType}`)

    // Criar job de separação automático
    try {
      await db.musicStemJob.create({
        data: {
          musicId: faixaMusica.id,
          status: 'pending',
          progress: 0,
        },
      })
      console.log(`[From Link] Created stem job for music ${faixaMusica.id}`)
    } catch (error) {
      console.error('[From Link] Failed to create stem job:', error)
      // Não falhar se a criação do job falhar
    }

    return NextResponse.json(faixaMusica, { status: 201 })
  } catch (error) {
    console.error('[From Link]', error)
    return NextResponse.json(
      { error: 'Failed to process link' },
      { status: 500 }
    )
  }
}
