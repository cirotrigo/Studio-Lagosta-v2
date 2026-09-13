import { NextResponse, after } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { invalidateScheduledRenders, normalizeLayersString } from '@/lib/posts/invalidate-renders'
import { registrarDecisaoSemSugestao } from '@/lib/aprendizado/captura'
import { lerCamadas } from '@/lib/posts/page-layers'
import { reconciliarMarcasDoRevisor } from '@/lib/creatives/revisao/oculta-pelo-revisor'
import { copyParaDecisao, diffDeCopy } from '@/lib/aprendizado/diff-copy'
import { recusaDaRevisao, revisaoDaPaginaComCamadas } from '@/lib/copy-autoral/revisar-pagina'
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
    const canonicas = validatedData.layers !== undefined ? canonicalizeLayersForPersistence(validatedData.layers) : undefined
    /**
     * Escrita HUMANA: a camada que a pessoa escondeu agora (estava visível) perde a marca de "escondida pelo
     * revisor" que porventura carregasse — senão o esconder dela seria lido como mecânico (REV-9E-01).
     *
     * 🔴 "Estava visível" se mede contra a página que ESTA escrita substitui — a leitura protegida, refeita a
     * cada volta do compare-and-set —, nunca contra `existingPage`, lida no começo do handler (C3-02 da
     * pré-revisão do commit bf85cb26, 12/09/2026). O autosave não espera o PATCH em voo: a pessoa mostra a
     * camada (P1), esconde de novo, e P2 sai com a marca antiga lendo a página de antes de P1 — contra ela a
     * marca ficava, P2 gravava por cima de P1 a camada escondida COM a marca, e a remoção nunca entrava no
     * contrato nem no aprendizado. Troca consciente: uma aba desatualizada que regrave escondida e marcada
     * uma camada que outra aba mostrou passa a contar como remoção de quem gravou por último — coerente com
     * a regra deste PATCH de que o contrato descreve o que ficou gravado em relação à base.
     */
    const reconciliarContra = (camadasDaBase: unknown) => {
      if (canonicas === undefined) return
      const reconciliadas = Array.isArray(canonicas)
        ? reconciliarMarcasDoRevisor(lerCamadas(camadasDaBase).camadas as Array<{ id: string; visible?: unknown }>, canonicas as Array<{ id: string; [chave: string]: unknown }>)
        : canonicas
      updateData.layers = JSON.stringify(reconciliadas)
    }
    // Prisma não aceita null literal em coluna Json — limpar exige DbNull
    if (validatedData.audio === null) {
      updateData.audio = Prisma.DbNull
    }

    // A arte agendada renderiza desta página; mudou o visual, o render antigo
    // vale nada. Só campos visuais contam — este mesmo PATCH recebe thumbnail
    // e autosave do PageSync a cada troca de página, e layers idênticas não
    // podem invalidar (senão abrir o editor re-renderiza os agendados à toa).
    //
    // 🔴 A comparação é contra a página COMO ELA ESTÁ NO BANCO NA HORA DE
    // GRAVAR, nunca contra a leitura do começo do handler: A lia X, recebia
    // um autosave com X e concluía "nada mudou"; B gravava Y (com o contrato
    // de Y); A caía no caminho sem proteção e gravava X por cima, deixando as
    // camadas X com o contrato Y — e sem invalidar imagem única nem pedir a
    // recomposição do slide (REV-01 da 3ª rodada da revisão do Codex sobre o
    // PR 3, 12/09/2026). Hoje quem decide é `mudancasContra(base)`, chamada
    // sobre a leitura protegida pelo compare-and-set; o que NÃO difere da
    // base não é reescrito (então não há como regredir o que outro gravou),
    // e invalidação, recomposição e sinais seguem a mudança EFETIVAMENTE
    // persistida.
    const payloadVisual =
      validatedData.layers !== undefined ||
      validatedData.background !== undefined ||
      validatedData.width !== undefined ||
      validatedData.height !== undefined
    type BaseVisual = { layers: unknown; background: string | null; width: number; height: number }
    const mudancasContra = (base: BaseVisual) => {
      const layersChanged = validatedData.layers !== undefined && updateData.layers !== normalizeLayersString(base.layers)
      const backgroundChanged = validatedData.background !== undefined && validatedData.background !== base.background
      const widthChanged = validatedData.width !== undefined && validatedData.width !== base.width
      const heightChanged = validatedData.height !== undefined && validatedData.height !== base.height
      return { layersChanged, visualChanged: layersChanged || backgroundChanged || widthChanged || heightChanged, backgroundChanged, widthChanged, heightChanged }
    }
    /** Os dados a gravar SEM o que é idêntico à base — o idêntico não se reescreve. */
    const dadosContra = (base: BaseVisual): Record<string, unknown> => {
      const m = mudancasContra(base)
      const dados: Record<string, unknown> = { ...updateData }
      if (validatedData.layers !== undefined && !m.layersChanged) delete dados.layers
      if (validatedData.background !== undefined && !m.backgroundChanged) delete dados.background
      if (validatedData.width !== undefined && !m.widthChanged) delete dados.width
      if (validatedData.height !== undefined && !m.heightChanged) delete dados.height
      return dados
    }

    // Transação SÓ quando há mudança visual (update + invalidação atômicos).
    // Thumbnail e autosave sem diff visual são a maioria dos PATCHes e abriam
    // transação à toa — com o Accelerate, transações concorrentes estouravam
    // "Unable to start a transaction in the given time" no meio da edição.
    // A leitura fresca abaixo é o que decide se a transação abre: custa um
    // SELECT a mais por PATCH com campo visual e nenhuma transação nova.
    const selecaoDaBase = { updatedAt: true, layers: true, background: true, width: true, height: true, copyAutoral: true } as const
    const baseFresca = payloadVisual ? await db.page.findUnique({ where: { id: pageId }, select: selecaoDaBase }) : null
    if (payloadVisual && !baseFresca) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }
    reconciliarContra((baseFresca ?? existingPage).layers)
    const previa = mudancasContra(baseFresca ?? existingPage)
    /** A base contra a qual a mudança foi de fato medida e gravada (a leitura protegida). */
    let baseGravada: BaseVisual = baseFresca ?? existingPage
    let layersChanged = false
    let visualChanged = false

    /**
     * F1: o contrato da copy autoral da página ganha a REVISÃO desta edição
     * (autor `equipe`, superfície `editor`) NA MESMA ESCRITA das camadas — o
     * diff é exato e decide sozinho se há revisão (mudou só o destaque do rich
     * text, ou uma quebra: revisa; autosave idêntico: não). Calculada aqui e
     * não num `after()`, para dois autosaves fora de ordem não deixarem a
     * página com as camadas B e o contrato de A. Página sem contrato fica
     * como está — não se inventa histórico.
     */

    let page
    let invalidated = 0
    let congelados: string[] = []
    /** A edição mexeu na copy e o contrato não a registrou (histórico cheio) — vai na resposta e no log. */
    let avisoDaCopy: string | null = null
    if (previa.visualChanged) {
      ;({ page, invalidated, congelados, layersChanged, visualChanged, baseGravada, avisoDaCopy } = await db.$transaction(
        async (tx) => {
          /**
           * A escrita das camadas e a revisão do contrato saem JUNTAS, por
           * compare-and-set na versão LIDA AGORA (não na leitura do começo do
           * handler): dois PATCHes concorrentes — um só de geometria, outro
           * de texto — não podem deixar as camadas de um com o contrato do
           * outro, nem apagar a revisão um do outro (R01 e R02 da revisão do
           * Codex sobre o PR 3, 12/09/2026). Perdeu a corrida → relê, refaz a
           * DIFERENÇA e a revisão contra a página nova e tenta de novo; a
           * escrita das camadas continua sendo a do cliente (último a gravar
           * vence, como sempre foi), mas o contrato descreve o que ficou
           * gravado — e se a página nova já é igual ao payload, nada visual é
           * reescrito e nada é invalidado (REV-01, 3ª rodada).
           */
          let updated: NonNullable<typeof existingPage> | null = null
          let efetiva = previa
          let base: BaseVisual = baseGravada
          let aviso: string | null = null
          for (let volta = 0; volta < 4 && !updated; volta++) {
            const fresca = await tx.page.findUnique({ where: { id: pageId }, select: selecaoDaBase })
            if (!fresca) throw new Error('page_not_found')
            // A marca do revisor é reconciliada contra ESTA leitura, antes de medir e revisar (C3-02).
            reconciliarContra(fresca.layers)
            const m = mudancasContra(fresca)
            const dados = dadosContra(fresca)
            let avisoDestaVolta: string | null = null
            if (m.layersChanged) {
              const revisao = revisaoDaPaginaComCamadas(fresca.copyAutoral, updateData.layers, { autor: 'equipe', motivo: 'edição no editor', superficie: 'editor' })
              if (revisao.estado === 'registrada' && revisao.copy) dados.copyAutoral = revisao.copy
              // 🔴 Recusa do contrato — histórico CHEIO (PR2-02) ou copy lida das camadas que não cabe
              // (`RevisaoDaCopyInvalida`): o autosave NUNCA falha nem perde o que a pessoa editou — as
              // camadas vão, o contrato fica como estava (sem a revisão, que o leitor rejeitaria) e a
              // resposta avisa.
              avisoDestaVolta = recusaDaRevisao(revisao)
            }
            const gravada = await tx.page.updateMany({ where: { id: pageId, updatedAt: fresca.updatedAt }, data: dados })
            if (gravada.count > 0) {
              updated = await tx.page.findUnique({ where: { id: pageId } })
              efetiva = m
              base = fresca
              aviso = avisoDestaVolta
            }
          }
          if (!updated) throw new Error('page_write_conflict')
          const r = efetiva.visualChanged ? await invalidateScheduledRenders(tx, { pageIds: [pageId] }) : { invalidados: 0, congelados: [] as string[] }
          return { page: updated, invalidated: r.invalidados, congelados: r.congelados, layersChanged: efetiva.layersChanged, visualChanged: efetiva.visualChanged, baseGravada: base, avisoDaCopy: aviso }
        },
        // Accelerate: o maxWait default (2s) estourava com autosaves em
        // sequência — "Unable to start a transaction in the given time"
        { maxWait: 10_000, timeout: 15_000 },
      ))
    } else {
      // Nada visual difere da página como está: o que é idêntico sai do
      // update (uma escrita de camadas iguais às do banco não pode regredir
      // o que outro PATCH gravou no meio tempo), e o resto — thumbnail,
      // nome, áudio — grava sem transação, como sempre.
      page = await db.page.update({
        where: { id: pageId },
        data: dadosContra(baseGravada),
      })
    }

    /**
     * O texto da página antes e depois — o que a captura de aprendizado abaixo
     * mede, contra a base que a escrita protegida de fato substituiu. A cópia
     * da copy que o post carrega não é mais atualizada aqui: o render desenha
     * a página como ela está (copy-segue-a-pagina.ts), e o remendo que fazia a
     * cópia "seguir" a página só neste PATCH era o que deixava de funcionar
     * quando outro caminho escrevia as camadas.
     */
    // `copyParaDecisao`: a camada escondida por ajuste do revisor conta como presente dos dois lados — o
    // autosave depois de um ajuste mecânico não pode registrar remoção em nome de quem edita (REV-9E-01).
    const copyAntes = layersChanged ? copyParaDecisao(baseGravada.layers) : null
    const copyDepois = layersChanged ? copyParaDecisao(updateData.layers) : null

    if (invalidated > 0) {
      console.log(`[API] Page ${pageId} changed — invalidated ${invalidated} scheduled render(s)`)
    }
    if (congelados.length > 0) {
      console.warn(
        `[API] Page ${pageId}: ${congelados.length} post(s) já entregues ao publicador não receberam a alteração`,
      )
    }
    if (avisoDaCopy) {
      console.warn(`[API] Page ${pageId}: camadas gravadas sem revisão do contrato da copy — ${avisoDaCopy}`)
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
      const geometria = diffDeGeometria(baseGravada.layers, updateData.layers)
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
      // As camadas foram gravadas e o contrato da copy ficou como estava (histórico cheio).
      ...(avisoDaCopy ? { avisoDaCopy } : {}),
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
