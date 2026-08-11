import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  fetchProjectWithShares,
  hasProjectReadAccess,
  hasProjectWriteAccess,
} from '@/lib/projects/access'
import {
  lerFeedbackDeArte,
  registrarFeedbackDeArte,
  TETO_COMENTARIO,
  VEREDITOS_DE_ARTE,
} from '@/lib/aprendizado/feedback-de-arte'
import { normalizarSuperficie } from '@/lib/aprendizado/vocabulario'

export const runtime = 'nodejs'

/**
 * O que a pessoa achou da arte — "gostei" ou "preciso melhorar".
 *
 * Casca fina sobre `src/lib/aprendizado/feedback-de-arte.ts`, na mesma regra da
 * casa (rota/tool embrulha serviço, nunca reimplementa). O serviço não lança:
 * sinal recusado volta 200 com o motivo, e 4xx fica para pedido malformado —
 * a UI chama isto no clique e um erro aqui não pode aparecer para quem só
 * queria dizer que gostou.
 *
 * O GET existe porque a UI precisa mostrar o ESTADO ao reabrir a arte: sem ele
 * o botão nasceria sempre apagado e a pessoa julgaria de novo o que já julgou.
 */
const bodySchema = z
  .object({
    veredito: z.enum(VEREDITOS_DE_ARTE),
    /** Sempre opcional — o veredito vale sozinho. */
    comentario: z.string().max(TETO_COMENTARIO).optional().nullable(),
    superficie: z.string().max(32).optional(),
  })
  .strict()

/** Localiza a arte e devolve o projeto dela, para a checagem de acesso. */
async function acharArte(id: string) {
  if (!id) return null
  return db.generation.findUnique({ where: { id }, select: { id: true, projectId: true } })
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { id } = await params
    const arte = await acharArte(id)
    if (!arte) return NextResponse.json({ error: 'Criativo não encontrado' }, { status: 404 })

    const project = await fetchProjectWithShares(arte.projectId)
    if (!hasProjectReadAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    return NextResponse.json({ feedback: await lerFeedbackDeArte(arte.id) })
  } catch (error) {
    console.error('[aprendizado] erro inesperado ao ler feedback de arte:', error)
    return NextResponse.json({ feedback: null })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { id } = await params
    const arte = await acharArte(id)
    if (!arte) return NextResponse.json({ error: 'Criativo não encontrado' }, { status: 404 })

    const project = await fetchProjectWithShares(arte.projectId)
    if (!hasProjectWriteAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Pedido inválido', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    /**
     * `decididoPor` é o `User.id` INTERNO, nunca o clerkId. Busca somente
     * leitura: quem ainda não tem linha deixa a coluna nula (isto é auditoria),
     * e criar User a partir daqui é exatamente como nascem os fantasmas.
     */
    const dbUser = await db.user.findUnique({ where: { clerkId: userId }, select: { id: true } })

    const resposta = await registrarFeedbackDeArte({
      generationId: arte.id,
      projectId: arte.projectId,
      veredito: parsed.data.veredito,
      comentario: parsed.data.comentario ?? null,
      decididoPor: dbUser?.id ?? null,
      superficie: normalizarSuperficie(parsed.data.superficie) ?? 'galeria',
    })

    return NextResponse.json(resposta)
  } catch (error) {
    console.error('[aprendizado] erro inesperado ao registrar feedback de arte:', error)
    return NextResponse.json({ ok: false, resultado: 'erro', feedback: null })
  }
}
