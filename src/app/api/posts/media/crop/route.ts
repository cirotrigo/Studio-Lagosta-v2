import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import sharp from 'sharp'
import { put } from '@vercel/blob'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Recorte de mídia que já está numa URL (Criativos, Imagens IA, Google Drive).
 *
 * O upload local recorta no próprio navegador (canvas) — ali o arquivo está na
 * mão. Aqui a origem é uma URL, então quem recorta é o servidor, com o MESMO
 * resultado: extrai a região escolhida e entrega no tamanho final do formato.
 *
 * A arte de origem NÃO é alterada — sai um arquivo novo no Blob. Uma Generation
 * usada em dois posts pode ter enquadramentos diferentes em cada um.
 */

const DIMENSIONS = {
  POST: { width: 1080, height: 1350 },
  CAROUSEL: { width: 1080, height: 1350 },
  STORY: { width: 1080, height: 1920 },
} as const

/**
 * Só hosts nossos: sem isso a rota vira um proxy que busca qualquer URL da
 * internet a partir do servidor (SSRF).
 */
const HOSTS_PERMITIDOS = [
  /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i,
  /^https:\/\/[a-z0-9-]+\.blob\.vercel-storage\.com$/i,
]

const bodySchema = z.object({
  sourceUrl: z.string().url(),
  postType: z.enum(['POST', 'CAROUSEL', 'STORY']),
  crop: z.object({
    left: z.number().min(0),
    top: z.number().min(0),
    width: z.number().min(1),
    height: z.number().min(1),
  }),
})

export async function POST(req: Request) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Pedido inválido', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const { sourceUrl, postType, crop } = parsed.data

    const origem = new URL(sourceUrl)
    if (!HOSTS_PERMITIDOS.some((regex) => regex.test(origem.origin))) {
      return NextResponse.json({ error: 'Origem não permitida' }, { status: 400 })
    }

    const resposta = await fetch(sourceUrl)
    if (!resposta.ok) {
      return NextResponse.json({ error: 'Não foi possível ler a imagem' }, { status: 400 })
    }
    const entrada = Buffer.from(await resposta.arrayBuffer())

    const metadados = await sharp(entrada).metadata()
    const larguraOriginal = metadados.width ?? 0
    const alturaOriginal = metadados.height ?? 0
    if (!larguraOriginal || !alturaOriginal) {
      return NextResponse.json({ error: 'Imagem ilegível' }, { status: 400 })
    }

    // A região vem do navegador: clampar antes de entregar ao sharp, que
    // rejeita extração fora dos limites com erro genérico
    const left = Math.min(Math.round(crop.left), larguraOriginal - 1)
    const top = Math.min(Math.round(crop.top), alturaOriginal - 1)
    const width = Math.max(1, Math.min(Math.round(crop.width), larguraOriginal - left))
    const height = Math.max(1, Math.min(Math.round(crop.height), alturaOriginal - top))

    const alvo = DIMENSIONS[postType]
    const saida = await sharp(entrada)
      .extract({ left, top, width, height })
      .resize(alvo.width, alvo.height, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 92 })
      .toBuffer()

    const nome = `enquadrado-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
    const blob = await put(`post-media/${nome}`, saida, {
      access: 'public',
      contentType: 'image/jpeg',
    })

    return NextResponse.json({
      url: blob.url,
      pathname: blob.pathname,
      width: alvo.width,
      height: alvo.height,
    })
  } catch (error) {
    console.error('[api] POST /api/posts/media/crop', error)
    return NextResponse.json({ error: 'Falha ao enquadrar a imagem' }, { status: 500 })
  }
}
