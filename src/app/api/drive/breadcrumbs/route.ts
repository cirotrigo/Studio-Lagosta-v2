import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { googleDriveService } from '@/server/google-drive-service'
import { driveItemPermitido, raizesNaRotaDoProjeto } from '@/lib/google-drive/escopo'
import { PermissionError, requireProjectAccess } from '@/lib/permissions'

const naoEncontrado = () => NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

const querySchema = z.object({
  folderId: z.string().trim().min(1),
  projectId: z.coerce.number().int().positive(),
})

export async function GET(req: Request) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    if (!googleDriveService.isEnabled()) {
      return NextResponse.json({ error: 'Google Drive não configurado' }, { status: 503 })
    }

    const { searchParams } = new URL(req.url)
    const parsed = querySchema.safeParse({
      folderId: searchParams.get('folderId'),
      projectId: searchParams.get('projectId'),
    })

    if (!parsed.success) {
      return NextResponse.json({ error: 'Parâmetros inválidos', details: parsed.error.flatten() }, { status: 400 })
    }

    const { folderId, projectId } = parsed.data
    await requireProjectAccess(projectId, { userId, orgId })

    // Fora do admin: a pasta precisa estar sob as pastas do projeto, e a
    // trilha começa na pasta do projeto — nada acima dela aparece.
    const raizes = await raizesNaRotaDoProjeto(userId, projectId)
    if (!raizes) {
      return NextResponse.json({ breadcrumbs: await googleDriveService.getFolderBreadcrumbs(folderId) })
    }
    const decisao = await driveItemPermitido(folderId, raizes)
    if (!decisao.permitido) {
      return naoEncontrado()
    }
    const trilha = await googleDriveService.getFolderBreadcrumbs(decisao.idEfetivo, raizes)
    const inicio = trilha.findIndex((b) => raizes.has(b.id))
    const breadcrumbs = inicio >= 0 ? trilha.slice(inicio) : trilha.slice(-1)

    return NextResponse.json({ breadcrumbs })
  } catch (error) {
    // Projeto inexistente, sem acesso e pasta fora do projeto: a mesma resposta.
    if (error instanceof PermissionError) {
      return naoEncontrado()
    }

    console.error('[Drive API] Failed to fetch breadcrumbs', error)
    return NextResponse.json({ error: 'Erro ao carregar breadcrumbs' }, { status: 500 })
  }
}

export const runtime = 'nodejs'
