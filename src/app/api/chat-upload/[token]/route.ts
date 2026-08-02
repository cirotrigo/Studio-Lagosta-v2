import { NextResponse } from 'next/server'
import { CreativeError } from '@/lib/creatives/errors'
import { receberFoto } from '@/lib/creatives/chat-upload'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Recebe a foto da página /envio/[token]. Rota PÚBLICA (listada no
 * middleware): a autenticação é o próprio token — cuid não-adivinhável, com
 * validade de 30min e escopo de um projeto. Corpo = bytes crus da imagem.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const bytes = Buffer.from(await req.arrayBuffer())
    const resultado = await receberFoto(token, bytes)
    return NextResponse.json({ recebida: true, ...resultado })
  } catch (error) {
    if (error instanceof CreativeError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[chat-upload] erro inesperado:', error)
    return NextResponse.json({ error: 'Erro ao receber a foto. Tente de novo.' }, { status: 500 })
  }
}
