import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { fetchProjectWithShares, hasProjectWriteAccess } from '@/lib/projects/access'
import { CreativeError } from '@/lib/creatives/errors'
import {
  AVISO_CATALOGACAO,
  enviarFotosParaAcervo,
  MAX_FOTOS_POR_CHAMADA,
} from '@/lib/creatives/acervo-upload'

export const runtime = 'nodejs'
// INLINE, não no vercel.json — o glob de lá não casa com src/app/**. 120s
// porque uma foto de 25MB sobe para o Drive com retries dentro da invocação.
export const maxDuration = 120

/**
 * Recebe fotos do celular para o ACERVO do cliente (pasta "Fotos do Celular"
 * no Drive). Multipart: campo `arquivos`, um ou mais File — a página de envio
 * manda UM por requisição para ter estado por foto, mas a rota aceita a leva.
 *
 * Os bytes sobem INTOCADOS (o acervo é insumo); a busca por tema só enxerga a
 * foto depois da catalogação da madrugada — o `aviso` da resposta diz isso.
 *
 * Acesso de ESCRITA: enviar foto muda o Drive do cliente.
 */
export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params
    const id = Number(projectId)
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
    }

    const project = await fetchProjectWithShares(id)
    if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    if (!hasProjectWriteAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    let form: FormData
    try {
      form = await req.formData()
    } catch {
      return NextResponse.json(
        { error: 'Envie as fotos como multipart/form-data, no campo "arquivos".' },
        { status: 400 },
      )
    }

    const files = form.getAll('arquivos').filter((f): f is File => f instanceof File)
    if (files.length === 0) {
      return NextResponse.json(
        { error: 'Nenhuma foto no pedido — o campo esperado é "arquivos".' },
        { status: 400 },
      )
    }
    if (files.length > MAX_FOTOS_POR_CHAMADA) {
      return NextResponse.json(
        { error: `O limite é ${MAX_FOTOS_POR_CHAMADA} fotos por vez. Envie em levas menores.` },
        { status: 413 },
      )
    }

    const arquivos = await Promise.all(
      files.map(async (f) => ({
        bytes: Buffer.from(await f.arrayBuffer()),
        fileName: f.name || 'foto',
        mimeType: f.type || null,
      })),
    )

    const resultado = await enviarFotosParaAcervo({ projectId: id, arquivos })

    return NextResponse.json({
      ...resultado,
      aviso: AVISO_CATALOGACAO,
    })
  } catch (error) {
    if (error instanceof CreativeError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[acervo-upload] erro inesperado:', error)
    return NextResponse.json({ error: 'Erro ao enviar as fotos. Tente de novo.' }, { status: 500 })
  }
}
