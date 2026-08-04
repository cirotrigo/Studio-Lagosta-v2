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
import { parseLayers } from '@/lib/creatives/arte-rapida'

/**
 * Textos da página, no formato que `extractExpectedTexts` lê (`slotValues`).
 *
 * É o que dá à melhoria com IA a verificação de texto: sem textos esperados
 * ela roda com `textCheck: 'skipped'` e ninguém confere se o modelo reescreveu
 * a headline. A chave é o nome da camada (o mesmo que o editor mostra).
 */
function textosDaPagina(layers: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  for (const layer of parseLayers(layers)) {
    if (layer?.type !== 'text') continue
    const conteudo = typeof layer.content === 'string' ? layer.content.trim() : ''
    if (!conteudo) continue
    out[layer.name ?? layer.id] = conteudo
  }
  return out
}

/**
 * Devolve o `generationId` do post — reaproveitando o que existir, criando
 * quando faltar. Nunca lança: se falhar, o post segue sem o vínculo (o botão
 * some, mas a publicação não pode quebrar por causa disso).
 */
export async function ensurePostGeneration(postId: string): Promise<string | null> {
  try {
    const post = await db.socialPost.findUnique({
      where: { id: postId },
      select: {
        id: true,
        projectId: true,
        templateId: true,
        pageId: true,
        generationId: true,
        mediaUrls: true,
        renderedImageUrl: true,
        slotValues: true,
        Project: { select: { userId: true, name: true } },
      },
    })

    if (!post) return null
    if (post.generationId) return post.generationId

    const arte = post.mediaUrls?.[0] ?? post.renderedImageUrl
    // Sem arte não há o que registrar. Post de página nasce assim e volta aqui
    // depois do render (renderPostArt chama de novo).
    if (!arte) return null
    // Só arte que veio de uma página: mídia externa (upload, Drive, import do
    // Zernio) não tem template ao qual amarrar a Generation.
    if (!post.pageId) return null

    const page = await db.page.findUnique({
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
    const existente = await db.generation.findFirst({
      where: { projectId: post.projectId, resultUrl: arte },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    })

    if (existente) {
      await db.socialPost.updateMany({
        where: { id: post.id, generationId: null },
        data: { generationId: existente.id },
      })
      return existente.id
    }

    const slotValues =
      post.slotValues && typeof post.slotValues === 'object' && Object.keys(post.slotValues).length > 0
        ? (post.slotValues as Record<string, unknown>)
        : textosDaPagina(page.layers)

    const generation = await db.generation.create({
      data: {
        status: 'COMPLETED' as never,
        templateId,
        fieldValues: {
          source: 'post-schedule',
          postId: post.id,
          // pageId sempre: é como conferir-arte localiza as camadas para o
          // diagnóstico geométrico (sobreposição vs texto faltando).
          pageId: page.id,
          slotValues,
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

    // `generationId: null` no where: se outra execução venceu a corrida, a
    // dela vale e esta fica órfã na galeria — inofensivo, e melhor que
    // sobrescrever um vínculo já usado por uma melhoria em andamento.
    const vinculado = await db.socialPost.updateMany({
      where: { id: post.id, generationId: null },
      data: { generationId: generation.id },
    })

    if (vinculado.count === 0) {
      const atual = await db.socialPost.findUnique({
        where: { id: post.id },
        select: { generationId: true },
      })
      return atual?.generationId ?? null
    }

    console.log(`[ensure-post-generation] post ${post.id} vinculado à Generation ${generation.id}`)
    return generation.id
  } catch (error) {
    // Nunca derruba quem chamou: agendar e publicar são mais importantes que
    // o vínculo que habilita a melhoria.
    console.error(`[ensure-post-generation] falhou para o post ${postId}:`, error)
    return null
  }
}
