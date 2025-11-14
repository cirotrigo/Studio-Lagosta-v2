/**
 * POST /api/biblioteca-musicas/confirm
 * Confirma upload e salva metadados no banco após upload direto ao Vercel Blob
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { blobUrl, blobSize, name, artist, genre, mood, projectId, duration } = body

    if (!blobUrl || !name || !duration || !blobSize) {
      return NextResponse.json(
        { error: 'Missing required fields: blobUrl, name, duration, blobSize' },
        { status: 400 }
      )
    }

    // Salvar no banco de dados
    const faixaMusica = await db.musicLibrary.create({
      data: {
        name,
        artist: artist || null,
        genre: genre || null,
        mood: mood || null,
        projectId: projectId ? parseInt(projectId) : null,
        duration: parseFloat(duration),
        blobUrl,
        blobSize: parseInt(blobSize),
        createdBy: userId,
      },
    })

    // Criar job de separação automático
    try {
      await db.musicStemJob.create({
        data: {
          musicId: faixaMusica.id,
          status: 'pending',
          progress: 0,
        },
      })
      console.log(`[Biblioteca Músicas] Created stem job for music ${faixaMusica.id}`)
    } catch (error) {
      console.error('[Biblioteca Músicas] Failed to create stem job:', error)
      // Não falhar o upload se a criação do job falhar
    }

    return NextResponse.json(faixaMusica, { status: 201 })
  } catch (error) {
    console.error('[Biblioteca Músicas Confirm]', error)
    return NextResponse.json(
      { error: 'Failed to save music metadata' },
      { status: 500 }
    )
  }
}
