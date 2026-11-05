import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectWriteAccess } from '@/lib/projects/access'
import { CreativeError } from '@/lib/creatives/errors'
import { reverterCamadasDaArte } from '@/lib/compositor/reverter'

export const runtime = 'nodejs'

/**
 * Volta a página da arte para as camadas que o compositor entregou (F4 do
 * editor-como-usina) — o "desfazer tudo" de uma peça. Casca fina sobre
 * `reverterCamadasDaArte`: só peça do compositor tem snapshot.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const { id } = await params

    const gen = await db.generation.findUnique({ where: { id }, select: { projectId: true } })
    if (!gen) return NextResponse.json({ error: 'Arte não encontrada' }, { status: 404 })
    const project = await fetchProjectWithShares(gen.projectId)
    if (!project || !hasProjectWriteAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const r = await reverterCamadasDaArte(id, { projectId: gen.projectId })
    return NextResponse.json(r)
  } catch (error) {
    // CP-X2c (R1): só a recusa vetorial sai no corpo das portas (`{ error, codigo, camadas }`, preflight X2 §4.4);
    // `code` fica como alias. Os outros CreativeError respondem como sempre.
    if (error instanceof CreativeError && error.code === 'VETOR_INVALIDO') {
      const camadas = (error.details as { camadas?: unknown } | undefined)?.camadas ?? []
      return NextResponse.json({ error: error.message, codigo: error.code, code: error.code, camadas }, { status: error.status })
    }
    if (error instanceof CreativeError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[compositor] reverter falhou', error)
    return NextResponse.json({ error: 'Erro ao reverter a arte' }, { status: 500 })
  }
}
