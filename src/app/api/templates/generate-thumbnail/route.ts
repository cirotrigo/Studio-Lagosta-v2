import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { put } from '@vercel/blob'
import { generateThumbnail } from '@/lib/render-engine'
import type { DesignData } from '@/types/template'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/templates/generate-thumbnail
 * Gera a miniatura de um design e devolve a URL dela no Blob.
 *
 * Body:
 * - designData: DesignData
 * - width: número (padrão: 400)
 * - height: número (padrão: 300)
 * - templateId: opcional — dá caminho estável, para regerar SOBRESCREVER em
 *   vez de acumular arquivo órfão no Blob a cada salvamento.
 *
 * 🔴 A miniatura vai para o BLOB, não volta como `data:` base64.
 *
 * Medido em 05/09/2026: 130 de 130 miniaturas de template estavam embutidas na
 * coluna, 6,86 MB no total — e a listagem da aba de Templates devolve a coluna
 * inteira, então abrir a aba baixava 1.492 KB só no projeto 4. Com URL, o
 * payload cai para ~120 bytes por template, o navegador cacheia a imagem e o
 * `next/image` pode redimensioná-la, o que `data:` nunca permitiu.
 *
 * ⚠️ Esta rota é o caminho MENOS usado (só o "salvar como modelo"). Quem
 * produzia as 130 é o botão Salvar do editor, e a trava dele mora na porta de
 * entrada: `guardarMiniatura` em src/lib/templates/miniatura.ts.
 */
export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { designData, width = 400, height = 300, templateId } = body

    if (!designData) {
      return NextResponse.json({ error: 'designData é obrigatório' }, { status: 400 })
    }

    const buffer = await generateThumbnail(designData as DesignData, {}, { width, height })

    // Caminho estável quando se sabe o template: o Blob sobrescreve o mesmo
    // path (sem `addRandomSuffix`), então salvar de novo não deixa órfão.
    const nome = Number.isInteger(templateId)
      ? `templates/thumbnails/${templateId}.png`
      : `templates/thumbnails/avulso-${userId}-${Date.now()}.png`
    const blob = await put(nome, buffer, {
      access: 'public',
      contentType: 'image/png',
      allowOverwrite: true, // o v2 recusa o mesmo caminho sem isto
    })

    return NextResponse.json({ thumbnailUrl: blob.url })
  } catch (error) {
    console.error('Error generating thumbnail:', error)
    return NextResponse.json({ error: 'Erro ao gerar thumbnail' }, { status: 500 })
  }
}
