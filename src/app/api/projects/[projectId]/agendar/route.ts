import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectWriteAccess } from '@/lib/projects/access'
import { CreativeError } from '@/lib/creatives/errors'
import { agendarPost } from '@/lib/creatives/agendar'
import { normalizarEscopo } from '@/lib/posts/learning-scope'
import { avaliarSlotSugerido, fecharDesfechoDoSlot } from '@/lib/aprendizado/desfecho-de-slot'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Coloca na agenda uma arte que já existe (Generation ou Page) — a mesma
 * função que a tool `colocar-na-agenda` do MCP usa.
 *
 * Existe separada do `POST /posts` (que é o composer completo, com validação
 * por tipo, Instagram e scheduler) porque a bancada precisa do caminho curto:
 * "esta arte, neste horário, como rascunho". `agendarPost` já resolve mídia,
 * `renderStatus` e horário em BRT — regras que não podem divergir entre a UI
 * e o chat.
 */
const bodySchema = z.object({
  generationId: z.string().min(1).optional(),
  pageId: z.string().min(1).optional(),
  mediaUrls: z.array(z.string().url()).optional(),
  /** "YYYY-MM-DD HH:mm" em BRT, ou ISO com fuso. */
  quando: z.string().min(1),
  situacao: z.enum(['rascunho', 'agendado']).optional().default('rascunho'),
  postType: z.enum(['STORY', 'POST', 'REEL', 'CAROUSEL']).optional(),
  caption: z.string().max(2200).optional(),
  /**
   * Escopo de aprendizado, no vocabulário da tela. Ausente = rotina, que é o
   * caminho comum — a bancada só manda quando a pessoa marcou outra coisa.
   */
  escopo: z.enum(['rotina', 'campanha', 'pontual']).optional(),
  /** Entrada CAMPANHAS da base que dá o escopo temporal. */
  campanhaId: z.string().min(1).optional(),
  /**
   * A sugestão de horário que originou este post (`sugestaoId` de
   * `GET /slots`). Vira coluna no post E fecha o sinal — e o desfecho é
   * calculado AQUI, comparando o horário proposto com o `quando` que chegou:
   * a bancada deixa mudar data e hora antes de agendar, então aceitar o
   * rótulo da tela seria contar como aceitação o que foi edição.
   */
  sugestaoId: z.string().min(1).max(64).optional(),
})

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

    const parsed = bodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Pedido inválido', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    /**
     * `decididoPor` é o `User.id` INTERNO, nunca o clerkId — os dois espaços
     * já produziram User fantasma no banco. Busca somente leitura de
     * propósito: se o usuário ainda não existe na tabela, a coluna fica nula
     * (é auditoria), e criar linha de User a partir daqui seria o próprio
     * erro que se quer evitar.
     */
    const dbUser = await db.user.findUnique({ where: { clerkId: userId }, select: { id: true } })

    /**
     * Antes de criar o post: é a comparação com o horário PROPOSTO que dá
     * tanto o desfecho do sinal quanto a `origem` gravada na coluna — e a
     * coluna só existe no momento do create. Sem sugestão, `null` e o post
     * nasce como sempre nasceu.
     */
    const veredito = await avaliarSlotSugerido(parsed.data.sugestaoId, parsed.data.quando)

    const resultado = await agendarPost({
      projectId: id,
      generationId: parsed.data.generationId,
      pageId: parsed.data.pageId,
      mediaUrls: parsed.data.mediaUrls,
      scheduledDatetime: parsed.data.quando,
      situacao: parsed.data.situacao,
      postType: parsed.data.postType,
      caption: parsed.data.caption,
      learningScope: normalizarEscopo(parsed.data.escopo),
      campaignId: parsed.data.campanhaId,
      origem: veredito?.origem,
      sugestaoId: parsed.data.sugestaoId,
      decididoPor: dbUser?.id,
    })

    // Só depois de o post existir — é ele que o sinal aponta.
    await fecharDesfechoDoSlot(veredito, {
      postId: resultado.postId,
      generationId: parsed.data.generationId,
      pageId: parsed.data.pageId,
      decididoPor: dbUser?.id,
      superficie: 'bancada',
    })

    return NextResponse.json(resultado, { status: 201 })
  } catch (error) {
    if (error instanceof CreativeError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[agendar] erro inesperado:', error)
    return NextResponse.json({ error: 'Erro ao colocar na agenda' }, { status: 500 })
  }
}
