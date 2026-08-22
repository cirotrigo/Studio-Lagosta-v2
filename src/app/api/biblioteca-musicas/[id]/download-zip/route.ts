/**
 * GET /api/biblioteca-musicas/:id/download-zip
 * Baixa um ZIP com as três versões: original, instrumental e voz isolada
 * (os stems entram quando já tiverem sido separados)
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

    // As três versões: a original e os dois stems que a separação devolve.
    // Cada uma é opcional a partir da segunda — faixa ainda não separada baixa
    // só o original, e stem que falhou no download não derruba o ZIP inteiro.
    const versoes: Array<{ sufixo: string; url: string }> = [
      { sufixo: 'original', url: music.blobUrl },
    ]

    if (music.hasInstrumentalStem && music.instrumentalUrl) {
      versoes.push({ sufixo: 'instrumental', url: music.instrumentalUrl })
    }

    if (music.hasVocalsStem && music.vocalsUrl) {
      versoes.push({ sufixo: 'voz', url: music.vocalsUrl })
    }

    // A extensão sai da URL; o que a separação devolve é sempre mp3 320kbps.
    const extensaoDe = (url: string) =>
      url.includes('.wav') ? 'wav' : url.includes('.m4a') ? 'm4a' : 'mp3'

    for (const versao of versoes) {
      console.log(`[DOWNLOAD_ZIP] Baixando ${versao.sufixo} de:`, versao.url)

      const resposta = await fetch(versao.url)

      if (!resposta.ok) {
        // O original é obrigatório: sem ele não há ZIP que faça sentido.
        if (versao.sufixo === 'original') {
          throw new Error('Failed to download original audio')
        }
        console.warn(`[DOWNLOAD_ZIP] Falha ao baixar ${versao.sufixo}, seguindo sem ele`)
        continue
      }

      const buffer = Buffer.from(await resposta.arrayBuffer())
      zip.file(`${baseFileName}_${versao.sufixo}.${extensaoDe(versao.url)}`, buffer)
      console.log(`[DOWNLOAD_ZIP] ${versao.sufixo} adicionado ao ZIP (${buffer.length} bytes)`)
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
