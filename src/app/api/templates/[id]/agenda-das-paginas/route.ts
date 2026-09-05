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
interface DadosDaPagina {
  quando: string | null
  /** Posição no carrossel (1 = capa). Não-nulo = a peça é SLIDE, não post. */
  slide: number | null
  /** A arte desta página já é mídia de algum post do projeto. */
  jaEmPost: boolean
}

async function dadosPorPagina(templateId: number, projectId: number): Promise<Map<string, DadosDaPagina>> {
  const linhas = await db.$queryRaw<
    Array<{ pageId: string | null; quando: string | null; slide: number | null; jaEmPost: boolean }>
  >`
    SELECT g."fieldValues"->>'pageId' AS "pageId",
           g."fieldValues"->'spec'->>'quando' AS "quando",
           g."slideOrder" AS "slide",
           EXISTS (
             SELECT 1 FROM "SocialPost" sp
             WHERE sp."projectId" = g."projectId"
               AND g."resultUrl" IS NOT NULL
               AND g."resultUrl" = ANY (sp."mediaUrls")
           ) AS "jaEmPost"
    FROM "Generation" g
    WHERE g."templateId" = ${templateId}
      AND g."projectId" = ${projectId}
      AND g."fieldValues"->>'pageId' IS NOT NULL
    ORDER BY g."createdAt" DESC
  `
  const mapa = new Map<string, DadosDaPagina>()
  // DESC + "o primeiro vence" = a geração mais recente da página manda.
  for (const l of linhas) {
    if (l.pageId && !mapa.has(l.pageId)) {
      mapa.set(l.pageId, { quando: l.quando, slide: l.slide, jaEmPost: Boolean(l.jaEmPost) })
    }
  }
  return mapa
}

/**
 * 🔴 SLIDE DE CARROSSEL NÃO SE AGENDA SOZINHO.
 *
 * Um carrossel é UM `SocialPost` com `postType: CAROUSEL`, as 5 mídias e
 * `pageId: null` — nenhum slide tem post próprio. Sem esta trava, a detecção
 * por `SocialPost.pageId` não acha nada, o botão "Agendar" aparece em todos os
 * slides e cada clique cria um post de imagem ÚNICA com um slide solto, no
 * mesmo horário em que o carrossel completo já está. Medido em produção em
 * 04/09/2026: 44 páginas nesse estado.
 *
 * São dois critérios porque um só não basta: `slideOrder` cobre quem declarou
 * o carrossel na spec, e a arte já estar em `mediaUrls` cobre a peça composta
 * SEM declarar (que o próprio compositor admite acontecer).
 */
function ehSlideDeCarrossel(d: DadosDaPagina | undefined): boolean {
  return Boolean(d && (d.slide != null || d.jaEmPost))
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
  const dados = await dadosPorPagina(templateId, template.projectId)

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
      const d = dados.get(p.id)
      return {
        pageId: p.id,
        quando: d?.quando ?? null,
        postType: TIPO_DE_POST[formatoDaPagina(p)],
        // Slide de carrossel não ganha botão: ele já vai ao ar dentro do post
        // do carrossel, e agendá-lo sozinho duplicaria a publicação.
        slide: d?.slide ?? null,
        ehSlide: ehSlideDeCarrossel(d),
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

    const d = (await dadosPorPagina(templateId, template.projectId)).get(page.id)
    if (ehSlideDeCarrossel(d)) {
      return NextResponse.json(
        {
          error: 'Esta peça é um slide de carrossel — ela vai ao ar dentro do post do carrossel, não sozinha.',
          code: 'SLIDE_DE_CARROSSEL',
        },
        { status: 409 },
      )
    }
    const quando = d?.quando
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
