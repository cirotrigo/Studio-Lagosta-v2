import { NextResponse, after } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { invalidateScheduledRenders, normalizeLayersString } from '@/lib/posts/invalidate-renders'
import { registrarDecisaoSemSugestao } from '@/lib/aprendizado/captura'
import { copyDeCamadas, diffDeCopy } from '@/lib/aprendizado/diff-copy'
import { seguirCopyDaPagina } from '@/lib/posts/copy-segue-a-pagina'
import { descreverDiff, diffDeGeometria } from '@/lib/aprendizado/diff-geometria'
import {
  caiNaEscolhaPropria,
  fecharDicaDeCopyDaPagina,
} from '@/lib/aprendizado/fechar-copy-por-pagina'
import { z } from 'zod'
import {
  fetchTemplateWithProject,
  hasTemplateReadAccess,
  hasTemplateWriteAccess,
} from '@/lib/templates/access'
import { canonicalizeLayersForPersistence } from '@/lib/shape-style'
import { Prisma } from '../../../../../../../prisma/generated/client'

const pageAudioSchema = z.object({
  source: z.enum(['original', 'library', 'mute', 'mix']),
  musicId: z.number().int().optional(),
  audioVersion: z.enum(['original', 'instrumental', 'vocals']).optional(),
  musicName: z.string().optional(),
  musicThumbnailUrl: z.string().nullable().optional(),
  startTime: z.number().min(0),
  endTime: z.number().min(0),
  volume: z.number().min(0).max(100),
  volumeOriginal: z.number().min(0).max(100).optional(),
  volumeMusic: z.number().min(0).max(100).optional(),
  fadeIn: z.boolean(),
  fadeOut: z.boolean(),
  fadeInDuration: z.number().min(0),
  fadeOutDuration: z.number().min(0),
})

const updatePageSchema = z.object({
  name: z.string().min(1).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  layers: z.array(z.unknown()).optional(),
  background: z.string().optional(),
  // Trilha sonora da página (aba Músicas); null limpa. NÃO entra no diff
  // visual — mudar música não invalida o render agendado (que é PNG).
  audio: pageAudioSchema.nullable().optional(),
  order: z.number().int().optional(),
  thumbnail: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

// GET - Buscar página específica
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; pageId: string }> }
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, pageId } = await params
    const templateId = Number(id)

    // Verificar acesso ao template considerando organizações
    const template = await fetchTemplateWithProject(templateId)

    if (!hasTemplateReadAccess(template, { userId, orgId })) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Buscar página
    const page = await db.page.findFirst({
      where: {
        id: pageId,
        templateId,
      },
    })

    if (!page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }

    // Deserializar layers
    const pageWithParsedLayers = {
      ...page,
      layers: typeof page.layers === 'string' ? JSON.parse(page.layers) : page.layers,
    }

    return NextResponse.json(pageWithParsedLayers)
  } catch (error) {
    console.error('Error fetching page:', error)
    return NextResponse.json(
      { error: 'Failed to fetch page' },
      { status: 500 }
    )
  }
}

// PATCH - Atualizar página
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; pageId: string }> }
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, pageId } = await params
    const templateId = Number(id)

    // Verificar acesso ao template considerando organizações
    const template = await fetchTemplateWithProject(templateId)

    if (!hasTemplateWriteAccess(template, { userId, orgId })) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Verificar se a página existe e pertence ao template
    const existingPage = await db.page.findFirst({
      where: {
        id: pageId,
        templateId,
      },
    })

    if (!existingPage) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }

    const body = await request.json()
    const validatedData = updatePageSchema.parse(body)

    // Preparar dados com layers serializados se fornecidos
    const updateData: Record<string, unknown> = { ...validatedData }
    if (validatedData.layers !== undefined) {
      updateData.layers = JSON.stringify(canonicalizeLayersForPersistence(validatedData.layers))
    }
    // Prisma não aceita null literal em coluna Json — limpar exige DbNull
    if (validatedData.audio === null) {
      updateData.audio = Prisma.DbNull
    }

    // A arte agendada renderiza desta página; mudou o visual, o render antigo
    // vale nada. Só campos visuais contam — este mesmo PATCH recebe thumbnail
    // e autosave do PageSync a cada troca de página, e layers idênticas não
    // podem invalidar (senão abrir o editor re-renderiza os agendados à toa).
    const layersChanged =
      validatedData.layers !== undefined &&
      updateData.layers !== normalizeLayersString(existingPage.layers)
    const visualChanged =
      layersChanged ||
      (validatedData.background !== undefined && validatedData.background !== existingPage.background) ||
      (validatedData.width !== undefined && validatedData.width !== existingPage.width) ||
      (validatedData.height !== undefined && validatedData.height !== existingPage.height)

    // Transação SÓ quando há mudança visual (update + invalidação atômicos).
    // Thumbnail e autosave sem diff visual são a maioria dos PATCHes e abriam
    // transação à toa — com o Accelerate, transações concorrentes estouravam
    // "Unable to start a transaction in the given time" no meio da edição.
    /**
     * O texto da página antes e depois — lido UMA vez, porque serve a duas
     * coisas: o post que carregava a copy desta página segue a copy nova
     * (dentro da transação, antes do render que a invalidação dispara), e a
     * captura de aprendizado abaixo mede o diff.
     */
    const copyAntes = layersChanged ? copyDeCamadas(existingPage.layers) : null
    const copyDepois = layersChanged ? copyDeCamadas(updateData.layers) : null

    let page
    let invalidated = 0
    let congelados: string[] = []
    let seguiram = 0
    if (visualChanged) {
      ;({ page, invalidated, congelados, seguiram } = await db.$transaction(
        async (tx) => {
          const updated = await tx.page.update({
            where: { id: pageId },
            data: updateData,
          })
          // ANTES de invalidar: o render lê `slotValues` por cima da página, e
          // a cópia gravada no agendamento reescreveria a edição no re-render.
          const s = layersChanged ? await seguirCopyDaPagina(tx, { pageId, copyAntes, copyDepois }) : 0
          const r = await invalidateScheduledRenders(tx, { pageIds: [pageId] })
          return { page: updated, invalidated: r.invalidados, congelados: r.congelados, seguiram: s }
        },
        // Accelerate: o maxWait default (2s) estourava com autosaves em
        // sequência — "Unable to start a transaction in the given time"
        { maxWait: 10_000, timeout: 15_000 },
      ))
    } else {
      page = await db.page.update({
        where: { id: pageId },
        data: updateData,
      })
    }

    if (invalidated > 0) {
      console.log(`[API] Page ${pageId} changed — invalidated ${invalidated} scheduled render(s)`)
    }
    if (seguiram > 0) {
      console.log(`[API] Page ${pageId}: ${seguiram} post(s) passaram a carregar a copy nova da página`)
    }
    if (congelados.length > 0) {
      console.warn(
        `[API] Page ${pageId}: ${congelados.length} post(s) já entregues ao publicador não receberam a alteração`,
      )
    }

    /**
     * O TEXTO mudou? É o que a captura de aprendizado pergunta:
     * `layersChanged` dispara também em mudança puramente geométrica
     * (arrastar uma caixa), e uma linha de copy sem diferença de copy seria
     * ruído no corpus.
     */
    const diffDeTexto = layersChanged ? diffDeCopy(copyAntes, copyDepois) : null
    const textoMudou = !!diffDeTexto && !diffDeTexto.ilegivel && diffDeTexto.mudou

    /**
     * 🔴 A ARTE CONGELADA desta página — o slide de CARROSSEL, e a arte
     * agendada por `generationId` — não é alcançada pela invalidação acima.
     * Ela é `NOT_NEEDED` de propósito, porque `renderPostArt` grava
     * `mediaUrls: [url]` e um post `RENDERED` de 5 slides perderia 4 no
     * primeiro re-render. A proteção evitava o estrago e, no mesmo movimento,
     * abandonava a edição: até 04/09/2026 editar a copy de um slide não fazia
     * NADA — o post publicava o texto velho, sem log, aviso ou status (7 das
     * 65 artes agendadas do projeto 8 estavam assim).
     *
     * A porta é `visualChanged`, a MESMA da invalidação, e não só a mudança de
     * texto: para a arte congelada, mover uma caixa ou trocar uma cor fica
     * velho exatamente como a copy fica. As duas metades da regra divergirem
     * é o defeito de origem.
     *
     * Aqui só se ENFILEIRA. Refazer a arte leva dezenas de segundos e este
     * PATCH é o autosave: ele bate a cada pausa da digitação e não pode
     * segurar um render. O cron `generation-jobs` pega o job em no máximo um
     * minuto; o desfecho (inclusive a recusa por texto que não cabe) fica no
     * histórico do post e na Generation — ver `recompor.ts`.
     */
    if (visualChanged) {
      after(async () => {
        const { pedirRecomposicaoDaArteCongelada } = await import('@/lib/compositor/recompor')
        await pedirRecomposicaoDaArteCongelada([pageId])
      })
    }

    /**
     * A EDIÇÃO MANUAL no editor — a pessoa reescrevendo o que o gerador
     * escreveu. O detector `layersChanged` acima já existia e só invalidava
     * render; daqui para a frente ele também alimenta o corpus.
     *
     * Fora da resposta (`after`): o autosave bate aqui a cada pausa da
     * digitação e não pode esperar por telemetria. Nada aqui lança — as
     * funções de `captura.ts` engolem o próprio erro.
     */
    if (textoMudou) {
      const diff = diffDeTexto!
      const projectId = template!.Project.id
      after(async () => {
        /**
         * `decididoPor` é o `User.id` INTERNO, nunca o clerkId. Busca
         * somente leitura: criar linha de User a partir daqui é justamente
         * como nascem os Users fantasma, e isto é auditoria.
         */
        const dbUser = await db.user.findUnique({
          where: { clerkId: userId },
          select: { id: true },
        })
        /**
         * Se esta página é a arte de um item de plano, a copy JÁ foi
         * proposta (`propor-semana` a registrou como sugestão emitida) e o
         * que se grava é o DESFECHO dela. Abrir uma decisão nova aqui faria
         * o mesmo texto virar dois sinais com sentidos opostos — o defeito
         * que a F1 já corrigiu uma vez no slot (`e3236624`).
         *
         * O desfecho é calculado comparando proposta × final; a tela não
         * declara nada. Só `sem-plano` cai no registro de sempre.
         *
         * Custa uma consulta por autosave que MUDA TEXTO — dentro do
         * `after()`, fora da resposta. Reescrever a mesma página várias
         * vezes no mesmo minuto não cria linhas novas: `registrarDesfecho`
         * só grava quando a evidência é mais forte que a já registrada.
         */
        const fechamento = await fecharDicaDeCopyDaPagina({
          projectId,
          pageId,
          copyFinal: copyDepois,
          decididoPor: dbUser?.id ?? null,
          superficie: 'editor',
        })
        if (!caiNaEscolhaPropria(fechamento)) return

        await registrarDecisaoSemSugestao({
          projectId,
          tipo: 'copy',
          escolhido: {
            copy: copyDepois,
            // A copy de um MODELO é texto de espelho, não copy de peça —
            // quem agrega precisa poder separar sem outro join.
            modelo: existingPage.isTemplate,
          },
          diff,
          pageId,
          decididoPor: dbUser?.id ?? null,
          superficie: 'editor',
          /**
           * Balde de 10 minutos por página. Sem ele, digitar uma headline
           * com o autosave ligado vira uma dezena de linhas quase iguais e
           * dilui o corpus. Com ele fica a PRIMEIRA edição do balde — que é
           * a mais valiosa, porque o lado "antes" dela ainda é o texto que
           * a IA gerou. O preço é perder as revisões seguintes do mesmo
           * balde; a edição que continua depois de 10 minutos entra inteira.
           */
          chave: `copy:editor:${pageId}:${Math.floor(Date.now() / 600_000)}`,
        })
      })
    }

    /**
     * F4 (editor-como-usina): a GEOMETRIA que a equipe muda numa peça do
     * compositor — mover, encolher, realinhar, esconder. É o sinal que só o
     * editor produz; destilado por marca vira proposta de ajuste da
     * assinatura. Só em página do compositor (tag), fora da resposta, balde
     * de 10 minutos por página como a copy. Ilegível nunca vira "não mudou".
     */
    if (layersChanged && Array.isArray(existingPage.tags) && existingPage.tags.includes('compositor')) {
      const geometria = diffDeGeometria(existingPage.layers, updateData.layers)
      if (!geometria.ilegivel && geometria.mudou) {
        const projectId = template!.Project.id
        after(async () => {
          const dbUser = await db.user.findUnique({ where: { clerkId: userId }, select: { id: true } })
          await registrarDecisaoSemSugestao({
            projectId,
            tipo: 'geometria',
            escolhido: { resumo: descreverDiff(geometria).slice(0, 20) },
            diff: geometria,
            pageId,
            decididoPor: dbUser?.id ?? null,
            superficie: 'editor',
            chave: `geometria:editor:${pageId}:${Math.floor(Date.now() / 600_000)}`,
          })
        })
      }
    }

    // Deserializar layers na resposta
    const pageWithParsedLayers = {
      ...page,
      layers: typeof page.layers === 'string' ? JSON.parse(page.layers) : page.layers,
      // O autosave do editor bate aqui a cada pausa: é o ponto natural para
      // avisar que a edição não alcança mais um post já entregue.
      ...(congelados.length > 0 ? { postsCongelados: congelados } : {}),
    }

    return NextResponse.json(pageWithParsedLayers)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error updating page:', error)
    return NextResponse.json(
      { error: 'Failed to update page' },
      { status: 500 }
    )
  }
}

// DELETE - Remover página
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; pageId: string }> }
) {
  try {
    const { userId, orgId } = await auth()
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, pageId } = await params
    const templateId = Number(id)

    // Verificar acesso ao template considerando organizações
    const template = await fetchTemplateWithProject(templateId)

    if (!hasTemplateWriteAccess(template, { userId, orgId })) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    // Verificar se é a última página (deve ter ao menos 1)
    const pageCount = await db.page.count({
      where: { templateId },
    })

    if (pageCount <= 1) {
      return NextResponse.json(
        { error: 'Cannot delete the last page' },
        { status: 400 }
      )
    }

    // Verificar se a página existe
    const existingPage = await db.page.findFirst({
      where: {
        id: pageId,
        templateId,
      },
    })

    if (!existingPage) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }

    // Verificar se a página é um modelo
    if (existingPage.isTemplate) {
      return NextResponse.json(
        {
          error: 'template_page',
          message: 'Não é possível excluir página modelo. Desmarque como modelo primeiro.'
        },
        { status: 403 }
      )
    }

    // Obter order da página a ser deletada
    const pageOrder = existingPage.order

    // Deletar página
    await db.page.delete({
      where: { id: pageId },
    })

    // Reordenar páginas restantes (diminuir order de páginas que estavam após a deletada)
    await db.page.updateMany({
      where: {
        templateId,
        order: { gt: pageOrder },
      },
      data: {
        order: { decrement: 1 },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting page:', error)
    return NextResponse.json(
      { error: 'Failed to delete page' },
      { status: 500 }
    )
  }
}
