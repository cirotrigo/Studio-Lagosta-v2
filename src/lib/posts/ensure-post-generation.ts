/**
 * Garante que um post com arte tenha uma Generation vinculada.
 *
 * `SocialPost.generationId` é o que habilita "Melhorar com IA" na agenda (e a
 * linhagem antes/depois na galeria). Só que os caminhos que criam post a
 * partir de uma PÁGINA nunca preencheram esse campo:
 *
 *   - o modal "Agendar" do editor exporta o stage, sobe por /api/upload e
 *     chama a criação com `generationIds: []` — literal, fixo;
 *   - o `create-post` do MCP local cria o post sem arte, e o cron
 *     `render-stories` grava o PNG sem registrar Generation nenhuma.
 *
 * Resultado medido em 03/08/2026: dos 193 posts com `pageId` em produção,
 * ZERO tinham `generationId`. O botão de melhoria nunca apareceu uma única vez
 * para um post agendado pelo editor.
 *
 * A Generation criada aqui NÃO re-renderiza nada e NÃO cobra crédito: ela só
 * registra a arte que o post já tem. É de propósito diferente do
 * `/api/templates/[id]/export`, que cobra `creative_download` porque ali o
 * download é o produto.
 *
 * A arte aparece na galeria de Criativos como qualquer outra — é uma arte que
 * a pessoa fez, e esconder criaria a inconsistência oposta (arte-rápida
 * aparece, arte do editor não). `fieldValues.source` marca a origem para quem
 * precisar distinguir depois.
 */
import { db } from '@/lib/db'
/**
 * `textosDaPagina` era uma cópia local que lia as camadas com o `parseLayers`
 * da arte-rápida — então um decodificador de UM nível, que devolvia `[]` em
 * silêncio quando `Page.layers` estava dupla-codificada. Nessas páginas a Generation
 * nascia sem textos esperados e a melhoria rodava com `textCheck: 'skipped'`,
 * sem ninguém conferir a headline. A versão compartilhada decodifica fundo.
 */
import { textosDaPagina } from '@/lib/posts/page-layers'
import { comTravaPorChave } from '@/lib/trava-por-chave'
import { temContratoSemantico } from '@/lib/posts/copy-segue-a-pagina'
import { copyVisualDasCamadas } from '@/lib/creatives/procedencia-da-copy'
import { RenderStatus, type Prisma } from '../../../prisma/generated/client'

/**
 * A chave da trava das artes de UM post (R12-09) — a mesma para quem cria a
 * Generation da capa (aqui) e para o catálogo das outras mídias
 * (`registrarArtesDoPost`). Chaves diferentes não se excluiriam: o catálogo
 * que visse a capa ainda sem arte a registraria de novo.
 */
export const chaveDasArtesDoPost = (postId: string) => `catalogo-do-post:${postId}`

/**
 * Devolve o `generationId` do post — reaproveitando o que existir, criando
 * quando faltar. Nunca lança: se falhar, o post segue sem o vínculo (o botão
 * some, mas a publicação não pode quebrar por causa disso).
 */
/**
 * `midiaEsperada` (B1d checkpoint d, Codex rodada 9): o render passa a URL que ESTA execução confirmou. O vínculo só
 * acontece se o post ainda aponta para ela E ainda está RENDERED — o CAS exige `mediaUrls = [url]`,
 * `renderedImageUrl = url` e `renderStatus = RENDERED`, nos dois ramos (voltar a rascunho mantém a URL e só troca
 * o status, Codex rodada 10). Sem isso, uma execução vencida (a arte foi invalidada e outra reservou) gravava o `generationId` da arte
 * antiga, e o render seguinte não o corrigia. Os outros chamadores não passam nada: comportamento de sempre.
 */
export async function ensurePostGeneration(postId: string, opcoes: { midiaEsperada?: string } = {}): Promise<string | null> {
  try {
    // O post que já tem vínculo não espera ninguém: um vínculo não é desfeito por quem cria.
    const previa = await db.socialPost.findUnique({ where: { id: postId }, select: { generationId: true } })
    if (!previa) return null
    if (previa.generationId) return previa.generationId
    /**
     * R12-09: procurar a arte e criá-la é verificar-e-criar. Duas execuções ao
     * mesmo tempo (o catálogo de duas retomadas, o render do cron e o
     * agendamento) liam as duas "nenhuma Generation" e criavam as duas — uma
     * ficava órfã na galeria. Sob a trava do post, quem chega depois relê e
     * encontra o vínculo que a primeira gravou.
     */
    return await comTravaPorChave(chaveDasArtesDoPost(postId), (tx) => vincularSobATrava(tx, postId, opcoes.midiaEsperada))
  } catch (error) {
    // A arte mudou no meio do vínculo: a transação desfez a Generation criada — não é falha.
    if (error === ARTE_MUDOU) return null
    // Nunca derruba quem chamou: agendar e publicar são mais importantes que
    // o vínculo que habilita a melhoria.
    console.error(`[ensure-post-generation] falhou para o post ${postId}:`, error)
    return null
  }
}

/** Lançado dentro da transação para desfazer a Generation recém-criada quando o CAS do vínculo falha pela mídia. */
const ARTE_MUDOU = Symbol('arte-mudou')

/** O vínculo, com todas as leituras e escritas pela transação que segura a trava do post. */
async function vincularSobATrava(tx: Prisma.TransactionClient, postId: string, midiaEsperada?: string): Promise<string | null> {
  const post = await tx.socialPost.findUnique({
    where: { id: postId },
    select: {
      id: true,
      projectId: true,
      templateId: true,
      pageId: true,
      generationId: true,
      mediaUrls: true,
      renderedImageUrl: true,
      renderStatus: true,
      slotValues: true,
      Project: { select: { userId: true, name: true } },
    },
  })

  if (!post) return null
  if (post.generationId) return post.generationId

  // Checagem antecipada só poupa trabalho; quem garante é o CAS do vínculo, abaixo.
  if (midiaEsperada && !(post.mediaUrls?.length === 1 && post.mediaUrls[0] === midiaEsperada && post.renderedImageUrl === midiaEsperada && post.renderStatus === RenderStatus.RENDERED)) return null
  const arte = post.mediaUrls?.[0] ?? post.renderedImageUrl
  const doVinculo = { id: post.id, generationId: null, ...(midiaEsperada ? { mediaUrls: { equals: [midiaEsperada] }, renderedImageUrl: midiaEsperada, renderStatus: RenderStatus.RENDERED } : {}) }
  // Sem arte não há o que registrar. Post de página nasce assim e volta aqui
  // depois do render (renderPostArt chama de novo).
  if (!arte) return null
  // Só arte que veio de uma página: mídia externa (upload, Drive, import do
  // Zernio) não tem template ao qual amarrar a Generation.
  if (!post.pageId) return null

  const page = await tx.page.findUnique({
    where: { id: post.pageId },
    select: { id: true, name: true, layers: true, templateId: true, Template: { select: { name: true } } },
  })
  if (!page) return null

  const templateId = post.templateId ?? page.templateId

  /**
   * Reaproveita a Generation que já descreve esta arte, se existir — é o
   * mesmo casamento por `resultUrl` que o `agendarPost` faz. Sem isto, um
   * post criado a partir de uma arte da galeria ganharia uma segunda
   * Generation apontando para o mesmo arquivo.
   */
  const existente = await tx.generation.findFirst({
    where: { projectId: post.projectId, resultUrl: arte },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
  })

  if (existente) {
    const vinculado = await tx.socialPost.updateMany({ where: doVinculo, data: { generationId: existente.id } })
    if (vinculado.count === 0 && midiaEsperada) return null
    return existente.id
  }

  /**
   * B1d: `_slots`/`_papeis` são o PEDIDO, não o texto da arte — nunca entram em `slotValues` (a COPY VISUAL que
   * a melhoria, o agendamento por Generation e a troca de arte leem). Nem o texto da página: num post semântico a
   * página é o MODELO, e o texto cru dele não é o desta mídia.
   *
   * Checkpoint g: a copy visual sai das camadas que PRODUZIRAM esta mídia — a prova do render da URL (`PostRenderProof`,
   * casada por post + URL, no formato da arte-rápida/recomposição: `copyVisualDasCamadas`). Sem prova dessa URL, nada
   * se afirma (sem `slotValues`): melhor "não sei" do que o pedido no campo errado. O pedido fica em
   * `slotValuesRecebidos`, só como auditoria.
   */
  const semantico = temContratoSemantico(post.slotValues)
  const prova = semantico
    ? await tx.postRenderProof.findUnique({ where: { postId_mediaUrl: { postId: post.id, mediaUrl: arte } }, select: { layersSnapshot: true } })
    : null
  const copyVisual = semantico
    ? prova
      ? copyVisualDasCamadas(prova.layersSnapshot)
      : null
    : post.slotValues && typeof post.slotValues === 'object' && Object.keys(post.slotValues).length > 0
      ? (post.slotValues as Record<string, unknown>)
      : textosDaPagina(page.layers)

  const generation = await tx.generation.create({
    data: {
      status: 'COMPLETED' as never,
      templateId,
      fieldValues: {
        source: 'post-schedule',
        postId: post.id,
        // pageId sempre: é como conferir-arte localiza as camadas para o
        // diagnóstico geométrico (sobreposição vs texto faltando).
        pageId: page.id,
        ...(copyVisual ? { slotValues: copyVisual } : {}),
        ...(semantico ? { slotValuesRecebidos: post.slotValues } : {}),
      } as never,
      resultUrl: arte,
      projectId: post.projectId,
      createdBy: post.Project.userId,
      templateName: page.Template?.name ?? null,
      projectName: post.Project.name,
      completedAt: new Date(),
      fileName: `${page.name}.jpg`,
    },
    select: { id: true },
  })

  // `generationId: null` no where: com a trava do post a corrida entre quem
  // cria não acontece mais, mas outro escritor do vínculo (trocar-arte, a
  // melhoria) não passa por ela — o vínculo dele vale.
  const vinculado = await tx.socialPost.updateMany({
    where: doVinculo,
    data: { generationId: generation.id },
  })

  if (vinculado.count === 0) {
    if (midiaEsperada) throw ARTE_MUDOU
    const atual = await tx.socialPost.findUnique({
      where: { id: post.id },
      select: { generationId: true },
    })
    return atual?.generationId ?? null
  }

  console.log(`[ensure-post-generation] post ${post.id} vinculado à Generation ${generation.id}`)
  return generation.id
}
