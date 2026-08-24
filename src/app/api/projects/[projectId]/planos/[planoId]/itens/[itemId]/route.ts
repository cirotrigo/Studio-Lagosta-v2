import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectWriteAccess } from '@/lib/projects/access'
import { CreativeError } from '@/lib/creatives/errors'
import { atualizarItem, removerItem, transicionarItem } from '@/lib/planos/plano-service'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * Um item do plano (F3).
 *
 * PATCH faz as duas coisas que se pode fazer com um item, e nesta ordem:
 *
 *  1. **editar o conteúdo** (copy, horário, foto, formato, via) — só enquanto a
 *     arte não existe, e sempre devolvendo o item a "editado";
 *  2. **mudar a situação**, quando vem `situacao` — aprovar, reprovar com
 *     motivo, mandar para a fila, marcar o que a geração produziu.
 *
 * As duas juntas atendem o gesto real de "corrigi a headline e aprovei", que é
 * uma requisição só. Quem valida a transição é o serviço, num lugar só.
 */

const patchSchema = z.object({
  ordem: z.number().int().min(0).max(999).optional(),
  quando: z.string().min(1).max(40).nullable().optional(),
  tema: z.string().max(200).nullable().optional(),
  copyProposta: z.array(z.string().max(2000)).max(12).nullable().optional(),
  legenda: z.string().max(2200).nullable().optional(),
  fotoUrl: z.string().max(2000).nullable().optional(),
  fotoDriveId: z.string().max(200).nullable().optional(),
  /** Substitui a lista inteira; `[]` limpa lista e espelho. Tetos no serviço. */
  referencias: z
    .array(
      z.object({
        role: z.enum(['subject', 'anchor-ambient', 'anchor-dish', 'style']),
        driveFileId: z.string().max(200).optional(),
        url: z.string().max(2000).optional(),
        label: z.string().max(200).optional(),
      }),
    )
    .max(6)
    .nullable()
    .optional(),
  formato: z.string().max(30).optional(),
  via: z.string().max(30).nullable().optional(),
  sourcePageId: z.string().max(64).nullable().optional(),
  direcao: z.string().max(1200).nullable().optional(),
  ajusteDaFoto: z.string().max(500).nullable().optional(),
  clienteProjectId: z.number().int().positive().nullable().optional(),
  motivoDoSlot: z.string().max(400).nullable().optional(),
  escopo: z.string().max(30).nullable().optional(),
  campaignId: z.string().max(64).nullable().optional(),
  slides: z.unknown().optional(),

  /** A nova situação: proposto | editado | aprovado | reprovado | na-fila | … */
  situacao: z.string().max(30).optional(),
  /** Por que reprovou — é o que transforma a recusa em sinal. */
  motivo: z.string().max(600).nullable().optional(),
  erro: z.string().max(600).nullable().optional(),
  generationId: z.string().max(64).nullable().optional(),
  pageId: z.string().max(64).nullable().optional(),
  postId: z.string().max(64).nullable().optional(),
})

const CAMPOS_DE_CONTEUDO = [
  'ordem',
  'quando',
  'tema',
  'copyProposta',
  'legenda',
  'fotoUrl',
  'fotoDriveId',
  'referencias',
  'formato',
  'via',
  'sourcePageId',
  'direcao',
  'ajusteDaFoto',
  'clienteProjectId',
  'motivoDoSlot',
  'escopo',
  'campaignId',
] as const

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ projectId: string; planoId: string; itemId: string }> },
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { projectId, planoId, itemId } = await params
    const id = Number(projectId)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
    }
    const project = await fetchProjectWithShares(id)
    if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    if (!hasProjectWriteAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const parsed = patchSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Pedido inválido', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    /**
     * `decididoPor` é o `User.id` INTERNO, nunca o clerkId. Busca somente
     * LEITURA: criar User a partir de código de auditoria é como nascem os
     * Users fantasma que já existem neste banco.
     */
    const dbUser = await db.user.findUnique({ where: { clerkId: userId }, select: { id: true } })

    const patch: Record<string, unknown> = {}
    for (const campo of CAMPOS_DE_CONTEUDO) {
      if (parsed.data[campo] !== undefined) patch[campo] = parsed.data[campo]
    }
    /**
     * `slides` anda pelos DOIS trilhos, nunca pelos dois ao mesmo tempo: SEM
     * `situacao` é edição de conteúdo (passa pela régua de item editável);
     * COM `situacao` ele pega carona na transição — é como a bancada sincroniza
     * os generationIds da série durante a geração, quando o item já não é
     * editável e `atualizarItem` recusaria.
     */
    if (parsed.data.slides !== undefined && !parsed.data.situacao) patch.slides = parsed.data.slides

    const avisos: string[] = []
    let item

    if (Object.keys(patch).length > 0) {
      const resultado = await atualizarItem({
        projectId: id,
        planoId,
        itemId,
        patch,
        decididoPor: dbUser?.id,
      })
      item = resultado.item
      avisos.push(...resultado.avisos)
    }

    if (parsed.data.situacao) {
      item = await transicionarItem({
        projectId: id,
        planoId,
        itemId,
        para: parsed.data.situacao,
        motivo: parsed.data.motivo,
        erro: parsed.data.erro,
        slides: parsed.data.slides,
        generationId: parsed.data.generationId,
        pageId: parsed.data.pageId,
        postId: parsed.data.postId,
        decididoPor: dbUser?.id,
      })
    }

    if (!item) {
      return NextResponse.json(
        { error: 'Nada para mudar neste item — mande algum campo ou a nova situação.' },
        { status: 400 },
      )
    }

    return NextResponse.json({ item, avisos })
  } catch (error) {
    if (error instanceof CreativeError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[planos] PATCH de item falhou', error)
    return NextResponse.json({ error: 'Erro ao mudar o item do plano' }, { status: 500 })
  }
}

/**
 * Tira o item da leva — a lixeira da bancada.
 *
 * Sem isto o descarte era só do localStorage de quem clicou, e o card voltava
 * no refresh: a hidratação recria a fila a partir do plano, então remover de
 * verdade é remover AQUI. Arte, post e sinais apontados pelo item ficam — os
 * vínculos são frouxos de propósito.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string; planoId: string; itemId: string }> },
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { projectId, planoId, itemId } = await params
    const id = Number(projectId)
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Projeto inválido' }, { status: 400 })
    }
    const project = await fetchProjectWithShares(id)
    if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    if (!hasProjectWriteAccess(project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const removido = await removerItem({ projectId: id, planoId, itemId })
    return NextResponse.json({ removido: true, ...removido })
  } catch (error) {
    if (error instanceof CreativeError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[planos] DELETE de item falhou', error)
    return NextResponse.json({ error: 'Erro ao tirar o item do plano' }, { status: 500 })
  }
}
