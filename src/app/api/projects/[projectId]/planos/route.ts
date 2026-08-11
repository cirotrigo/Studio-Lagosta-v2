import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  fetchProjectWithShares,
  hasProjectReadAccess,
  hasProjectWriteAccess,
} from '@/lib/projects/access'
import { CreativeError } from '@/lib/creatives/errors'
import { anexarItensAoPlanoAtivo, criarPlano, listarPlanos, MAX_ITENS_POR_PLANO } from '@/lib/planos/plano-service'

export const runtime = 'nodejs'
/** Só banco: nada aqui chama modelo, gera arte nem fala com o Zernio. */
export const maxDuration = 30

/**
 * Os planos de conteúdo do projeto (F3).
 *
 * GET  — a lista, com o progresso agregado de cada leva.
 * POST — cria a leva (plano + itens) numa transação. **Não gera arte e não
 *        cobra crédito**: registra o que se pretende fazer. Quem executa é
 *        `executar-plano`, com gate de confirmação.
 *
 * Casca fina sobre `src/lib/planos/plano-service.ts` — a mesma função que as
 * tools do MCP vão embrulhar, para que a regra não divirja entre a tela e o
 * chat.
 */

const itemSchema = z.object({
  ordem: z.number().int().min(0).max(999).optional(),
  /** "YYYY-MM-DD HH:mm" em BRT, ou ISO com fuso. Nulo = ainda a decidir. */
  quando: z.string().min(1).max(40).nullable().optional(),
  tema: z.string().max(200).nullable().optional(),
  copyProposta: z.array(z.string().max(2000)).max(12).nullable().optional(),
  legenda: z.string().max(2200).nullable().optional(),
  fotoUrl: z.string().max(2000).nullable().optional(),
  fotoDriveId: z.string().max(200).nullable().optional(),
  formato: z.string().min(1).max(30),
  via: z.string().max(30).nullable().optional(),
  sourcePageId: z.string().max(64).nullable().optional(),
  motivoDoSlot: z.string().max(400).nullable().optional(),
  escopo: z.string().max(30).nullable().optional(),
  campaignId: z.string().max(64).nullable().optional(),
  sugestaoId: z.string().max(64).nullable().optional(),
})

const postSchema = z.object({
  titulo: z.string().max(200).nullable().optional(),
  /** "YYYY-MM-DD" (dia inteiro em BRT) ou data e hora. */
  // Opcionais por causa do modo anexar; a criação avulsa valida no handler.
  inicio: z.string().min(1).max(40).optional(),
  fim: z.string().min(1).max(40).optional(),
  /** Que superfície montou: 'chat' | 'bancada' | 'propor-semana'. */
  origem: z.string().max(40).nullable().optional(),
  /** Versão da heurística que montou — é o que deixa comparar safras. */
  versao: z.string().max(40).nullable().optional(),
  itens: z.array(itemSchema).max(MAX_ITENS_POR_PLANO).optional(),
  /**
   * `true` = anexa os itens ao PLANO ATIVO (criando um de hoje até domingo se
   * não houver), em vez de criar um plano novo. É o modo do compositor da
   * bancada — item montado ali precisa aparecer para a equipe inteira, não só
   * no navegador de quem clicou. Neste modo `inicio`/`fim` são ignorados.
   */
  anexarAoAtivo: z.boolean().optional(),
})

async function resolver(projectIdRaw: string) {
  const id = Number(projectIdRaw)
  if (!Number.isInteger(id) || id <= 0) return { erro: 'Projeto inválido', status: 400 as const }
  const project = await fetchProjectWithShares(id)
  if (!project) return { erro: 'Projeto não encontrado', status: 404 as const }
  return { id, project }
}

function tratar(error: unknown, contexto: string) {
  if (error instanceof CreativeError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
  }
  console.error(`[planos] ${contexto} falhou`, error)
  return NextResponse.json({ error: 'Erro ao trabalhar com os planos' }, { status: 500 })
}

export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const r = await resolver((await params).projectId)
    if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
    if (!hasProjectReadAccess(r.project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const limiteRaw = url.searchParams.get('limite')
    const limite = limiteRaw ? Number(limiteRaw) : undefined

    const planos = await listarPlanos(r.id, {
      status,
      limite: Number.isFinite(limite) ? limite : undefined,
    })
    return NextResponse.json({ planos })
  } catch (error) {
    return tratar(error, 'GET')
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    const r = await resolver((await params).projectId)
    if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
    if (!hasProjectWriteAccess(r.project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const parsed = postSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Pedido inválido', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    /**
     * `criadoPor` é o `User.id` INTERNO, nunca o clerkId — os dois espaços já
     * produziram User fantasma neste banco. Busca somente LEITURA de propósito:
     * quem ainda não tem linha deixa a coluna nula (é auditoria), e criar User
     * a partir daqui seria o próprio erro que se quer evitar.
     */
    const dbUser = await db.user.findUnique({ where: { clerkId: userId }, select: { id: true } })

    if (parsed.data.anexarAoAtivo) {
      const { plano, criados } = await anexarItensAoPlanoAtivo({
        projectId: r.id,
        itens: parsed.data.itens ?? [],
        criadoPor: dbUser?.id,
      })
      return NextResponse.json({ plano, criados }, { status: 201 })
    }

    if (!parsed.data.inicio || !parsed.data.fim) {
      return NextResponse.json(
        { error: 'Informe início e fim do plano (ou anexarAoAtivo: true).' },
        { status: 400 },
      )
    }

    const { plano, avisos } = await criarPlano({
      projectId: r.id,
      titulo: parsed.data.titulo,
      inicio: parsed.data.inicio,
      fim: parsed.data.fim,
      origem: parsed.data.origem ?? 'bancada',
      versao: parsed.data.versao,
      criadoPor: dbUser?.id,
      itens: parsed.data.itens,
    })

    return NextResponse.json({ plano, avisos }, { status: 201 })
  } catch (error) {
    return tratar(error, 'POST')
  }
}
