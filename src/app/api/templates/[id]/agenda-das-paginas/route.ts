import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { z } from 'zod'

import { db } from '@/lib/db'
import { fetchProjectWithShares, hasProjectReadAccess, hasProjectWriteAccess } from '@/lib/projects/access'
import { agendarPost } from '@/lib/creatives/agendar'
import { CreativeError } from '@/lib/creatives/errors'
import { formatoDaPagina } from '@/lib/compositor/pastas'
import type { Formato } from '@/lib/compositor/spec'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * A agenda de cada PÁGINA de uma pasta: o horário previsto e o post que já
 * existe (ou não).
 *
 * Existe para o editor poder oferecer "Agendar" ao lado de duplicar/excluir —
 * a peça composta já sabe quando devia sair, e até aqui alguém tinha de
 * reencontrar esse horário na mão para criar o post.
 *
 * 🔴 Fica FORA de `GET /api/templates/[id]/pages` de propósito: aquela
 * resposta vai para o cache `['pages', templateId]`, que o autosave do editor
 * SUBSTITUI a cada pausa da digitação com o retorno do PATCH (sem estes
 * campos). Pendurar a agenda ali a faria sumir sozinha entre um autosave e
 * outro.
 */

/**
 * O horário previsto de cada página, lido da spec do compositor — nunca do
 * nome nem da ordem (`Page.order` só codifica o dia DENTRO da semana, e para
 * peça remarcada daria a data errada).
 *
 * 🔴 SQL cru para trazer só os dois caminhos do JSON. `select: { fieldValues:
 * true }` traz o objeto INTEIRO — e ali dentro mora `layersSnapshot`, as
 * camadas completas da peça. Numa pasta de 35 peças isso são megabytes por
 * requisição: medido em 04/09/2026, o endpoint passava de 45s e a tela ficava
 * girando. Aqui a resposta é uma linha de duas strings por geração.
 */
async function horariosPorPagina(templateId: number, projectId: number): Promise<Map<string, string>> {
  const linhas = await db.$queryRaw<Array<{ pageId: string | null; quando: string | null }>>`
    SELECT "fieldValues"->>'pageId' AS "pageId",
           "fieldValues"->'spec'->>'quando' AS "quando"
    FROM "Generation"
    WHERE "templateId" = ${templateId}
      AND "projectId" = ${projectId}
      AND "fieldValues"->>'pageId' IS NOT NULL
      AND "fieldValues"->'spec'->>'quando' IS NOT NULL
    ORDER BY "createdAt" DESC
  `
  const mapa = new Map<string, string>()
  // DESC + "o primeiro vence" = a geração mais recente da página manda.
  for (const l of linhas) {
    if (l.pageId && l.quando && !mapa.has(l.pageId)) mapa.set(l.pageId, l.quando)
  }
  return mapa
}

/**
 * 🔴 `agendarPost` NÃO infere o tipo pelo tamanho: sem `postType` ele grava
 * STORY (`agendar.ts`, `input.postType ?? 'STORY'`). Agendar uma peça de feed
 * sem dizer o tipo criaria um story de 1080x1350.
 */
const TIPO_DE_POST: Record<Formato, 'STORY' | 'POST'> = { story: 'STORY', feed: 'POST', quadrado: 'POST' }

/** O template e o projeto COM os compartilhamentos — é o que o gate de acesso lê. */
async function carregar(templateId: number) {
  const template = await db.template.findUnique({ where: { id: templateId }, select: { id: true, projectId: true } })
  if (!template) return null
  const project = await fetchProjectWithShares(template.projectId)
  if (!project) return null
  return { ...template, project }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const templateId = Number(id)
  if (!Number.isInteger(templateId) || templateId <= 0) {
    return NextResponse.json({ error: 'Template inválido' }, { status: 400 })
  }

  const template = await carregar(templateId)
  if (!template) return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 })
  if (!hasProjectReadAccess(template.project, { userId, orgId })) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  const paginas = await db.page.findMany({
    where: { templateId },
    select: { id: true, width: true, height: true, tags: true },
    orderBy: { order: 'asc' },
  })
  if (paginas.length === 0) return NextResponse.json({ projectId: template.projectId, paginas: [] })

  // As Generations acompanham a pasta da página (é o que o compositor e a
  // migração mantêm), então uma consulta por template basta.
  const quandoPorPagina = await horariosPorPagina(templateId, template.projectId)

  const posts = await db.socialPost.findMany({
    where: { pageId: { in: paginas.map((p) => p.id) } },
    select: { id: true, pageId: true, status: true, scheduledDatetime: true },
    orderBy: { createdAt: 'desc' },
  })
  const postPorPagina = new Map<string, (typeof posts)[number]>()
  for (const p of posts) if (p.pageId && !postPorPagina.has(p.pageId)) postPorPagina.set(p.pageId, p)

  return NextResponse.json({
    projectId: template.projectId,
    paginas: paginas.map((p) => {
      const post = postPorPagina.get(p.id)
      return {
        pageId: p.id,
        quando: quandoPorPagina.get(p.id) ?? null,
        postType: TIPO_DE_POST[formatoDaPagina(p)],
        post: post
          ? { id: post.id, status: post.status, quando: post.scheduledDatetime?.toISOString() ?? null }
          : null,
      }
    }),
  })
}

const corpo = z.object({ pageId: z.string().min(1) })

/**
 * Agenda UMA página no horário que a composição previu, como RASCUNHO — o
 * destino padrão da casa (regra do Ciro, 04/09/2026). O horário NÃO vem do
 * cliente: ele é lido aqui da spec, para o botão não poder agendar em data
 * diferente da que a tela mostrou.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { id } = await params
    const templateId = Number(id)
    if (!Number.isInteger(templateId) || templateId <= 0) {
      return NextResponse.json({ error: 'Template inválido' }, { status: 400 })
    }

    const template = await carregar(templateId)
    if (!template) return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 })
    if (!hasProjectWriteAccess(template.project, { userId, orgId })) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    const parsed = corpo.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 })

    const page = await db.page.findFirst({
      where: { id: parsed.data.pageId, templateId },
      select: { id: true, name: true, width: true, height: true, tags: true },
    })
    if (!page) return NextResponse.json({ error: 'Página não encontrada nesta pasta' }, { status: 404 })

    // O botão fica desativado quando já há post, mas quem manda é o servidor:
    // dois cliques rápidos criariam dois posts para a mesma peça.
    const jaTem = await db.socialPost.findFirst({ where: { pageId: page.id }, select: { id: true } })
    if (jaTem) {
      return NextResponse.json({ error: 'Esta peça já está na agenda', code: 'JA_AGENDADA', postId: jaTem.id }, { status: 409 })
    }

    const quando = (await horariosPorPagina(templateId, template.projectId)).get(page.id)
    if (!quando) {
      return NextResponse.json(
        { error: 'Esta peça não tem horário previsto — agende pela agenda, escolhendo a data.', code: 'SEM_HORARIO' },
        { status: 422 },
      )
    }

    /**
     * `decididoPor` é o `User.id` INTERNO, nunca o clerkId, e a busca é só de
     * LEITURA: criar User a partir de código de auditoria é como nascem os
     * Users fantasma que já estão neste banco.
     */
    const dbUser = await db.user.findUnique({ where: { clerkId: userId }, select: { id: true } })

    const resultado = await agendarPost({
      projectId: template.projectId,
      pageId: page.id,
      scheduledDatetime: quando,
      situacao: 'rascunho',
      postType: TIPO_DE_POST[formatoDaPagina(page)],
      decididoPor: dbUser?.id,
      superficie: 'editor',
    })

    return NextResponse.json(resultado, { status: 201 })
  } catch (error) {
    if (error instanceof CreativeError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[agenda-das-paginas] erro inesperado:', error)
    return NextResponse.json({ error: 'Erro ao colocar na agenda' }, { status: 500 })
  }
}
