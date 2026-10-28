import { NextResponse, after } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { guardarMiniatura } from '@/lib/templates/miniatura'
import { updateTemplateSchema } from '@/lib/validations/studio'
import type { Prisma } from '@/lib/prisma-types'
import { hasProjectReadAccess, hasProjectWriteAccess, withProjectOwner } from '@/lib/projects/access'
import { invalidateScheduledRenders, normalizeLayersString } from '@/lib/posts/invalidate-renders'
import { PostStatus } from '../../../../../prisma/generated/client'
import { gravarCamadasComRevisao } from '@/lib/copy-autoral/persistir'
import { RecusaDoPushDoDesktop, exigirPaginaNovaSemGrade, idsDePaginaRepetidos, mesclarCamadasDoDesktop } from '@/lib/templates/guarda-do-push-do-desktop'
import { lerCamadas } from '@/lib/posts/page-layers'
import { VetorInvalido } from '@/lib/vetor/validar-camada'
import { corpoDoVetorInvalido, exigirVetoresValidos } from '@/lib/vetor/guarda-de-porta'
import { tagsComMarcaPreservada } from '@/lib/compositor/fora-do-rodizio'

export const runtime = 'nodejs'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const templateId = Number(id)
  if (!templateId) {
    return NextResponse.json({ error: 'Template inválido' }, { status: 400 })
  }

  const template = await db.template.findFirst({
    where: { id: templateId },
    include: {
      Project: {
        include: {
          organizationProjects: {
            include: {
              organization: {
                select: {
                  clerkOrgId: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!template) {
    return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 })
  }

  // Verificar se o usuário tem acesso ao projeto (dono ou membro de organização)
  if (!hasProjectReadAccess(await withProjectOwner(template.Project), { userId, orgId })) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  // Remover dados do projeto antes de retornar o template
  const { Project: _Project, ...templateData } = template
  return NextResponse.json(templateData)
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params
  const templateId = Number(id)
  if (!templateId) {
    return NextResponse.json({ error: 'Template inválido' }, { status: 400 })
  }

  const existing = await db.template.findFirst({
    where: { id: templateId },
    include: {
      Project: {
        include: {
          organizationProjects: {
            include: {
              organization: {
                select: {
                  clerkOrgId: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 })
  }

  // Verificar se o usuário tem permissão de escrita no projeto
  if (!hasProjectWriteAccess(await withProjectOwner(existing.Project), { userId, orgId })) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  try {
    const payload = await req.json()

    // Log payload for debugging sync issues
    console.log('[API] Template update payload:', {
      name: payload?.name,
      hasDesignData: !!payload?.designData,
      canvas: payload?.designData?.canvas,
      pagesCount: payload?.designData?.pages?.length,
      localId: payload?.localId,
    })

    const parsed = updateTemplateSchema.parse(payload)
    // CP-X2b: as camadas da RAIZ (`designData.layers`) vão cruas para `Template.designData`, que o render de
    // generations lê — conferidas sempre que vierem, com ou sem `pages`, ANTES de qualquer Blob ou escrita. As
    // páginas do desktop NÃO são pré-conferidas aqui: o X0 restaura da base o que o push omite, e só o estado
    // mesclado (abaixo, a cada volta) é o que vai ser gravado.
    if (parsed.designData?.layers !== undefined) exigirVetoresValidos(parsed.designData.layers)

    const data: Prisma.TemplateUpdateInput = {}
    if (parsed.name !== undefined) data.name = parsed.name
    if (parsed.designData !== undefined) {
      data.designData = parsed.designData as unknown as Prisma.JsonValue
    }
    if (parsed.dynamicFields !== undefined) {
      data.dynamicFields = parsed.dynamicFields as unknown as Prisma.JsonValue
    }
    // CP-X0: no push do desktop (com `pages`) a miniatura só é processada DEPOIS do commit das páginas. O upload de
    // data URL sobrescreve o caminho estável do Blob, e a transação não desfaz Blob: subir antes deixaria um push
    // recusado (409) trocando a miniatura que o web usa. URL comum passa intacta pelo `guardarMiniatura`.
    const ehPushDoDesktop = Array.isArray((parsed.designData as { pages?: unknown } | undefined)?.pages)
    const miniaturaAdiada = ehPushDoDesktop && parsed.thumbnailUrl ? parsed.thumbnailUrl : null
    if (parsed.thumbnailUrl !== undefined && !miniaturaAdiada) {
      // O editor manda a miniatura como data URL; ela vai para o Blob e a
      // coluna guarda só a URL. Ver src/lib/templates/miniatura.ts.
      data.thumbnailUrl = parsed.thumbnailUrl
        ? await guardarMiniatura(parsed.thumbnailUrl, templateId)
        : parsed.thumbnailUrl
    }
    if (parsed.localId !== undefined) {
      data.localId = parsed.localId
    }

    let invalidados = 0
    let congelados: string[] = []
    /** Páginas do template ausentes do push do desktop: preservadas, nunca apagadas (CP-X0). */
    let paginasPreservadas: string[] = []
    /** As páginas cujo visual mudou — a recomposição da arte congelada roda FORA da transação. */
    let alteradas: string[] = []

    // Use transaction to update template and pages together
    let updated = await db.$transaction(async (tx) => {
      let updatedTemplate = await tx.template.update({
        where: { id: templateId },
        data,
      })

      // If designData.pages is provided, update the Page records
      const designData = parsed.designData as { pages?: Array<{ id?: string; name?: string; width?: number; height?: number; layers?: unknown; background?: string; order?: number; thumbnail?: string | null; tags?: string[] }> } | undefined
      if (designData?.pages && Array.isArray(designData.pages)) {
        // CP-X0: este ramo é o push do desktop (o Salvar do web não manda `pages`). Id de página repetido deixaria
        // duas páginas do payload disputando o mesmo destino — recusa, e o $transaction desfaz o update acima.
        const repetidas = idsDePaginaRepetidos(designData.pages)
        if (repetidas.length > 0) throw new RecusaDoPushDoDesktop('PUSH_PAGINAS_DUPLICADAS', repetidas[0])

        // Get existing pages to know which to update vs delete.
        // Desktop sync can send page IDs that belong to another template; in that case
        // fall back to matching the current template page by order/name.
        const existingPages = await tx.page.findMany({
          where: { templateId },
          select: {
            id: true,
            name: true,
            order: true,
          },
        })
        /**
         * Só as páginas cujo VISUAL mudou voltam para a fila de render.
         *
         * Até 03/08/2026 este handler invalidava por `templateId` inteiro, e a
         * chamada estava fora do `if (designData?.pages)` — salvar só o nome do
         * template devolvia à fila todos os posts de todas as páginas. Num
         * template com 10 posts vivos em 10 páginas, um "Salvar" re-renderizava
         * os 10. É a mesma regra que o PATCH de página já aplicava (o
         * `visualChanged` de lá); aqui ela faltava.
         */
        const paginasAlteradas = new Set<string>()
        /**
         * 🔴 A página existente é gravada COM a revisão do contrato da copy,
         * sobre a página relida e por compare-and-set
         * (`gravarCamadasComRevisao`, PR3-F03 da revisão FINAL do Codex sobre
         * abac9b34, 18/09/2026). Antes este PUT ("Salvar e Voltar", sync do
         * desktop) escrevia `layers` sem revisar `copyAutoral`: a página
         * mostrava um texto e o contrato outro, e a próxima edição assinava a
         * mudança com a autoria errada. Escrita humana: a marca do revisor é
         * reconciliada contra a mesma base. Recusa do contrato não derruba o
         * salvamento — as camadas vão e o contrato fica como estava.
         *
         * 🔴 E a decisão de "o visual mudou?" sai da base EFETIVAMENTE
         * SUBSTITUÍDA (`g.base`) contra as camadas EFETIVAMENTE GRAVADAS
         * (`g.camadas`, já com a marca do revisor reconciliada) — nunca contra
         * a leitura do começo do handler (PR3-R9-01 da revisão do Codex sobre
         * cd98cd6d, 20/09/2026). O helper relê a página a cada volta: um PATCH
         * concorrente gravava Y, este PUT escrevia X por cima, e a comparação
         * com a leitura inicial (também X) concluía "nada mudou" — a página ia
         * de Y para X sem invalidar a imagem única nem pedir a recomposição do
         * slide. É a MESMA lição do REV-01 da 3ª rodada no PATCH da página.
         */
        /**
         * 🔴 CP-X0: as camadas do desktop são MESCLADAS sobre a base relida a cada volta do compare-and-set — o que o
         * desktop não representa (path do svg-path, máscara, compositor, slot) é preservado, e o push que perderia
         * isso é recusado (`RecusaDoPushDoDesktop` lança daqui e o $transaction desfaz TUDO). Ver
         * src/lib/templates/guarda-do-push-do-desktop.ts.
         */
        const gravarPagina = async (pageId: string, pageData: { layers: string; background: string; width: number; height: number; [campo: string]: unknown }, casadaPorFallback: boolean) => {
          const { layers, ...dados } = pageData
          const g = await gravarCamadasComRevisao(tx, {
            pageId,
            humana: true,
            // T5: a marca `fora-do-rodizio` é a da base relida a cada volta, nunca a do push.
            dados: (base) => ({ ...dados, tags: tagsComMarcaPreservada(base.tags, (dados.tags as string[] | undefined) ?? []) }),
            quem: { autor: 'equipe', motivo: 'edição no editor (salvar o template)', superficie: 'editor' },
            camadas: (base) => {
              const mescladas = mesclarCamadasDoDesktop(base.layers, layers, { paginaId: pageId, casadaPorFallback })
              // CP-X2b: o estado FINAL desta volta (base relida + payload, depois das recusas 409 do X0) precisa
              // ser válido; a recusa lança daqui e o $transaction desfaz o template e as páginas já gravadas.
              exigirVetoresValidos(mescladas, { paginaId: pageId })
              return mescladas
            },
          })
          if (!g) return
          if (g.aviso) console.warn(`[API] Template ${templateId}, página ${pageId}: camadas gravadas sem revisão do contrato da copy — ${g.aviso}`)
          if (
            normalizeLayersString(g.camadas) !== normalizeLayersString(g.base.layers) ||
            pageData.background !== g.base.background ||
            pageData.width !== g.base.width ||
            pageData.height !== g.base.height
          ) {
            paginasAlteradas.add(pageId)
          }
        }
        const existingPageIds = new Set(existingPages.map((p) => p.id))
        const incomingPageIds = Array.from(
          new Set(designData.pages.map((p) => p.id).filter((pageId): pageId is string => typeof pageId === 'string' && pageId.length > 0))
        )
        const foreignPages = incomingPageIds.length > 0
          ? await tx.page.findMany({
              where: {
                id: { in: incomingPageIds },
                templateId: { not: templateId },
              },
              select: { id: true, templateId: true },
            })
          : []
        const foreignPageIds = new Set(foreignPages.map((page) => page.id))
        const matchedExistingPageIds = new Set<string>()
        const resolvedCurrentPageIds = new Set<string>()

        const findFallbackPage = (page: { name?: string; order?: number }) => {
          const byOrder = existingPages.find((existingPage) => (
            !matchedExistingPageIds.has(existingPage.id) &&
            existingPage.order === (page.order ?? 0)
          ))
          if (byOrder) return byOrder

          const byName = existingPages.find((existingPage) => (
            !matchedExistingPageIds.has(existingPage.id) &&
            existingPage.name === (page.name ?? '')
          ))
          if (byName) return byName

          return undefined
        }

        // Upsert pages - update if exists, create with provided ID if not
        for (let i = 0; i < designData.pages.length; i++) {
          const page = designData.pages[i]
          const requestedPageId = page.id
          const pageData = {
            name: page.name ?? `Página ${i + 1}`,
            width: page.width ?? 1080,
            height: page.height ?? 1920,
            layers: typeof page.layers === 'string' ? page.layers : JSON.stringify(page.layers ?? []),
            background: page.background ?? '#ffffff',
            order: page.order ?? i,
            thumbnail: page.thumbnail ?? null,
            tags: Array.isArray(page.tags) ? page.tags : [],
          }

          if (requestedPageId && existingPageIds.has(requestedPageId)) {
            // CP-X0: duas páginas do payload no mesmo destino (por exemplo, uma por ordem/nome e outra por id).
            if (resolvedCurrentPageIds.has(requestedPageId)) throw new RecusaDoPushDoDesktop('PUSH_DESTINO_REPETIDO', requestedPageId)
            await gravarPagina(requestedPageId, pageData, false)
            matchedExistingPageIds.add(requestedPageId)
            resolvedCurrentPageIds.add(requestedPageId)
          } else {
            const fallbackPage = findFallbackPage(page)
            const hasForeignIdConflict = requestedPageId ? foreignPageIds.has(requestedPageId) : false

            if (fallbackPage) {
              if (resolvedCurrentPageIds.has(fallbackPage.id)) throw new RecusaDoPushDoDesktop('PUSH_DESTINO_REPETIDO', fallbackPage.id)
              await gravarPagina(fallbackPage.id, pageData, true)
              matchedExistingPageIds.add(fallbackPage.id)
              resolvedCurrentPageIds.add(fallbackPage.id)
            } else {
              // CP-X2b: página nova (sem par) não tem base para mesclar — o payload É o estado final.
              exigirVetoresValidos(pageData.layers, { paginaId: requestedPageId ?? `#${i}` })
              // G4.1: o desktop não cria grade de fotos — página nova com metadata de grade é recusada (409).
              exigirPaginaNovaSemGrade(pageData.layers, requestedPageId ?? `#${i}`)
              await tx.page.create({
                data: {
                  id: hasForeignIdConflict ? crypto.randomUUID() : (requestedPageId ?? crypto.randomUUID()),
                  ...pageData,
                  templateId,
                },
              })
            }
          }
        }

        // CP-X0: página ausente do push NÃO é apagada. O desktop só manda as páginas que conhece, e apagar levava
        // junto a página feita no web e desvinculava os posts agendados dela (`SocialPost.pageId` é SetNull).
        paginasPreservadas = existingPages
          .map((page) => page.id)
          .filter((pageId) => !resolvedCurrentPageIds.has(pageId))
        if (paginasPreservadas.length > 0) {
          console.warn(`[API] Template ${templateId}: ${paginasPreservadas.length} página(s) ausente(s) do push preservada(s): ${paginasPreservadas.join(', ')}`)
        }

        // CP-X0: o `designData.pages` gravado acima é o payload CRU do desktop (sem o path, sem as páginas
        // preservadas) — e é a cópia que o GET deste template devolve ao app (`fetchRemoteTemplateById`). Ele é
        // reconstruído das páginas FINAIS, na mesma transação; o resto do `designData` fica como veio.
        const finais = await tx.page.findMany({
          where: { templateId },
          orderBy: { order: 'asc' },
          select: { id: true, name: true, width: true, height: true, layers: true, background: true, order: true, thumbnail: true, tags: true },
        })
        updatedTemplate = await tx.template.update({
          where: { id: templateId },
          data: {
            designData: {
              ...(parsed.designData as Record<string, unknown>),
              pages: finais.map((p) => {
                const { camadas, legivel } = lerCamadas(p.layers)
                return { id: p.id, name: p.name, width: p.width, height: p.height, layers: legivel ? camadas : p.layers, background: p.background, order: p.order, thumbnail: p.thumbnail, tags: p.tags }
              }),
            } as unknown as Prisma.JsonValue,
          },
        })

        // Página cujo visual mudou faz a arte agendada valer nada: volta para
        // a fila de render. Só as alteradas — e só quando o payload traz
        // páginas (um PUT que muda apenas o nome do template não mexe em arte
        // nenhuma).
        alteradas = Array.from(paginasAlteradas)
        if (paginasAlteradas.size > 0) {
          const r = await invalidateScheduledRenders(tx, {
            pageIds: Array.from(paginasAlteradas),
          })
          invalidados = r.invalidados
          console.log(
            `[API] Template ${templateId}: ${paginasAlteradas.size} página(s) alterada(s) — ${invalidados} render(s) invalidado(s)`,
          )
        }

        /**
         * Os congelados NÃO saem da invalidação, e sim de uma consulta própria
         * sobre as páginas do payload.
         *
         * O PageSync já persistiu as camadas quando a pessoa clica em "Salvar
         * e Voltar", então `paginasAlteradas` costuma vir VAZIO aqui — e a
         * invalidação, que é quem devolveria os congelados, nem chega a rodar.
         * Reportar só a partir dela deixaria o editor prometendo "imagem
         * atualizada em instantes" justamente no caso que ele precisa negar.
         */
        const pageIdsDoPayload = Array.from(resolvedCurrentPageIds)
        if (pageIdsDoPayload.length > 0) {
          const armados = await tx.socialPost.findMany({
            where: {
              pageId: { in: pageIdsDoPayload },
              status: { in: [PostStatus.SCHEDULED, PostStatus.DRAFT] },
              laterPostId: { not: null },
            },
            select: { id: true },
          })
          congelados = armados.map((p) => p.id)
        }
      }

      return updatedTemplate
    })

    if (miniaturaAdiada) {
      // Limite: a atualização da miniatura é pós-commit e NÃO atômica com as páginas, e pode ficar parcial. Se o
      // upload no caminho estável funcionar e o update da coluna falhar, os bytes no Blob já são os novos e a coluna
      // segue com o valor anterior. As páginas já valem: só log, sem 500 enganoso. Um salvamento concorrente nesse
      // intervalo segue a regra de sempre (a última escrita vence).
      try {
        updated = await db.template.update({
          where: { id: templateId },
          data: { thumbnailUrl: await guardarMiniatura(miniaturaAdiada, templateId) },
        })
      } catch (erro) {
        console.error(`[API] Template ${templateId}: páginas gravadas, mas a miniatura do push não foi atualizada`, erro)
      }
    }

    if (congelados.length > 0) {
      console.warn(
        `[API] Template ${templateId}: ${congelados.length} post(s) já entregues ao publicador não receberam a alteração`,
      )
    }

    /**
     * O outro lado da invalidação: a arte CONGELADA destas páginas (o slide de
     * carrossel) não volta para a fila de render, e sem isto continuaria
     * publicando o visual antigo em silêncio. Ver `recompor.ts`.
     */
    if (alteradas.length > 0) {
      // Fora da resposta: o levantamento custa duas idas ao banco por página,
      // e o "Salvar e Voltar" do editor pode trazer a leva inteira.
      after(async () => {
        const { pedirRecomposicaoDaArteCongelada } = await import('@/lib/compositor/recompor')
        await pedirRecomposicaoDaArteCongelada(alteradas)
      })
    }

    return NextResponse.json({
      ...updated,
      // A edição não alcança post já entregue ao publicador. Devolver isso é o
      // que permite ao editor avisar em vez de deixar a pessoa achar que a
      // mudança valeu para tudo.
      ...(congelados.length > 0 ? { postsCongelados: congelados } : {}),
      ...(paginasPreservadas.length > 0 ? { paginasPreservadas } : {}),
    })
  } catch (error) {
    if (error instanceof RecusaDoPushDoDesktop) {
      // A recusa saiu de DENTRO da transação: o template e as páginas gravadas antes dela foram desfeitos, e a
      // miniatura do push nem subiu (ela só sobe depois do commit).
      console.warn(`[API] Template ${templateId}: push do desktop recusado — ${error.message}`)
      return NextResponse.json(
        {
          error: 'O envio do app desktop perderia conteúdo que só existe no web (vetor, máscara, página, camada do compositor ou grade de fotos). Nada foi gravado. Atualize o template no app (puxe de novo) e envie outra vez.',
          codigo: error.codigo,
          paginaId: error.paginaId,
          ...(error.camadaId ? { camadaId: error.camadaId } : {}),
        },
        { status: 409 },
      )
    }
    if (error instanceof VetorInvalido) {
      // De antes do Blob (raiz) ou de dentro da transação (páginas): nada foi gravado.
      return NextResponse.json(corpoDoVetorInvalido(error), { status: 422 })
    }
    console.error('[API] Failed to update template:', error)

    // Se for erro do Zod, retornar detalhes
    if (error && typeof error === 'object' && 'issues' in error) {
      const zodError = error as { issues: Array<{ path: string[]; message: string }> }
      console.error('[API] Validation errors:', JSON.stringify(zodError.issues, null, 2))
      return NextResponse.json({
        error: 'Dados inválidos',
        details: zodError.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message
        }))
      }, { status: 400 })
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[API] Non-Zod error:', errorMessage)
    return NextResponse.json(
      { error: 'Dados inválidos', details: errorMessage },
      { status: 400 }
    )
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId, orgId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const { id } = await params
  const templateId = Number(id)
  if (!templateId) {
    return NextResponse.json({ error: 'Template inválido' }, { status: 400 })
  }

  const existing = await db.template.findFirst({
    where: { id: templateId },
    include: {
      Project: {
        include: {
          organizationProjects: {
            include: {
              organization: {
                select: {
                  clerkOrgId: true,
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 })
  }

  // Verificar se o usuário tem permissão de escrita no projeto
  if (!hasProjectWriteAccess(await withProjectOwner(existing.Project), { userId, orgId })) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
  }

  try {
    // Primeiro, excluir todas as gerações relacionadas ao template
    await db.generation.deleteMany({
      where: { templateId: templateId },
    })

    // Depois, excluir o template (as páginas serão excluídas automaticamente via cascade)
    await db.template.delete({
      where: { id: templateId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete template', error)
    return NextResponse.json({ error: 'Erro ao deletar template' }, { status: 500 })
  }
}
