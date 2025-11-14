/**
 * GET /api/biblioteca-musicas/:id/download-zip
 * Baixa um ZIP contendo a versão original e instrumental (se disponível)
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import JSZip from 'jszip'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutos para download de arquivos grandes

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params
    const id = parseInt(idStr)

    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid music ID' }, { status: 400 })
    }

    // Buscar música com informações de stem
    const music = await db.musicLibrary.findUnique({
      where: { id },
    })

    if (!music) {
      return NextResponse.json({ error: 'Music not found' }, { status: 404 })
    }

    console.log('[DOWNLOAD_ZIP] Creating ZIP for music:', music.name, music.id)

    // Criar ZIP
    const zip = new JSZip()

    // Sanitizar nome do arquivo (remover caracteres especiais)
    const sanitizeName = (name: string) => {
      return name
        .replace(/[^a-zA-Z0-9\s\-_]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 50) // Limitar tamanho
    }

    const musicName = sanitizeName(music.name)
    const artistName = music.artist ? sanitizeName(music.artist) : 'Unknown'
    const baseFileName = `${musicName}_${artistName}`

    // Baixar arquivo original
    console.log('[DOWNLOAD_ZIP] Downloading original from:', music.blobUrl)
    const originalResponse = await fetch(music.blobUrl)
    if (!originalResponse.ok) {
      throw new Error('Failed to download original audio')
    }
    const originalBlob = await originalResponse.blob()
    const originalBuffer = Buffer.from(await originalBlob.arrayBuffer())

    // Detectar extensão do arquivo original
    const originalExt = music.blobUrl.includes('.mp3') ? 'mp3' :
                        music.blobUrl.includes('.wav') ? 'wav' :
                        music.blobUrl.includes('.m4a') ? 'm4a' : 'mp3'

    zip.file(`${baseFileName}_original.${originalExt}`, originalBuffer)
    console.log('[DOWNLOAD_ZIP] Added original to ZIP')

    // Baixar arquivo instrumental (se disponível)
    if (music.hasInstrumentalStem && music.instrumentalUrl) {
      console.log('[DOWNLOAD_ZIP] Downloading instrumental from:', music.instrumentalUrl)
      const instrumentalResponse = await fetch(music.instrumentalUrl)
      if (instrumentalResponse.ok) {
        const instrumentalBlob = await instrumentalResponse.blob()
        const instrumentalBuffer = Buffer.from(await instrumentalBlob.arrayBuffer())

        // Detectar extensão do arquivo instrumental
        const instrumentalExt = music.instrumentalUrl.includes('.mp3') ? 'mp3' :
                               music.instrumentalUrl.includes('.wav') ? 'wav' :
                               music.instrumentalUrl.includes('.m4a') ? 'm4a' : 'mp3'

        zip.file(`${baseFileName}_instrumental.${instrumentalExt}`, instrumentalBuffer)
        console.log('[DOWNLOAD_ZIP] Added instrumental to ZIP')
      } else {
        console.warn('[DOWNLOAD_ZIP] Failed to download instrumental, continuing without it')
      }
    }

    // Gerar ZIP
    console.log('[DOWNLOAD_ZIP] Generating ZIP file...')
    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    })

    console.log('[DOWNLOAD_ZIP] ZIP created, size:', zipBuffer.length, 'bytes')

    // Retornar ZIP - converter Buffer para Uint8Array para compatibilidade com NextResponse
    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${baseFileName}.zip"`,
        'Content-Length': zipBuffer.length.toString(),
      },
    })
  } catch (error) {
    console.error('[DOWNLOAD_ZIP] Error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
