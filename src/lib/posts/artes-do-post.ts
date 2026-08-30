/**
 * As artes de um post, SLIDE A SLIDE.
 *
 * `SocialPost.generationId` é UM id, e um carrossel tem N artes — cada slide
 * costuma ter a sua própria Generation. Enquanto a revisão pela agenda leu só a
 * coluna, ela respondia sempre pelo primeiro slide: quem abrisse o carrossel,
 * andasse até o slide 5 com as setas e clicasse em "Gostei" estava elogiando a
 * arte do slide 1, em silêncio. É o mesmo cuidado que a melhoria já tinha
 * (`applyToPostMediaIndex: currentImageIndex`) e que faltava aqui.
 *
 * Este módulo resolve as duas metades do problema:
 *
 * - **`lerArtesDoPost`** (leitura) mapeia cada `mediaUrls[i]` à Generation que a
 *   descreve, casando por `resultUrl` — o mesmo casamento que `agendarPost` e
 *   `ensurePostGeneration` já fazem, só que para TODOS os índices em vez do
 *   primeiro. A coluna vira fallback do índice 0, nunca a verdade.
 * - **`registrarArtesDoPost`** (escrita) cria a Generation da mídia que não tem
 *   nenhuma. Sem ela, arte que chega ao Studio como URL pronta — canvas
 *   renderizado e subido ao Drive, export de outra ferramenta — nunca entra na
 *   galeria e não pode ser revisada. Foi assim que o carrossel de domingo do
 *   Bacana (30/08/2026, 7 slides) nasceu sem barra de revisão: as 7 artes
 *   existiam no Drive e ZERO existiam como Generation.
 *
 * ⚠️ **Por que a URL vence a coluna.** `agendarPost` casa a Generation ANTES de
 * `ingerirMidiaExterna` reescrever a mídia para o Blob — então a coluna pode
 * apontar para uma Generation cujo `resultUrl` já não é o `mediaUrls[0]` de
 * hoje. Casar por URL é mais específico e acompanha a melhoria com IA, que
 * troca a mídia do slide junto com a arte.
 *
 * Nada aqui lança. Registrar arte é conveniência de catálogo — o mesmo contrato
 * de `ensure-post-generation.ts`: agendar e publicar valem mais que o vínculo.
 */

import { db } from '@/lib/db'
import { ensureArteTemplate } from '@/lib/creatives/persist'
import { ARTE_ENVIADA_TEMPLATE_NAMES } from '@/lib/creatives/arte-enviada'
import type { PostType, TemplateType } from '@prisma/client'

/** Uma mídia do post e a arte que a descreve. */
export interface ArteDoPost {
  /** Posição em `mediaUrls` — é o mesmo índice que a UI navega com as setas. */
  indice: number
  mediaUrl: string
  /** `null` = esta mídia não tem Generation (arte de fora, vídeo, import). */
  generationId: string | null
}

const EXTENSOES_DE_VIDEO = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v']

/**
 * Vídeo não vira Generation aqui.
 *
 * A galeria de Criativos desenha `<Image>`, e a revisão pergunta sobre a ARTE —
 * o Reel tem a sua própria trilha (`VideoProcessingJob`), com Generation criada
 * por lá. Registrar o mp4 como arte encheria a galeria de miniaturas quebradas.
 */
export function ehVideo(url: string): boolean {
  const semQuery = url.split('?')[0].toLowerCase()
  return EXTENSOES_DE_VIDEO.some((ext) => semQuery.endsWith(ext))
}

/** Mídia que pode ser catalogada como arte. */
function catalogavel(url: string | null | undefined): url is string {
  return !!url && !url.startsWith('data:') && !ehVideo(url)
}

/**
 * Formato do coletor a partir do tipo do post.
 *
 * `classificarFormato` (arte-enviada) decide pela PROPORÇÃO real do arquivo, o
 * que exigiria baixar cada imagem. Aqui a mídia já está publicada e o template
 * é só o balde ao qual a Generation precisa pertencer (`Generation.templateId`
 * é NOT NULL), então o tipo do post basta — e erra para o lado inofensivo.
 */
function formatoDoPost(postType: PostType): { type: TemplateType; dimensions: string } {
  switch (postType) {
    case 'STORY':
    case 'REEL':
      return { type: 'STORY', dimensions: '1080x1920' }
    default:
      return { type: 'FEED', dimensions: '1080x1350' }
  }
}

interface PostComArtes {
  id: string
  projectId: number
  postType: PostType
  mediaUrls: string[]
  generationId: string | null
  templateId: number | null
  pageId: string | null
}

async function carregarPost(postId: string): Promise<PostComArtes | null> {
  if (!postId) return null
  const post = await db.socialPost.findUnique({
    where: { id: postId },
    select: {
      id: true,
      projectId: true,
      postType: true,
      mediaUrls: true,
      generationId: true,
      templateId: true,
      pageId: true,
    },
  })
  return post ?? null
}

/**
 * Qual Generation descreve cada URL — UMA consulta para o post inteiro.
 *
 * Mais de uma Generation pode apontar para o mesmo arquivo (a arte agendada
 * duas vezes, o registro tardio de uma corrida); a mais recente vence, mesma
 * regra do casamento de `agendarPost`.
 */
async function generationsPorUrl(
  projectId: number,
  urls: string[],
): Promise<Map<string, string>> {
  const alvos = Array.from(new Set(urls.filter(catalogavel)))
  if (alvos.length === 0) return new Map()

  const encontradas = await db.generation.findMany({
    where: { projectId, resultUrl: { in: alvos } },
    select: { id: true, resultUrl: true },
    orderBy: { createdAt: 'desc' },
  })

  const mapa = new Map<string, string>()
  for (const g of encontradas) {
    // `orderBy desc` + só gravar a primeira = a mais recente por URL.
    if (g.resultUrl && !mapa.has(g.resultUrl)) mapa.set(g.resultUrl, g.id)
  }
  return mapa
}

function montarArtes(post: PostComArtes, porUrl: Map<string, string>): ArteDoPost[] {
  return post.mediaUrls.map((mediaUrl, indice) => ({
    indice,
    mediaUrl,
    generationId:
      porUrl.get(mediaUrl) ??
      // A coluna só responde pelo PRIMEIRO slide: ela é um ponteiro único e
      // usá-la nos demais faria o slide 5 herdar a arte do slide 1 — que é
      // exatamente o defeito que este módulo existe para corrigir.
      (indice === 0 ? post.generationId : null),
  }))
}

/**
 * As artes do post, na ordem dos slides. Somente leitura.
 *
 * Devolve `[]` para post inexistente ou sem mídia — quem chama trata ausência,
 * nunca erro.
 */
export async function lerArtesDoPost(postId: string): Promise<ArteDoPost[]> {
  try {
    const post = await carregarPost(postId)
    if (!post || post.mediaUrls.length === 0) return []
    return montarArtes(post, await generationsPorUrl(post.projectId, post.mediaUrls))
  } catch (erro) {
    console.error(`[artes-do-post] falha ao ler as artes do post ${postId}:`, erro)
    return []
  }
}

export interface RegistroDeArtes {
  /** Generations criadas agora (mídia que não tinha nenhuma). */
  registradas: number
  /** `true` quando a coluna `generationId` do post foi preenchida nesta chamada. */
  colunaVinculada: boolean
  artes: ArteDoPost[]
}

/**
 * Garante que toda mídia catalogável do post tenha uma Generation.
 *
 * Reaproveita o que existir (casamento por `resultUrl`) e cria só o que faltar.
 * A Generation criada NÃO renderiza nada e NÃO cobra crédito: ela registra a
 * arte que o post já tem — mesma natureza da que `ensurePostGeneration` cria
 * para o post que nasceu de uma página, e mesma razão de existir (sem ela a
 * arte não aparece na galeria e não pode ser revisada).
 *
 * A diferença para `ensurePostGeneration` é o alcance: aquela exige `pageId` e
 * para no primeiro slide; esta atende a mídia que chegou pronta, de qualquer
 * origem, em todos os índices.
 */
export async function registrarArtesDoPost(postId: string): Promise<RegistroDeArtes> {
  const vazio: RegistroDeArtes = { registradas: 0, colunaVinculada: false, artes: [] }
  try {
    let post = await carregarPost(postId)
    if (!post || post.mediaUrls.length === 0) return vazio

    /**
     * Post que nasceu de uma PÁGINA já tem dono: `ensurePostGeneration` registra
     * a capa com `pageId` e `slotValues` — a procedência que `conferir-arte`
     * usa para localizar as camadas e que este módulo não tem como
     * reconstruir a partir de uma URL. Ele é idempotente (sai cedo quando a
     * coluna já existe), então chamar aqui só cobre o que faltava; os slides
     * 2..N de um carrossel montado a partir de uma página continuam sendo
     * nossos, porque ele só enxerga o primeiro.
     */
    if (post.pageId && !post.generationId) {
      const { ensurePostGeneration } = await import('./ensure-post-generation')
      await ensurePostGeneration(post.id)
      post = (await carregarPost(postId)) ?? post
    }

    const porUrl = await generationsPorUrl(post.projectId, post.mediaUrls)
    // Único por URL: o mesmo arquivo repetido em dois slides é uma arte só, e
    // sem o dedupe o segundo passaria pelo `!porUrl.has` do primeiro (o mapa só
    // é atualizado depois do create) e nasceria uma Generation duplicada.
    const faltando = Array.from(
      new Set(post.mediaUrls.filter((url) => catalogavel(url) && !porUrl.has(url))),
    )

    let registradas = 0
    if (faltando.length > 0) {
      const project = await db.project.findUnique({
        where: { id: post.projectId },
        select: { name: true, userId: true },
      })
      if (!project) return vazio

      // O coletor "Arte Enviada" já é o balde da arte que chega pronta de fora
      // (upload-creative). Um coletor novo só multiplicaria template vazio na
      // conta do cliente para dizer a mesma coisa.
      const { type, dimensions } = formatoDoPost(post.postType)
      const template =
        post.templateId != null
          ? { id: post.templateId, name: null as string | null }
          : await ensureArteTemplate(
              post.projectId,
              project.userId,
              type,
              dimensions,
              ARTE_ENVIADA_TEMPLATE_NAMES[type],
            )

      for (const url of faltando) {
        const indice = post.mediaUrls.indexOf(url)
        const criada = await db.generation.create({
          data: {
            status: 'COMPLETED' as never,
            templateId: template.id,
            fieldValues: {
              source: 'post-midia',
              postId: post.id,
              // O índice é o que liga esta arte ao slide — sem ele, um
              // carrossel vira sete Generations indistinguíveis na galeria.
              midiaIndice: indice,
            } as never,
            resultUrl: url,
            projectId: post.projectId,
            createdBy: project.userId,
            authorName: 'post-midia',
            templateName: template.name,
            projectName: project.name,
            completedAt: new Date(),
          },
          select: { id: true },
        })
        porUrl.set(url, criada.id)
        registradas += 1
      }
    }

    /**
     * A coluna continua apontando para o PRIMEIRO slide, que é o contrato que o
     * resto do sistema já assume (`trocar-arte-do-post` só a troca no índice 0,
     * e "melhorar com IA" leria o slide errado se ela apontasse para outro).
     */
    let colunaVinculada = false
    const arteDaCapa = porUrl.get(post.mediaUrls[0] ?? '')
    if (!post.generationId && arteDaCapa) {
      // `generationId: null` no where: se outra execução venceu a corrida, a
      // dela vale — mesmo guard de `ensurePostGeneration`.
      const r = await db.socialPost.updateMany({
        where: { id: post.id, generationId: null },
        data: { generationId: arteDaCapa },
      })
      colunaVinculada = r.count > 0
    }

    if (registradas > 0) {
      console.log(
        `[artes-do-post] post ${post.id}: ${registradas} arte(s) registrada(s)` +
          `${colunaVinculada ? ' e capa vinculada' : ''}`,
      )
    }

    return {
      registradas,
      colunaVinculada,
      artes: montarArtes({ ...post, generationId: post.generationId ?? arteDaCapa ?? null }, porUrl),
    }
  } catch (erro) {
    // Nunca derruba quem chamou — agendar vale mais que catalogar.
    console.error(`[artes-do-post] falha ao registrar as artes do post ${postId}:`, erro)
    return vazio
  }
}
